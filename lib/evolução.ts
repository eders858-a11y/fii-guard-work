import AsyncStorage from '@react-native-async-storage/async-storage';

const PORTFOLIO_KEY = '@fii-guard/portfolio-v2';
const CACHE_EVOLUCAO_KEY = '@fii-guard/cache-evolucao-v1';
const BRAPI_TOKEN = 'fZh138TebUi2JYGBJG75C6';

const BCB_CDI_URL =
  'https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados';

const BCB_IPCA_URL =
  'https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados';

export interface PontoEvolucao {
  value: number;
  label?: string;
  data?: string;
}

export interface DatasetEvolucao {
  carteira: PontoEvolucao[];
  ifix: PontoEvolucao[];
  cdi: PontoEvolucao[];
  ipca: PontoEvolucao[];
}

type Operation = {
  ticker: string;
  kind: 'buy' | 'sell';
  date: string;
  quantity: number;
  price: number;
  fees?: number;
};

type Portfolio = {
  operations?: Operation[];
  quotes?: Record<string, { price: number }>;
};

type SerieBCB = {
  data: string;
  valor: string;
};

function dataBRParaISO(data: string): string {
  const partes = data.split('/');
  return `${partes[2]}-${partes[1]}-${partes[0]}`;
}

function formatarData(data: string): string {
  const partes = data.split('-');
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function formatarLabel(data: string): string {
  const [ano, mes] = data.split('-');
  const meses = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
  ];

  return `${meses[Number(mes) - 1]}\n${ano}`;
}

function normalizarTicker(ticker: string): string {
  return ticker?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/SA$/, '') || '';
}

function dataInicialDasOperacoes(operations: Operation[]): string {
  const compras = operations
    .filter(
      (op) =>
        op.kind === 'buy' &&
        op.date &&
        Number(op.quantity) > 0,
    )
    .map((op) => op.date.slice(0, 10))
    .sort();

  if (!compras.length) {
    const umAnoAtras = new Date();
    umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
    return umAnoAtras.toISOString().slice(0, 10);
  }

  return compras[0];
}

async function buscarSerieBCB(
  codigoUrl: string,
  inicio: string,
  fim: string,
  tipo: 'cdi' | 'ipca',
): Promise<Map<string, number>> {
  const serie = new Map<string, number>();
  try {
    const url =
      `${codigoUrl}?formato=json` +
      `&dataInicial=${encodeURIComponent(formatarData(inicio))}` +
      `&dataFinal=${encodeURIComponent(formatarData(fim))}`;

    const resposta = await fetch(url);

    if (resposta.ok) {
      const dados = (await resposta.json()) as SerieBCB[];
      for (const item of dados) {
        if (!item.data || !item.valor) continue;
        const valor = Number(item.valor.replace(',', '.'));

        if (Number.isFinite(valor)) {
          if (tipo === 'ipca') {
            const partes = item.data.split('/');
            if (partes.length === 3) {
              const mesAno = `${partes[2]}-${partes[1]}`;
              serie.set(mesAno, valor);
            }
          } else {
            const dataIso = dataBRParaISO(item.data);
            serie.set(dataIso, valor);
          }
        }
      }
    }
  } catch (error) {
    console.warn('[BCB] Erro ao buscar dados:', error);
  }

  return serie;
}

function gerarMeses(inicio: string, fim: string): string[] {
  const resultado: string[] = [];
  const data = new Date(`${inicio.slice(0, 7)}-01T12:00:00`);
  const final = new Date(`${fim.slice(0, 7)}-01T12:00:00`);

  while (data <= final) {
    resultado.push(
      `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`,
    );
    data.setMonth(data.getMonth() + 1);
  }

  return resultado;
}

