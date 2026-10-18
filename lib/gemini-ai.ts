import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchLiveQuotes } from './quotes';
import { findFund } from './fii-catalog';

export interface FiiDataForAi {
  ticker: string;
  dataReferencia?: string;
  dataCotacao?: string;
  dataUltimoProvento?: string;
  dataComUltimoProvento?: string;
  dataPagamentoUltimoProvento?: string;
  dataPatrimonio?: string;
  fontes?: string[];
  price?: number;
  priceVariation12m?: number;
  volumeMedioDiario?: number;
  liquidezDiaria?: number;
  volatilidade?: number;
  pvp?: number;
  patrimonioLiquido?: number;
  patrimonioPorCota?: number;
  valorMercado?: number;
  descontoPremioVp?: number;
  lastDividend?: number;
  dividendYield?: number;
  dividendYield12m?: number;
  mediaDividendos6m?: number;
  mediaDividendos12m?: number;
  resultadoRecorrentePorCota?: number;
  coberturaDividendos?: number;
  historicoDividendos?: Array<{ date: string; amount: number }>;
  sector?: string;
  estrategia?: string;
  patrimonioLiquidoCvm?: number;
  numeroAtivos?: number;
  numeroCotistas?: number;
  tipoFii?: string;
  tipo?: string;
  numeroImoveis?: number;
  areaBrutaLocavel?: number;
  vacancia?: number;
  vacanciaFisica?: number;
  vacanciaFinanceira?: number;
  prazoMedioContratos?: number;
  concentracaoMaiorInquilino?: number;
  endividamento?: number;
  dividaSobrePatrimonio?: number;
  ltv?: number;
  inadimplencia?: number;
  indexadores?: string[];
  concentracaoDevedores?: number;
  garantias?: string[];
  principaisAtivos?: string[];
  gestor?: string;
  administrador?: string;
  quantityHeld?: number;
  averagePrice?: number;
  descricao?: string;
  riscosConhecidos?: string[];
  dadosAdicionais?: Record<string, unknown>;
  qualidadeImoveis?: string;       // ex: "Triple A (AAA)", "A+", "Classe B"
  perfilCreditoCris?: string;      // ex: "High Grade", "High Yield", "Middle Risk"
  ratingMedioCrp?: string;         // ex: "AAA", "AA+", "A"
  indexadorDominante?: string;     // ex: "IPCA (75%)", "CDI (25%)"
  // Preço-teto calculado pelo FII Guard
  precoTeto?: number;
  pvpEstimadoPrecoTeto?: number;
  margemSegurancaPrecoTeto?: number;
  proventoAnualUsadoPrecoTeto?: number;
  retornoExigidoPrecoTeto?: number;
  crescimentoEsperadoPrecoTeto?: number;
  taxaTesouroIpcaPrecoTeto?: number;
  premioRiscoPrecoTeto?: number;
  dataTaxaTesouroPrecoTeto?: string;
  metodoPrecoTeto?: string;
  statusPrecoTeto?: string;
}

export type AiAnalysisType = 'completa' | 'dividendos' | 'riscos' | 'valuation';

export interface FonteCitada {
  uri: string;
  titulo?: string;
}

