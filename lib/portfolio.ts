import AsyncStorage from "@react-native-async-storage/async-storage";
import { exportBackup as shareBackup, importBackup as pickBackup } from "./backup";
import { syncMarket } from "./market-sync";
import { importB3Spreadsheet } from "./b3-import";
import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";

export type OperationKind = "buy" | "sell";
export type DividendKind = "income" | "amortization";
export type DividendSource = "manual" | "yfinance" | "brapi" | "b3" | "render";

export type Operation = { id: string; ticker: string; kind: OperationKind; date: string; quantity: number; price: number; fees: number; source?: DividendSource; note?: string; createdAt: string };
export type Dividend = { id: string; ticker: string; paymentDate: string; dateCom?: string; amountPerShare: number; kind: DividendKind; source: DividendSource; note?: string; createdAt: string };
export type Quote = { ticker: string; price: number; referenceDate: string; updatedAt: string };
export type Position = { ticker: string; quantity: number; costBasis: number; averagePrice: number; lastPrice?: number; marketValue?: number; unrealizedResult?: number; realizedResult: number };
export type Settings = { marketServiceUrl: string; brapiToken?: string; lastSyncAt?: string; lastSyncMessage?: string; themeName?: string; cardColor?: string; textColor?: string; autoSync?: boolean };
export type PortfolioData = { operations: Operation[]; dividends: Dividend[]; quotes: Record<string, Quote>; settings: Settings };

export type NewOperation = Omit<Operation, "id" | "createdAt" | "fees"> & { fees?: number; source?: DividendSource };
export type NewDividend = Omit<Dividend, "id" | "createdAt" | "source"> & { source?: DividendSource; kind?: string };

const KEY = "@fii-guard/portfolio-v2";
const initial: PortfolioData = { operations: [], dividends: [], quotes: {}, settings: { marketServiceUrl: "", brapiToken: "", themeName: "Oceano", cardColor: "#303234", textColor: "#F5F7FA", autoSync: true } };
const now = () => new Date().toISOString();
export const normalizeTicker = (value: string) => {
  if (!value) return "";
  let tk = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/SA$/, "");
  // MAPEAMENTO DE TICKERS QUE MUDARAM (Garante consistência na carteira)
  if (tk === "GALG11") return "GARE11";
  return tk;
};
const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function toISO(d: string): string {
  if (!d) return "";
  const cleaned = d.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) return cleaned.slice(0, 10);
  const mBR = cleaned.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (mBR) return `${mBR[3]}-${mBR[2].padStart(2, "0")}-${mBR[1].padStart(2, "0")}`;
  return cleaned.slice(0, 10);
}

function sortedOperations(operations: Operation[]) {
  return [...(operations || [])].sort((a, b) => toISO(a.date).localeCompare(toISO(b.date)) || a.createdAt.localeCompare(b.createdAt));
}

export function calculatePositions(operations: Operation[], quotes: Record<string, Quote> = {}): Position[] {
  const state = new Map<string, Position>();
  const sorted = sortedOperations(operations);
  for (const op of sorted) {
    const ticker = normalizeTicker(op.ticker);
    const current = state.get(ticker) ?? { ticker, quantity: 0, costBasis: 0, averagePrice: 0, realizedResult: 0 };
    const q = Number(op.quantity || 0);
    const p = Number(op.price || 0);
    const f = Number(op.fees || 0);
    if (op.kind === "buy") { current.costBasis += (q * p) + f; current.quantity += q; }
    else {
        const avg = current.quantity ? current.costBasis / current.quantity : 0;
        current.realizedResult += (q * p) - f - (avg * q);
        current.costBasis = Math.max(0, current.costBasis - (avg * q));
        current.quantity = Math.max(0, current.quantity - q);
    }
    current.averagePrice = current.quantity > 0.0001 ? current.costBasis / current.quantity : 0;
    state.set(ticker, current);
  }
  return [...state.values()].map((p) => {
    const q = quotes[p.ticker];
    const lastPrice = (q?.price && q.price > 0) ? q.price : undefined;
    const marketValue = lastPrice ? lastPrice * p.quantity : p.costBasis;
    const unrealizedResult = marketValue - p.costBasis;
    if (p.quantity < 0.01) return { ...p, quantity: 0, marketValue: 0, costBasis: 0, unrealizedResult: 0, lastPrice };
    return { ...p, lastPrice, marketValue, unrealizedResult };
  });
}

