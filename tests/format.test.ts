import { describe, expect, it } from "vitest";
import { brDateToIso, currencyInput, isoDateToBr, parseCurrencyInput } from "../lib/format";

describe("formatos brasileiros", () => {
  it("formata moeda digitada em centavos", () => {
    expect(currencyInput("7295")).toBe("72,95");
    expect(parseCurrencyInput("72,95")).toBe(72.95);
  });
  it("converte datas brasileiras e ISO", () => {
    expect(brDateToIso("07/08/2026")).toBe("2026-08-07");
    expect(isoDateToBr("2026-08-07")).toBe("07/08/2026");
  });
});
