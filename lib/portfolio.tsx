import AsyncStorage from "@react-native-async-storage/async-storage";
import { exportBackup as shareBackup, importBackup as pickBackup } from "./backup";
import { syncMarket } from "./market-sync";
import { importB3Spreadsheet } from "./b3-import";
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type OperationKind = "buy" | "sell";
export type DividendKind = "income" | "amortization";
export type DividendSource = "manual" | "yfinance" | "brapi" | "b3";

export type Operation = { id: string; ticker: string; kind: OperationKind; date: string; quantity: number; price: number; fees: number; source?: "manual" | "b3"; note?: string; createdAt: string };
export type Dividend = { id: string; ticker: string; paymentDate: string; dateCom?: string; amountPerShare: number; kind: DividendKind; source: DividendSource; note?: string; createdAt: string };
export type Quote = { ticker: string; price: number; referenceDate: string; updatedAt: string };
export type Position = { ticker: string; quantity: number; costBasis: number; averagePrice: number; lastPrice?: number; marketValue?: number; unrealizedResult?: number; realizedResult: number };
export type Settings = { marketServiceUrl: string; brapiToken?: string; lastSyncAt?: string; lastSyncMessage?: string; themeName?: string; cardColor?: string; textColor?: string; autoSync?: boolean };
export type PortfolioData = { operations: Operation[]; dividends: Dividend[]; quotes: Record<string, Quote>; settings: Settings };

export type NewOperation = Omit<Operation, "id" | "createdAt" | "fees"> & { fees?: number };
export type NewDividend = Omit<Dividend, "id" | "createdAt" | "source"> & { source?: DividendSource };

const KEY = "@fii-guard/portfolio-v2";
const initial: PortfolioData = { operations: [], dividends: [], quotes: {}, settings: { marketServiceUrl: "", brapiToken: "", themeName: "Oceano", cardColor: "#303234", textColor: "#F5F7FA", autoSync: true } };
const now = () => new Date().toISOString();
export const normalizeTicker = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/SA$/, "");
const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function sortedOperations(operations: Operation[]) { return [...operations].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)); }

export function calculatePositions(operations: Operation[], quotes: Record<string, Quote>): Position[] {
  const state = new Map<string, Position>();
  for (const operation of sortedOperations(operations)) {
    const ticker = normalizeTicker(operation.ticker);
    const current = state.get(ticker) ?? { ticker, quantity: 0, costBasis: 0, averagePrice: 0, realizedResult: 0 };
    const total = operation.quantity * operation.price;
    if (operation.kind === "buy") {
      current.costBasis += total + operation.fees;
      current.quantity += operation.quantity;
      current.averagePrice = current.quantity ? current.costBasis / current.quantity : 0;
    } else {
      const average = current.quantity ? current.costBasis / current.quantity : 0;
      current.realizedResult += total - operation.fees - average * operation.quantity;
      current.costBasis = Math.max(0, current.costBasis - average * operation.quantity);
      current.quantity = Math.max(0, current.quantity - operation.quantity);
      current.averagePrice = current.quantity ? current.costBasis / current.quantity : 0;
    }
    state.set(ticker, current);
  }
  return [...state.values()].map((position) => {
    const quote = quotes[position.ticker];
    const lastPrice = quote?.price;
    const marketValue = lastPrice === undefined ? undefined : lastPrice * position.quantity;
    return { ...position, lastPrice, marketValue, unrealizedResult: marketValue === undefined ? undefined : marketValue - position.costBasis };
  });
}

export function quantityAt(operations: Operation[], ticker: string, date: string) {
  return calculatePositions(operations.filter((operation) => operation.date <= date), {}).find((position) => position.ticker === normalizeTicker(ticker))?.quantity ?? 0;
}

export function valueOfDividend(dividend: Dividend, operations: Operation[]) { return dividend.amountPerShare * quantityAt(operations, dividend.ticker, dividend.dateCom || dividend.paymentDate); }