export function quantityAt(operations: Operation[], ticker: string, date: string) {
  const target = toISO(date);
  const tk = normalizeTicker(ticker);
  let q = 0;
  for (let i = 0; i < (operations || []).length; i++) {
    const op = operations[i];
    if (normalizeTicker(op.ticker) === tk && toISO(op.date) <= target) {
      q += op.kind === "buy" ? (op.quantity || 0) : -(op.quantity || 0);
    }
  }
  return Math.max(0, q);
}

export function valueOfDividend(dividend: Dividend, operations: Operation[]) {
  const q = quantityAt(operations, dividend.ticker, dividend.dateCom || dividend.paymentDate);
  // CÁLCULO REAL SEM ARREDONDAMENTO CONFORME PEDIDO
  return (dividend.amountPerShare || 0) * q;
}

export function snapshot(operations: Operation[] = [], quotes: Record<string, Quote> = {}, dividends: Dividend[] = []) {
  const positions = calculatePositions(operations, quotes);
  const active = positions.filter(p => p.quantity > 0.01);
  const totalDividends = (dividends || []).reduce((s, d) => s + valueOfDividend(d, operations), 0);
  return {
    active,
    marketValue: active.reduce((s,p) => s + (p.marketValue || 0), 0),
    investedCost: active.reduce((s,p) => s + (p.costBasis || 0), 0),
    totalResult: active.reduce((s,p) => s + (p.unrealizedResult || 0), 0) + positions.reduce((s,p) => s + p.realizedResult, 0),
    totalDividends,
    fundCount: active.length,
    positions
  };
}

export function monthReport(operations: Operation[] = [], dividends: Dividend[] = [], key: string) {
  try {
    const [year, month] = key.split("-").map(Number);
    const start = `${key}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${key}-${lastDay.toString().padStart(2, "0")}`;
    const items = (operations || []).filter(op => toISO(op.date) >= start && toISO(op.date) <= end);
    const incomeTotal = (dividends || []).filter(d => toISO(d.paymentDate) >= start && toISO(d.paymentDate) <= end && d.kind === "income").reduce((s, d) => s + valueOfDividend(d, operations), 0);
    const amortizationTotal = (dividends || []).filter(d => toISO(d.paymentDate) >= start && d.paymentDate <= end && d.kind === "amortization").reduce((s, d) => s + valueOfDividend(d, operations), 0);
    const purchaseTotal = items.filter(i => i.kind === "buy").reduce((sum, i) => sum + (i.quantity * i.price) + (i.fees || 0), 0);
    const saleTotal = items.filter(i => i.kind === "sell").reduce((sum, i) => sum + (i.quantity * i.price) - i.fees, 0);

    const before = calculatePositions((operations || []).filter(o => toISO(o.date) < start), {});
    const through = calculatePositions((operations || []).filter(o => toISO(o.date) <= end), {});
    const realizedResult = through.reduce((s,p) => s + p.realizedResult, 0) - before.reduce((s,p) => s + p.realizedResult, 0);

    return { key, incomeTotal, amortizationTotal, purchaseTotal, saleTotal, movementCount: items.length, realizedResult, netCashFlow: (purchaseTotal + incomeTotal + amortizationTotal) - saleTotal };
  } catch (e) { return { key, incomeTotal: 0, amortizationTotal: 0, purchaseTotal: 0, saleTotal: 0, movementCount: 0, realizedResult: 0, netCashFlow: 0 }; }
}

export function yearReport(operations: Operation[] = [], dividends: Dividend[] = [], year: string) {
  try {
    const months = Array.from({ length: 12 }, (_, i) => monthReport(operations, dividends, `${year}-${String(i + 1).padStart(2, "0")}`));
    return { incomeTotal: months.reduce((sum, m) => sum + m.incomeTotal, 0), amortizationTotal: months.reduce((sum, m) => sum + m.amortizationTotal, 0), realizedResult: months.reduce((sum, m) => sum + m.realizedResult, 0), purchaseTotal: months.reduce((sum, m) => sum + m.purchaseTotal, 0), saleTotal: months.reduce((sum, m) => sum + m.saleTotal, 0) };
  } catch { return { incomeTotal: 0, amortizationTotal: 0, realizedResult: 0, purchaseTotal: 0, saleTotal: 0 }; }
}

