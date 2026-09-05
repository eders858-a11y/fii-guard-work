import { describe, expect, it } from "vitest";
import { calculateDarfYear } from "../lib/darf-calculations";
import type { Operation } from "../lib/portfolio";

const op = (id: string, date: string, kind: "buy" | "sell", quantity: number, price: number, fees = 0): Operation => ({ id, date, kind, quantity, price, fees, ticker: "HGLG11", createdAt: `${date}T12:00:00.000Z` });

describe("apuração DARF", () => {
  it("calcula lucro de venda sobre o custo médio e imposto de 20%", () => {
    const rows = calculateDarfYear([op("b", "2026-01-02", "buy", 10, 100), op("s", "2026-02-03", "sell", 5, 120)], 2026);
    expect(rows[1].realizedResult).toBe(100);
    expect(rows[1].taxableBase).toBe(100);
    expect(rows[1].taxDue).toBe(20);
  });

  it("compensa prejuízo anterior no lucro dos meses seguintes", () => {
    const rows = calculateDarfYear([op("b", "2026-01-02", "buy", 10, 100), op("s1", "2026-02-03", "sell", 5, 80), op("s2", "2026-03-03", "sell", 5, 140)], 2026);
    expect(rows[1].realizedResult).toBe(-100);
    expect(rows[1].lossCarry).toBe(-100);
    expect(rows[2].realizedResult).toBe(200);
    expect(rows[2].taxableBase).toBe(100);
    expect(rows[2].taxDue).toBe(20);
  });
});
