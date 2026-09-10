import AsyncStorage from '@react-native-async-storage/async-storage';

export const BRAPI_TOKEN = 'fZh138TebUi2JYGBJG75C6';
const CUSTOM_RENDER_API = 'https://fii-guard-work.onrender.com';

export interface ProventoBrapi {
  ticker: string;
  dataCom: string;
  dataPagamento: string;
  valorUnitario: number;
  tipo: string;
}

export interface CotacaoBrapi {
  ticker: string;
  precoAtual: number;
  variacaoDia: number;
  ultimaAtualizacao: string;
}

const CACHE_PREFIX = '@brapiProv_';
const CACHE_COT_PREFIX = '@brapiCot_';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_COT_TTL_MS = 30 * 60 * 1000;

export const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export function mesAnoKey(ano: number, mes1a12: number) {
  return `${ano}-${String(mes1a12).padStart(2, '0')}`;
}

function parseLiteralValue(val: any): number {
  if (typeof val === 'number') return val;
  let s = String(val || "0").replace(/R\$\s*/gi, "").replace(/\s/g, "");
  if (s.includes(",")) {
    if (s.split(",")[0].includes(".")) s = s.replace(/\./g, "");
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseDateAny(v: any): string | null {
  if (!v) return null;
  if (typeof v === 'string') {
    const cleanStr = v.split("T")[0];
    const m = cleanStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return cleanStr;
    const mBr = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (mBr) return `${mBr[3]}-${mBr[2]}-${mBr[1]}`;
    const d = new Date(cleanStr);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  if (typeof v === 'number') {
    const ms = v > 1e12 ? v : v * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

function pickTipo(raw: string): string {
  const s = (raw || '').toUpperCase();
  if (s.includes('AMORT')) return 'Amortização';
  if (s.includes('JCP')) return 'JCP';
  if (s.includes('DIVID')) return 'Dividendo';
  return 'Rendimento';
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCotacoes(tickers: string[], token = BRAPI_TOKEN): Promise<Record<string, CotacaoBrapi>> {
  const out: Record<string, CotacaoBrapi> = {};
  const unique = Array.from(new Set(tickers.map(t => t.toUpperCase()).filter(Boolean)));
  if (!unique.length) return out;

  try {
    const symbols = unique.join(',');
    const url = `https://brapi.dev/api/quote/${encodeURIComponent(symbols)}?token=${token}`;
    const r = await fetchWithTimeout(url);
    if (!r.ok) return out;
    const j = await r.json();
    const results = j?.results || [];

    for (const item of results) {
      const sym = String(item.symbol || '').toUpperCase();
      if (!sym) continue;

      out[sym] = {
        ticker: sym,
        precoAtual: Number(item.regularMarketPrice ?? item.price ?? 0),
        variacaoDia: Number(item.regularMarketChangePercent ?? item.changePercent ?? 0),
        ultimaAtualizacao: item.regularMarketTime ? new Date(item.regularMarketTime * 1000).toISOString() : new Date().toISOString(),
      };
    }
  } catch (err) {
    console.warn('Erro ao buscar cotações atuais:', err);
  }

  return out;
}

async function fetchFromRenderApi(tickers: string[]): Promise<Record<string, ProventoBrapi[]>> {
  const out: Record<string, ProventoBrapi[]> = {};
  const cleanBase = CUSTOM_RENDER_API.trim().replace(/\/$/, "");
  if (!tickers.length) return out;

  for (const t of tickers) {
    try {
      const url = `${cleanBase}/api/proventos?ticker=${encodeURIComponent(t)}`;
      const r = await fetchWithTimeout(url);
      if (r.ok) {
        const j = await r.json();
        const divs = j?.dividends || j?.proventos || (Array.isArray(j) ? j : []);

        for (const d of divs) {
          const sym = String(d.ticker ?? d.symbol ?? t).toUpperCase();
          if (!sym) continue;

          const rate = parseLiteralValue(d.valorUnitario ?? d.rate ?? 0);
          const dataCom = parseDateAny(d.dataCom ?? d.dateCom);
          const dataPgto = parseDateAny(d.dataPagamento ?? d.paymentDate);
          if (!rate || !(dataCom || dataPgto)) continue;

          if (!out[sym]) out[sym] = [];
          out[sym].push({
            ticker: sym,
            dataCom: dataCom || dataPgto!,
            dataPagamento: dataPgto || dataCom!,
            valorUnitario: rate,
            tipo: pickTipo(d.tipo ?? d.label ?? ''),
          });
        }
      }
    } catch (err) {
      console.warn(`Erro ao buscar proventos para ${t} na API do Render:`, err);
    }
  }

  return out;
}

export async function fetchProventosTicker(ticker: string, force = false): Promise<ProventoBrapi[]> {
  const key = CACHE_PREFIX + ticker.toUpperCase();
  if (!force) {
    try {
      const cached = await AsyncStorage.getItem(key);
      if (cached) {
        const { ts, data } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL_MS) return data as ProventoBrapi[];
      }
    } catch {}
  }

  const resMap = await fetchFromRenderApi([ticker]);
  let lista = resMap[ticker.toUpperCase()] || [];

  if (!lista.length) {
    try {
      const cached = await AsyncStorage.getItem(key);
      if (cached) return JSON.parse(cached).data as ProventoBrapi[];
    } catch {}
  }

  lista.sort((a, b) => a.dataPagamento.localeCompare(b.dataPagamento));
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: lista }));
  } catch {}
  return lista;
}

export async function fetchProventosCarteira(
  tickers: string[],
  onProgress?: (done: number, total: number) => void,
  force = false,
): Promise<Record<string, ProventoBrapi[]>> {
  const out: Record<string, ProventoBrapi[]> = {};
  const uniqueTickers = Array.from(new Set(tickers.map(t => t.toUpperCase()).filter(Boolean)));

  if (!uniqueTickers.length) return out;

  const batchMap = await fetchFromRenderApi(uniqueTickers);

  let done = 0;
  for (const t of uniqueTickers) {
    let lista = batchMap[t] || [];

    if (!lista.length && !force) {
      try {
        const cached = await AsyncStorage.getItem(CACHE_PREFIX + t);
        if (cached) {
          lista = JSON.parse(cached).data;
        }
      } catch {}
    }

    lista.sort((a, b) => a.dataPagamento.localeCompare(b.dataPagamento));
    out[t] = lista;

    try {
      await AsyncStorage.setItem(CACHE_PREFIX + t, JSON.stringify({ ts: Date.now(), data: lista }));
    } catch {}

    done++;
    onProgress?.(done, uniqueTickers.length);
  }

  return out;
}

export async function fetchRelatorios(tickers: string[]): Promise<any[]> {
  const cleanBase = CUSTOM_RENDER_API.trim().replace(/\/$/, "");
  if (!tickers.length) return [];

  try {
    const symbols = tickers.map(t => t.toUpperCase()).join(',');
    const url = `${cleanBase}/relatorios?tickers=${encodeURIComponent(symbols)}`;
    const r = await fetchWithTimeout(url);
    if (r.ok) {
      return await r.json();
    }
  } catch (err) {
    console.warn('Erro ao buscar relatórios na API:', err);
  }
  return [];
}

export function mediaHistorica(proventos: ProventoBrapi[], ultimos = 3): number {
  const rends = proventos.filter(p => (p.tipo === 'Rendimento' || p.tipo === 'Dividendo') && p.valorUnitario > 0);
  const tail = rends.slice(-ultimos);
  if (!tail.length) return 0;
  return tail.reduce((s, p) => s + p.valorUnitario, 0) / tail.length;
}