export function snapshot(operations: Operation[], quotes: Record<string, Quote>) {
  const positions = calculatePositions(operations, quotes);
  const active = positions.filter((position) => position.quantity > 0);
  const marketValue = active.reduce((sum, position) => sum + (position.marketValue ?? 0), 0);
  const investedCost = active.reduce((sum, position) => sum + position.costBasis, 0);
  const realizedResult = positions.reduce((sum, position) => sum + position.realizedResult, 0);
  const unrealizedResult = active.reduce((sum, position) => sum + (position.unrealizedResult ?? 0), 0);
  return { positions, active, marketValue, investedCost, realizedResult, unrealizedResult, totalResult: realizedResult + unrealizedResult, fundCount: active.length };
}

function rangeForMonth(key: string) {
  const [year, month] = key.split("-").map(Number);
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start: `${key}-01`, end };
}

export function monthReport(operations: Operation[], dividends: Dividend[], key: string) {
  const { start, end } = rangeForMonth(key);
  const items = operations.filter((operation) => operation.date >= start && operation.date <= end);
  const before = calculatePositions(operations.filter((operation) => operation.date < start), {});
  const through = calculatePositions(operations.filter((operation) => operation.date <= end), {});
  const realizedResult = through.reduce((sum, position) => sum + position.realizedResult, 0) - before.reduce((sum, position) => sum + position.realizedResult, 0);
  const income = dividends.filter((dividend) => dividend.paymentDate >= start && dividend.paymentDate <= end && dividend.kind === "income").reduce((sum, dividend) => sum + valueOfDividend(dividend, operations), 0);
  const amortization = dividends.filter((dividend) => dividend.paymentDate >= start && dividend.paymentDate <= end && dividend.kind === "amortization").reduce((sum, dividend) => sum + valueOfDividend(dividend, operations), 0);
  return { key, purchaseTotal: items.filter((item) => item.kind === "buy").reduce((sum, item) => sum + item.quantity * item.price + item.fees, 0), saleTotal: items.filter((item) => item.kind === "sell").reduce((sum, item) => sum + item.quantity * item.price - item.fees, 0), incomeTotal: income, amortizationTotal: amortization, realizedResult, netCashFlow: income + amortization + items.filter((item) => item.kind === "sell").reduce((sum, item) => sum + item.quantity * item.price - item.fees, 0) - items.filter((item) => item.kind === "buy").reduce((sum, item) => sum + item.quantity * item.price + item.fees, 0), movementCount: items.length };
}

export function yearReport(operations: Operation[], dividends: Dividend[], year: string) {
  const months = Array.from({ length: 12 }, (_, index) => monthReport(operations, dividends, `${year}-${String(index + 1).padStart(2, "0")}`));
  return { incomeTotal: months.reduce((sum, item) => sum + item.incomeTotal, 0), amortizationTotal: months.reduce((sum, item) => sum + item.amortizationTotal, 0), realizedResult: months.reduce((sum, item) => sum + item.realizedResult, 0), purchaseTotal: months.reduce((sum, item) => sum + item.purchaseTotal, 0), saleTotal: months.reduce((sum, item) => sum + item.saleTotal, 0) };
}

function validateSales(operations: Operation[]) {
  const balances = new Map<string, number>();
  for (const operation of sortedOperations(operations)) {
    const ticker = normalizeTicker(operation.ticker);
    const available = balances.get(ticker) ?? 0;
    if (operation.kind === "sell" && operation.quantity > available) throw new Error(`A venda de ${operation.quantity} cotas supera o saldo disponível de ${available} cotas.`);
    balances.set(ticker, available + (operation.kind === "buy" ? operation.quantity : -operation.quantity));
  }
}

