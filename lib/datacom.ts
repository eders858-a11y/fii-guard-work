export type DataComRegra =
  | {
      tipo: "dia";
      dia: number;
    }
  | {
      tipo: "faixa";
      inicio: number;
      fim: number;
    }
  | {
      tipo: "ultimo";
    };

export type DataComFii = {
  ticker: string;
  regra: DataComRegra;
};

/**
 * Feriados oficiais e dias sem pregão na B3 (2026 e 2027)
 * Inclui feriados nacionais e datas específicas sem negociação (ex: Carnaval, Véspera de Natal/Ano Novo)
 */
export const FERIADOS_B3 = new Set<string>([
  // 2026
  "2026-01-01", // Confraternização Universal
  "2026-02-16", // Carnaval
  "2026-02-17", // Carnaval
  "2026-04-03", // Sexta-feira Santa
  "2026-04-21", // Tiradentes
  "2026-05-01", // Dia do Trabalho
  "2026-06-04", // Corpus Christi
  "2026-09-07", // Independência do Brasil
  "2026-10-12", // Nossa Senhora Aparecida
  "2026-11-02", // Finados
  "2026-11-20", // Consciência Negra
  "2026-12-24", // Véspera de Natal (Sem pregão)
  "2026-12-25", // Natal
  "2026-12-31", // Véspera de Ano Novo (Sem pregão)

  // 2027
  "2027-01-01", // Confraternização Universal
  "2027-02-08", // Carnaval
  "2027-02-09", // Carnaval
  "2027-03-26", // Paixão de Cristo
  "2027-04-21", // Tiradentes
  "2027-05-01", // Dia do Trabalho
  "2027-05-27", // Corpus Christi
  "2027-09-07", // Independência do Brasil
  "2027-10-12", // Nossa Senhora Aparecida
  "2027-11-02", // Finados
  "2027-11-20", // Consciência Negra
  "2027-12-25", // Natal
]);

/**
 * Verifica se um determinado dia é dia útil na B3
 */
export function eDiaUtilB3(ano: number, mes: number, dia: number): boolean {
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  const diaSemana = data.getUTCDay(); // 0 = Domingo, 6 = Sábado
  if (diaSemana === 0 || diaSemana === 6) {
    return false;
  }

  const mStr = String(mes).padStart(2, "0");
  const dStr = String(dia).padStart(2, "0");
  const iso = `${ano}-${mStr}-${dStr}`;

  return !FERIADOS_B3.has(iso);
}

/**
 * Retorna todos os dias úteis reais da B3 para o ano e mês informados
 */
export function obterDiasUteisB3(ano: number, mes: number): string[] {
  const diasUteis: string[] = [];
  const totalDias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();

  for (let dia = 1; dia <= totalDias; dia++) {
    if (eDiaUtilB3(ano, mes, dia)) {
      const mStr = String(mes).padStart(2, "0");
      const dStr = String(dia).padStart(2, "0");
      diasUteis.push(`${ano}-${mStr}-${dStr}`);
    }
  }

  return diasUteis;
}

/**
 * Verifica se a B3 está fechada em uma determinada data
 */
export function b3EstaFechada(dataVerificar: Date): { fechado: boolean; motivo: string } {
  const diaSemana = dataVerificar.getDay(); // 0 = Domingo, 6 = Sábado
  if (diaSemana === 0 || diaSemana === 6) {
    const nomeDia = diaSemana === 6 ? "Sábado" : "Domingo";
    return { fechado: true, motivo: `Fim de semana (${nomeDia})` };
  }

  const ano = dataVerificar.getFullYear();
  const mes = String(dataVerificar.getMonth() + 1).padStart(2, "0");
  const dia = String(dataVerificar.getDate()).padStart(2, "0");
  const iso = `${ano}-${mes}-${dia}`;

  if (FERIADOS_B3.has(iso)) {
    return { fechado: true, motivo: "Feriado / Sem pregão na B3" };
  }

  return { fechado: false, motivo: "Dia útil (B3 opera normalmente)" };
}