async function buscarHistoricoAtivo(
  ticker: string,
  inicio: string,
  fim: string,
  fallbackPreco?: number,
): Promise<Map<string, number>> {
  const historico = new Map<string, number>();

  try {
    const tkClean = normalizarTicker(ticker);
    const urlBrapi = `https://brapi.dev/api/quote/${tkClean}?range=2y&interval=1d&token=${BRAPI_TOKEN}`;
    const resp = await fetch(urlBrapi);

    if (resp.ok) {
      const json = await resp.json();
      const histData = json?.results?.[0]?.historicalDataPrice;

      if (Array.isArray(histData) && histData.length > 0) {
        histData.forEach((item: { date?: number; close?: number }) => {
          if (item.date && typeof item.close === 'number' && item.close > 0) {
            const dateStr = new Date(item.date * 1000).toISOString().slice(0, 10);
            historico.set(dateStr, item.close);
          }
        });
      }
    }
  } catch (err) {
    console.warn(`[BRAPI] Erro ao buscar ${ticker}:`, err);
  }

  if (!historico.size && fallbackPreco && fallbackPreco > 0) {
    historico.set(inicio, fallbackPreco);
    historico.set(fim, fallbackPreco);
  }

  return historico;
}

function ultimoPrecoAte(
  historico: Map<string, number>,
  data: string,
): number | undefined {
  let melhorData: string | undefined;
  let melhorPreco: number | undefined;

  for (const [dia, valor] of historico) {
    if (
      dia <= data &&
      Number.isFinite(valor) &&
      valor > 0 &&
      (melhorData === undefined || dia > melhorData)
    ) {
      melhorData = dia;
      melhorPreco = valor;
    }
  }

  if (melhorPreco !== undefined) {
    return melhorPreco;
  }

  const primeiro = [...historico.entries()]
    .filter(([dia, valor]) =>
      dia > data && Number.isFinite(valor) && valor > 0
    )
    .sort(([dataA], [dataB]) => dataA.localeCompare(dataB))[0];

  return primeiro?.[1];
}

async function buscarHistoricoIFIX(
  inicio: string,
  fim: string,
): Promise<Map<string, number>> {
  const historico = new Map<string, number>();

  const converterValor = (valor: unknown): number => {
    if (typeof valor === "number") return valor;
    if (typeof valor !== "string" || !valor.trim()) return 0;

    const numero = Number(
      valor.trim().replace(/\./g, "").replace(",", "."),
    );

    return Number.isFinite(numero) ? numero : 0;
  };

  try {
    const anoInicial = Number(inicio.slice(0, 4));
    const anoFinal = Number(fim.slice(0, 4));

    for (let ano = anoInicial; ano <= anoFinal; ano++) {
      const payload = JSON.stringify({
        index: "IFIX",
        language: "pt-br",
        year: String(ano),
      });

      const payloadBase64 = btoa(
        unescape(encodeURIComponent(payload)),
      );

      const url =
        "https://sistemaswebb3-listados.b3.com.br/" +
        "indexStatisticsProxy/IndexCall/GetPortfolioDay/" +
        payloadBase64;

      const resp = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!resp.ok) continue;

      const json = await resp.json();
      const resultados = json?.results;

      if (!Array.isArray(resultados)) continue;

      for (const linha of resultados) {
        const dia = Number(linha?.day);

        if (!Number.isInteger(dia) || dia < 1 || dia > 31) continue;

        for (let mes = 1; mes <= 12; mes++) {
          const campo = `rateValue${mes}`;
          const valor = converterValor(linha?.[campo]);

          if (valor <= 0) continue;

          const data =
            `${ano}-${String(mes).padStart(2, "0")}-` +
            `${String(dia).padStart(2, "0")}`;

          const dataValida = new Date(
            Date.UTC(ano, mes - 1, dia),
          );

          if (
            dataValida.getUTCFullYear() !== ano ||
            dataValida.getUTCMonth() !== mes - 1 ||
            dataValida.getUTCDate() !== dia
          ) {
            continue;
          }

          if (data >= inicio && data <= fim) {
            historico.set(data, valor);
          }
        }
      }
    }
  } catch (err) {
    console.warn("[IFIX] Erro ao consultar histórico da B3:", err);
  }

  return historico;
}