function prepareOperation(input: NewOperation, original?: Operation): Operation {
  const ticker = normalizeTicker(input.ticker); const quantity = Number(input.quantity); const price = Number(input.price); const fees = Number(input.fees ?? 0);
  if (!ticker || !input.date || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) throw new Error("Preencha ticker, data, quantidade e preço com valores válidos.");
  if (fees < 0) throw new Error("As taxas não podem ser negativas.");
  return { ...input, ticker, quantity, price, fees, id: original?.id ?? id("op"), createdAt: original?.createdAt ?? now() };
}
function prepareDividend(input: NewDividend, original?: Dividend): Dividend {
  const ticker = normalizeTicker(input.ticker); const amountPerShare = Number(input.amountPerShare);
  if (!ticker || !input.paymentDate || !Number.isFinite(amountPerShare) || amountPerShare <= 0) throw new Error("Preencha ticker, pagamento e valor por cota com valores válidos.");
  return { ...input, ticker, amountPerShare, id: original?.id ?? id("div"), source: input.source ?? original?.source ?? "manual", createdAt: original?.createdAt ?? now() };
}

interface ContextValue extends PortfolioData { ready: boolean; snapshot: ReturnType<typeof snapshot>; addOperation: (input: NewOperation) => void; updateOperation: (id: string, input: NewOperation) => void; deleteOperation: (id: string) => void; clearManualOperations: () => number; addDividend: (input: NewDividend) => void; updateDividend: (id: string, input: NewDividend) => void; deleteDividend: (id: string) => void; updateSettings: (input: Partial<Settings>) => void; applyMarketData: (quotes: Quote[], dividends: NewDividend[], message?: string) => void; syncMarketData: () => Promise<void>; exportData: () => Promise<void>; importData: () => Promise<boolean>; importB3: (mode?: "merge" | "update") => Promise<{ imported: number; duplicates: number; warnings: string[] } | null>; }
const Context = createContext<ContextValue | null>(null);