const Context = createContext<any>(null);

export function PortfolioProvider({ children }: PropsWithChildren) {
  const [data, setData] = useState<PortfolioData>(initial);
  const [ready, setReady] = useState(false);
  const syncRef = useRef(false);
  const dataRef = useRef(data);

  useEffect(() => { dataRef.current = data; }, [data]);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(raw => {
      if (raw) {
        let parsed = JSON.parse(raw);
        setData({ ...initial, ...parsed });
      }
    }).finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) {
      AsyncStorage.setItem(KEY, JSON.stringify(data));
      if (Platform.OS === 'web') window.dispatchEvent(new Event('storage'));
    }
  }, [data, ready]);

  const syncMarketData = useCallback(async (customTickers?: string[]) => {
    if (syncRef.current) return;
    syncRef.current = true;
    try {
      const currentData = dataRef.current;

      // BUSCA INTELIGENTE: Pega apenas FIIs que estão na sua carteira (active positions)
      const snapshots = snapshot(currentData.operations, currentData.quotes, currentData.dividends);
      const tickers = customTickers || snapshots.active.map(p => p.ticker);

      if (!tickers.length) {
          syncRef.current = false;
          return;
      }

      console.log(`[SYNC] Atualizando apenas ativos da carteira: ${tickers.join(", ")}`);

      const res = await syncMarket(currentData.settings.marketServiceUrl, tickers, undefined, currentData.settings.brapiToken);
      if (res) {
          setData(prev => {
              const existingDivs = prev.dividends || [];
              const rawIncoming = res.dividends.map(d => prepareDividend(d));

              // DEDUPLICA INCOMING: Sempre mantém o maior valor para o mesmo dia/fundo
              const incomingMap = new Map<string, Dividend>();
              rawIncoming.forEach(n => {
                  const key = `${normalizeTicker(n.ticker)}-${toISO(n.paymentDate)}-${n.kind}`;
                  const existing = incomingMap.get(key);
                  if (!existing || n.amountPerShare > existing.amountPerShare) {
                      incomingMap.set(key, n);
                  }
              });
              const incoming = Array.from(incomingMap.values());

              // ATUALIZAÇÃO AGRESSIVA: Substitui se o novo for diferente ou se for um anúncio inédito
              const cleanedExisting = existingDivs.filter(e => {
                  const tk = normalizeTicker(e.ticker);
                  const incomingDestaData = incoming.find(n =>
                      normalizeTicker(n.ticker) === tk &&
                      toISO(n.paymentDate) === toISO(e.paymentDate) &&
                      n.kind === e.kind
                  );

                  // Se o servidor mandou um valor para esta data, removemos o antigo para entrar o novo (mais preciso ou atualizado)
                  if (incomingDestaData) {
                      return false; // Remove o antigo
                  }
                  return true; // Mantém se o servidor não mandou nada para este dia
              });

              // Pega tudo o que o servidor mandou e que não é exatamente igual ao que sobrou
              const finalNew = incoming.filter(n =>
                !cleanedExisting.some(e =>
                    normalizeTicker(e.ticker) === normalizeTicker(n.ticker) &&
                    toISO(e.paymentDate) === toISO(n.paymentDate) &&
                    e.kind === n.kind &&
                    Math.abs(n.amountPerShare - e.amountPerShare) < 0.00001
                )
              );

              const updatedQuotes = { ...prev.quotes };
              res.quotes.forEach(q => {
                  updatedQuotes[normalizeTicker(q.ticker)] = q;
              });

              return {
                  ...prev,
                  quotes: updatedQuotes,
                  dividends: [...cleanedExisting, ...finalNew],
                  settings: { ...prev.settings, lastSyncAt: now(), lastSyncMessage: res.message }
              };
          });
      }
    } catch (e: any) {
      console.warn("Falha na sincronização:", e.message);
      throw e;
    } finally { syncRef.current = false; }
  }, []);

  const value = useMemo(() => ({
    ...data, ready, snapshot: snapshot(data.operations, data.quotes, data.dividends),
    addOperation: (i: any) => setData(p => ({ ...p, operations: [...(p.operations || []), prepareOperation(i)] })),
    updateOperation: (id: string, i: any) => setData(p => ({ ...p, operations: (p.operations || []).map(o => o.id === id ? prepareOperation(i, o) : o) })),
    deleteOperation: (id: string) => setData(p => ({ ...p, operations: (p.operations || []).filter(o => o.id !== id) })),
    addDividend: (i: any) => setData(p => ({ ...p, dividends: [...(p.dividends || []), prepareDividend(i)] })),
    updateDividend: (id: string, i: any) => setData(p => ({ ...p, dividends: (p.dividends || []).map(d => d.id === id ? prepareDividend(i, d) : d) })),
    deleteDividend: (id: string) => setData(p => ({ ...p, dividends: (p.dividends || []).filter(d => d.id !== id) })),
    updateSettings: (s: any) => setData(p => ({ ...p, settings: { ...p.settings, ...s } })),
    syncMarketData,
    importB3: async (mode: "merge" | "update" = "merge") => {
      const imp = await importB3Spreadsheet();
      if (!imp) return null;
      let count = 0;
      setData(p => {
        const prevOps = p.operations || [];
        const prevDivs = p.dividends || [];
        const newOps = imp.operations.map(o => prepareOperation(o));
        const newDivs = imp.dividends.map(d => prepareDividend(d));
        const uniqueOps = newOps.filter(n => !prevOps.some(e => normalizeTicker(e.ticker) === normalizeTicker(n.ticker) && toISO(e.date) === toISO(n.date) && e.kind === n.kind && Math.abs(e.quantity - n.quantity) < 0.001 && Math.abs(e.price - n.price) < 0.01));
        const uniqueDivs = newDivs.filter(n => !prevDivs.some(e => normalizeTicker(e.ticker) === normalizeTicker(n.ticker) && toISO(e.paymentDate) === toISO(n.paymentDate) && e.kind === n.kind && Math.abs(e.amountPerShare - n.amountPerShare) < 0.0001));
        count = uniqueOps.length;
        return { ...p, operations: mode === "merge" ? [...newOps] : [...prevOps, ...uniqueOps], dividends: mode === "merge" ? [...newDivs] : [...prevDivs, ...uniqueDivs] };
      });
      return { imported: count, duplicates: 0, warnings: [] };
    },
    clearManualOperations: () => {
        const count = (data.operations || []).filter(op => op.source !== "b3").length;
        setData(p => ({ ...p, operations: (p.operations || []).filter(op => op.source === "b3") }));
        return count;
    },
    clearB3Operations: () => {
        const count = (data.operations || []).filter(op => op.source === "b3").length;
        setData(p => ({ ...p, operations: (p.operations || []).filter(op => op.source !== "b3") }));
        return count;
    },
    clearManualDividends: () => {
        setData(p => ({ ...p, dividends: (p.dividends || []).filter(d => d.source === "b3" || d.source === "render" || d.source === "brapi") }));
    },
    exportData: () => shareBackup(data),
    importData: async () => {
      const b = await pickBackup();
      if (b) { setData(prev => ({ ...prev, operations: b.operations || [], dividends: b.dividends || [], quotes: b.quotes || {} })); return true; }
      return false;
    }
  }), [data, ready, syncMarketData]);

  return React.createElement(Context.Provider, { value }, children);
}

