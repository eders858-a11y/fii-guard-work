import { NewDividend, Quote, normalizeTicker } from "./portfolio";
import { BRAPI_TOKEN } from "./brapi-proventos";

export type SyncResult = { quotes: Quote[]; dividends: NewDividend[]; message: string };

type YahooChart = {
  chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; regularMarketTime?: number }; timestamp?: number[]; events?: { dividends?: Record<string, { amount?: number; date?: number; exDate?: number; paymentDate?: number }> } }> };
};

const yahooTicker = (ticker: string) => `${normalizeTicker(ticker)}.SA`;
const isoDay = (timestamp: number) => new Date(timestamp * 1000).toISOString().slice(0, 10);

async function syncBrapi(tickers: string[], since?: string, explicitToken?: string): Promise<SyncResult> {
  const token = explicitToken || (BRAPI_TOKEN && !BRAPI_TOKEN.startsWith("SEU_TOKEN") ? BRAPI_TOKEN : "");
  const results = await Promise.all(tickers.map(async (ticker) => {
    try {
      const quoteUrl = `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}${token ? `?token=${token}` : ""}`;
      const divUrl = `https://brapi.dev/api/v2/fii/dividends?symbols=${encodeURIComponent(ticker)}${token ? `&token=${token}` : ""}`;

      const [quoteResponse, dividendsResponse] = await Promise.all([
        fetch(quoteUrl),
        fetch(divUrl)
      ]);
      if (!quoteResponse.ok || !dividendsResponse.ok) throw new Error("BRAPI indisponível para este ativo.");
      const quoteBody = await quoteResponse.json() as { results?: Array<{ regularMarketPrice?: number; regularMarketTime?: number | string }> };
      const quoteItem = quoteBody.results?.[0];
      const quote = typeof quoteItem?.regularMarketPrice === "number" && Number.isFinite(quoteItem.regularMarketPrice) ? { ticker, price: quoteItem.regularMarketPrice, referenceDate: quoteItem.regularMarketTime ? (typeof quoteItem.regularMarketTime === "number" ? isoDay(quoteItem.regularMarketTime) : String(quoteItem.regularMarketTime).slice(0, 10)) : new Date().toISOString().slice(0, 10), updatedAt: new Date().toISOString() } : null;
      const body = await dividendsResponse.json() as { dividends?: Array<{ rate?: number; value?: number; paymentDate?: string; lastDatePrior?: string; dateCom?: string; recordDate?: string; label?: string }> };
      const dividends = (body.dividends ?? []).flatMap((event) => { const amount = Number(event.rate ?? event.value ?? 0); const paymentDate = String(event.paymentDate ?? "").slice(0, 10); const dateCom = String(event.lastDatePrior ?? event.dateCom ?? event.recordDate ?? "").slice(0, 10); if (!Number.isFinite(amount) || amount <= 0 || !paymentDate || !dateCom || (since && paymentDate < since)) return []; return [{ ticker, paymentDate, dateCom, amountPerShare: amount, kind: String(event.label).toUpperCase().includes("AMORT") ? "amortization" as const : "income" as const, source: "brapi" as const }]; });
      return { quote, dividends, error: "" };
    } catch (error) { return { quote: null, dividends: [], error: error instanceof Error ? error.message : "falha desconhecida" }; }
  }));
  const quotes = results.flatMap((result) => result.quote ? [result.quote] : []); const dividends = results.flatMap((result) => result.dividends); const failures = results.filter((result) => result.error).map((result, index) => `${tickers[index]} (${result.error})`);
  if (!quotes.length && !dividends.length && failures.length) throw new Error(`Não foi possível integrar os ativos: ${failures.join(", ")}`);
  return { quotes, dividends, message: `${quotes.length} cotações e ${dividends.length} proventos consultados na BRAPI${failures.length ? `. Falhas: ${failures.join(", ")}` : "."}` };
}