export interface MensagemChat {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

export interface RespostaChat {
  texto: string;
  fontes: FonteCitada[];
}

export interface AnalisarFiiOptions {
  geminiApiKey?: string;
  geminiModel?: string;
  aiProvider?: 'gemini' | 'groq';
  groqApiKey?: string;
  dadosCvm?: Partial<FiiDataForAi>;
  dadosLocais?: Partial<FiiDataForAi>;
  perguntaUsuario?: string;
  tipo?: AiAnalysisType;
}

export interface OpcoesChatIa {
  tipo?: AiAnalysisType;
  aiProvider?: 'gemini' | 'groq';
  geminiApiKey?: string;
  groqApiKey?: string;
  geminiModel?: string;
  usarBuscaWeb?: boolean;
}

type UnknownRecord = Record<string, unknown>;

const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const ANALISE_ACOES_URL = 'https://www.analisedeacoes.com/page-data/fiis';
const RENDER_PROVENTOS_URL = 'https://fii-guard-work.onrender.com';
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

function normalizarTicker(ticker: string): string {
  return String(ticker ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/SA$/, '');
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function obterCaminho(objeto: unknown, caminho: string[]): unknown {
  let atual: unknown = objeto;
  for (const chave of caminho) {
    if (Array.isArray(atual)) {
      const indice = Number(chave);
      if (!Number.isInteger(indice) || indice < 0 || indice >= atual.length) return undefined;
      atual = atual[indice];
      continue;
    }
    if (!isRecord(atual)) return undefined;
    atual = atual[chave];
  }
  return atual;
}

function numero(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  let textoVal = value.trim();
  if (!textoVal) return undefined;
  textoVal = textoVal.replace(/R\$\s*/gi, '').replace(/%/g, '').replace(/\s/g, '');
  if (textoVal.includes(',')) {
    textoVal = textoVal.replace(/\./g, '').replace(',', '.');
  }
  const resultado = Number(textoVal);
  return Number.isFinite(resultado) ? resultado : undefined;
}

function texto(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const resultado = value.trim();
  return resultado.length > 0 ? resultado : undefined;
}

function dataISO(timestamp: number): string {
  const data = new Date(timestamp * 1000);
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function unicos(valores: string[]): string[] {
  return [...new Set(valores.filter(Boolean))];
}

async function fetchComTimeout(url: string, options: RequestInit = {}, timeoutMs = 30000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resposta = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return resposta;
  } catch (erro: any) {
    if (erro.name === 'AbortError') {
      throw new Error(`A requisição demorou muito e foi cancelada (timeout de ${timeoutMs / 1000}s). Verifique sua conexão móvel.`);
    }
    throw erro;
  } finally {
    clearTimeout(timer);
  }
}

function normalizarHistorico(historico: unknown): Array<{ date: string; amount: number }> {
  if (!Array.isArray(historico)) return [];
  const resultado: Array<{ date: string; amount: number }> = [];
  for (const item of historico) {
    if (!isRecord(item)) continue;
    const date = texto(item.date);
    const amount = numero(item.amount);
    if (date && amount !== undefined && amount > 0) {
      resultado.push({ date, amount });
    }
  }
  return resultado.sort((a, b) => a.date.localeCompare(b.date));
}

function calcularMedia(
  historico: Array<{ date: string; amount: number }>,
  meses: number,
): number | undefined {
  if (!historico.length) return undefined;
  const limite = new Date();
  limite.setMonth(limite.getMonth() - meses);
  const limiteISO = [
    limite.getFullYear(),
    String(limite.getMonth() + 1).padStart(2, '0'),
    String(limite.getDate()).padStart(2, '0'),
  ].join('-');
  const filtrado = historico.filter(item => item.date >= limiteISO);
  if (!filtrado.length) return undefined;
  const soma = filtrado.reduce((total, item) => total + item.amount, 0);
  return soma / meses;
}

function calcularProventoAnualRecorrente(
  historico: Array<{ date: string; amount: number }>,
  limiteISO: string,
  hojeISO: string,
): { anual: number; mediaMensal: number; excluidos: number } | undefined {
  const historico12m = historico.filter(
    item => item.date >= limiteISO && item.date <= hojeISO,
  );

  const porMes = new Map<string, number>();

  for (const item of historico12m) {
    const mes = item.date.slice(0, 7);
    porMes.set(mes, (porMes.get(mes) ?? 0) + item.amount);
  }

  const valores = [...porMes.values()].filter(
    valor => Number.isFinite(valor) && valor > 0,
  );

  if (valores.length < 6) return undefined;

  const ordenar = (lista: number[]) =>
    [...lista].sort((a, b) => a - b);

  const mediana = (lista: number[]): number => {
    const ordenada = ordenar(lista);
    const meio = Math.floor(ordenada.length / 2);

    return ordenada.length % 2
      ? ordenada[meio]
      : (ordenada[meio - 1] + ordenada[meio]) / 2;
  };

  const centro = mediana(valores);
  const desvios = valores.map(valor => Math.abs(valor - centro));
  const desvioMediano = mediana(desvios);

  const limiteSuperior = desvioMediano > 0
    ? Math.max(centro * 1.35, centro + 3 * 1.4826 * desvioMediano)
    : centro * 1.35;

  const recorrentes = valores.filter(valor => valor <= limiteSuperior);

  if (recorrentes.length < 6) return undefined;

  const mediaMensal =
    recorrentes.reduce((soma, valor) => soma + valor, 0) /
    recorrentes.length;

  if (!Number.isFinite(mediaMensal) || mediaMensal <= 0) {
    return undefined;
  }

  return {
    anual: mediaMensal * 12,
    mediaMensal,
    excluidos: valores.length - recorrentes.length,
  };
}

function calcularPrecoTetoFii(
  dados: FiiDataForAi,
  taxaIpcaTesouro?: number,
  dataTaxaTesouro?: string,
): Partial<FiiDataForAi> {
  const preco = dados.price;
  const historico = normalizarHistorico(dados.historicoDividendos);

  if (preco === undefined || !Number.isFinite(preco) || preco <= 0) {
    return { statusPrecoTeto: 'Indisponível: cotação válida não encontrada.' };
  }

  const catalogo = findFund(dados.ticker);
  const setorCatalogo = (catalogo?.sector ?? '').toLowerCase();
  const segmentoCatalogo = (catalogo?.segment ?? '').toLowerCase();

  const textoBruto = [
    setorCatalogo,
    segmentoCatalogo,
    dados.tipoFii,
    dados.sector,
    dados.estrategia,
    dados.ticker,
  ].filter(Boolean).join(' ').toLowerCase();

  const tipoStr = (dados.tipoFii ?? dados.tipo ?? '').toLowerCase();
  const ehDesenvolvimento = /desenvolvimento|loteamento|spe|misto/.test(textoBruto) || segmentoCatalogo.includes('desenvolvimento');
  const ehPapel =
    /papel|receb[ií]veis|cr[ií]s?\b|cr[eé]dito imobili[aá]rio/.test(textoBruto) ||
    setorCatalogo.includes('papel') ||
    tipoStr.includes('papel') ||
    tipoStr.includes('cri') ||
    tipoStr.includes('recebíveis') ||
    tipoStr.includes('recebiveis');
  const ehInfra = /infra|deb[eê]ntures?|bodb|fi-infra/.test(textoBruto);
  const ehTijolo = !ehPapel && !ehInfra && !ehDesenvolvimento && (/tijolo|log[ií]stica|shopping|lajes|renda urbana|galp[oõ]es?|im[oó]veis/.test(textoBruto) || setorCatalogo.includes('tijolo'));

  if (!ehPapel && !ehTijolo && !ehInfra && !ehDesenvolvimento) {
    return { statusPrecoTeto: 'Indisponível: tipo de FII não identificado com segurança.' };
  }

  const hoje = new Date();
  const limite = new Date(hoje);
  limite.setFullYear(limite.getFullYear() - 1);

  const formatarData = (data: Date) =>
    `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;

  const limiteISO = formatarData(limite);
  const hojeISO = formatarData(hoje);

  const historico12m = historico.filter(
    item => item.date >= limiteISO && item.date <= hojeISO,
  );

  const recorrencia = calcularProventoAnualRecorrente(
    historico12m,
    limiteISO,
    hojeISO,
  );

  if (
    !recorrencia ||
    !Number.isFinite(recorrencia.anual) ||
    recorrencia.anual <= 0
  ) {
    return {
      statusPrecoTeto:
        'Indisponível: histórico de proventos recorrentes insuficiente; são necessários pelo menos 6 meses válidos de pagamentos.',
    };
  }

  const proventoAnual = recorrencia.anual;
  if (taxaIpcaTesouro === undefined || !Number.isFinite(taxaIpcaTesouro) || taxaIpcaTesouro <= 0) {
    return {
      proventoAnualUsadoPrecoTeto: proventoAnual,
      statusPrecoTeto: 'Indisponível: não foi possível obter a taxa IPCA+ atual do Tesouro Direto.',
    };
  }

  const premioRisco = ehDesenvolvimento ? 6.0 : ehPapel ? 5.5 : ehInfra ? 5.5 : 2.0;
  const crescimentoEsperado = 0;
  const retornoExigido = taxaIpcaTesouro + premioRisco / 100;
  const denominador = retornoExigido - (crescimentoEsperado / 100);

  if (denominador <= 0) {
    return { statusPrecoTeto: 'Indisponível: taxa de desconto inválida para o método de Gordon.' };
  }

  const precoTeto = proventoAnual / denominador;
  const valorPatrimonialPorCota = dados.patrimonioPorCota;

  const pvpEstimadoPrecoTeto =
    typeof valorPatrimonialPorCota === 'number' &&
    Number.isFinite(valorPatrimonialPorCota) &&
    valorPatrimonialPorCota > 0
      ? precoTeto / valorPatrimonialPorCota
      : undefined;

  if (!Number.isFinite(precoTeto) || precoTeto <= 0) {
    return { statusPrecoTeto: 'Indisponível: não foi possível calcular um preço-teto válido.' };
  }

  const margemSeguranca = ((precoTeto - preco) / precoTeto) * 100;
  const taxaPercentual = taxaIpcaTesouro * 100;
  const retornoPercentual = retornoExigido * 100;

  const categoria = ehDesenvolvimento
    ? 'Desenvolvimento'
    : ehInfra
      ? 'FI-Infra'
      : ehPapel
        ? 'FII Papel'
        : 'FII Tijolo';

  return {
    precoTeto,
    pvpEstimadoPrecoTeto,
    margemSegurancaPrecoTeto: margemSeguranca,
    proventoAnualUsadoPrecoTeto: proventoAnual,
    retornoExigidoPrecoTeto: retornoPercentual,
    crescimentoEsperadoPrecoTeto: crescimentoEsperado,
    taxaTesouroIpcaPrecoTeto: taxaPercentual,
    premioRiscoPrecoTeto: premioRisco,
    dataTaxaTesouroPrecoTeto: dataTaxaTesouro,
    metodoPrecoTeto: `Gordon adaptado (${categoria}): provento anualizado ÷ (taxa IPCA+ Tesouro ${taxaPercentual.toFixed(2)}% + prêmio de risco ${premioRisco}% − crescimento real ${crescimentoEsperado}%).`,
    statusPrecoTeto: 'Estimativa de preço-teto baseada no modelo de Gordon adaptado, usando a taxa IPCA+ do Tesouro Direto como referência de retorno real. O resultado depende da estabilidade dos proventos e das premissas adotadas.',
  };
}

function calcularDerivados(dados: FiiDataForAi): FiiDataForAi {
  const resultado = { ...dados };
  const historico = normalizarHistorico(resultado.historicoDividendos);

  if (historico.length) {
    resultado.historicoDividendos = historico;
    const ultimo = historico[historico.length - 1];
    if (resultado.lastDividend === undefined) resultado.lastDividend = ultimo.amount;
    if (resultado.dataUltimoProvento === undefined) resultado.dataUltimoProvento = ultimo.date;
    if (resultado.mediaDividendos6m === undefined) resultado.mediaDividendos6m = calcularMedia(historico, 6);
    if (resultado.mediaDividendos12m === undefined) resultado.mediaDividendos12m = calcularMedia(historico, 12);

    if (
      resultado.dividendYield12m === undefined &&
      resultado.price !== undefined &&
      resultado.price > 0
    ) {
      const umAnoAtras = new Date();
      umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
      const limiteISO = [
        umAnoAtras.getFullYear(),
        String(umAnoAtras.getMonth() + 1).padStart(2, '0'),
        String(umAnoAtras.getDate()).padStart(2, '0'),
      ].join('-');

      const soma12m = historico
        .filter(item => item.date >= limiteISO)
        .reduce((total, item) => total + item.amount, 0);

      resultado.dividendYield12m = (soma12m / resultado.price) * 100;
    }
  }

  if (
    resultado.dividendYield === undefined &&
    resultado.lastDividend !== undefined &&
    resultado.price !== undefined &&
    resultado.price > 0
  ) {
    resultado.dividendYield = (resultado.lastDividend * 12 / resultado.price) * 100;
  }

  if (
    (resultado.patrimonioPorCota === undefined ||
      !Number.isFinite(resultado.patrimonioPorCota) ||
      resultado.patrimonioPorCota <= 0) &&
    resultado.price !== undefined &&
    resultado.pvp !== undefined &&
    resultado.pvp > 0
  ) {
    resultado.patrimonioPorCota = resultado.price / resultado.pvp;
  }

  if (
    resultado.price !== undefined &&
    Number.isFinite(resultado.price) &&
    resultado.price > 0 &&
    resultado.patrimonioPorCota !== undefined &&
    Number.isFinite(resultado.patrimonioPorCota) &&
    resultado.patrimonioPorCota > 0
  ) {
    resultado.pvp = resultado.price / resultado.patrimonioPorCota;
    resultado.descontoPremioVp = (resultado.pvp - 1) * 100;
  }

  if (
    resultado.coberturaDividendos === undefined &&
    resultado.resultadoRecorrentePorCota !== undefined &&
    resultado.resultadoRecorrentePorCota > 0 &&
    resultado.lastDividend !== undefined &&
    resultado.lastDividend > 0
  ) {
    resultado.coberturaDividendos =
      resultado.resultadoRecorrentePorCota / resultado.lastDividend;
  }

  return {
    ...resultado,
    ...calcularPrecoTetoFii(resultado),
  };
}

export async function buscarMaiorTaxaIpcaTesouro(): Promise<{ taxa: number; data: string }> {
  const url = 'https://www.tesourodireto.com.br/o/rentabilidade/investir';

  const resposta = await fetchComTimeout(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0',
    },
  }, 30000);

  if (!resposta.ok) {
    throw new Error(`Tesouro Direto retornou HTTP ${resposta.status}.`);
  }

  const json: unknown = await resposta.json();
  const candidatos: number[] = [];
  const visitados = new Set<object>();

  function percorrer(valor: unknown): void {
    if (!valor || typeof valor !== 'object' || visitados.has(valor)) return;
    visitados.add(valor);

    if (Array.isArray(valor)) {
      valor.forEach(percorrer);
      return;
    }

    if (!isRecord(valor)) return;

    const textoObjeto = Object.values(valor)
      .filter((item): item is string => typeof item === 'string')
      .join(' ');

    const taxaCompra = valor.investmentProfitabilityIndexerName;

    if (/Tesouro\s+IPCA\s*\+/i.test(textoObjeto) && typeof taxaCompra === 'string') {
      const correspondencia = taxaCompra.match(/IPCA\s*\+\s*([\d.,]+)\s*%/i);

      if (correspondencia) {
        const taxa = numero(correspondencia[1]);
        if (taxa !== undefined && taxa > 0 && taxa < 30) {
          candidatos.push(taxa / 100);
        }
      }
    }

    Object.values(valor).forEach(percorrer);
  }

  percorrer(json);

  if (!candidatos.length) {
    throw new Error('Não foi encontrada uma taxa de compra IPCA+ válida na resposta do Tesouro Direto.');
  }

  return {
    taxa: Math.max(...candidatos),
    data: new Date().toISOString().slice(0, 10),
  };
}

export async function recalcularPrecoTetoComTesouro(
  dados: FiiDataForAi,
): Promise<FiiDataForAi> {
  try {
    const referencia = await buscarMaiorTaxaIpcaTesouro();

    return {
      ...dados,
      ...calcularPrecoTetoFii(dados, referencia.taxa, referencia.data),
    };
  } catch (erro) {
    console.warn('[FII Guard] Não foi possível atualizar a taxa IPCA+ para o preço-teto:', erro);

    return {
      ...dados,
      precoTeto: undefined,
      margemSegurancaPrecoTeto: undefined,
      retornoExigidoPrecoTeto: undefined,
      taxaTesouroIpcaPrecoTeto: undefined,
      premioRiscoPrecoTeto: undefined,
      dataTaxaTesouroPrecoTeto: undefined,
      metodoPrecoTeto: undefined,
      statusPrecoTeto: 'Indisponível: falha ao consultar a taxa oficial IPCA+ do Tesouro Direto.',
    };
  }
}

function mesclar(ticker: string, ...fontes: Array<Partial<FiiDataForAi> | undefined>): FiiDataForAi {
  const resultado: Record<string, unknown> = {
    ticker: normalizarTicker(ticker),
    fontes: [],
  };
  const nomesFontes: string[] = [];
  for (const fonte of fontes) {
    if (!fonte) continue;
    for (const [chave, valor] of Object.entries(fonte)) {
      if (chave === 'fontes' && Array.isArray(valor)) {
        for (const nome of valor) {
          if (typeof nome === 'string') nomesFontes.push(nome);
        }
        continue;
      }
      if (valor !== undefined && valor !== null && valor !== '') {
        resultado[chave] = valor;
      }
    }
  }
  resultado.ticker = normalizarTicker(ticker);
  resultado.fontes = unicos(nomesFontes);
  return calcularDerivados(resultado as unknown as FiiDataForAi);
}

export async function buscarDadosYahoo(
  ticker: string,
  timeoutMs = 30000,
): Promise<Partial<FiiDataForAi>> {
  const cleanTicker = normalizarTicker(ticker);
  if (!cleanTicker) throw new Error('Informe um ticker válido.');
  const url = `${YAHOO_CHART_URL}/${encodeURIComponent(cleanTicker)}.SA?range=1y&interval=1d&events=div%2Csplits&includePrePost=false`;

  try {
    const resposta = await fetchComTimeout(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    }, timeoutMs);

    if (!resposta.ok) throw new Error(`Yahoo Finance retornou HTTP ${resposta.status}.`);
    const json: unknown = await resposta.json();
    const chart = obterCaminho(json, ['chart', 'result', '0']);
    if (!isRecord(chart)) throw new Error(`Yahoo Finance não retornou dados para ${cleanTicker}.`);
    const meta = isRecord(chart.meta) ? chart.meta : {};
    const indicadores = isRecord(chart.indicators) ? chart.indicators : {};
    const quoteArray = Array.isArray(indicadores.quote) ? indicadores.quote : [];
    const quote = isRecord(quoteArray[0]) ? quoteArray[0] : {};
    const timestamps = Array.isArray(chart.timestamp) ? chart.timestamp : [];
    const closes = Array.isArray(quote.close) ? quote.close : [];
    const volumes = Array.isArray(quote.volume) ? quote.volume : [];
    const precosHistoricos: number[] = [];
    for (const valor of closes) {
      const preco = numero(valor);
      if (preco !== undefined && preco > 0) precosHistoricos.push(preco);
    }
    const precoAtual = numero(meta.regularMarketPrice) ?? precosHistoricos[precosHistoricos.length - 1];
    const timestampCotacao =
      numero(meta.regularMarketTime) ??
      timestamps
        .map(numero)
        .filter((valor): valor is number => valor !== undefined)
        .filter((valor, indice) => {
          const fechamento = numero(closes[indice]);
          return fechamento !== undefined && fechamento > 0;
        })
        .at(-1);
    const dataCotacao = timestampCotacao !== undefined ? dataISO(timestampCotacao) : undefined;
    let variacao12m: number | undefined;
    if (precosHistoricos.length >= 2) {
      const primeiro = precosHistoricos[0];
      const ultimo = precosHistoricos[precosHistoricos.length - 1];
      if (primeiro > 0) variacao12m = ((ultimo - primeiro) / primeiro) * 100;
    }
    const volumesValidos = volumes
      .map(numero)
      .filter((valor): valor is number => valor !== undefined && valor > 0);
    const volumeMedioDiario =
      volumesValidos.length > 0
        ? volumesValidos.reduce((total, valor) => total + valor, 0) / volumesValidos.length
        : undefined;
    const eventos = isRecord(chart.events) ? chart.events : {};
    const dividendos = isRecord(eventos.dividends) ? eventos.dividends : {};
    const historicoDividendos: Array<{ date: string; amount: number }> = [];
    for (const evento of Object.values(dividendos)) {
      if (!isRecord(evento)) continue;
      const timestamp = numero(evento.date);
      const amount = numero(evento.amount);
      if (timestamp !== undefined && amount !== undefined && amount > 0) {
        historicoDividendos.push({ date: dataISO(timestamp), amount });
      }
    }
    historicoDividendos.sort((a, b) => a.date.localeCompare(b.date));
    const ultimoProventoObj = historicoDividendos.at(-1);
    const dataUltimoProvento = ultimoProventoObj ? ultimoProventoObj.date : undefined;
    const nomeEmpresa = texto(meta.longName) ?? texto(meta.shortName);
    const resultado: Partial<FiiDataForAi> = {
      ticker: cleanTicker,
      fontes: ['Yahoo Finance'],
      dataReferencia: dataCotacao,
      dataCotacao,
      dataUltimoProvento,
      price: precoAtual,
      priceVariation12m: variacao12m,
      volumeMedioDiario,
      historicoDividendos,
      descricao: nomeEmpresa,
    };
    if (precoAtual !== undefined && volumeMedioDiario !== undefined) {
      resultado.liquidezDiaria = precoAtual * volumeMedioDiario;
    }
    return resultado;
  } catch (erro: any) {
    console.warn(`[FII Guard] Erro no Yahoo Finance (${cleanTicker}):`, erro);
    return {};
  }
}

export async function buscarProventosRender(ticker: string): Promise<Partial<FiiDataForAi>> {
  const cleanTicker = normalizarTicker(ticker);
  if (!cleanTicker) return {};
  try {
    const resposta = await fetchComTimeout(
      `${RENDER_PROVENTOS_URL}/api/proventos?ticker=${encodeURIComponent(cleanTicker)}`,
      { headers: { Accept: 'application/json' } },
      30000,
    );
    if (!resposta.ok) return {};
    const json: unknown = await resposta.json();
    const lista =
      isRecord(json) && Array.isArray(json.dividends)
        ? json.dividends
        : Array.isArray(json)
          ? json
          : [];
    if (lista.length > 0) {
      const proventosValidos: Array<{ dataCom: string; dataPagamento: string; amount: number }> = [];
      for (const item of lista) {
        if (isRecord(item)) {
          const dataCom = texto(item.dataCom)?.slice(0, 10);
          const dataPagamento = texto(item.dataPagamento)?.slice(0, 10) || dataCom;
          const val = numero(item.valorUnitario) || numero(item.valor) || numero(item.amount);
          if (dataCom && val !== undefined && val > 0) {
            proventosValidos.push({ dataCom, dataPagamento: dataPagamento || dataCom, amount: val });
          }
        }
      }

      proventosValidos.sort((a, b) => b.dataCom.localeCompare(a.dataCom));
      const historicoRender = proventosValidos.map(p => ({ date: p.dataPagamento, amount: p.amount })).sort((a, b) => a.date.localeCompare(b.date));

      if (proventosValidos.length > 0) {
        const maisRecente = proventosValidos[0];
        return {
          lastDividend: maisRecente.amount,
          dataUltimoProvento: maisRecente.dataPagamento,
          dataComUltimoProvento: maisRecente.dataCom,
          dataPagamentoUltimoProvento: maisRecente.dataPagamento,
          historicoDividendos: historicoRender,
          fontes: ['Render API (Proventos)'],
        };
      }
    }
  } catch (erro) {
    console.warn(`[FII Guard] Erro ao buscar proventos no Render para ${cleanTicker}:`, erro);
  }
  return {};
}

async function buscarDadosBrfiis(ticker: string): Promise<Partial<FiiDataForAi>> {
  const cleanTicker = normalizarTicker(ticker);
  if (!cleanTicker) return {};

  try {
    const headers = { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0' };
    const respostaPagina = await fetchComTimeout(
      `https://brfiis.com.br/fundos/${encodeURIComponent(cleanTicker)}`,
      { headers },
      30000,
    );
    if (!respostaPagina.ok) return {};

    const htmlPagina = await respostaPagina.text();
    const dadosCapturados: Partial<FiiDataForAi> = {
      ticker: cleanTicker,
      fontes: ['BRFIIS'],
    };

    const htmlTexto = htmlPagina
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();

    const converterNumero = (textoVal: string): number => {
      const limpo = textoVal.trim();
      if (limpo.includes(',')) {
        return Number(limpo.replace(/\./g, '').replace(',', '.'));
      }
      return Number(limpo);
    };

    const matchPatrimonio = htmlTexto.match(
      /patrim[oô]nio\s+l[ií]quido[\s\S]{0,180}?R?\$?\s*([\d.]+(?:,\d+)?)\s*(bilh[oõ]es?|bi|milh[oõ]es?|mi|mil)\b/i,
    );
    if (matchPatrimonio) {
      const valorBase = converterNumero(matchPatrimonio[1]);
      const unidade = matchPatrimonio[2].toLowerCase();
      const multiplicador = unidade.startsWith('bi')
        ? 1_000_000_000
        : unidade.startsWith('mi')
          ? 1_000_000
          : unidade.startsWith('mil')
            ? 1_000
            : 1;
      const patrimonio = valorBase * multiplicador;
      if (Number.isFinite(patrimonio) && patrimonio > 0) {
        dadosCapturados.patrimonioLiquido = patrimonio;
      }
    }

    const matchCotistas = htmlPagina.match(
      /<span[^>]*>\s*Número de cotistas\s*<\/span>\s*<span[^>]*>\s*([\d.]+)\s*<\/span>/i,
    );
    if (matchCotistas) {
      const cotistas = Number(matchCotistas[1].replace(/\./g, ''));
      if (Number.isSafeInteger(cotistas) && cotistas > 0) {
        dadosCapturados.numeroCotistas = cotistas;
      }
    }

    const matchTipo = htmlTexto.match(
      /\bTipo\s+(Tijolo|Papel|Híbrido|Hibrido|Fundo de Fundos|FoF)\b/i,
    );
    if (matchTipo) {
      dadosCapturados.tipoFii = matchTipo[1];
    }

    const mImovTab = htmlPagina.match(/Im[oó]veis\s*\(\s*(\d+)\s*\)/i);
    if (mImovTab) {
      const val = Number(mImovTab[1]);
      if (Number.isSafeInteger(val) && val >= 0) {
        (dadosCapturados as any).qtdImoveis = val;
        dadosCapturados.numeroImoveis = val;
      }
    }

    const mCrisTab = htmlPagina.match(/(?:CRI\/CRA|CRIs?\/CRAs?|CRIs?|CRAs?|T[ií]tulos)\s*\(\s*(\d+)\s*\)/i);
    if (mCrisTab) {
      const val = Number(mCrisTab[1]);
      if (Number.isSafeInteger(val) && val > 0) {
        (dadosCapturados as any).qtdCris = val;
      }
    }

    const mFiisTab = htmlPagina.match(/(?:Cotas\s+de\s+FIIs|FIIs)\s*\(\s*(\d+)\s*\)/i);
    if (mFiisTab) {
      const val = Number(mFiisTab[1]);
      if (Number.isSafeInteger(val) && val > 0) {
        (dadosCapturados as any).qtdFiis = val;
      }
    }

    const mProjetosTab = htmlPagina.match(/(?:Aç[oõ]es\s+de\s+SPEs\s+imobili[aá]rias|SPEs|Projetos|Loteamentos|Empreendimentos|Obras)\s*\(\s*(\d+)\s*\)/i);
    if (mProjetosTab) {
      const val = Number(mProjetosTab[1]);
      if (Number.isSafeInteger(val) && val > 0) {
        (dadosCapturados as any).qtdProjetos = val;
        (dadosCapturados as any).qtdSpes = val;
      }
    }

    if ((dadosCapturados as any).qtdProjetos === undefined) {
      const mProj = htmlTexto.match(/(?:n[uú]mero|qtd|quantidade|total)\s+de\s+(?:projetos|loteamentos|empreendimentos|spes|obras)\s*:?\s*(\d{1,4})\b(?!\s*(?:[.,]\d+|bi|mi|milh|bilh|r\$|%))/i);
      if (mProj) {
        const val = Number(mProj[1]);
        if (Number.isSafeInteger(val) && val > 0) {
          (dadosCapturados as any).qtdProjetos = val;
          (dadosCapturados as any).qtdSpes = val;
        }
      }
    }

    if ((dadosCapturados as any).qtdImoveis === undefined) {
      const m = htmlTexto.match(/(?:n[uú]mero|qtd|quantidade|total)\s+de\s+im[oó]veis\s*:?\s*(\d{1,4})\b(?!\s*(?:[.,]\d+|bi|mi|milh|bilh|r\$|%))/i);
      if (m) {
        const val = Number(m[1]);
        if (Number.isSafeInteger(val) && val > 0) {
          (dadosCapturados as any).qtdImoveis = val;
          dadosCapturados.numeroImoveis = val;
        }
      }
    }

    if ((dadosCapturados as any).qtdCris === undefined) {
      const m = htmlTexto.match(/(?:n[uú]mero|qtd|quantidade|total)\s+de\s+(?:cris?|t[ií]tulos|receb[ií]veis)\s*:?\s*(\d{1,4})\b(?!\s*(?:[.,]\d+|bi|mi|milh|bilh|r\$|%))/i);
      if (m) {
        const val = Number(m[1]);
        if (Number.isSafeInteger(val) && val > 0) {
          (dadosCapturados as any).qtdCris = val;
        }
      }
    }

    if ((dadosCapturados as any).qtdFiis === undefined) {
      const m = htmlTexto.match(/(?:n[uú]mero|qtd|quantidade|total)\s+de\s+fundos?\s*:?\s*(\d{1,4})\b(?!\s*(?:[.,]\d+|bi|mi|milh|bilh|r\$|%))/i);
      if (m) {
        const val = Number(m[1]);
        if (Number.isSafeInteger(val) && val > 0) {
          (dadosCapturados as any).qtdFiis = val;
        }
      }
    }

    if (/high\s*yield/i.test(htmlTexto)) {
      dadosCapturados.perfilCreditoCris = 'High Yield';
    } else if (/high\s*grade/i.test(htmlTexto)) {
      dadosCapturados.perfilCreditoCris = 'High Grade';
    } else if (/middle\s*risk|mid\s*risk/i.test(htmlTexto)) {
      dadosCapturados.perfilCreditoCris = 'Middle Risk';
    } else {
      const mRating = htmlTexto.match(/\b(AAA|AA\+|AA|A\+|A|BBB\+|BBB)\b/i);
      if (mRating) {
        dadosCapturados.perfilCreditoCris = `Rating ${mRating[1].toUpperCase()}`;
      }
    }

    if (/triple\s*a|class[e\s]+aaa|\baaa\b/i.test(htmlTexto)) {
      dadosCapturados.qualidadeImoveis = 'Triple A (AAA)';
    } else if (/class[e\s]+a\b|\ba\+\b/i.test(htmlTexto)) {
      dadosCapturados.qualidadeImoveis = 'Classe A';
    } else if (/class[e\s]+b\b/i.test(htmlTexto)) {
      dadosCapturados.qualidadeImoveis = 'Classe B';
    }

    const somaAtivos =
      ((dadosCapturados as any).qtdImoveis ?? 0) +
      ((dadosCapturados as any).qtdCris ?? 0) +
      ((dadosCapturados as any).qtdFiis ?? 0) +
      ((dadosCapturados as any).qtdProjetos ?? 0);

    if (somaAtivos > 0) {
      dadosCapturados.numeroAtivos = somaAtivos;
    } else if (dadosCapturados.numeroImoveis != null && dadosCapturados.numeroImoveis > 0) {
      dadosCapturados.numeroAtivos = dadosCapturados.numeroImoveis;
    }

    const matchVacanciaMedia = htmlTexto.match(
      /([\d.,]+)\s*%\s*Vac[aâ]ncia\s+m[eé]dia/i,
    );
    const matchVacanciaFisica = htmlTexto.match(
      /Vac[aâ]ncia\s+f[ií]sica\s*:?\s*([\d.,]+)\s*%/i,
    );
    const matchVacancia = matchVacanciaMedia || matchVacanciaFisica;

    if (matchVacancia) {
      const vacancia = converterNumero(matchVacancia[1]);
      if (Number.isFinite(vacancia) && vacancia >= 0 && vacancia <= 100) {
        dadosCapturados.vacancia = vacancia;
        dadosCapturados.vacanciaFisica = vacancia;
      }
    }

    const matchInadimplencia =
      htmlTexto.match(/([\d.,]+)\s*%\s*Inadimpl[eê]ncia/i) ||
      htmlTexto.match(/Inadimpl[eê]ncia\s*:?\s*([\d.,]+)\s*%/i);

    if (matchInadimplencia) {
      const inadimplencia = converterNumero(matchInadimplencia[1]);
      if (
        Number.isFinite(inadimplencia) &&
        inadimplencia >= 0 &&
        inadimplencia <= 100
      ) {
        dadosCapturados.inadimplencia = inadimplencia;
      }
    }

    const matchGestor = htmlTexto.match(
      /Gestor\s+(.+?)\s*\(\s*\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\s*\)/i,
    );
    if (matchGestor) {
      dadosCapturados.gestor = matchGestor[1].trim();
    }

    const matchAdministrador = htmlTexto.match(
      /Administrador\s+(.+?)\s*\(\s*\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\s*\)/i,
    );
    if (matchAdministrador) {
      dadosCapturados.administrador = matchAdministrador[1].trim();
    }

    return dadosCapturados;
  } catch (erro) {
    console.warn(
      `[FII Guard] Erro ao buscar dados no BRFIIS (${cleanTicker}):`,
      erro,
    );
  }

