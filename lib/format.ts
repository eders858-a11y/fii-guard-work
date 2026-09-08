const MONTHS_BR = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function currency(value: number | undefined, options?: { sign?: boolean }) {
  if (value === undefined || !Number.isFinite(value)) return "R$ 0,00";
  const val = Math.abs(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = value < 0 ? "-" : (options?.sign && value > 0 ? "+" : "");
  return `${sign}R$ ${val}`;
}

export function number(value: number | undefined, digits = 2) {
  if (value === undefined || !Number.isFinite(value)) return "0";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function date(value?: string) {
  if (!value) return "—";
  const parts = value.slice(0, 10).split("-");
  if (parts.length !== 3) return value;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function dateTime(value?: string) {
  if (!value) return "ainda não sincronizado";
  try {
    const d = new Date(value);
    return `${d.getDate().toString().padStart(2,"0")}/${(d.getMonth()+1).toString().padStart(2,"0")} ${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
  } catch { return "data inválida"; }
}

export function monthLabel(value: string) {
  const [y, m] = value.split("-").map(Number);
  if (!y || !m) return value;
  return `${MONTHS_BR[m - 1]} de ${y}`;
}

export function brDateToIso(value: string) {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return value;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function isoDateToBr(value: string) {
  return date(value);
}

export function currencyInput(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return (Number(digits) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function parseCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) / 100 : 0;
}
