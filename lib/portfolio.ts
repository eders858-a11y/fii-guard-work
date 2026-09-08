import AsyncStorage from "@react-native-async-storage/async-storage";
import { exportBackup as shareBackup, importBackup as pickBackup } from "./backup";
import { syncMarket } from "./market-sync";
import { importB3Spreadsheet } from "./b3-import";
import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type OperationKind = "buy" | "sell";
export type DividendKind = "income" | "amortization";
export type DividendSource = "manual" | "yfinance" | "brapi" | "b3" | "render";

export type Operation = { id: string; ticker: string; kind: OperationKind; date: string; quantity: number; price: number; fees: number; source?: "manual" | "b3"; note?: string; createdAt: string };
export type Dividend = { id: string; ticker: string; paymentDate: string; dateCom?: string; amountPerShare: number; kind: DividendKind; source: DividendSource; note?: string; createdAt: string };
export type Quote = { ticker: string; price: number; referenceDate: string; updatedAt: string };
export type Position = { ticker: string; quantity: number; costBasis: number; averagePrice: number; lastPrice?: number; marketValue?: number; unrealizedResult?: number; realizedResult: number };
export type Settings = { marketServiceUrl: string; brapiToken?: string; lastSyncAt?: string; lastSyncMessage?: string; themeName?: string; cardColor?: string; textColor?: string; autoSync?: boolean };
export type PortfolioData = { operations: Operation[]; dividends: Dividend[]; quotes: Record<string, Quote>; settings: Settings };

export type NewOperation = Omit<Operation, "id" | "createdAt" | "fees"> & { fees?: number };
export type NewDividend = Omit<Dividend, "id" | "createdAt" | "source"> & { source?: DividendSource; kind?: string };

const KEY = "@fii-guard/portfolio-v2";
const initial: PortfolioData = { operations: [], dividends: [], quotes: {}, settings: { marketServiceUrl: "", brapiToken: "", themeName: "Oceano", cardColor: "#303234", textColor: "#F5F7FA", autoSync: true } };
const now = () => new Date().toISOString();
export const normalizeTicker = (value: string) => value?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/SA$/, "") || "";
const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function toISO(d: string): string {
  if (!d) return "";
  const cleaned = d.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) return cleaned.slice(0, 10);
  const mBR = cleaned.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (mBR) return `${mBR[3]}-${mBR[2]}-${mBR[1]}`;
  return cleaned.slice(0, 10);
}

function sortedOperations(operations: Operation[]) {
  return [...(operations || [])].sort((a, b) => toISO(a.date).localeCompare(toISO(b.date)) || a.createdAt.localeCompare(b.createdAt));
}

export function calculatePositions(operations: Operation[], quotes: Record<string, Quote> = {}): Position[] {
  const state = new Map<string, Position>();
  for (const op of sortedOperations(operations)) {
    const ticker = normalizeTicker(op.ticker);
    const current = state.get(ticker) ?? { ticker, quantity: 0, costBasis: 0, averagePrice: 0, realizedResult: 0 };
    const q = Number(op.quantity || 0);
    const p = Number(op.price || 0);
    const f = Number(op.fees || 0);

    if (op.kind === "buy") {
      current.costBasis += (q * p) + f;
      current.quantity += q;
    } else {
      const avg = current.quantity ? current.costBasis / current.quantity : 0;
      current.realizedResult += (q * p) - f - (avg * q);
      current.costBasis = Math.max(0, current.costBasis - (avg * q));
      current.quantity = Math.max(0, current.quantity - q);
    }
    current.averagePrice = current.quantity ? current.costBasis / current.quantity : 0;
    state.set(ticker, current);
  }
  return [...state.values()].map((p) => {
    const q = quotes[p.ticker];
    const lastPrice = (q?.price && q.price > 0) ? q.price : undefined;
    const marketValue = lastPrice ? lastPrice * p.quantity : p.costBasis;
    const unrealizedResult = marketValue - p.costBasis;
    return { ...p, lastPrice, marketValue, unrealizedResult };
  });
}

export function quantityAt(operations: Operation[], ticker: string, date: string) {
  const target = toISO(date);
  let q = 0;
  for (const op of operations) {
    if (normalizeTicker(op.ticker) === normalizeTicker(ticker) && toISO(op.date) <= target) {
      q += op.kind === "buy" ? (op.quantity || 0) : -(op.quantity || 0);
    }
  }
  return Math.max(0, q);
}

export function valueOfDividend(dividend: Dividend, operations: Operation[]) {
  const q = quantityAt(operations, dividend.ticker, dividend.dateCom || dividend.paymentDate);
  return (dividend.amountPerShare || 0) * q;
}

export function snapshot(operations: Operation[] = [], quotes: Record<string, Quote> = {}, dividends: Dividend[] = []) {
  const positions = calculatePositions(operations, quotes);
  const active = positions.filter(p => p.quantity > 0);
  const marketValue = active.reduce((s, p) => s + (p.marketValue || 0), 0);
  const investedCost = active.reduce((s, p) => s + (p.costBasis || 0), 0);
  const realizedResult = positions.reduce((s, p) => s + (p.realizedResult || 0), 0);
  const unrealizedResult = active.reduce((s, p) => s + (p.unrealizedResult || 0), 0);
  const totalDividends = (dividends || []).reduce((s, d) => s + valueOfDividend(d, operations), 0);

  return {
    positions, active, marketValue, investedCost, realizedResult, unrealizedResult,
    totalDividends: totalDividends || 0,
    totalResult: (realizedResult || 0) + (unrealizedResult || 0),
    fundCount: active.length
  };
}