  return {};
}

async function buscarDadosTesemetriaBodb11(ticker: string): Promise<Partial<FiiDataForAi>> {
  if (normalizarTicker(ticker) !== 'BODB11') return {};

  try {
    const resposta = await fetchComTimeout(
      'https://www.tesemetria.com.br/fundos/bodb11',
      {
        headers: {
          Accept: 'text/html',
          'User-Agent': 'Mozilla/5.0',
        },
      },
      20000,
    );

    if (!resposta.ok) return {};

    const html = await resposta.text();
    const htmlTexto = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/\s+/g, ' ')
      .trim();

    const converterValor = (valor: string): number | undefined => {
      const limpo = valor.replace(/\s/g, '');
      const normalizado = limpo.includes(',')
        ? limpo.replace(/\./g, '').replace(',', '.')
        : limpo;
      const n = Number(normalizado);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };

    const capturar = (padroes: RegExp[]): number | undefined => {
      for (const padrao of padroes) {
        const match = htmlTexto.match(padrao);
        if (match?.[1]) {
          const valor = converterValor(match[1]);
          if (valor !== undefined) return valor;
        }
      }
      return undefined;
    };

    const vp = capturar([
      /(?:VP\s*\/\s*cota|VP\s*por\s*cota|valor\s+patrimonial\s+por\s+cota)\s*:?\s*R?\$?\s*([\d.,]+)/i,
      /R?\$?\s*([\d.,]+)\s*(?:VP\s*\/\s*cota|VP\s*por\s*cota)/i,
    ]);

    const pvp = capturar([
      /P\s*\/\s*VP\s*:?\s*([\d.,]+)\s*x?/i,
      /([\d.,]+)\s*x\s*P\s*\/\s*VP/i,
    ]);

    const patrimonioMatch = htmlTexto.match(
      /patrim[oô]nio\s+l[ií]quido[\s\S]{0,100}?R?\$?\s*([\d.,]+)\s*(bilh[oõ]es?|bi|milh[oõ]es?|mi|mil)\b/i,
    );

    let patrimonioLiquido: number | undefined;
    if (patrimonioMatch) {
      const valor = converterValor(patrimonioMatch[1]);
      const unidade = patrimonioMatch[2].toLowerCase();

      if (valor !== undefined) {
        const multiplicador = /^(bilh|bi)/i.test(unidade)
          ? 1_000_000_000
          : /^(milh|mi)/i.test(unidade)
            ? 1_000_000
            : 1_000;

        patrimonioLiquido = valor * multiplicador;
      }
    }

    const cotistas = (() => {
      const regexContexto = /(?:cotistas|investidores)[^0-9]{0,150}?([\d.]+)/i;
      const matchCtx = html.match(regexContexto);
      if (matchCtx?.[1]) {
        const valor = Number(matchCtx[1].replace(/\./g, ''));
        if (Number.isSafeInteger(valor) && valor > 0) return valor;
      }

      const matchRsc = html.match(/"Cotistas"[\s\S]{0,100}?"([\d.]+)"/i);
      if (matchRsc?.[1]) {
        const valor = Number(matchRsc[1].replace(/\./g, ''));
        if (Number.isSafeInteger(valor) && valor > 0) return valor;
      }

      return capturar([
        /(?:n[uú]mero\s+de\s+cotistas|cotistas)\s*:?\s*([\d.]+)/i,
        /([\d.]+)\s+cotistas/i,
      ]);
    })();

    const resultado: Partial<FiiDataForAi> = {
      ticker: 'BODB11',
      fontes: ['Tesemetria (BODB11)'],
      gestor: 'Bocaina Capital Gestora de Recursos Ltda.',
      administrador: 'BTG Pactual Serviços Financeiros DTVM',
    };

    if (vp !== undefined) resultado.patrimonioPorCota = vp;
    if (pvp !== undefined) resultado.pvp = pvp;
    if (patrimonioLiquido !== undefined) {
      resultado.patrimonioLiquido = patrimonioLiquido;
    }
    if (cotistas !== undefined) {
      resultado.numeroCotistas = Math.round(cotistas);
    }

    return resultado;
  } catch (erro) {
    console.warn('[FII Guard] Falha ao consultar Tesemetria para BODB11:', erro);
    return {};
  }
}

