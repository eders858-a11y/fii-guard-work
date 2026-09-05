export function currency(value: number | undefined, options?: { sign?: boolean }) { if (value === undefined || !Number.isFinite(value)) return "—"; const formatted = value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); return options?.sign && value > 0 ? `+${formatted}` : formatted; }
export function number(value: number | undefined, digits = 2) { return value === undefined ? "—" : value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }); }
export function date(value?: string) { if (!value) return "—"; const [y, m, d] = value.slice(0, 10).split("-"); return `${d}/${m}/${y}`; }
export function dateTime(value?: string) { return value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "ainda não sincronizado"; }
export function monthLabel(value: string) { const [y, m] = value.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); }
export function brDateToIso(value: string) { const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (!match) return value; const [, day, month, year] = match; return `${year}-${month}-${day}`; }
export function isoDateToBr(value: string) { if (!value) return ""; const [year, month, day] = value.slice(0, 10).split("-"); return year && month && day ? `${day}/${month}/${year}` : value; }
export function currencyInput(value: string) { const digits = value.replace(/\D/g, ""); if (!digits) return ""; return (Number(digits) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
export function parseCurrencyInput(value: string) { const digits = value.replace(/\D/g, ""); return digits ? Number(digits) / 100 : 0; }
