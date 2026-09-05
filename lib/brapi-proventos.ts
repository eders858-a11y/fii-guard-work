import AsyncStorage from '@react-native-async-storage/async-storage';

// >>> Coloque seu token da brapi aqui (grátis em https://brapi.dev)
export const BRAPI_TOKEN = 'SEU_TOKEN_BRAPI_AQUI';

export interface ProventoBrapi {
  ticker: string;
  dataCom: string;        // 'YYYY-MM-DD'
  dataPagamento: string;  // 'YYYY-MM-DD'
  valorUnitario: number;  // R$ por cota
  tipo: string;           // 'Rendimento' | 'JCP' | 'Dividendo' | 'Amortização'
}

const CACHE_PREFIX = '@brapiProv_';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export function mesAnoKey(ano: number, mes1a12: number) {
  return `${ano}-${String(mes1a12).padStart(2, '0')}`;
}

// ---------- Parsing robusto da resposta da brapi ----------
function parseDateAny(v: any): string | null {
  if (!v) return null;
  if (typeof v === 'string') {
    // dd/mm/yyyy
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    // ISO
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  if (typeof v === 'number') { // epoch (s ou ms)
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

// ---------- Busca de um ticker (com cache) ----------
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

  let lista: ProventoBrapi[] = [];
  try {
    const url = `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?dividends=true&token=${BRAPI_TOKEN}`;
    const r = await fetch(url);
    const j = await r.json();
    const divs = j?.results?.[0]?.dividendsData?.cashDividends || [];
    for (const d of divs) {
      const rate = Number(d.rate ?? d.value ?? d.dividendRate ?? 0);
      const dataCom = parseDateAny(d.lastDatePrior ?? d.dataCom ?? d.exDate ?? d.relatedTo);
      const dataPgto = parseDateAny(d.paymentDate ?? d.approvedOn ?? d.lastDatePrior);
      if (!rate || !(dataCom || dataPgto)) continue;
      lista.push({
        ticker: ticker.toUpperCase(),
        dataCom: dataCom || dataPgto!,
        dataPagamento: dataPgto || dataCom!,
        valorUnitario: rate,
        tipo: pickTipo(d.label ?? d.type ?? ''),
      });
    }
  } catch (e) {
    // sem internet / limite da API -> devolve cache mesmo vencido, se houver
    try {
      const cached = await AsyncStorage.getItem(key);
      if (cached) return JSON.parse(cached).data as ProventoBrapi[];
    } catch {}
  }

  // ordena por data
  lista.sort((a, b) => a.dataPagamento.localeCompare(b.dataPagamento));
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: lista }));
  } catch {}
  return lista;
}

// ---------- Busca de toda a carteira ----------
export async function fetchProventosCarteira(
  tickers: string[],
  onProgress?: (done: number, total: number) => void,
  force = false,
): Promise<Record<string, ProventoBrapi[]>> {
  const out: Record<string, ProventoBrapi[]> = {};
  let done = 0;
  for (const t of tickers) {
    out[t.toUpperCase()] = await fetchProventosTicker(t, force);
    done++;
    onProgress?.(done, tickers.length);
    // pequena pausa p/ respeitar rate-limit do plano grátis
    await new Promise(r => setTimeout(r, 350));
  }
  return out;
}

// ---------- Fallback: média dos últimos rendimentos p/ meses futuros não anunciados ----------
export function mediaHistorica(proventos: ProventoBrapi[], ultimos = 3): number {
  const rends = proventos.filter(p => p.tipo === 'Rendimento' && p.valorUnitario > 0);
  const tail = rends.slice(-ultimos);
  if (!tail.length) return 0;
  return tail.reduce((s, p) => s + p.valorUnitario, 0) / tail.length;
}