function encontrarObjetoFundo(json: unknown): UnknownRecord | undefined {
  const caminhos = [
    ['result', 'pageContext', 'data'],
    ['result', 'data', 'pageContext', 'data'],
    ['pageContext', 'data'],
    ['data', 'pageContext', 'data'],
    ['result', 'pageContext'],
    ['pageContext'],
    ['data'],
  ];
  for (const caminho of caminhos) {
    let candidato: unknown = obterCaminho(json, caminho);
    if (typeof candidato === 'string') {
      try {
        candidato = JSON.parse(candidato) as unknown;
      } catch {
        continue;
      }
    }
    if (!isRecord(candidato)) continue;
    if (
      isRecord(candidato.indicators) ||
      isRecord(candidato.indicadores) ||
      isRecord(candidato.fund) ||
      isRecord(candidato.fii)
    ) {
      return candidato;
    }
    const internos = [
      candidato.fund,
      candidato.fii,
      candidato.data,
      candidato.fundData,
      candidato.fiiData,
    ];
    for (const interno of internos) {
      if (isRecord(interno) && (isRecord(interno.indicators) || isRecord(interno.indicadores))) {
        return interno;
      }
    }
  }
  if (isRecord(json)) {
    const candidatosDiretos = [json.fund, json.fii, json.data];
    for (const candidato of candidatosDiretos) {
      if (isRecord(candidato) && (isRecord(candidato.indicators) || isRecord(candidato.indicadores))) {
        return candidato;
      }
    }
  }
  return undefined;
}

