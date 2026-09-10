export type FundSuggestion = {
  ticker: string;
  name: string;
  sector: "Fundo de papel" | "Fundo de tijolo" | "Infraestrutura" |"Hibrido Papel" | "Fundo de fundos";
  segment: string
};

const rows: [string, string, FundSuggestion["sector"], string][] = [
  // --- INFRAESTRUTURA (FI-Infra) ---
  ["BODB11", "Bocaina Infra", "Infraestrutura", "Infraestrutura"],
  ["KDIF11", "Kinea Infra", "Infraestrutura", "Infraestrutura"],
  ["SNID11", "Suno Infra", "Infraestrutura", "Infraestrutura"],
  ["XPID11", "XP Infra", "Infraestrutura", "Infraestrutura"],
  ["BDIF11", "BTG Pactual Infra", "Infraestrutura", "Infraestrutura"],
  ["JURO11", "Sparta Infra", "Infraestrutura", "Infraestrutura"],
  ["CPTI11", "Capitânia Infra", "Infraestrutura", "Infraestrutura"],

  // --- FUNDOS DE PAPEL (Recebíveis) ---
  ["MXRF11", "Maxi Renda", "Fundo de papel", "Papéis CDI"],
  ["CPTS11", "Capitânia Securities", "Fundo de papel", "Papéis CDI"],
  ["KNCR11", "Kinea Rendimentos", "Fundo de papel", "Papéis CDI"],
  ["MCCI11", "Mauá Capital Recebíveis", "Fundo de papel", "Papéis CDI"],
  ["IRDM11", "Iridium Recebíveis", "Fundo de papel", "Papéis CDI"],
  ["DEVA11", "Devant Recebíveis", "Fundo de papel", "Papéis CDI"],
  ["VGIR11", "Valora Hedge", "Fundo de papel", "Papéis CDI"],
  ["KNIP11", "Kinea Índices de Preços", "Fundo de papel", "Papéis IPCA"],
  ["HGLS11", "Hedge Recebíveis", "Fundo de papel", "Papéis IPCA"],
  ["RBRR11", "RBR High Yield", "Fundo de papel", "Papéis IPCA"],
  ["RECR11", "REC Recebíveis Imobiliários", "Fundo de papel", "Papéis IPCA"],
  ["HCTR11", "Hectare CE", "Fundo de papel", "Papéis High Yield"],
  ["VGHF11", "Valora Hedge", "Fundo de papel", "Papéis Hibrido"],
  ["TGLT11", "TG Fundo de Papel", "Fundo de papel", "Papéis IPCA"],
  ["BARI11", "Barigui Rendimentos", "Fundo de papel", "Papéis IPCA"],
  ["CLIN11", "Sparta CRI", "Fundo de papel", "Papéis CDI"],
  ["CVBI11", "VBI Recebíveis", "Fundo de papel", "Papéis IPCA"],
  ["GCRA11", "GGR Recebíveis", "Fundo de papel", "Papéis CDI"],
  ["HABT11", "Habitat Recebíveis", "Fundo de papel", "Papéis IPCA"],
  ["OUFF11", "Ourinvest Fundo de Papel", "Fundo de papel", "Papéis CDI"],
  ["PORD11", "Pactual Oportunidades", "Fundo de papel", "Papéis IPCA"],
  ["RZAK11", "Riza Akin", "Fundo de papel", "Papéis IPCA"],

  // --- FUNDOS DE TIJOLO (Logística, Shoppings, Lajes, etc.) ---
  ["HGLG11", "CSHG Logística", "Fundo de tijolo", "Logística"],
  ["KNRI11", "Kinea Renda Imobiliária", "Fundo de tijolo", "Híbrido"],
  ["XPML11", "XP Malls", "Fundo de tijolo", "Shoppings"],
  ["VISC11", "Vinci Shoppings", "Fundo de tijolo", "Shoppings"],
  ["BTLG11", "BTG Logística", "Fundo de tijolo", "Logística"],
  ["XPLG11", "XP Log", "Fundo de tijolo", "Logística"],
  ["RECT11", "REC Renda Imobiliária", "Fundo de tijolo", "Lajes corporativas"],
  ["LVBI11", "VBI Logístico", "Fundo de tijolo", "Logística"],
  ["GGRC11", "GGR Covepi", "Fundo de tijolo", "Industrial"],
  ["MALL11", "Malls Brasil Plural", "Fundo de tijolo", "Shoppings"],
  ["TGAR11", "TG Ativo Real", "Fundo de tijolo", "Desenvolvimento"],
  ["RBVA11", "VBI Reits", "Fundo de tijolo", "Varejo"],
  ["ALZR11", "Alianza Trust Renda Imobiliária", "Fundo de tijolo", "Renda urbana"],
  ["HGRU11", "CSHG Renda Urbana", "Fundo de tijolo", "Renda urbana"],
  ["BRCO11", "Bresco Logística", "Fundo de tijolo", "Logística"],
  ["HSLG11", "HSI Logística", "Fundo de tijolo", "Logística"],
  ["PVBI11", "VBI Prime Properties", "Fundo de tijolo", "Lajes corporativas"],
  ["JSRE11", "JS Real Estate", "Fundo de tijolo", "Lajes corporativas"],
  ["FLMA11", "Fama", "Fundo de tijolo", "Shoppings"],
  ["PATC11", "Pactual Corporate", "Fundo de tijolo", "Lajes corporativas"],
  ["SARE11", "Santander Renda Imobiliária", "Fundo de tijolo", "Híbrido"],
  ["TRNT11", "Torre Norte", "Fundo de tijolo", "Lajes corporativas"],
  ["VILG11", "Vinci Logística", "Fundo de tijolo", "Logística"],
  ["ONEF11", "The One", "Fundo de tijolo", "Lajes corporativas"],
  ["RBRP11", "RBR Properties", "Fundo de tijolo", "Lajes corporativas"],
  ["BLMG11", "Blueming Logística", "Fundo de tijolo", "Logística"],
  ["EDGA11", "Edifício Galeria", "Fundo de tijolo", "Lajes corporativas"],
  ["TRXF11", "TRX Real Estate", "Fundo de tijolo", "Renda urbana"],
  ["GARE11", "Guardiã Real Estate", "Fundo de tijolo", "Renda urbana"],
  ["HGBS11", "Hedge Brasil Shopping", "Fundo de tijolo", "Shoppings"],

  // --- FUNDOS DE FUNDOS (FOFs) ---
  ["BCFF11", "BTG Fundo de Fundos", "Fundo de fundos", "Fundo de fundos"],
  ["RBRF11", "RBR Alpha", "Fundo de fundos", "Fundo de fundos"],
  ["HFOF11", "Hedge FOF", "Fundo de fundos", "Fundo de fundos"],
  ["KFOF11", "Kinea FOF", "Fundo de fundos", "Fundo de fundos"],
  ["BPFF11", "Pactual FOF", "Fundo de fundos", "Fundo de fundos"],
  ["CPFF11", "Capitânia FOF", "Fundo de fundos", "Fundo de fundos"],
  ["MCHF11", "Mauá Capital FOF", "Fundo de fundos", "Fundo de fundos"],
  ["MFII11", "Merito FII", "Fundo de fundos", "Outros"]
];

export const FII_CATALOG: FundSuggestion[] = rows.map(([ticker, name, sector, segment]) => ({ ticker, name, sector, segment }));

export function suggestFunds(query: string) {
  const term = query.trim().toUpperCase();
  if (!term) return [];
  return FII_CATALOG.filter((fund) => fund.ticker.includes(term) || fund.name.toUpperCase().includes(term)).slice(0, 5);
}

export function findFund(ticker: string) {
  const cleanTicker = ticker.trim().toUpperCase();
  const found = FII_CATALOG.find((fund) => fund.ticker === cleanTicker);
  if (found) return found;

  // Fallback inteligente para novos ativos que terminem com 11
  if (cleanTicker.endsWith("11")) {
    return {
      ticker: cleanTicker,
      name: cleanTicker,
      sector: "Fundo de papel" as const,
      segment: "Papel CDI/IPCA"
    };
  }
  return undefined;
}