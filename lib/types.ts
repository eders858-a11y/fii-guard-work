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
