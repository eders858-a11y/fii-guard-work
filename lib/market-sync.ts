import { Platform } from 'react-native';
import { Quote, NewDividend, normalizeTicker, toISO } from './portfolio';

export const BRAPI_TOKEN = 'fZh138TebUi2JYGBJG75C6';
const CUSTOM_RENDER_API = 'https://fii-guard-work.onrender.com';

async function fetchWithTimeout(
  url: string,
  timeoutMs = 15000,
  token?: string
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  const activeToken = token || BRAPI_TOKEN;

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${activeToken}`,
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
      }
    });

    clearTimeout(id);
    return response;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

const sleep = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

function parseLiteralValue(val: any): number {
  if (typeof val === 'number') return val;

  let s = String(val || '0')
    .replace(/R\$\s*/gi, '')
    .replace(/\s/g, '');

  if (s.includes(',')) {
    if (s.split(',')[0].includes('.')) {
      s = s.replace(/\./g, '');
    }

    s = s.replace(',', '.');
  }

  return parseFloat(s) || 0;
}

export async function syncMarket(
  serviceUrl: string | undefined,
  tickers: string[],
  userOperations: any[] = [],
  brapiToken?: string
): Promise<{
  quotes: Quote[];
  dividends: NewDividend[];
  message: string;
}> {
  const activeToken = brapiToken || BRAPI_TOKEN;
  const quotes: Quote[] = [];
  const dividends: NewDividend[] = [];
  let source = 'Offline / Local';

  if (!tickers || tickers.length === 0) {
    return {
      quotes: [],
      dividends: [],
      message: 'Sem ativos.'
    };
  }

  const isWeb = Platform.OS === 'web';
  const baseUrl = CUSTOM_RENDER_API;

  // Na web, evitamos proxies externos com erro 403
  // e caimos direto para operacao local/offline segura
  if (!isWeb) {
    try {
      // BUSCA PARALELA: Dispara todas as consultas ao mesmo tempo
      // para máxima performance
      const quotePromises = tickers.map(async ticker => {
        const tk = normalizeTicker(ticker);
        let quote: Quote | null = null;

        // 1. Primeiro tenta a cotação pelo Render
        try {
          const renderUrl =
            `${baseUrl}/api/cotacao/${encodeURIComponent(tk)}`;

          const renderRes = await fetchWithTimeout(
            renderUrl,
            6000,
            activeToken
          );

          if (renderRes.ok) {
            const renderData = await renderRes.json();
            const price = Number(renderData?.price);

            if (
              renderData?.status === 'OK' &&
              Number.isFinite(price) &&
              price > 0
            ) {
              quote = {
                ticker: tk,
                price,
                referenceDate: new Date()
                  .toISOString()
                  .slice(0, 10),
                updatedAt: new Date().toISOString()
              };

              console.log(
                `[SYNC] ${tk} Render: R$ ${price.toFixed(2)}`
              );
            }
          }
        } catch (e) {}

        // 2. Fallback: Se o Render falhar, tenta BRAPI
        if (!quote) {
          try {
            const url = `https://brapi.dev/api/quote/${tk}`;

            const res = await fetchWithTimeout(
              url,
              5000,
              activeToken
            );

            if (res.ok) {
              const j = await res.json();
              const q = j.results?.[0];

              const price =
                q?.regularMarketPrice ?? q?.price;

              if (price && Number(price) > 0) {
                quote = {
                  ticker: tk,
                  price: Number(price),
                  referenceDate: new Date()
                    .toISOString()
                    .slice(0, 10),
                  updatedAt: new Date().toISOString()
                };

                console.log(
                  `[SYNC] ${tk} BRAPI: R$ ${Number(price).toFixed(2)}`
                );
              }
            }
          } catch (e) {}
        }

        return quote;
      });

      const results = await Promise.all(quotePromises);

      results.forEach(q => {
        if (q) quotes.push(q);
      });

      source = 'Internet (Multi-Source)';
    } catch (e) {
      console.warn('[SYNC] Falha na rede nativa');
    }
  }

  // Tenta o Render apenas se não estiver travado por CORS na web
  if (!isWeb) {
    try {
      // DAMA11 e VGRI11 não participam da sincronização automática
      // de proventos.
      const proventoTickers = tickers.map(normalizeTicker);

      // Divide em blocos de no máximo 5 FIIs
      for (
        let i = 0;
        i < proventoTickers.length;
        i += 5
      ) {
        const bloco = proventoTickers.slice(i, i + 5);

        const renderUrl =
          `${baseUrl}/api/proventos-lote?tickers=${bloco.join(',')}`;

        console.log(
          '[SYNC PROVENTOS] BLOCO:',
          bloco
        );

        const resR = await fetchWithTimeout(
          renderUrl,
          30000,
          activeToken
        );

        if (resR.ok) {
          const body = await resR.json();

          source = 'Cloud Render + BRAPI';

          (body.dividends || []).forEach((d: any) => {
            const nVal = parseLiteralValue(
              d.valorUnitario
            );

            console.log(
              `[PROVENTO TESTE] ${d.ticker} | original=${d.valorUnitario} | convertido=${nVal}`
            );

            if (nVal > 0) {
              dividends.push({
                ticker: normalizeTicker(d.ticker),
                paymentDate: toISO(d.dataPagamento),
                dateCom: toISO(d.dataCom),
                amountPerShare: nVal,
                kind: String(d.tipo)
                  .toUpperCase()
                  .includes('AMORT')
                  ? 'amortization'
                  : 'income',
                source: 'render'
              });
            }
          });

          (body.quotes || []).forEach((q: any) => {
            const ticker = normalizeTicker(q.ticker);

            const idx = quotes.findIndex(
              old => old.ticker === ticker
            );

            if (idx > -1) {
              quotes[idx].price = Number(q.price);
            } else {
              quotes.push({
                ticker,
                price: Number(q.price),
                referenceDate: new Date()
                  .toISOString()
                  .slice(0, 10),
                updatedAt: new Date().toISOString()
              });
            }
          });
        } else {
          console.warn(
            '[SYNC PROVENTOS] HTTP:',
            resR.status,
            'BLOCO:',
            bloco
          );
        }
      }
    } catch (e) {
      console.warn(
        '[SYNC] Render indisponível:',
        e
      );
    }
  }

  return {
    quotes,
    dividends,
    message: `Sincronizado via ${source}`
  };
}