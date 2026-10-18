import { ProventoBrapi, mesAnoKey } from './brapi-proventos';

export interface MovimentacaoB3 {
  ticker: string;            // ex.: 'HGLG11'
  data: string;              // 'YYYY-MM-DD' ou 'DD/MM/YYYY' ou 'DD-MM-YYYY'
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
  estimado: boolean;
}

export interface ResumoMes {
  key: string;             // 'YYYY-MM'
  ano: number;
  mes: number;             // 1..12
  itens: ItemProventoMes[];
  totalMes: number;
}

// ---------- Converte qualquer data (BR ou ISO) para 'YYYY-MM-DD' ----------
export function toISODate(d: string): string {
  if (!d) return '';
  // Trata DD-MM-YYYY ou DD/MM/YYYY
  const mBR = d.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (mBR) return `${mBR[3]}-${mBR[2]}-${mBR[1]}`;

  // Trata YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);

  return d;
}

// Quantidade de cotas de um ticker em determinada data (soma compras - vendas até a data)
export function quantidadeNaData(movs: MovimentacaoB3[], ticker: string, dataISO: string): number {
  let q = 0;
  const tk = ticker.toUpperCase();
  const limitDateISO = toISODate(dataISO);

  for (const m of movs) {
    if ((m.ticker || '').toUpperCase() !== tk) continue;
    const d = toISODate(m.data);
    if (limitDateISO && d > limitDateISO) continue; // ignora movimentos posteriores à data-com

    const tipo = (m.tipo || '').toString().toUpperCase();
    if (tipo.startsWith('C')) q += Math.abs(m.quantidade);
    else if (tipo.startsWith('V')) q -= Math.abs(m.quantidade);
  }
  return Math.max(0, q);
}

// Monta o resumo de um mês/ano de PAGAMENTO (Apenas dados reais confirmados)
export function resumoDoMes(
  ano: number,
  mes: number, // 1..12
  movs: MovimentacaoB3[],
  proventosPorTicker: Record<string, ProventoBrapi[]>,
  mediaPorTicker: Record<string, number>,
): ResumoMes {
  const key = mesAnoKey(ano, mes); // Ex: "2026-08"
  const itens: ItemProventoMes[] = [];

  for (const [ticker, lista] of Object.entries(proventosPorTicker)) {
    // Converte a data de pagamento para ISO para extrair o ano-mês corretamente (YYYY-MM)
    const doMes = lista.filter(p => {
      const dateIso = toISODate(p.dataPagamento);
      return dateIso.slice(0, 7) === key;
    });

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
    }
  }

  // Ordenação usando conversão para ISO
  itens.sort((a, b) => {
    const isoA = toISODate(a.dataPagamento);
    const isoB = toISODate(b.dataPagamento);
    return isoA.localeCompare(isoB) || a.ticker.localeCompare(b.ticker);
  });

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

export function fmtDataBR(dateStr: string): string {
  if (!dateStr) return '--/--/----';

  // Se já estiver formatado com - ou /
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts[0].length === 4) {
      // YYYY-MM-DD -> DD/MM/YYYY
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    // DD-MM-YYYY -> DD/MM/YYYY
    return dateStr.replace(/-/g, '/');
  }
  return dateStr;
}