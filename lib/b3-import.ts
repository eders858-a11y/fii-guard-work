import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as XLSX from "xlsx";

type NewOperation = { ticker: string; kind: "buy" | "sell"; date: string; quantity: number; price: number; fees?: number; note?: string };

const normalizeTicker = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/SA$/, "");
export type B3ImportResult = { operations: NewOperation[]; dividends: any[]; fileName: string; warnings: string[] };

const key = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const asDate = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}` : "";
  }
  const text = String(value ?? "").trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
    const [d, m, y] = text.split("/"); return `${y}-${m}-${d}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return "";
};

const asNumber = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let text = String(value ?? "").replace(/R\$\s?/gi, "").replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
};

const find = (headers: string[], names: string[]) => headers.findIndex((header) => names.some((name) => header.includes(name)));

export async function importB3Spreadsheet(): Promise<B3ImportResult | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"], copyToCacheDirectory: true });
  if (picked.canceled || !picked.assets?.[0]) return null;

  const asset = picked.assets[0];
  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  const workbook = XLSX.read(base64, { type: "base64", cellDates: true });
  const rows = workbook.SheetNames.flatMap((sheetName) => XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "" }) as unknown[][]);

  if (!rows.length) throw new Error("A planilha está vazia.");

  const headerIndex = rows.findIndex((row) => row.some((cell) => {
    const h = key(cell); return h.includes("ticker") || h.includes("ativo") || h.includes("data");
  }));

  if (headerIndex < 0) throw new Error("Cabeçalhos não reconhecidos.");

  const headers = rows[headerIndex].map(key);
  const tickerCol = find(headers, ["ticker", "ativo", "fii", "codigo", "produto"]);
  const dateCol = find(headers, ["data", "datacom", "datamovimentacao"]);
  const quantityCol = find(headers, ["quantidade", "qtde", "qtd"]);
  const priceCol = find(headers, ["preco", "valor", "precomedio"]);
  const kindCol = find(headers, ["tipo", "movimentacao", "operacao"]);

  const operations: NewOperation[] = [];

  // Foco exclusivo em Movimentação (Compra/Venda) para evitar erros de dividendos
  for (const row of rows.slice(headerIndex + 1)) {
    const ticker = normalizeTicker(String(row[tickerCol] ?? "").split(" - ")[0]);
    if (!ticker) continue;

    const date = asDate(row[dateCol]);
    const kind = key(row[kindCol] ?? "");
    const qty = asNumber(row[quantityCol]);
    const price = asNumber(row[priceCol]);

    if (qty > 0 && price > 0 && date && (kind.includes("compra") || kind.includes("buy") || kind.includes("venda") || kind.includes("sell") || kind.includes("liquidacao"))) {
      operations.push({
        ticker,
        kind: kind.includes("venda") || kind.includes("sell") ? "sell" : "buy",
        date,
        quantity: qty,
        price: price,
        fees: 0
      });
    }
  }

  return { operations, dividends: [], fileName: asset.name, warnings: [] };
}
