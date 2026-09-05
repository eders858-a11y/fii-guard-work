export type FundSuggestion = { ticker: string; name: string; sector: "Fundo de papel" | "Fundo de tijolo" | "Outros"; segment: string };
const rows: [string, string, FundSuggestion["sector"], string][] = [
  ["HGLG11", "CSHG Logística", "Fundo de tijolo", "Logística"],
  ["MXRF11", "Maxi Renda", "Fundo de papel", "Papéis CDI"],
  ["KNRI11", "Kinea Renda Imobiliária", "Fundo de tijolo", "Híbrido"],
  ["XPML11", "XP Malls", "Fundo de tijolo", "Shoppings"],
  ["VISC11", "Vinci Shoppings", "Fundo de tijolo", "Shoppings"],
  ["BTLG11", "BTG Logística", "Fundo de tijolo", "Logística"],
  ["XPLG11", "XP Log", "Fundo de tijolo", "Logística"],
  ["CPTS11", "Capitânia Securities", "Fundo de papel", "Papéis CDI"],
  ["KNCR11", "Kinea Rendimentos", "Fundo de papel", "Papéis CDI"],
  ["MCCI11", "Mauá Capital Recebíveis", "Fundo de papel", "Papéis CDI"],
  ["RECT11", "REC Renda Imobiliária", "Fundo de tijolo", "Lajes corporativas"],
  ["IRDM11", "Iridium Recebíveis", "Fundo de papel", "Papéis CDI"],
  ["BCFF11", "BTG Fundo de Fundos", "Outros", "Fundo de fundos"],
  ["RBRF11", "RBR Alpha", "Outros", "Fundo de fundos"],
  ["LVBI11", "VBI Logístico", "Fundo de tijolo", "Logística"],
  ["TRXF11", "TRX Real Estate", "Fundo de tijolo", "Renda urbana"],
  ["GGRC11", "GGR Covepi", "Fundo de tijolo", "Industrial"],
  ["MALL11", "Malls Brasil Plural", "Fundo de tijolo", "Shoppings"],
  ["DEVA11", "Devant Recebíveis", "Fundo de papel", "Papéis CDI"],
  ["TGAR11", "TG Ativo Real", "Fundo de tijolo", "Desenvolvimento"],
  ["VGIR11", "Valora Hedge", "Fundo de papel", "Papéis CDI"],
  ["RBVA11", "VBI Reits", "Fundo de tijolo", "Varejo"],
  ["ALZR11", "Alianza Trust Renda Imobiliária", "Fundo de tijolo", "Renda urbana"],
];
export const FII_CATALOG: FundSuggestion[] = rows.map(([ticker, name, sector, segment]) => ({ ticker, name, sector, segment }));
export function suggestFunds(query: string) { const term = query.trim().toUpperCase(); if (!term) return []; return FII_CATALOG.filter((fund) => fund.ticker.includes(term) || fund.name.toUpperCase().includes(term)).slice(0, 5); }
export function findFund(ticker: string) { return FII_CATALOG.find((fund) => fund.ticker === ticker.trim().toUpperCase()); }
