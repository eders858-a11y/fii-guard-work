import { NewDividend, Quote, normalizeTicker, toISO } from "./portfolio";
import { BRAPI_TOKEN } from "./brapi-proventos";

export type SyncResult = { quotes: Quote[]; dividends: NewDividend[]; message: string };

async function fetchWithTimeout(url: string, options: any = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function fetchPrices(tickers: string[], token?: string): Promise<Quote[]> {
  const activeToken = token || (BRAPI_TOKEN && !BRAPI_TOKEN.startsWith("SEU_TOKEN") ? BRAPI_TOKEN : "");
  const quotes: Quote[] = [];
  if (activeToken) {
    try {
      const r = await fetchWithTimeout(`https://brapi.dev/api/quote/${tickers.join(",")}?token=${activeToken}`);
      const j = await r.json();
      (j.results || []).forEach((q: any) => {
        if (q.regularMarketPrice) quotes.push({ ticker: normalizeTicker(q.symbol), price: q.regularMarketPrice, referenceDate: new Date().toISOString().slice(0, 10), updatedAt: new Date().toISOString() });
      });
    } catch {}
  }
  if (quotes.length === 0) {
    for (const t of tickers) {
      try {
        const res = await fetchWithTimeout(`https://query1.finance.yahoo.com/v8/finance/chart/${t}.SA?interval=1d`);
        const data = await res.json();
        const p = data?.chart?.result?.[0]?.meta?.regularMarketPrice || data?.chart?.result?.[0]?.meta?.previousClose;
        if (p) quotes.push({ ticker: normalizeTicker(t), price: Number(p), referenceDate: new Date().toISOString().slice(0, 10), updatedAt: new Date().toISOString() });
      } catch {}
    }
  }
  return quotes;
}

export async function syncMarket(serviceUrl: string | undefined, tickers: string[], since?: string, brapiToken?: string): Promise<SyncResult> {
  const base = serviceUrl?.trim().replace(/\/$/, "");
  let quotes: Quote[] = [];
  let dividends: NewDividend[] = [];
  let status = "";

  if (base && base.includes("onrender.com")) {
    try {
      const url = `${base}/api/proventos-lote?tickers=${tickers.join(",")}`;
      const res = await fetchWithTimeout(url, {}, 65000);
      if (res.ok) {
        const body = await res.json();
        const raw: any[] = body.dividends || body.proventos || body.results || (Array.isArray(body) ? body : []);

        dividends = raw.map((d: any) => {
          const tk = normalizeTicker(d.ticker || d.symbol || d.Ticker || d.ativo || "");

          // Limpeza robusta para formatos como "R$ 0,10" ou "0,10"
          let valRaw = String(d.valorUnitario || d.rendimento || d.Rendimento || d.valor || d.amount || d.value || d.rate || "0");
          valRaw = valRaw.replace(/R\$\s*/gi, "").replace(/\./g, "").replace(",", ".");
          const valNum = parseFloat(valRaw);

          return {
            ticker: tk,
            paymentDate: toISO(d.dataPagamento || d.paymentDate || d.date),
            dateCom: toISO(d.dataCom || d.dateCom || d.date),
            amountPerShare: isNaN(valNum) ? 0 : valNum,
            kind: String(d.tipo || d.kind || "").toUpperCase().includes("AMORT") ? "amortization" : "income",
            source: "render"
          };
        }).filter(d => d.ticker && d.amountPerShare > 0);
        status = `${dividends.length} proventos carregados. `;
      }
    } catch (e) { status = "Python offline. "; }
  }

  const fallback = await fetchPrices(tickers, brapiToken);
  if (quotes.length === 0) {
    quotes = fallback;
    status += "Preços OK.";
  } else {
    status += "Preços OK.";
  }

  return { quotes, dividends, message: status.trim() };
}
