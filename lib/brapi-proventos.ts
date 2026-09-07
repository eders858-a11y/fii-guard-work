import { getApiUrl } from './api';

export interface ProventoBrapi {
  ticker: string;
  dataPagamento: string;
  dataCom: string;
  valorUnitario: number;
  tipo: string;
  estimado?: boolean;
}

// Função unificada: Tenta o servidor Python (Flask local ou nuvem) e usa a Brapi de fallback
export async function fetchProventosCarteira(
  tickers: string[],
  onProgress?: (done: number, total: number) => void,
  force: boolean = false
): Promise<Record<string, ProventoBrapi[]>> {
  const resultado: Record<string, ProventoBrapi[]> = {};
  const baseUrl = getApiUrl();

  try {
    const tickersParam = tickers.join(',');
    const response = await fetch(`${baseUrl}/api/proventos-lote?tickers=${tickersParam}`);

    if (response.ok) {
      const data = await response.json();
      if (data && data.dividends) {
        return data.dividends;
      }
    }
  } catch (error) {
    console.log('Servidor Python indisponível, usando fallback da Brapi...', error);
  }

  // Fallback ativo caso o Python falhe
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