function procurarNumero(objetos: unknown[], chaves: string[]): number | undefined {
  for (const objeto of objetos) {
    if (!isRecord(objeto)) continue;
    for (const chave of chaves) {
      const resultado = numero(objeto[chave]);
      if (resultado !== undefined) return resultado;
    }
  }
  return undefined;
}

function procurarTexto(objetos: unknown[], chaves: string[]): string | undefined {
  for (const objeto of objetos) {
    if (!isRecord(objeto)) continue;
    for (const chave of chaves) {
      const resultado = texto(objeto[chave]);
      if (resultado) return resultado;
    }
  }
  return undefined;
}

export async function buscarDadosAnaliseAcoes(ticker: string): Promise<Partial<FiiDataForAi>> {
  const cleanTicker = normalizarTicker(ticker);
  if (!cleanTicker) {
    throw new Error('Informe um ticker válido.');
  }
  const url = `${ANALISE_ACOES_URL}/${encodeURIComponent(cleanTicker.toLowerCase())}/page-data.json`;
  const resposta = await fetchComTimeout(url, { headers: { Accept: 'application/json' } }, 30000);
  if (!resposta.ok) {
    throw new Error(`Análise de Ações retornou HTTP ${resposta.status}.`);
  }
  const json: unknown = await resposta.json();
  const fundo = encontrarObjetoFundo(json);
  if (!fundo) {
    throw new Error(`Não foi possível interpretar os dados de ${cleanTicker} no Análise de Ações.`);
  }
  const indicadores = [
    fundo.indicators,
    fundo.indicadores,
    obterCaminho(fundo, ['data', 'indicators']),
    obterCaminho(fundo, ['fund', 'indicators']),
  ];
  const objetos = [...indicadores, fundo];
  const vp = procurarNumero(indicadores, [
    'vp',
    'patrimonioPorCota',
    'valorPatrimonial',
    'valorPatrimonialPorCota',
    'bookValue',
  ]);
  const pvp = procurarNumero(indicadores, ['pvp', 'p_vp', 'priceToBook', 'priceToBookRatio']);
  const dy = procurarNumero(indicadores, ['dy', 'dividendYield', 'dividend_yield', 'yield']);
  const variacao12m = procurarNumero(objetos, [
    'priceVariation365',
    'priceVariation12m',
    'variation365',
    'variation12m',
  ]);
  const patrimonioLiquido = procurarNumero(indicadores, [
    'patrimonioLiquido',
    'patrimonio_liquido',
    'netAssets',
    'totalNetAssets',
    'totalAssets',
  ]);
  const precoAtual = procurarNumero(indicadores, ['price', 'preco', 'cotacao', 'val']);

  const numeroCotistas = procurarNumero(objetos, [
    'cotistas',
    'numeroCotistas',
    'holders',
    'shareholders',
    'investors',
    'quantidadeCotistas',
    'totalCotistas',
    'numberOfHolders',
    'numberOfInvestors',
  ]);

  const numeroAtivos = procurarNumero(objetos, [
    'ativos',
    'numeroAtivos',
    'quantidadeAtivos',
    'imoveis',
    'quantidadeImoveis',
    'numAtivos',
    'propertiesCount',
    'assetsCount',
  ]);

  const nome = procurarTexto(objetos, ['name', 'nome', 'fundName', 'title']);
  const tipo = procurarTexto(objetos, ['type', 'segmentName', 'segment', 'sector', 'setor']);
  const mandato = procurarTexto(objetos, ['mandate', 'strategy', 'estrategia']);
  const administrador = procurarTexto(objetos, ['administrator', 'administrador', 'administradora']);
  const gestor = procurarTexto(objetos, ['manager', 'gestor', 'gestora']);
  const descricao = procurarTexto(objetos, ['description', 'descricao', 'summary']);
  const dataFundamentos = procurarTexto(objetos, [
    'updatedAt',
    'date',
    'dataReferencia',
    'referenceDate',
  ]);
  const dataPatrimonio = dataFundamentos ? dataFundamentos.slice(0, 10) : undefined;

  return {
    ticker: cleanTicker,
    fontes: ['Análise de Ações'],
    dataReferencia: dataPatrimonio,
    dataPatrimonio,
    price: precoAtual,
    patrimonioLiquido,
    patrimonioPorCota: vp,
    pvp,
    dividendYield: dy,
    priceVariation12m: variacao12m,
    numeroCotistas,
    numeroAtivos,
    sector: tipo,
    estrategia: mandato,
    administrador,
    gestor,
    descricao: descricao ?? nome,
  };
}