function prepareOperation(input: NewOperation, original?: Operation): Operation {
  const ticker = normalizeTicker(input.ticker);
  const quantity = Number(input.quantity || 0);
  const price = Number(input.price || 0);
  const date = toISO(input.date);
  if (!ticker || !date || quantity <= 0) throw new Error("Dados inválidos.");
  return { ...input, ticker, quantity, price, fees: Number(input.fees || 0), date, id: original?.id ?? id("op"), source: input.source || original?.source || "manual", createdAt: original?.createdAt ?? now() };
}

function prepareDividend(input: NewDividend, original?: Dividend): Dividend {
  const ticker = normalizeTicker(input.ticker);
  const amount = Number(input.amountPerShare || 0);

  const paymentDate = toISO(input.paymentDate);
  if (!ticker || !paymentDate || amount <= 0) throw new Error("Dados de provento inválidos.");
  const rawKind = String(input.kind || "income").toLowerCase();
  const kind: DividendKind = rawKind.includes("amort") ? "amortization" : "income";
  return { ...input, ticker, amountPerShare: amount, kind, paymentDate, dateCom: toISO(input.dateCom || ""), id: original?.id || id("div"), source: input.source || "render", createdAt: original?.createdAt || now() } as Dividend;
}

export function usePortfolio() { return useContext(Context); }
