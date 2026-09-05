import { ProventoBrapi, mesAnoKey } from './brapi-proventos';

export interface MovimentacaoB3 {
  ticker: string;            // ex.: 'HGLG11'
  data: string;              // 'YYYY-MM-DD' ou 'DD/MM/YYYY'
  tipo: 'C' | 'V' | string;  // 'C' compra, 'V' venda (ou 'Compra'/'Venda')
  quantidade: number;
}

export interface ItemProventoMes {
  ticker: string;
  tipo: string;
  dataCom: string;
  dataPagamento: string;
  quantidadeNaDataCom: number;
  valorUnitario: number;
  valorTotal: number;
  estimado: boolean; // true = mês futuro sem anúncio (média histórica)
}

export interface ResumoMes {
  key: string;             // 'YYYY-MM'
  ano: number;
  mes: number;             // 1..12
  itens: ItemProventoMes[];
  totalMes: number;
}

export function toISODate(d: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return d;
}

// Quantidade de cotas de um ticker em determinada data (soma compras - vendas até a data)
export function quantidadeNaData(movs: MovimentacaoB3[], ticker: string, dataISO: string): number {
  let q = 0;
  const tk = ticker.toUpperCase();
  for (const m of movs) {
    if ((m.ticker || '').toUpperCase() !== tk) continue;
    const d = toISODate(m.data);
    if (d > dataISO) continue; // ignora movimentos posteriores à data-com
    const tipo = (m.tipo || '').toString().toUpperCase();
    if (tipo.startsWith('C')) q += Math.abs(m.quantidade);
    else if (tipo.startsWith('V')) q -= Math.abs(m.quantidade);
  }
  return Math.max(0, q);
}

// Monta o resumo de um mês/ano de PAGAMENTO
export function resumoDoMes(
  ano: number,
  mes: number, // 1..12
  movs: MovimentacaoB3[],
  proventosPorTicker: Record<string, ProventoBrapi[]>,
  mediaPorTicker: Record<string, number>,
): ResumoMes {
  const key = mesAnoKey(ano, mes);
  const itens: ItemProventoMes[] = [];

  for (const [ticker, lista] of Object.entries(proventosPorTicker)) {
    const doMes = lista.filter(p => p.dataPagamento.slice(0, 7) === key);
    if (doMes.length) {
      for (const p of doMes) {
        const qtd = quantidadeNaData(movs, ticker, p.dataCom);
        if (qtd <= 0) continue;
        itens.push({
          ticker,
          tipo: p.tipo,
          dataCom: p.dataCom,
          dataPagamento: p.dataPagamento,
          quantidadeNaDataCom: qtd,
          valorUnitario: p.valorUnitario,
          valorTotal: qtd * p.valorUnitario,
          estimado: false,
        });
      }
    } else {
      // Mês sem anúncio: estima pela média (só se mês atual/futuro)
      const hojeKey = mesAnoKey(new Date().getFullYear(), new Date().getMonth() + 1);
      if (key >= hojeKey) {
        const media = mediaPorTicker[ticker] || 0;
        if (media > 0) {
          // posição estimada no último dia útil conhecido (usa hoje como referência)
          const qtd = quantidadeNaData(movs, ticker, '9999-12-31');
          if (qtd > 0) {
            itens.push({
              ticker,
              tipo: 'Rendimento',
              dataCom: '',
              dataPagamento: `${key}-15`, // data provável
              quantidadeNaDataCom: qtd,
              valorUnitario: media,
              valorTotal: qtd * media,
              estimado: true,
            });
          }
        }
      }
    }
  }

  itens.sort((a, b) => a.dataPagamento.localeCompare(b.dataPagamento) || a.ticker.localeCompare(b.ticker));
  const totalMes = itens.reduce((s, i) => s + i.valorTotal, 0);
  return { key, ano, mes, itens, totalMes };
}

// Resumos de todos os meses do ano
export function resumoDoAno(
  ano: number,
  movs: MovimentacaoB3[],
  proventosPorTicker: Record<string, ProventoBrapi[]>,
  mediaPorTicker: Record<string, number>,
): ResumoMes[] {
  return Array.from({ length: 12 }, (_, i) =>
    resumoDoMes(ano, i + 1, movs, proventosPorTicker, mediaPorTicker));
}

export function fmtBRL(v: number, casas = 2): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: 3 });
}

export function fmtDataBR(iso: string): string {
  if (!iso) return '--/--/--';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y.slice(2)}`;
}
