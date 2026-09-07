import { getApiUrl } from './api';

export interface ProventoBrapi {
  ticker: string;
  dataPagamento: string;
  dataCom: string;
  valorUnitario: number;
  tipo: string;
  estimado?: boolean;
}

export async function fetchProventosCarteira(
  tickers: string[],
  onProgress?: (done: number, total: number) => void,
  force: boolean = false
): Promise<Record<string, ProventoBrapi[]>> {
  console.log("==> TICKERS RECEBIDOS:", tickers);
  const resultado: Record<string, ProventoBrapi[]> = {};
  const baseUrl = getApiUrl();
  console.log("==> BASE URL:", baseUrl);

  try {
    const tickersParam = tickers.join(',');
    console.log(`==> REQUISITANDO: ${baseUrl}/api/proventos-lote?tickers=${tickersParam}`);
    const response = await fetch(`${baseUrl}/api/proventos-lote?tickers=${tickersParam}`);
    console.log("==> STATUS RESPOSTA:", response.status);

    if (response.ok) {
      const data = await response.json();
      console.log("==> DADOS RECEBIDOS DA API:", data);
      if (data && data.dividends) {
        return data.dividends;
      }
    }
  } catch (error) {
    console.log('Erro capturado no fetch de proventos, usando fallback...', error);
  }

  let done = 0;
  for (const ticker of tickers) {
    try {
      if (onProgress) onProgress(done, tickers.length);
      const res = await fetch(`https://brapi.dev/api/v2/funds/cash-dividends/${ticker}`);
      const json = await res.json();

      if (json && json.cashDividends) {
        resultado[ticker] = json.cashDividends.map((d: any) => ({
          ticker,
          dataPagamento: d.paymentDate || d.lastDatePrior || '',
          dataCom: d.lastDatePrior || '',
          valorUnitario: d.rate || 0,
          tipo: d.relatedTo || 'Rendimento',
        }));
      } else {
        resultado[ticker] = [];
      }
    } catch (e) {
      resultado[ticker] = [];
    }
    done++;
  }

  return resultado;
}

export function mediaHistorica(provs: ProventoBrapi[]): number {
  if (!provs || provs.length === 0) return 0;
  const ultimos = provs.slice(-6);
  const soma = ultimos.reduce((acc, cur) => acc + (cur.valorUnitario || 0), 0);
  return soma / ultimos.length;
}

export const MESES = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];