export const DATA_COM_FIIS: DataComFii[] = [
  // 1º dia útil do mês
  { ticker: "GGRC11", regra: { tipo: "dia", dia: 1 } },
  { ticker: "QAGR11", regra: { tipo: "dia", dia: 1 } },

  // 4º dia útil do mês
  { ticker: "BLMR11", regra: { tipo: "dia", dia: 4 } },
  { ticker: "RCRB11", regra: { tipo: "dia", dia: 4 } },

  // 5º dia útil do mês
  { ticker: "BCFF11", regra: { tipo: "dia", dia: 5 } },
  { ticker: "BLMG11", regra: { tipo: "dia", dia: 5 } },
  { ticker: "BRCR11", regra: { tipo: "dia", dia: 5 } },
  { ticker: "BTCI11", regra: { tipo: "dia", dia: 5 } },
  { ticker: "CARE11", regra: { tipo: "dia", dia: 5 } },
  { ticker: "DEVA11", regra: { tipo: "dia", dia: 5 } },
  { ticker: "HCTR11", regra: { tipo: "dia", dia: 5 } },
  { ticker: "MGFF11", regra: { tipo: "dia", dia: 5 } },
  { ticker: "NCHB11", regra: { tipo: "dia", dia: 5 } },
  { ticker: "RBRL11", regra: { tipo: "dia", dia: 5 } },
  { ticker: "RBRP11", regra: { tipo: "dia", dia: 5 } },
  { ticker: "RECR11", regra: { tipo: "dia", dia: 5 } },
  { ticker: "RECT11", regra: { tipo: "dia", dia: 5 } },
  { ticker: "TORD11", regra: { tipo: "dia", dia: 5 } },
  { ticker: "VSLH11", regra: { tipo: "dia", dia: 5 } },

  // 6º dia útil do mês
  { ticker: "CPFF11", regra: { tipo: "dia", dia: 6 } },
  { ticker: "CVBI11", regra: { tipo: "dia", dia: 6 } },

  // 7º dia útil do mês
  { ticker: "IRDM11", regra: { tipo: "dia", dia: 7 } },
  { ticker: "RBFF11", regra: { tipo: "dia", dia: 7 } }, // Corrigido para o 7º dia útil
  { ticker: "RBRR11", regra: { tipo: "dia", dia: 7 } },
  { ticker: "RBRY11", regra: { tipo: "dia", dia: 7 } },

  // 8º dia útil do mês
  { ticker: "CPTS11", regra: { tipo: "dia", dia: 8 } },
  { ticker: "MCCI11", regra: { tipo: "dia", dia: 8 } },
  { ticker: "MCHF11", regra: { tipo: "dia", dia: 8 } },
  { ticker: "VGIP11", regra: { tipo: "dia", dia: 8 } },
  { ticker: "VGIR11", regra: { tipo: "dia", dia: 8 } },

  // 9º dia útil do mês
  { ticker: "MPRE11", regra: { tipo: "dia", dia: 9 } },

  // 10º dia útil do mês
  { ticker: "AFHI11", regra: { tipo: "dia", dia: 10 } },
  { ticker: "BTLG11", regra: { tipo: "dia", dia: 10 } },
  { ticker: "RBRX11", regra: { tipo: "dia", dia: 10 } },
  { ticker: "RZAK11", regra: { tipo: "dia", dia: 10 } },
  { ticker: "RZAT11", regra: { tipo: "dia", dia: 10 } },
  { ticker: "SNCI11", regra: { tipo: "dia", dia: 10 } },
  { ticker: "SNFF11", regra: { tipo: "dia", dia: 10 } },

  // 12º dia útil do mês
  { ticker: "ALZR11", regra: { tipo: "dia", dia: 12 } },
  { ticker: "BROF11", regra: { tipo: "dia", dia: 12 } },
  { ticker: "XPIN11", regra: { tipo: "dia", dia: 12 } },
  { ticker: "XPML11", regra: { tipo: "dia", dia: 12 } },

  // Entre 13º e 14º dia útil do mês
  { ticker: "BTAL11", regra: { tipo: "faixa", inicio: 13, fim: 14 } },
  { ticker: "MORC11", regra: { tipo: "faixa", inicio: 13, fim: 14 } },

  // Entre 16º e 18º dia útil do mês
  { ticker: "BTRA11", regra: { tipo: "faixa", inicio: 16, fim: 18 } },

  // Último dia útil do mês (FIIs e FI-Infra)
  { ticker: "AIEC11", regra: { tipo: "ultimo" } },
  { ticker: "ARRI11", regra: { tipo: "ultimo" } },
  { ticker: "BARI11", regra: { tipo: "ultimo" } },
  { ticker: "BBPO11", regra: { tipo: "ultimo" } },
  { ticker: "BCIA11", regra: { tipo: "ultimo" } },
  { ticker: "BCRI11", regra: { tipo: "ultimo" } },
  { ticker: "BODB11", regra: { tipo: "ultimo" } }, // FI-Infra
  { ticker: "BPFF11", regra: { tipo: "ultimo" } },
  { ticker: "BRCO11", regra: { tipo: "ultimo" } },
  { ticker: "CACR11", regra: { tipo: "ultimo" } },
  { ticker: "CYCR11", regra: { tipo: "ultimo" } },
  { ticker: "GALG11", regra: { tipo: "ultimo" } },
  { ticker: "GTWR11", regra: { tipo: "ultimo" } },
  { ticker: "HABT11", regra: { tipo: "ultimo" } },
  { ticker: "HFOF11", regra: { tipo: "ultimo" } },
  { ticker: "HGBS11", regra: { tipo: "ultimo" } },
  { ticker: "HGCR11", regra: { tipo: "ultimo" } },
  { ticker: "HGFF11", regra: { tipo: "ultimo" } },
  { ticker: "HGLG11", regra: { tipo: "ultimo" } },
  { ticker: "HGRE11", regra: { tipo: "ultimo" } },
  { ticker: "HGRU11", regra: { tipo: "ultimo" } },
  { ticker: "HSAF11", regra: { tipo: "ultimo" } },
  { ticker: "HSLG11", regra: { tipo: "ultimo" } },
  { ticker: "HSML11", regra: { tipo: "ultimo" } },
  { ticker: "HTMX11", regra: { tipo: "ultimo" } },
  { ticker: "JPPA11", regra: { tipo: "ultimo" } },
  { ticker: "JSAF11", regra: { tipo: "ultimo" } },
  { ticker: "JSRE11", regra: { tipo: "ultimo" } },
  { ticker: "KCRE11", regra: { tipo: "ultimo" } },
  { ticker: "KFOF11", regra: { tipo: "ultimo" } },
  { ticker: "KISU11", regra: { tipo: "ultimo" } },
  { ticker: "KNCR11", regra: { tipo: "ultimo" } },
  { ticker: "KNHY11", regra: { tipo: "ultimo" } },
  { ticker: "KNIP11", regra: { tipo: "ultimo" } },
  { ticker: "KNRI11", regra: { tipo: "ultimo" } },
  { ticker: "KNSC11", regra: { tipo: "ultimo" } },
  { ticker: "LGCP11", regra: { tipo: "ultimo" } },
  { ticker: "LVBI11", regra: { tipo: "ultimo" } },
  { ticker: "MALL11", regra: { tipo: "ultimo" } },
  { ticker: "MFII11", regra: { tipo: "ultimo" } },
  { ticker: "MXRF11", regra: { tipo: "ultimo" } },
  { ticker: "OUJP11", regra: { tipo: "ultimo" } },
  { ticker: "PATL11", regra: { tipo: "ultimo" } },
  { ticker: "PLCR11", regra: { tipo: "ultimo" } },
  { ticker: "PORD11", regra: { tipo: "ultimo" } },
  { ticker: "PVBI11", regra: { tipo: "ultimo" } },
  { ticker: "RBVA11", regra: { tipo: "ultimo" } },
  { ticker: "RZTR11", regra: { tipo: "ultimo" } },
  { ticker: "SADI11", regra: { tipo: "ultimo" } }, // Duplicata removida, mantido no último dia útil
  { ticker: "SDIL11", regra: { tipo: "ultimo" } },
  { ticker: "TEPP11", regra: { tipo: "ultimo" } },
  { ticker: "TGAR11", regra: { tipo: "ultimo" } },
  { ticker: "TRXF11", regra: { tipo: "ultimo" } },
  { ticker: "URPR11", regra: { tipo: "ultimo" } },
  { ticker: "VCJR11", regra: { tipo: "ultimo" } },
  { ticker: "VCRI11", regra: { tipo: "ultimo" } },
  { ticker: "VGHF11", regra: { tipo: "ultimo" } },
  { ticker: "VILG11", regra: { tipo: "ultimo" } },
  { ticker: "VINO11", regra: { tipo: "ultimo" } },
  { ticker: "VISC11", regra: { tipo: "ultimo" } },
  { ticker: "VIUR11", regra: { tipo: "ultimo" } },
  { ticker: "VRTA11", regra: { tipo: "ultimo" } },
  { ticker: "VTLT11", regra: { tipo: "ultimo" } },
  { ticker: "WHGR11", regra: { tipo: "ultimo" } },
  { ticker: "XPCI11", regra: { tipo: "ultimo" } },
  { ticker: "XPLG11", regra: { tipo: "ultimo" } },
  { ticker: "XPPR11", regra: { tipo: "ultimo" } },
  { ticker: "XPSF11", regra: { tipo: "ultimo" } },
];

export function obterRegraDataCom(ticker: string): DataComRegra | null {
  const item = DATA_COM_FIIS.find(
    (fii) => fii.ticker === ticker.toUpperCase().trim()
  );

  return item?.regra || null;
}

export function listarTickersDataCom(): string[] {
  return DATA_COM_FIIS.map((item) => item.ticker);
}