export function perguntaInicialPorTipo(tipo: AiAnalysisType): string {
  switch (tipo) {
    case 'dividendos':
      return 'Analise a sustentabilidade, histórico e recorrência dos dividendos deste fundo.';
    case 'riscos':
      return 'Quais são os principais riscos operacionais, de crédito e de vacância deste FII?';
    case 'valuation':
      return 'O preço atual está atrativo frente ao seu valor patrimonial (P/VP) e potencial?';
    case 'completa':
    default:
      return 'Faça uma análise fundamentalista completa, cobrindo portfólio, dividendos, riscos e valuation.';
  }
}

function montarPromptSistema(fii: FiiDataForAi): string {
  const dados = {
    tipoFii: fii.tipoFii,
    numeroImoveis: fii.numeroImoveis,
    qtdImoveis: (fii as any).qtdImoveis ?? fii.numeroImoveis,
    qtdCris: (fii as any).qtdCris,
    qtdFiis: (fii as any).qtdFiis,
    ticker: fii.ticker,
    dataReferencia: fii.dataReferencia,
    dataCotacao: fii.dataCotacao,
    dataUltimoProvento: fii.dataUltimoProvento,
    dataPatrimonio: fii.dataPatrimonio,
    fontes: fii.fontes,
    cotacao: fii.price,
    variacao12m: fii.priceVariation12m,
    volumeMedioDiario: fii.volumeMedioDiario,
    liquidezDiaria: fii.liquidezDiaria,
    volatilidade: fii.volatilidade,
    pvp: fii.pvp,
    patrimonioLiquido: fii.patrimonioLiquido,
    patrimonioPorCota: fii.patrimonioPorCota,
    numeroCotistas: fii.numeroCotistas,
    numeroAtivos: fii.numeroAtivos,
    vacanciaFisica: fii.vacanciaFisica,
    inadimplencia: fii.inadimplencia,
    qualidadeImoveis: fii.qualidadeImoveis ?? 'High Grade / AAA',
    perfilCreditoCris: fii.perfilCreditoCris ?? 'High Grade',
    ultimoProvento: fii.lastDividend,
    dividendYield: fii.dividendYield,
    dividendYield12m: fii.dividendYield12m,
    setor: fii.sector,
    estrategia: fii.estrategia,
    gestor: fii.gestor,
    administrador: fii.administrador,
    descricao: fii.descricao,
    historicoDividendos: fii.historicoDividendos,
    precoTeto: fii.precoTeto,
    margemSegurancaPrecoTeto: fii.margemSegurancaPrecoTeto,
    proventoAnualUsadoPrecoTeto: fii.proventoAnualUsadoPrecoTeto,
    retornoExigidoPrecoTeto: fii.retornoExigidoPrecoTeto,
    crescimentoEsperadoPrecoTeto: fii.crescimentoEsperadoPrecoTeto,
    taxaTesouroIpcaPrecoTeto: fii.taxaTesouroIpcaPrecoTeto,
    premioRiscoPrecoTeto: fii.premioRiscoPrecoTeto,
    dataTaxaTesouroPrecoTeto: fii.dataTaxaTesouroPrecoTeto,
    metodoPrecoTeto: fii.metodoPrecoTeto,
    statusPrecoTeto: fii.statusPrecoTeto,
  };
  const dadosLimpos = Object.fromEntries(
    Object.entries(dados).filter(([, valor]) => valor !== undefined && valor !== null && valor !== ''),
  );

  return `
Você é um analista fundamentalista sênior de Fundos de Investimento Imobiliário (FIIs) na B3.
Você está conversando diretamente com o investidor sobre o fundo ${fii.ticker}.

DADOS REAIS DISPONÍVEIS DO FII:
${JSON.stringify(dadosLimpos, null, 2)}

DIRETRIZES:
1. Responda em português brasileiro com tom profissional, objetivo e analítico.
2. Não invente números ou informações não fornecidas. Se faltar algum dado, mencione essa limitação claramente.
3. Mantenha o contexto da conversa aberta com o usuário.
`;
}

