import type { Operation } from "./portfolio";

export type DarfMonth = {
  key: string;
  grossSales: number;
  saleCosts: number;
  costBasisSold: number;
  realizedResult: number;
  lossBefore: number;
  taxableBase: number;
  taxDue: number;
  lossCarry: number;
  hasSales: boolean;
};

type Balance = { quantity: number; costBasis: number };
const cleanTicker = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/SA$/, "");
const ordered = (operations: Operation[]) => [...operations].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

/** Apuração estimada de alienações de FIIs, com compensação de prejuízo acumulado. */
export function calculateDarfYear(operations: Operation[], year: number): DarfMonth[] {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    key: `${year}-${String(index + 1).padStart(2, "0")}`,
    grossSales: 0,
    saleCosts: 0,
    costBasisSold: 0,
    realizedResult: 0,
    lossBefore: 0,
    taxableBase: 0,
    taxDue: 0,
    lossCarry: 0,
    hasSales: false,
  }));
  const balances = new Map<string, Balance>();
  let lossCarry = 0;

  for (const operation of ordered(operations)) {
    const ticker = cleanTicker(operation.ticker);
    const balance = balances.get(ticker) ?? { quantity: 0, costBasis: 0 };
    const total = operation.quantity * operation.price;
    if (operation.kind === "buy") {
      balance.costBasis += total + operation.fees;
      balance.quantity += operation.quantity;
    } else {
      const average = balance.quantity > 0 ? balance.costBasis / balance.quantity : 0;
      const allocatedCost = average * operation.quantity;
      const result = total - operation.fees - allocatedCost;
      const key = operation.date.slice(0, 7);
      const row = rows.find((item) => item.key === key);
      if (row) {
        row.hasSales = true;
        row.grossSales += total;
        row.saleCosts += operation.fees;
        row.costBasisSold += allocatedCost;
        row.realizedResult += result;
      }
      balance.costBasis = Math.max(0, balance.costBasis - allocatedCost);
      balance.quantity = Math.max(0, balance.quantity - operation.quantity);
    }
    balances.set(ticker, balance);
  }

  for (const row of rows) {
    row.lossBefore = lossCarry;
    const afterCompensation = row.realizedResult + lossCarry;
    row.taxableBase = Math.max(0, afterCompensation);
    row.taxDue = row.taxableBase * 0.2;
    lossCarry = Math.min(0, afterCompensation);
    row.lossCarry = lossCarry;
  }
  return rows;
}