export function PortfolioProvider({ children }: PropsWithChildren) {
  const [data, setData] = useState<PortfolioData>(initial); const [ready, setReady] = useState(false);
  useEffect(() => { AsyncStorage.getItem(KEY).then((raw) => { if (raw) { const parsed = JSON.parse(raw) as Partial<PortfolioData>; setData({ ...initial, ...parsed, settings: { ...initial.settings, ...(parsed.settings ?? {}) } }); } }).catch(() => undefined).finally(() => setReady(true)); }, []);
  useEffect(() => { if (ready) AsyncStorage.setItem(KEY, JSON.stringify(data)).catch(() => undefined); }, [data, ready]);
  const addDividend = useCallback((input: NewDividend) => { const dividend = prepareDividend(input); setData((previous) => ({ ...previous, dividends: [...previous.dividends, dividend] })); }, []);
  const updateDividend = useCallback((dividendId: string, input: NewDividend) => { const original = data.dividends.find((dividend) => dividend.id === dividendId); if (!original) throw new Error("Provento não encontrado."); const dividend = prepareDividend(input, original); setData((previous) => ({ ...previous, dividends: previous.dividends.map((item) => item.id === dividendId ? dividend : item) })); }, [data.dividends]);
  const deleteDividend = useCallback((dividendId: string) => setData((previous) => ({ ...previous, dividends: previous.dividends.filter((item) => item.id !== dividendId) })), []);
  const updateSettings = useCallback((input: Partial<Settings>) => setData((previous) => ({ ...previous, settings: { ...previous.settings, ...input } })), []);
  const applyMarketData = useCallback((quotes: Quote[], dividends: NewDividend[], message?: string) => setData((previous) => { const newDividends = dividends.map((input) => prepareDividend(input)); const unique = newDividends.filter((item) => !previous.dividends.some((old) => old.ticker === item.ticker && old.paymentDate === item.paymentDate && old.dateCom === item.dateCom && old.amountPerShare === item.amountPerShare && old.kind === item.kind)); return { ...previous, quotes: { ...previous.quotes, ...Object.fromEntries(quotes.map((quote) => [normalizeTicker(quote.ticker), { ...quote, ticker: normalizeTicker(quote.ticker) }])) }, dividends: [...previous.dividends, ...unique], settings: { ...previous.settings, lastSyncAt: now(), lastSyncMessage: message } }; }), []);

  const syncTickers = useCallback(async (tickers: string[]) => {
    const uniqueTickers = [...new Set(tickers.map(normalizeTicker).filter(Boolean))];
    if (!uniqueTickers.length) return;

    let result: { quotes: Quote[]; dividends: NewDividend[]; message?: string } | null = null;
    const since = data.dividends.filter((item) => item.source !== "manual").map((item) => item.paymentDate).sort().at(-1);

    // Tentativa 1: Serviço Customizado (se configurado)
    if (data.settings.marketServiceUrl && data.settings.marketServiceUrl.trim() !== "") {
      try {
        result = await syncMarket(data.settings.marketServiceUrl, uniqueTickers, since, data.settings.brapiToken);
      } catch (e) {
        // Ignora e tenta o próximo
      }
    }

    // Tentativa 2: Brapi Direta (se houver token ou como padrão)
    if ((!result || !result.quotes.length) && data.settings.brapiToken) {
      try {
        const response = await fetch(`https://brapi.dev/api/quote/${uniqueTickers.join(",")}?token=${data.settings.brapiToken}`);
        const json = await response.json();
        const quotes: Quote[] = (json.results || []).map((q: any) => ({
          ticker: normalizeTicker(q.symbol),
          price: q.regularMarketPrice ?? 0,
          referenceDate: now(),
          updatedAt: now(),
        }));
        if (quotes.length > 0) {
          result = { quotes, dividends: [], message: `Cotações atualizadas via Brapi.` };
        }
      } catch (e) {
        // Ignora e tenta o próximo
      }
    }

    // Tentativa 3: Yahoo Finance (yfinance) Público Automático (Fallback robusto)
    if (!result || !result.quotes.length) {
      try {
        const yahooQuotes: Quote[] = [];
        for (const ticker of uniqueTickers) {
          try {
            const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.SA?interval=1d`);
            const dataJson = await res.json();
            const meta = dataJson.chart?.result?.[0]?.meta;
            const price = meta?.regularMarketPrice ?? meta?.previousClose;
            if (price) {
              yahooQuotes.push({
                ticker: normalizeTicker(ticker),
                price,
                referenceDate: now(),
                updatedAt: now(),
              });
            }
          } catch (err) {
            // Segue para o próximo ticker se falhar individualmente
          }
        }
        if (yahooQuotes.length > 0) {
          result = { quotes: yahooQuotes, dividends: [], message: `Cotações atualizadas via Yahoo Finance.` };
        }
      } catch (e) {
        // Falhou tudo
      }
    }

    if (result && result.quotes.length > 0) {
      applyMarketData(result.quotes, result.dividends, result.message);
    } else {
      updateSettings({
        lastSyncAt: now(),
        lastSyncMessage: "Não foi possível atualizar as cotações por nenhuma fonte no momento."
      });
    }
  }, [applyMarketData, data.dividends, data.settings.marketServiceUrl, data.settings.brapiToken, updateSettings]);

  const addOperation = useCallback((input: NewOperation) => { const operation = prepareOperation(input); validateSales([...data.operations, operation]); setData((previous) => ({ ...previous, operations: [...previous.operations, operation] })); void syncTickers([operation.ticker]); }, [data.operations, syncTickers]);
  const updateOperation = useCallback((operationId: string, input: NewOperation) => { const original = data.operations.find((operation) => operation.id === operationId); if (!original) throw new Error("Movimentação não encontrada."); const operation = prepareOperation(input, original); const operations = data.operations.map((item) => item.id === operationId ? operation : item); validateSales(operations); setData((previous) => ({ ...previous, operations })); void syncTickers([original.ticker, operation.ticker]); }, [data.operations, syncTickers]);
  const deleteOperation = useCallback((operationId: string) => { const ticker = data.operations.find((operation) => operation.id === operationId)?.ticker; setData((previous) => ({ ...previous, operations: previous.operations.filter((operation) => operation.id !== operationId) })); if (ticker) void syncTickers([ticker]); }, [data.operations, syncTickers]);
  const clearManualOperations = useCallback(() => { const count = data.operations.filter((item) => item.source !== "b3").length; setData((previous) => ({ ...previous, operations: previous.operations.filter((item) => item.source === "b3"), settings: { ...previous.settings, lastSyncAt: now(), lastSyncMessage: `${count} lançamentos manuais removidos. Operações importadas da B3 foram preservadas.` } })); return count; }, [data.operations]);
  const syncMarketData = useCallback(async () => { const tickers = [...new Set(data.operations.map((item) => normalizeTicker(item.ticker)).filter(Boolean))]; if (!tickers.length) { updateSettings({ lastSyncMessage: "Registre uma compra antes de atualizar." }); return; } await syncTickers(tickers); }, [data.operations, syncTickers, updateSettings]);
  const autoSyncStarted = useRef(false);
  useEffect(() => { if (!ready || autoSyncStarted.current) return; autoSyncStarted.current = true; void syncMarketData().catch(() => undefined); }, [ready, syncMarketData]);
  const exportData = useCallback(() => shareBackup(data), [data]);
  const importData = useCallback(async () => { const backup = await pickBackup(); if (!backup) return false; setData((previous) => ({ ...previous, operations: backup.operations, dividends: backup.dividends, quotes: backup.quotes })); return true; }, []);
  const importB3 = useCallback(async (mode: "merge" | "update" = "merge") => { const imported = await importB3Spreadsheet(); if (!imported) return null; const operationKey = (item: NewOperation) => `${normalizeTicker(item.ticker)}|${item.kind}|${item.date}`; const exactKey = (item: NewOperation) => `${operationKey(item)}|${Number(item.quantity).toFixed(8)}|${Number(item.price).toFixed(8)}`; const uniqueImported = new Set<string>(); const newOperations = imported.operations.filter((item) => { const key = exactKey(item); if (uniqueImported.has(key)) return false; uniqueImported.add(key); return true; }).map((item) => prepareOperation({ ...item, source: "b3" })); const importedByKey = new Map(newOperations.map((item) => [operationKey(item), item])); const updatedKeys = new Set<string>(); const operations = mode === "merge" ? newOperations : data.operations.flatMap((item) => { const key = operationKey(item); const replacement = importedByKey.get(key); if (!replacement) return [item]; if (updatedKeys.has(key)) return []; updatedKeys.add(key); return [replacement]; }); const duplicates = imported.operations.length - newOperations.length; setData((previous) => ({ ...previous, operations, dividends: [...previous.dividends], settings: { ...previous.settings, lastSyncAt: now(), lastSyncMessage: mode === "merge" ? `Carteira substituída pelo extrato B3: ${newOperations.length} operações mantidas. Operações ausentes no arquivo foram removidas.` : `${updatedKeys.size} operações existentes atualizadas; nenhuma operação nova foi adicionada e as demais foram preservadas.` } })); const tickers = [...new Set(newOperations.map((item) => item.ticker))]; if (tickers.length) void syncTickers(tickers); return { imported: newOperations.length, duplicates, warnings: [...imported.warnings, ...(imported.dividends.length ? ["Linhas de proventos do extrato não foram importadas; use as divulgações automáticas com data-com e pagamento."] : [])] }; }, [data.operations, syncTickers]);
  const calculated = useMemo(() => snapshot(data.operations, data.quotes), [data.operations, data.quotes]);
  const value = useMemo(() => ({ ...data, ready, snapshot: calculated, addOperation, updateOperation, deleteOperation, clearManualOperations, addDividend, updateDividend, deleteDividend, updateSettings, applyMarketData, syncMarketData, exportData, importData, importB3 }), [data, ready, calculated, addOperation, updateOperation, deleteOperation, clearManualOperations, addDividend, updateDividend, deleteDividend, updateSettings, applyMarketData, syncMarketData, exportData, importData, importB3]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePortfolio() { const value = useContext(Context); if (!value) throw new Error("usePortfolio deve ser usado dentro de PortfolioProvider."); return value; }