export async function conversarComAnalista(
  fii: FiiDataForAi,
  mensagensHistorico: MensagemChat[],
  options: AnalisarFiiOptions = {},
): Promise<RespostaChat> {
  const ticker = normalizarTicker(fii.ticker);
  if (!ticker) throw new Error('Informe o ticker do FII.');

  let dadosCompletos = calcularDerivados({ ...fii, ticker });
  if (
    dadosCompletos.pvp === undefined ||
    dadosCompletos.patrimonioPorCota === undefined ||
    dadosCompletos.dividendYield === undefined
  ) {
    try {
      const dadosExternos = await buscarDadosAnaliseAcoes(ticker);
      dadosCompletos = mesclar(ticker, dadosExternos, dadosCompletos);
    } catch (erro) {
      console.warn(`[FII Guard] Erro ao complementar com Análise de Ações:`, erro);
    }
  }
  dadosCompletos = calcularDerivados(dadosCompletos);
  dadosCompletos = await recalcularPrecoTetoComTesouro(dadosCompletos);

  const sistemaPrompt = montarPromptSistema(dadosCompletos);
  const provider = options.aiProvider ?? 'groq';

  let groqErroMsg = '';

  if (provider === 'groq') {
    const apiKey = options.groqApiKey?.trim() || process.env.EXPO_PUBLIC_GROQ_API_KEY?.trim();
    if (apiKey) {
      const mensagensFormatadas = [
        { role: 'system', content: sistemaPrompt },
        ...mensagensHistorico.map(m => ({
          role: m.role === 'model' ? 'assistant' : 'user',
          content: m.parts.map(p => p.text).join('\n'),
        })),
      ];

      const modelosGroq = [
        DEFAULT_GROQ_MODEL,
        'llama-3.1-8b-instant',
        'qwen/qwen3.8-27b',
        'openai/gpt-oss-120b',
      ];

      let ultimaResposta: Response | null = null;

      for (const modelo of modelosGroq) {
        try {
          const resposta = await fetchComTimeout('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: modelo,
              messages: mensagensFormatadas,
              temperature: 0.3,
              max_tokens: 4096,
            }),
          }, 30000);

          if (resposta.ok) {
            ultimaResposta = resposta;
            break;
          }

          const errBody = await resposta.text();
          groqErroMsg = `Groq HTTP ${resposta.status}: ${errBody}`;
          console.warn(`[Groq Warning] Modelo ${modelo} falhou:`, errBody);

          if (resposta.status === 401) {
            groqErroMsg = 'Chave de API Groq inválida ou sem autorização (401).';
            break;
          }
        } catch (err) {
          console.warn(`[Groq Error] Falha ao tentar modelo ${modelo}:`, err);
        }
      }

      if (ultimaResposta && ultimaResposta.ok) {
        const json: unknown = await ultimaResposta.json();
        const choices = obterCaminho(json, ['choices']);
        if (Array.isArray(choices) && choices.length) {
          const conteudo = obterCaminho(choices[0], ['message', 'content']);
          if (typeof conteudo === 'string' && conteudo.trim()) {
            return { texto: conteudo.trim(), fontes: [] };
          }
        }
      }
    } else {
      groqErroMsg = 'Chave da API Groq não configurada.';
    }
    console.warn(`[Groq Fallback] Tentando fallback para Gemini devido a falha no Groq (${groqErroMsg})...`);
  }

  const geminiApiKey = options.geminiApiKey?.trim() || process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim();
  if (!geminiApiKey) {
    throw new Error(
      groqErroMsg
        ? `Falha no Groq (${groqErroMsg}) e nenhuma chave Gemini configurada.`
        : 'Chave da API Gemini não configurada.',
    );
  }

  const modeloGemini = options.geminiModel?.trim() || DEFAULT_GEMINI_MODEL;
  const contents = [
    { role: 'user', parts: [{ text: sistemaPrompt }] },
    ...mensagensHistorico.map(m => ({
      role: m.role,
      parts: m.parts,
    })),
  ];

  const resposta = await fetchComTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modeloGemini)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey,
      },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
      }),
    },
    30000,
  );

  const json: unknown = await resposta.json();
  if (!resposta.ok) {
    const mensagem = obterCaminho(json, ['error', 'message']);
    throw new Error(
      typeof mensagem === 'string'
        ? `Erro Gemini: ${mensagem}`
        : `Erro Gemini HTTP ${resposta.status}.`,
    );
  }

  const candidatos = obterCaminho(json, ['candidates']);
  if (!Array.isArray(candidatos) || !candidatos.length) {
    throw new Error('O Gemini não retornou uma análise.');
  }
  const partes = obterCaminho(candidatos[0], ['content', 'parts']);
  if (!Array.isArray(partes)) {
    throw new Error('A resposta do Gemini veio sem conteúdo de texto.');
  }

  const respostaTexto = partes
    .filter(isRecord)
    .map(parte => texto(parte.text))
    .filter((parte): parte is string => parte !== undefined)
    .join('\n')
    .trim();

  if (!respostaTexto) {
    throw new Error('O Gemini retornou uma resposta vazia.');
  }

  return { texto: respostaTexto, fontes: [] };
}
const analiseCache = new Map<string, { data: FiiDataForAi; timestamp: number }>();
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const CACHE_PREFIX = 'FII_ANALYSIS_CACHE_';
export async function buscarDadosFiiParaAnalise(ticker: string, forceRefresh = false): Promise<FiiDataForAi> {
  const cleanTicker = normalizarTicker(ticker);
  if (!cleanTicker) throw new Error('Informe um ticker válido.');

  const catalogFund = findFund(cleanTicker);
  const catalogData: Partial<FiiDataForAi> | undefined = catalogFund
    ? {
        sector: catalogFund.sector,
        tipoFii: catalogFund.sector,
        estrategia: catalogFund.segment,
      }
    : undefined;

  const agora = Date.now();
  const cacheKey = `${CACHE_PREFIX}${cleanTicker}`;
  let cachedData: FiiDataForAi | undefined;

  if (!forceRefresh) {
    const memoria = analiseCache.get(cleanTicker);
    if (memoria && agora - memoria.timestamp < CACHE_TTL_MS) {
      cachedData = memoria.data;
    } else {
      try {
        const stored = await AsyncStorage.getItem(cacheKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (
            parsed?.data &&
            agora - parsed.timestamp < CACHE_TTL_MS
          ) {
            cachedData = parsed.data;
            analiseCache.set(cleanTicker, {
              data: parsed.data,
              timestamp: parsed.timestamp,
            });
          }
        }
      } catch (e) {
        console.warn('[FII Guard] Erro ao ler cache:', e);
      }
    }
  }

  let renderAnaliseData: Partial<FiiDataForAi> = {};
  try {


    const resp = await fetchComTimeout(
      `${RENDER_PROVENTOS_URL}/api/fii-analise?ticker=${encodeURIComponent(cleanTicker)}`,
      { headers: { Accept: 'application/json' } },
      30000,
    );
    if (resp.ok) {
      const json = await resp.json();
      if (json && json.status === 'OK') {
        renderAnaliseData = {
          ticker: cleanTicker,
          price: numero(json.price),
          lastDividend: numero(json.lastDividend),
          dataUltimoProvento: texto(json.dataUltimoProvento),
          dataComUltimoProvento: texto(json.dataComUltimoProvento),
          dataPagamentoUltimoProvento: texto(json.dataPagamentoUltimoProvento),
          historicoDividendos: normalizarHistorico(json.historicoDividendos),
          fontes: ['Render API (Backend)'],
        };
      }
    }
  } catch (e) {
    console.warn('[FII Guard] Erro ao consultar análise no Render:', e);
  }
   if (
     cachedData &&
     !forceRefresh &&
     renderAnaliseData.dataComUltimoProvento &&
     renderAnaliseData.dataComUltimoProvento === cachedData.dataComUltimoProvento &&
     renderAnaliseData.lastDividend === cachedData.lastDividend
   ) {
     return cachedData;
   }

  const [
    resultadoYahoo,
    resultadoAnaliseAcoes,
    resultadoLiveQuotes,
    resultadoRender,
    resultadoBrfiis,
    resultadoTesemetria,
  ] = await Promise.allSettled([
    buscarDadosYahoo(cleanTicker, 30000),
    buscarDadosAnaliseAcoes(cleanTicker),
    fetchLiveQuotes([cleanTicker]),
    buscarProventosRender(cleanTicker),
    buscarDadosBrfiis(cleanTicker),
    buscarDadosTesemetriaBodb11(cleanTicker),
  ]);

  let yahooData: Partial<FiiDataForAi> | undefined;
  let analiseAcoesData: Partial<FiiDataForAi> | undefined;
  let livePrice: number | undefined;
  let renderData: Partial<FiiDataForAi> | undefined;
  let brfiisData: Partial<FiiDataForAi> | undefined;
  let tesemetriaData: Partial<FiiDataForAi> | undefined;

  if (resultadoTesemetria.status === 'fulfilled') {
    tesemetriaData = resultadoTesemetria.value;
  }
  if (resultadoYahoo.status === 'fulfilled') yahooData = resultadoYahoo.value;
  if (resultadoAnaliseAcoes.status === 'fulfilled') analiseAcoesData = resultadoAnaliseAcoes.value;
  if (resultadoLiveQuotes.status === 'fulfilled') {
    const quotesMap = resultadoLiveQuotes.value;
    if (quotesMap[cleanTicker]) livePrice = quotesMap[cleanTicker];
  }
  if (resultadoRender.status === 'fulfilled') renderData = resultadoRender.value;
  if (resultadoBrfiis.status === 'fulfilled') brfiisData = resultadoBrfiis.value;

 const fii = mesclar(
   cleanTicker,
   catalogData,
   tesemetriaData,
   yahooData,
   analiseAcoesData,
   renderAnaliseData,
   renderData,
   brfiisData,
   { price: livePrice ?? renderAnaliseData.price },
 );

  if (
    fii.price === undefined &&
    fii.pvp === undefined &&
    fii.dividendYield === undefined &&
    fii.lastDividend === undefined
  ) {
    throw new Error(`Não foram encontrados dados financeiros reais para o ticker ${cleanTicker}.`);
  }
  const resultadoFinal = await recalcularPrecoTetoComTesouro(fii);
  analiseCache.set(cleanTicker, { data: resultadoFinal, timestamp: agora });

  try {
    await AsyncStorage.setItem(
      cacheKey,
      JSON.stringify({ data: resultadoFinal, timestamp: agora }),
    );
  } catch (e) {
    console.warn('[FII Guard] Erro ao salvar cache:', e);
  }

  return resultadoFinal;
}