async function syncYahoo(tickers: string[], since?: string): Promise<SyncResult> {
  const results = await Promise.all(tickers.map(async (ticker) => {
    try {
      const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker(ticker))}?range=2y&interval=1d&events=div`);
      if (!response.ok) throw new Error(`Yahoo Finance respondeu ${response.status}.`);
      const body = (await response.json()) as YahooChart;
      const item = body.chart?.result?.[0];
      if (!item) throw new Error("Ativo não localizado.");
      const price = item.meta?.regularMarketPrice;
      const quote = typeof price === "number" && Number.isFinite(price) ? { ticker, price, referenceDate: item.meta?.regularMarketTime ? isoDay(item.meta.regularMarketTime) : isoDay(Math.floor(Date.now() / 1000)), updatedAt: new Date().toISOString() } : null;
      const dividends = Object.values(item.events?.dividends ?? []).flatMap((event) => {
        if (!event.date || !event.amount || event.amount <= 0 || !event.paymentDate || !event.exDate) return [];
        const paymentDate = isoDay(event.paymentDate);
        const dateCom = isoDay(event.exDate);
        if (since && paymentDate < since) return [];
        return [{ ticker, paymentDate, dateCom, amountPerShare: event.amount, kind: "income" as const, source: "yfinance" as const }];
      });
      return { ticker, quote, dividends, error: "" };
    } catch (error) {
      return { ticker, quote: null, dividends: [], error: error instanceof Error ? error.message : "falha desconhecida" };
    }
  }));
  const quotes = results.flatMap((result) => result.quote ? [result.quote] : []);
  const dividends = results.flatMap((result) => result.dividends);
  const failures = results.filter((result) => result.error).map((result) => `${result.ticker} (${result.error})`);
  if (!quotes.length && !dividends.length && failures.length) throw new Error(`Não foi possível integrar os ativos: ${failures.join(", ")}`);
  return { quotes, dividends, message: `${quotes.length} cotações e ${dividends.length} proventos consultados automaticamente${failures.length ? `. Falhas: ${failures.join(", ")}` : "."}` };
}

export async function syncMarket(serviceUrl: string | undefined, tickers: string[], since?: string, brapiToken?: string): Promise<SyncResult> {
  const base = serviceUrl?.trim().replace(/\/$/, "");
  if (!base) { try { return await syncBrapi(tickers, since, brapiToken); } catch { return syncYahoo(tickers, since); } }
  if (!/^https?:\/\//i.test(base)) throw new Error("O endereço do serviço deve iniciar por http:// ou https://.");
  const params = new URLSearchParams({ symbols: tickers.join(",") });
  if (since) params.set("since", since);
  const response = await fetch(`${base}/market/sync?${params}`);
  if (!response.ok) throw new Error(`Serviço de mercado indisponível (${response.status}).`);
  const body = await response.json() as { checkedAt: string; results: Array<{ ticker: string; quote: { ticker: string; price: number; referenceDate: string } | null; dividends: Array<{ ticker: string; referenceDate?: string; paymentDate?: string; dateCom?: string; amountPerShare: number; kind: "income" | "amortization"; source: "brapi" | "yfinance" | "b3" }> }>; errors: Array<{ ticker: string }> };
  const quotes = body.results.flatMap((item) => item.quote ? [{ ...item.quote, updatedAt: body.checkedAt }] : []);
  const dividends = body.results.flatMap((item) => item.dividends.filter((event) => event.paymentDate && event.dateCom).map((event) => ({ ticker: event.ticker, paymentDate: event.paymentDate as string, dateCom: event.dateCom as string, amountPerShare: event.amountPerShare, kind: event.kind, source: event.source })));
  return { quotes, dividends, message: body.errors.length ? `${quotes.length} cotações atualizadas; falhas em ${body.errors.map((item) => item.ticker).join(", ")}.` : `${quotes.length} cotações e ${dividends.length} proventos consultados.` };
}
