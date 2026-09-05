import { describe, expect, it } from "vitest";
import { calculatePositions, monthReport, quantityAt, dividendValue } from "../lib/portfolio-calculations";
const buy = (id: string, date: string, quantity: number, price: number) => ({ id, ticker: "HGLG11", kind: "buy" as const, date, quantity, price, fees: 0, createdAt: date });
const sell = (id: string, date: string, quantity: number, price: number) => ({ id, ticker: "HGLG11", kind: "sell" as const, date, quantity, price, fees: 0, createdAt: date });
describe("cálculos da carteira", () => {
  it("calcula preço médio ponderado", () => { const [position] = calculatePositions([buy("1", "2026-01-01", 10, 100), buy("2", "2026-02-01", 10, 120)], {}); expect(position.quantity).toBe(20); expect(position.averagePrice).toBe(110); });
  it("reconhece resultado da venda sem alterar o PM remanescente", () => { const [position] = calculatePositions([buy("1", "2026-01-01", 10, 100), sell("2", "2026-02-01", 4, 130)], {}); expect(position.quantity).toBe(6); expect(position.averagePrice).toBe(100); expect(position.realizedResult).toBe(120); });
  it("usa a posição na data-com para calcular o provento", () => { const operations = [buy("1", "2026-01-01", 10, 100), sell("2", "2026-02-10", 4, 120)]; const dividend = { id: "d", ticker: "HGLG11", paymentDate: "2026-02-20", dateCom: "2026-02-05", amountPerShare: 1.5, kind: "income" as const, source: "manual" as const, createdAt: "2026-02-20" }; expect(quantityAt(operations, "HGLG11", "2026-02-05")).toBe(10); expect(dividendValue(dividend, operations)).toBe(15); });
  it("agrega somente as movimentações do mês selecionado", () => { const operations = [buy("1", "2026-01-31", 10, 100), buy("2", "2026-02-01", 2, 110)]; const report = monthReport(operations, [], "2026-02"); expect(report.purchaseTotal).toBe(220); expect(report.movementCount).toBe(1); });
});