export function monthReport(operations: Operation[] = [], dividends: Dividend[] = [], key: string) {
  const incomeTotal = (dividends || []).filter(d => toISO(d.paymentDate).startsWith(key) && d.kind === "income").reduce((s, d) => s + valueOfDividend(d, operations), 0);
  const amortizationTotal = (dividends || []).filter(d => toISO(d.paymentDate).startsWith(key) && d.kind === "amortization").reduce((s, d) => s + valueOfDividend(d, operations), 0);

  const start = `${key}-01`;
  const items = (operations || []).filter(op => toISO(op.date).startsWith(key));
  const purchaseTotal = items.filter(i => i.kind === "buy").reduce((s, i) => s + ((i.quantity || 0) * (i.price || 0)) + (i.fees || 0), 0);
  const saleTotal = items.filter(i => i.kind === "sell").reduce((s, i) => s + ((i.quantity || 0) * (i.price || 0)) - (i.fees || 0), 0);

  return { incomeTotal, amortizationTotal, purchaseTotal, saleTotal, movementCount: items.length, netCashFlow: (incomeTotal + amortizationTotal + saleTotal) - purchaseTotal, realizedResult: 0 };
}

function prepareOperation(input: NewOperation, original?: Operation): Operation {
  const ticker = normalizeTicker(input.ticker);
  const quantity = Number(input.quantity || 0);
  const price = Number(input.price || 0);
  const fees = Number(input.fees ?? 0);
  const date = toISO(input.date);
  if (!ticker || !date || quantity <= 0) throw new Error("Dados inválidos.");
  return { ...input, ticker, quantity, price, fees, date, id: original?.id ?? id("op"), createdAt: original?.createdAt ?? now() };
}

function prepareDividend(input: NewDividend, original?: Dividend): Dividend {
  const ticker = normalizeTicker(input.ticker);
  const amount = Number(input.amountPerShare || 0);
  const kind = String(input.kind || "income").toLowerCase().includes("amort") ? "amortization" : "income";
  return { ...input, ticker, amountPerShare: amount, kind, id: original?.id || id("div"), source: input.source || "render", createdAt: original?.createdAt || now() } as Dividend;
}

const Context = createContext<any>(null);

export function PortfolioProvider({ children }: PropsWithChildren) {
  const [data, setData] = useState<PortfolioData>(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(raw => {
      if (raw) {
        const parsed = JSON.parse(raw);
        setData({ ...initial, ...parsed, settings: { ...initial.settings, ...parsed.settings } });
      }
    }).finally(() => setReady(true));
  }, []);

  useEffect(() => { if (ready) AsyncStorage.setItem(KEY, JSON.stringify(data)); }, [data, ready]);

  const applyMarketData = useCallback((quotes: Quote[], dividends: NewDividend[], message?: string) => {
    setData(prev => {
      const newDivs = (dividends || []).map(d => prepareDividend(d));
      const existing = prev.dividends || [];
      const unique = newDivs.filter(n => !existing.some(e => e.ticker === n.ticker && e.paymentDate === n.paymentDate && Math.abs(e.amountPerShare - n.amountPerShare) < 0.0001));
      return {
        ...prev,
        quotes: { ...prev.quotes, ...Object.fromEntries((quotes || []).map(q => [normalizeTicker(q.ticker), q])) },
        dividends: [...existing, ...unique],
        settings: { ...prev.settings, lastSyncAt: now(), lastSyncMessage: message }
      };
    });
  }, []);

  const syncMarketData = useCallback(async () => {
    const tickers = [...new Set((data.operations || []).map(o => normalizeTicker(o.ticker)))].filter(Boolean);
    if (!tickers.length) return;
    const res = await syncMarket(data.settings.marketServiceUrl, tickers, undefined, data.settings.brapiToken);
    if (res) { applyMarketData(res.quotes, res.dividends, res.message); }
  }, [data.operations, data.settings, applyMarketData]);

  const addOperation = useCallback((input: NewOperation) => {
    setData(p => ({ ...p, operations: [...(p.operations || []), prepareOperation(input)] }));
    setTimeout(() => syncMarketData(), 1000);
  }, [syncMarketData]);

  const updateSettings = useCallback((s: any) => setData(p => ({ ...p, settings: { ...(p.settings || {}), ...s } })), []);

  const autoSyncStarted = useRef(false);
  useEffect(() => {
    if (!ready || autoSyncStarted.current) return;
    autoSyncStarted.current = true;
    void syncMarketData().catch(() => undefined);
  }, [ready, syncMarketData]);

  const value = useMemo(() => ({
    ...data, ready, snapshot: snapshot(data.operations, data.quotes, data.dividends),
    addOperation, updateSettings, applyMarketData, syncMarketData,
    exportData: () => shareBackup(data),
    importData: async () => {
      const b = await pickBackup();
      if (b) { setData(b); return true; }
      return false;
    },
    importB3: async () => {
      const imp = await importB3Spreadsheet();
      if (!imp) return null;
      const ops = imp.operations.map(o => prepareOperation({ ...o, source: "b3" }));
      setData(p => ({ ...p, operations: [...(p.operations || []), ...ops] }));
      return { imported: ops.length };
    }
  }), [data, ready, syncMarketData, applyMarketData, addOperation, updateSettings]);

  return React.createElement(Context.Provider, { value }, children);
}

export const usePortfolio = () => useContext(Context);