// Função interna principal de cálculo (executada em background ou fallback)
async function processarCalculoEvolucao(): Promise<DatasetEvolucao> {
  const cache = await AsyncStorage.getItem(PORTFOLIO_KEY);

  if (!cache) {
    throw new Error('Carteira local não encontrada.');
  }

  const portfolio = JSON.parse(cache) as Portfolio;
  const operations = portfolio.operations ?? [];

  const inicio = dataInicialDasOperacoes(operations);
  const fim = new Date().toISOString().slice(0, 10);

  const tickers = [
    ...new Set(
      operations.map((op) => normalizarTicker(op.ticker)),
    ),
  ];

  if (!tickers.length) {
    return {
      carteira: [{ value: 100, label: 'Atual', data: fim }],
      ifix: [{ value: 100, label: 'Atual', data: fim }],
      cdi: [{ value: 100, label: 'Atual', data: fim }],
      ipca: [{ value: 100, label: 'Atual', data: fim }],
    };
  }

  const fallbackPrecos = new Map<string, number>();
  for (const ticker of tickers) {
    const opsTicker = operations.filter(
      (op) => normalizarTicker(op.ticker) === ticker && op.kind === 'buy',
    );
    if (opsTicker.length > 0) {
      const totalQtd = opsTicker.reduce((sum, op) => sum + Number(op.quantity), 0);
      const totalValor = opsTicker.reduce(
        (sum, op) => sum + Number(op.quantity) * Number(op.price),
        0,
      );
      if (totalQtd > 0) {
        fallbackPrecos.set(ticker, totalValor / totalQtd);
      }
    }
    if (!fallbackPrecos.has(ticker) && portfolio.quotes?.[ticker]?.price) {
      fallbackPrecos.set(ticker, portfolio.quotes[ticker].price);
    }
  }

  const [historicos, serieCDI, serieIPCA, historicoIFIX] =
    await Promise.all([
      Promise.all(
        tickers.map(async (ticker) => ({
          ticker,
          historico: await buscarHistoricoAtivo(
            ticker,
            inicio,
            fim,
            fallbackPrecos.get(ticker),
          ),
        })),
      ),
      buscarSerieBCB(BCB_CDI_URL, inicio, fim, 'cdi'),
      buscarSerieBCB(BCB_IPCA_URL, inicio, fim, 'ipca'),
      buscarHistoricoIFIX(inicio, fim),
    ]);

  const porTicker = new Map(
    historicos.map((item) => [item.ticker, item.historico]),
  );

  const meses = gerarMeses(inicio, fim);
  const datasMensais = meses.map((mes) => {
    const [ano, numeroMes] = mes.split('-').map(Number);
    const ultimoDia = new Date(ano, numeroMes, 0, 12);
    const dataIso = ultimoDia.toISOString().slice(0, 10);
    return dataIso > fim ? fim : dataIso;
  });

  const datasUnicas = [...new Set(datasMensais)];
  if (!datasUnicas.includes(fim)) {
    datasUnicas.push(fim);
  }

  const operacoesOrdenadas = [...operations].sort(
    (a, b) => a.date.localeCompare(b.date),
  );

  const carteira: PontoEvolucao[] = datasUnicas.map((data) => {
    const posicoesAtuais = new Map<string, number>();
    const custosAtuais = new Map<string, number>();

    for (const op of operacoesOrdenadas) {
      const opDate = op.date ? op.date.slice(0, 10) : '';
      if (!opDate || opDate > data) continue;

      const tk = normalizarTicker(op.ticker);
      const qtdOp = Number(op.quantity) || 0;
      const precoOp = Number(op.price) || 0;
      const taxas = Number(op.fees) || 0;

      const qtdAtual = posicoesAtuais.get(tk) ?? 0;
      const custoAtual = custosAtuais.get(tk) ?? 0;

      if (op.kind === 'buy') {
        posicoesAtuais.set(tk, qtdAtual + qtdOp);
        custosAtuais.set(tk, custoAtual + qtdOp * precoOp + taxas);
      } else if (op.kind === 'sell') {
        const qtdVendida = Math.min(qtdOp, qtdAtual);
        const custoMedio = qtdAtual > 0 ? custoAtual / qtdAtual : 0;

        posicoesAtuais.set(tk, Math.max(0, qtdAtual - qtdVendida));
        custosAtuais.set(
          tk,
          Math.max(0, custoAtual - custoMedio * qtdVendida),
        );
      }
    }

    let custoAquisicaoAtual = 0;
    for (const custo of custosAtuais.values()) {
      custoAquisicaoAtual += custo;
    }

    let valorMercadoAtual = 0;
    for (const [ticker, qtd] of posicoesAtuais.entries()) {
      if (qtd <= 0) continue;

      let preco: number | undefined;

      if (data === fim && portfolio.quotes?.[ticker]?.price && portfolio.quotes[ticker].price > 0) {
        preco = portfolio.quotes[ticker].price;
      } else {
        const hist = porTicker.get(ticker);
        preco = hist ? ultimoPrecoAte(hist, data) : undefined;
      }

      if (preco === undefined || preco <= 0) {
        preco = fallbackPrecos.get(ticker) ?? 0;
      }

      valorMercadoAtual += qtd * preco;
    }

    let cotaBase100 = 100;
    if (custoAquisicaoAtual > 0 && valorMercadoAtual > 0) {
      cotaBase100 = (valorMercadoAtual / custoAquisicaoAtual) * 100;
    }

    return {
      value: Number(cotaBase100.toFixed(2)),
      data,
      label: formatarLabel(data),
    };
  });

  let ifixBase = ultimoPrecoAte(historicoIFIX, inicio);
  if (!ifixBase || ifixBase <= 0) {
    ifixBase = historicoIFIX.values().next().value ?? 1;
  }

  const ifix: PontoEvolucao[] = datasUnicas.map((data) => {
    let preco = ultimoPrecoAte(historicoIFIX, data);
    if (preco === undefined || preco <= 0) {
      preco = ifixBase;
    }
    const value = (preco / ifixBase) * 100;

    return {
      value: Number(value.toFixed(2)),
      data,
      label: formatarLabel(data),
    };
  });

  const cdiMensal = datasUnicas.map((data) => {
    let valorLog = 0;
    for (const [dia, taxa] of serieCDI) {
      if (dia <= data && dia >= inicio) {
        valorLog += Math.log(1 + taxa / 100);
      }
    }
    const valor = Math.exp(valorLog) * 100;
    return {
      value: Number(valor.toFixed(2)),
      data,
      label: formatarLabel(data),
    };
  });

  const ipcaAcumulado: PontoEvolucao[] = [];
  let indiceIPCA = 100;

  for (let i = 0; i < datasUnicas.length; i++) {
    const data = datasUnicas[i];
    const mesAnoKey = data.slice(0, 7);
    const taxa = serieIPCA.get(mesAnoKey);

    if (taxa !== undefined) {
      indiceIPCA *= 1 + taxa / 100;
    }

    ipcaAcumulado.push({
      value: Number(indiceIPCA.toFixed(2)),
      data,
      label: formatarLabel(data),
    });
  }

  const resultadoFinal: DatasetEvolucao = {
    carteira,
    ifix,
    cdi: cdiMensal,
    ipca: ipcaAcumulado,
  };

  // Salva no cache local para uso instantâneo futuro
  await AsyncStorage.setItem(CACHE_EVOLUCAO_KEY, JSON.stringify(resultadoFinal));

  return resultadoFinal;
}

// Função pública que aplica Stale-While-Revalidate (Nunca deixa a tela vazia)
export async function calcularEvolucaoPortfolio(): Promise<DatasetEvolucao> {
  try {
    const cacheSalvo = await AsyncStorage.getItem(CACHE_EVOLUCAO_KEY);

    if (cacheSalvo) {
      const dadosCache = JSON.parse(cacheSalvo) as DatasetEvolucao;

      // Dispara a atualização em segundo plano (background) sem bloquear a tela
      processarCalculoEvolucao().catch((err) =>
        console.warn('[Background Sync] Erro ao atualizar:', err)
      );

      // Retorna imediatamente o cache salvo anteriormente
      return dadosCache;
    }
  } catch (e) {
    console.warn('[Cache] Erro ao ler cache de evolução:', e);
  }

  // Se não houver cache prévio, executa normalmente aguardando a rede
  return await processarCalculoEvolucao();
}