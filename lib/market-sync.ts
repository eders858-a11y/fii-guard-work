import { Platform } from 'react-native';
import { Quote, NewDividend, normalizeTicker, toISO } from './portfolio';

export const BRAPI_TOKEN = 'fZh138TebUi2JYGBJG75C6';
const CUSTOM_RENDER_API = 'https://fii-guard-work.onrender.com';

async function fetchWithTimeout(url: string, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        // Essencial para o APK não ser bloqueado como "bot" pelos servidores de cotação
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
      }
    });
    clearTimeout(id);
    return response;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

// Limpeza ultra-segura para centavos (ex: 0,084)
function parseLiteralValue(val: any): number {
    let s = String(val || "0").replace(/R\$\s*/gi, "").replace(/\s/g, "");
    if (s.includes(",")) {
        if (s.split(",")[0].includes(".")) s = s.replace(/\./g, "");
        s = s.replace(",", ".");
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}

export async function syncMarket(
  serviceUrl: string | undefined,
  tickers: string[],
  userOperations: any[] = [],
  brapiToken?: string
): Promise<{ quotes: Quote[]; dividends: NewDividend[]; message: string }> {
  const activeToken = brapiToken || BRAPI_TOKEN;
  const quotes: Quote[] = [];
  const dividends: NewDividend[] = [];

  if (!tickers || tickers.length === 0) return { quotes: [], dividends: [], message: "Sem ativos." };

  const isWeb = Platform.OS === 'web';
  const corsProxy = isWeb ? 'https://corsproxy.io/?' : '';

  // 1. TENTA BRAPI (PREÇOS + DIVIDENDOS)
  try {
    const url = `${corsProxy}https://brapi.dev/api/quote/${tickers.join(',')}?dividends=true&token=${activeToken}`;
    const res = await fetchWithTimeout(url);
    if (res.ok) {
      const j = await res.json();
      (j.results || []).forEach((q: any) => {
        if (q.regularMarketPrice) {
          quotes.push({
            ticker: normalizeTicker(q.symbol),
            price: Number(q.regularMarketPrice),
            referenceDate: new Date().toISOString().slice(0, 10),
            updatedAt: new Date().toISOString()
          });
        }
        const divs = q.dividendsData?.cashDividends || [];
        divs.forEach((d: any) => {
           const rate = parseLiteralValue(d.rate || d.value);
           if (rate > 0) {
             dividends.push({
               ticker: normalizeTicker(q.symbol),
               amountPerShare: rate,
               paymentDate: toISO(d.paymentDate || d.payDate || ""),
               dateCom: toISO(d.lastDatePrior || d.dateCom || ""),
               kind: String(d.label || "").toUpperCase().includes("AMORT") ? "amortization" : "income",
               source: "brapi"
             });
           }
        });
      });
    }
  } catch (e) {
    console.warn("[BRAPI] Falha na busca");
  }

  // 2. TENTA SERVIDOR LOCAL/CUSTOM (DIVIDENDOS EM LOTE)
  const baseUrl = (serviceUrl || CUSTOM_RENDER_API).trim().replace(/\/$/, "");
  try {
    const renderUrl = `${corsProxy}${baseUrl}/api/proventos-lote?tickers=${tickers.join(',')}`;
    console.log(`[SYNC] Chamando: ${renderUrl}`);

    const resR = await fetchWithTimeout(renderUrl, 45000); // 45s agora é suficiente devido ao paralelismo
    if (resR.ok) {
      const body = await resR.json();
      const raw = body.dividends || body.proventos || (Array.isArray(body) ? body : []);
      raw.forEach((d: any) => {
        const nVal = parseLiteralValue(d.valorUnitario || d.rendimento);
        if (nVal > 0) {
          dividends.push({
            ticker: normalizeTicker(d.ticker || d.symbol || ""),
            paymentDate: toISO(d.dataPagamento || d.paymentDate || ""),
            dateCom: toISO(d.dataCom || d.dateCom || ""),
            amountPerShare: nVal,
            kind: String(d.tipo || d.kind || "").toUpperCase().includes("AMORT") ? "amortization" : "income",
            source: "render"
          });
        }
      });
    } else {
      console.warn(`[SYNC] Servidor respondeu erro: ${resR.status}`);
    }
  } catch (e) {
    console.warn(`[SYNC] Não foi possível conectar ao servidor: ${baseUrl}`);
    throw new Error(`Servidor Offline: Verifique se o Python está rodando e a URL está correta.`);
  }

  // 3. FALLBACK DE COTAÇÕES (YAHOO) - SÓ ENTRA SE A BRAPI NÃO RETORNAR PREÇOS
  // Não afeta os dividendos, apenas garante que o valor da carteira atualize no APK
  if (quotes.length === 0) {
    for (const t of tickers) {
      try {
        const resY = await fetchWithTimeout(`https://query1.finance.yahoo.com/v8/finance/chart/${t}.SA?interval=1d`, 5000);
        if (resY.ok) {
          const dataY = await resY.json();
          const p = dataY?.chart?.result?.[0]?.meta?.regularMarketPrice || dataY?.chart?.result?.[0]?.meta?.previousClose;
          if (p) {
            quotes.push({
              ticker: normalizeTicker(t),
              price: Number(p),
              referenceDate: new Date().toISOString().slice(0, 10),
              updatedAt: new Date().toISOString()
            });
          }
        }
      } catch {}
    }
  }

  return { quotes, dividends, message: "Sincronizado." };
}
