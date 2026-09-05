import { describe, expect, it } from "vitest";
import { monthReport, quantityAt, dividendValue } from "../lib/portfolio-calculations";

const buy = { id: "buy-1", ticker: "HGLG11", kind: "buy" as const, date: "2026-02-10", quantity: 100, price: 100, fees: 0, createdAt: "2026-02-10T10:00:00.000Z" };
const dividend = { id: "div-1", ticker: "HGLG11", dateCom: "2026-08-14", paymentDate: "2026-08-25", amountPerShare: 1.25, kind: "income" as const, source: "b3" as const, createdAt: "2026-08-01T10:00:00.000Z" };

describe("proventos por data-com e pagamento", () => {
  it("usa a quantidade existente na data-com", () => {
    expect(quantityAt([buy], "HGLG11", dividend.dateCom)).toBe(100);
    expect(dividendValue(dividend, [buy])).toBe(125);
  });

  it("soma o evento no mês da data de pagamento", () => {
    const report = monthReport([buy], [dividend], "2026-08");
    expect(report.incomeTotal).toBe(125);
    expect(monthReport([buy], [dividend], "2026-02").incomeTotal).toBe(0);
  });
});
