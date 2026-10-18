export const FII_DADOS: Record<string, { cnpj: string; nomePregao: string }> = {
  // --- INFRAESTRUTURA / FI-INFRA (Incluindo BODB11 da carteira) ---
  BODB11: { cnpj: "41.771.670/0001-99", nomePregao: "FIC FI BCNA" }, // Ajustado para encontrar no FNET
  KDIF11: { cnpj: "26.324.298/0001-89", nomePregao: "KINEA INF" },
  SNID11: { cnpj: "48.969.881/0001-80", nomePregao: "SUNO INF" },
  XPID11: { cnpj: "37.404.867/0001-12", nomePregao: "XP INFRA" },
  BDIF11: { cnpj: "40.502.607/0001-94", nomePregao: "BTG PACTUAL INF" },
  JURO11: { cnpj: "42.730.834/0001-00", nomePregao: "JURO" },
  CPTI11: { cnpj: "38.065.012/0001-77", nomePregao: "CSHG INF" },

  // --- FUNDOS DE PAPEL (Incluindo VGIR11, VGHF11, RBRX11, PCIP11) ---
  MXRF11: { cnpj: "97.521.225/0001-25", nomePregao: "MAXI RENDA" },
  PCIP11: { cnpj: "28.729.197/0001-13", nomePregao: "PCIP PAX" }, // Ajustado para o nome cadastrado no FNET
  KNCR11: { cnpj: "16.706.958/0001-32", nomePregao: "KINEA REND" },
  MCCI11: { cnpj: "23.648.935/0001-84", nomePregao: "MAUA CAP" },
  IRDM11: { cnpj: "28.830.325/0001-10", nomePregao: "IRIDIUM" },
  DEVA11: { cnpj: "37.087.810/0001-37", nomePregao: "DEVANT" },
  VGIR11: { cnpj: "29.852.732/0001-91", nomePregao: "VALREIII" },
  KNIP11: { cnpj: "24.960.430/0001-13", nomePregao: "KINEA IPCA" },
  HGLS11: { cnpj: "32.067.896/0001-57", nomePregao: "HGLS" },
  RBRR11: { cnpj: "29.467.977/0001-03", nomePregao: "RBR HIGH" },
  RECR11: { cnpj: "28.152.272/0001-26", nomePregao: "REC RECEB" },
  HCTR11: { cnpj: "30.248.180/0001-96", nomePregao: "HECTRE" },
  VGHF11: { cnpj: "36.771.692/0001-19", nomePregao: "VALORA H" },
  TGLT11: { cnpj: "33.516.270/0001-00", nomePregao: "TG LOGIST" },
  BARI11: { cnpj: "29.267.567/0001-00", nomePregao: "BARIGI" },
  CLIN11: { cnpj: "49.005.348/0001-60", nomePregao: "CSHG CLIN" },
  CVBI11: { cnpj: "28.729.197/0001-13", nomePregao: "VBI CRI" },
  GCRA11: { cnpj: "37.037.297/0001-70", nomePregao: "GCASA" },
  HABT11: { cnpj: "30.578.417/0001-05", nomePregao: "HABITAT" },
  OUFF11: { cnpj: "30.791.386/0001-68", nomePregao: "OURINVEST" },
  PORD11: { cnpj: "28.718.730/0001-44", nomePregao: "PORTICO" },
  RZAK11: { cnpj: "36.642.219/0001-31", nomePregao: "RIZA AKIN" },
  VGRI11: { cnpj: "53.656.482/0001-07", nomePregao: "VALORA R" },
  RBRX11: { cnpj: "41.088.458/0001-21", nomePregao: "RBR ALPHA" },

  // --- FUNDOS DE TIJOLO (Incluindo RBVA11, XPML11, GGRC11, ALZR11, TRXF11, HGBS11, GARE11) ---
  HGLG11: { cnpj: "11.728.688/0001-47", nomePregao: "CSHG LOGISTICA" },
  KNRI11: { cnpj: "12.005.956/0001-65", nomePregao: "KINEA RII" },
  XPML11: { cnpj: "28.757.546/0001-00", nomePregao: "XP MALLS" },
  VISC11: { cnpj: "17.554.274/0001-25", nomePregao: "VINCI SC" },
  BTLG11: { cnpj: "11.839.593/0001-09", nomePregao: "BTLG" },
  XPLG11: { cnpj: "26.502.794/0001-85", nomePregao: "XP LOG" },
  RECT11: { cnpj: "32.274.163/0001-59", nomePregao: "RIO BRAVO" },
  LVBI11: { cnpj: "30.629.603/0001-18", nomePregao: "VBI LOG" },
  GGRC11: { cnpj: "26.614.291/0001-00", nomePregao: "GGR" }, // Ajustado para encontrar no FNET
  MALL11: { cnpj: "26.499.833/0001-32", nomePregao: "MALLS BR" },
  TGAR11: { cnpj: "25.032.881/0001-53", nomePregao: "TG ARVI" },
  RBVA11: { cnpj: "15.576.907/0001-70", nomePregao: "RIO BRAVO" },
  ALZR11: { cnpj: "28.737.771/0001-85", nomePregao: "ALIANZA" },
  HGRU11: { cnpj: "29.641.226/0001-53", nomePregao: "CSHG URB" },
  BRCO11: { cnpj: "20.748.515/0001-81", nomePregao: "BRESCO" },
  HSLG11: { cnpj: "32.903.621/0001-71", nomePregao: "HSI LOG" },
  PVBI11: { cnpj: "35.652.102/0001-76", nomePregao: "VBI PINE" },
  JSRE11: { cnpj: "13.371.132/0001-71", nomePregao: "JS REAL" },
  FLMA11: { cnpj: "04.141.645/0001-03", nomePregao: "FATOR" },
  PATC11: { cnpj: "13.687.940/0001-44", nomePregao: "PACTUAL" },
  SARE11: { cnpj: "32.903.702/0001-71", nomePregao: "SANTANDER" },
  TRNT11: { cnpj: "04.722.883/0001-02", nomePregao: "TORRE" },
  VILG11: { cnpj: "24.853.044/0001-22", nomePregao: "VINCI LG" },
  ONEF11: { cnpj: "12.948.291/0001-23", nomePregao: "ONE" },
  RBRP11: { cnpj: "21.408.063/0001-51", nomePregao: "RIO BRAVO" },
  BLMG11: { cnpj: "32.062.247/0001-52", nomePregao: "BLOOMING" },
  EDGA11: { cnpj: "15.333.306/0001-37", nomePregao: "EDIFICIOS" },
  TRXF11: { cnpj: "28.548.288/0001-52", nomePregao: "TRX REAL" },
  HGBS11: { cnpj: "08.431.747/0001-06", nomePregao: "FII HEDGEBS" }, // Ajustado para nome completo exato
  GARE11: { cnpj: "37.295.919/0001-60", nomePregao: "GUARDIAN" }, // Ajustado para encontrar no FNET
  DAMA11: { cnpj: "53.866.872/0001-01", nomePregao: "DAMA" },

  // --- FUNDOS DE FUNDOS (FOFs) (Incluindo MFII11) ---
  BCFF11: { cnpj: "11.026.627/0001-38", nomePregao: "BTG PACTUAL" },
  RBRF11: { cnpj: "27.529.279/0001-51", nomePregao: "RBR FOF" },
  HFOF11: { cnpj: "18.307.582/0001-19", nomePregao: "HEDGE FOF" },
  KFOF11: { cnpj: "30.091.444/0001-40", nomePregao: "KINEA FOF" },
  BPFF11: { cnpj: "17.324.357/0001-28", nomePregao: "BTG PACTUAL" },
  CPFF11: { cnpj: "34.081.611/0001-23", nomePregao: "CSHG FOF" },
  MCHF11: { cnpj: "40.916.278/0001-20", nomePregao: "MAUA FOF" },
  MFII11: { cnpj: "16.915.968/0001-88", nomePregao: "MERITO" },
};

export const FII_CNPJ: Record<string, string> = Object.fromEntries(
  Object.entries(FII_DADOS).map(([ticker, info]) => [ticker, info.cnpj])
);