/**
 * Utilitários de Ticker e Data para evitar dependências circulares.
 */

export const normalizeTicker = (value: string) => {
  if (!value) return "";
  let tk = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/SA$/, "");
  // MAPEAMENTO DE TICKERS QUE MUDARAM (Garante consistência na carteira)
  if (tk === "GALG11") return "GARE11";
  return tk;
};

export function toISO(d: string): string {
  if (!d) return "";
  const cleaned = d.trim();
  // Se já for ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) return cleaned.slice(0, 10);

  // Se for BR DD/MM/YYYY
  const mBR = cleaned.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (mBR) return `${mBR[3]}-${mBR[2].padStart(2, "0")}-${mBR[1].padStart(2, "0")}`;

  return cleaned.slice(0, 10);
}
