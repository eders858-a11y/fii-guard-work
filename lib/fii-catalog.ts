export type FundSuggestion = {
  ticker: string;
  name: string;
  sector:
    | "Fundo de papel"
    | "Fundo de tijolo"
    | "Infraestrutura"
    | "Hibrido Papel"
    | "Fundo de fundos"
    | "Multiestratégia";
  segment: string;
  cnpj?: string;
};

const rows: [string, string, FundSuggestion["sector"], string, string?][] = [
  // --- INFRAESTRUTURA ---
  ["BODB11", "Bocaina Infra", "Infraestrutura", "Infraestrutura", "41.771.670/0001-99"],
  ["KDIF11", "Kinea Infra", "Infraestrutura", "Infraestrutura", "08.604.187/0001-44"],
  ["SNID11", "Suno Infra", "Infraestrutura", "Infraestrutura", "48.969.881/0001-80"],
  ["XPID11", "XP Infra", "Infraestrutura", "Infraestrutura", "37.404.867/0001-12"],
  ["BDIF11", "BTG Pactual Infra", "Infraestrutura", "Infraestrutura", "40.502.607/0001-94"],
  ["JURO11", "Sparta Infra", "Infraestrutura", "Infraestrutura", "42.730.834/0001-00"],
  ["CPTI11", "Capitânia Infra", "Infraestrutura", "Infraestrutura", "38.065.012/0001-77"],

  // --- FUNDOS DE PAPEL ---
  ["MXRF11", "Maxi Renda", "Fundo de papel", "Papéis CDI", "97.589.534/0001-10"],
  ["KNCR11", "Kinea Rendimentos", "Fundo de papel", "Papéis CDI", "12.012.355/0001-10"],
  ["MCCI11", "Mauá Capital Recebíveis", "Fundo de papel", "Papéis CDI", "30.446.526/0001-43"],
  ["IRDM11", "Iridium Recebíveis", "Fundo de papel", "Papéis CDI", "28.922.977/0001-20"],
  ["DEVA11", "Devant Recebíveis", "Fundo de papel", "Papéis CDI", "37.146.741/0001-09"],
  ["VGIR11", "Valora Hedge", "Fundo de papel", "Papéis CDI", "33.918.239/0001-34"],
  ["KNIP11", "Kinea Índices de Preços", "Fundo de papel", "Papéis IPCA", "15.048.917/0001-04"],
  ["HGLS11", "Hedge Recebíveis", "Fundo de papel", "Papéis IPCA", "32.067.896/0001-57"],
  ["RBRR11", "RBR High Yield", "Fundo de papel", "Papéis IPCA", "28.740.169/0001-24"],
  ["RECR11", "REC Recebíveis Imobiliários", "Fundo de papel", "Papéis IPCA", "28.528.275/0001-76"],
  ["HCTR11", "Hectare CE", "Fundo de papel", "Papéis High Yield", "27.636.574/0001-20"],
  ["TGLT11", "TG Fundo de Papel", "Fundo de papel", "Papéis IPCA", "33.516.270/0001-00"],
  ["BARI11", "Barigui Rendimentos", "Fundo de papel", "Papéis IPCA", "28.231.130/0001-20"],
  ["CLIN11", "Sparta CRI", "Fundo de papel", "Papéis CDI", "45.029.135/0001-07"],
  ["CVBI11", "VBI Recebíveis", "Fundo de papel", "Papéis IPCA", "30.019.539/0001-05"],
  ["GCRA11", "GGR Recebíveis", "Fundo de papel", "Papéis CDI", "41.657.442/0001-04"],
  ["HABT11", "Habitat Recebíveis", "Fundo de papel", "Papéis IPCA", "32.536.858/0001-07"],
  ["OUFF11", "Ourinvest Fundo de Papel", "Fundo de papel", "Papéis CDI", "21.603.882/0001-00"],
  ["PORD11", "Pactual Oportunidades", "Fundo de papel", "Papéis IPCA", "28.718.730/0001-44"],
  ["RZAK11", "Riza Akin", "Fundo de papel", "Papéis IPCA", "37.525.045/0001-04"],
  ["VGRI11", "Vila Olimpia Corporate", "Fundo de papel", "Recebíveis", "41.564.045/0001-91"],

  // --- FUNDOS DE TIJOLO ---
  ["HGLG11", "CSHG Logística", "Fundo de tijolo", "Logística", "11.728.896/0001-89"],
  ["KNRI11", "Kinea Renda Imobiliária", "Fundo de tijolo", "Híbrido", "12.003.768/0001-77"],
  ["XPML11", "XP Malls", "Fundo de tijolo", "Shoppings", "28.767.113/0001-38"],
  ["VISC11", "Vinci Shoppings", "Fundo de tijolo", "Shoppings", "24.771.748/0001-20"],
  ["BTLG11", "BTG Logística", "Fundo de tijolo", "Logística", "15.311.609/0001-05"],
  ["XPLG11", "XP Log", "Fundo de tijolo", "Logística", "26.568.228/0001-50"],
  ["RECT11", "REC Renda Imobiliária", "Fundo de tijolo", "Lajes corporativas", "28.533.366/0001-39"],
  ["LVBI11", "VBI Logístico", "Fundo de tijolo", "Logística", "32.883.391/0001-06"],
  ["GGRC11", "GGR Covepi", "Fundo de tijolo", "Industrial", "18.398.805/0001-90"],
  ["MALL11", "Malls Brasil Plural", "Fundo de tijolo", "Shoppings", "30.347.019/0001-50"],
  ["TGAR11", "TG Ativo Real", "Fundo de tijolo", "Desenvolvimento", "25.032.553/0001-06"],
  ["MFII11", "Merito FII", "Fundo de tijolo", "Desenvolvimento", "11.392.207/0001-20"],
  ["RBVA11", "VBI Reits", "Fundo de tijolo", "Varejo", "13.111.458/0001-98"],
  ["ALZR11", "Alianza Trust Renda Imobiliária", "Fundo de tijolo", "Renda urbana", "28.548.868/0001-50"],
  ["HGRU11", "CSHG Renda Urbana", "Fundo de tijolo", "Renda urbana", "28.155.198/0001-94"],
  ["BRCO11", "Bresco Logística", "Fundo de tijolo", "Logística", "29.986.377/0001-35"],
  ["HSLG11", "HSI Logística", "Fundo de tijolo", "Logística", "34.195.578/0001-30"],
  ["PVBI11", "VBI Prime Properties", "Fundo de tijolo", "Lajes corporativas", "34.197.519/0001-00"],
  ["JSRE11", "JS Real Estate", "Fundo de tijolo", "Lajes corporativas", "09.118.892/0001-17"],
  ["FLMA11", "Fama", "Fundo de tijolo", "Shoppings", "10.669.516/0001-20"],
  ["PATC11", "Pactual Corporate", "Fundo de tijolo", "Lajes corporativas", "13.687.940/0001-44"],
  ["SARE11", "Santander Renda Imobiliária", "Fundo de tijolo", "Híbrido", "34.805.515/0001-14"],
  ["TRNT11", "Torre Norte", "Fundo de tijolo", "Lajes corporativas", "03.047.886/0001-03"],
  ["VILG11", "Vinci Logística", "Fundo de tijolo", "Logística", "31.399.043/0001-41"],
  ["ONEF11", "The One", "Fundo de tijolo", "Lajes corporativas", "14.380.518/0001-42"],
  ["RBRP11", "RBR Properties", "Fundo de tijolo", "Lajes corporativas", "16.924.965/0001-10"],
  ["EDGA11", "Edifício Galeria", "Fundo de tijolo", "Lajes corporativas", "13.370.217/0001-20"],
  ["TRXF11", "TRX Real Estate", "Fundo de tijolo", "Renda urbana", "28.548.288/0001-52"],
  ["HGBS11", "Hedge Brasil Shopping", "Fundo de tijolo", "Shoppings", "13.090.934/0001-07"],
  ["GARE11", "Guardian Real Estate", "Fundo de tijolo", "Renda urbana", "42.066.533/0001-20"],

  // --- MULTIESTRATÉGIA ---
  ["CPTS11", "Capitânia Securities", "Multiestratégia", "Papéis CDI", "13.932.775/0001-68"],
  ["VGHF11", "Valora Hedge", "Multiestratégia", "Multiestratégia", "37.798.818/0001-92"],
  ["RBRX11", "RBR Crédito Imobiliário", "Multiestratégia", "Recebíveis", "40.540.091/0001-08"],
  ["BLMG11", "Blueming Logística", "Multiestratégia", "Logística", "32.062.247/0001-52"],
  ["DAMA11", "Dama FII", "Multiestratégia", "Outros", "36.331.026/0001-44"],

  // --- FUNDOS DE FUNDOS ---
  ["BCFF11", "BTG Fundo de Fundos", "Fundo de fundos", "Fundo de fundos", "11.666.195/0001-57"],
  ["RBRF11", "RBR Alpha", "Fundo de fundos", "Fundo de fundos", "28.533.275/0001-13"],
  ["HFOF11", "Hedge FOF", "Fundo de fundos", "Fundo de fundos", "28.877.060/0001-50"],
  ["KFOF11", "Kinea FOF", "Fundo de fundos", "Fundo de fundos", "34.195.601/0001-05"],
  ["BPFF11", "Pactual FOF", "Fundo de fundos", "Fundo de fundos", "17.761.352/0001-79"],
  ["CPFF11", "Capitânia FOF", "Fundo de fundos", "Fundo de fundos", "31.399.027/0001-19"],
  ["MCHF11", "Mauá Capital FOF", "Fundo de fundos", "Fundo de fundos", "40.916.278/0001-20"],
];
export const FII_CATALOG: FundSuggestion[] = rows.map(([ticker, name, sector, segment, cnpj]) => ({
  ticker,
  name,
  sector,
  segment,
  cnpj,
}));

export function suggestFunds(query: string) {
  const term = query.trim().toUpperCase();
  if (!term) return [];
  return FII_CATALOG.filter((f) => f.ticker.includes(term) || f.name.toUpperCase().includes(term)).slice(0, 5);
}

export function findFund(ticker: string) {
  const cleanTicker = ticker.trim().toUpperCase();
  const found = FII_CATALOG.find((f) => f.ticker === cleanTicker);
  if (found) return found;

  if (cleanTicker.endsWith("11")) {
    return { ticker: cleanTicker, name: cleanTicker, sector: "Fundo de papel" as const, segment: "Papel CDI/IPCA" };
  }
  return undefined;
}
