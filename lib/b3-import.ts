import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as XLSX from "xlsx";
type NewOperation = { ticker: string; kind: "buy" | "sell"; date: string; quantity: number; price: number; fees?: number; note?: string };
type NewDividend = { ticker: string; paymentDate: string; dateCom?: string; amountPerShare: number; kind: "income" | "amortization"; source?: "manual" | "yfinance" | "brapi" | "b3"; note?: string };
const normalizeTicker = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/SA$/, "");

export type B3ImportResult = { operations: NewOperation[]; dividends: NewDividend[]; fileName: string; warnings: string[] };
const key = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const asDate = (value: unknown) => { if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10); if (typeof value === "number") { const parsed = XLSX.SSF.parse_date_code(value); return parsed ? `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}` : ""; } const text = String(value ?? "").trim(); if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) { const [d, m, y] = text.split("/"); return `${y}-${m}-${d}`; } if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10); return ""; };
const asNumber = (value: unknown) => { if (typeof value === "number") return Number.isFinite(value) ? value : 0; let text = String(value ?? "").replace(/R\$\s?/gi, "").replace(/\s/g, "").replace(/[^\d,.-]/g, ""); if (text.includes(",")) text = text.replace(/\./g, "").replace(",", "."); else if ((text.match(/\./g) ?? []).length > 1) text = text.replace(/\./g, ""); const n = Number(text); return Number.isFinite(n) ? n : 0; };
const find = (headers: string[], names: string[]) => headers.findIndex((header) => names.some((name) => header.includes(name)));

export async function importB3Spreadsheet(): Promise<B3ImportResult | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel.sheet.macroEnabled.12", "application/octet-stream"], copyToCacheDirectory: true, multiple: false });
  if (picked.canceled || !picked.assets?.[0]) return null;
  const asset = picked.assets[0]; const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  const workbook = XLSX.read(base64, { type: "base64", cellDates: true }); const rows = workbook.SheetNames.flatMap((sheetName) => XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "" }) as unknown[][]);
  if (!rows.length) throw new Error("A planilha B3 está vazia.");
  const headerIndex = rows.findIndex((row) => row.some((cell) => { const h = key(cell); return h.includes("ticker") || h.includes("ativo") || h.includes("fii") || h.includes("data" ); }));
  if (headerIndex < 0) throw new Error("Não encontrei cabeçalhos reconhecíveis na planilha B3.");
  const headers = rows[headerIndex].map(key); const tickerCol = find(headers, ["ticker", "ativo", "fii", "codigo", "codigodenegociacao", "produto", "produtonegociado"]); const dateCol = find(headers, ["data", "datacom", "datalimite", "datainclusao", "dataoperacao", "datadonegocio", "datamovimentacao"]); const paymentCol = find(headers, ["datapagamento", "datacredito", "pagamento", "dataderecebimento"]); const dividendAmountCol = find(headers, ["valorporcota", "valorporativo", "valorcota", "valorunitario", "rendimento", "valorporevento", "valordistribuido"]); const amountCol = dividendAmountCol >= 0 ? dividendAmountCol : find(headers, ["valor"]); const quantityCol = find(headers, ["quantidade", "qtde", "qtd", "posicao", "quantidadetotal"]); const priceCol = find(headers, ["precomedio", "precounitario", "preco", "valorcompra", "valoroperacao", "preconegociado"]); const kindCol = find(headers, ["tipo", "operacao", "movimentacao", "tipodemovimentacao"]); const flowCol = find(headers, ["entradasaida", "entrada", "saida", "credito", "debito"]); const movementStatement = headers.includes("entradasaida") && headers.includes("movimentacao") && headers.includes("produto");
  const operations: NewOperation[] = []; const dividends: NewDividend[] = []; const warnings: string[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const rawProduct = String(row[tickerCol] ?? ""); const ticker = normalizeTicker(rawProduct.split(" - ")[0]); if (!ticker) continue; const date = asDate(row[dateCol >= 0 ? dateCol : 0]); const paymentDate = asDate(row[paymentCol >= 0 ? paymentCol : dateCol >= 0 ? dateCol : 0]) || date; const quantity = quantityCol >= 0 ? asNumber(row[quantityCol]) : 0; const price = priceCol >= 0 ? asNumber(row[priceCol]) : 0; const kind = key(row[kindCol] ?? ""); const flow = key(row[flowCol] ?? ""); const isDividend = kind.includes("rendimento") || kind.includes("amortizacao") || kind.includes("dividendo"); const amount = isDividend && priceCol >= 0 ? asNumber(row[priceCol]) : amountCol >= 0 ? asNumber(row[amountCol]) : 0;
    if (!isDividend && quantity > 0 && price > 0 && date && (kind.includes("compra") || kind.includes("buy") || kind.includes("aquisi") || kind.includes("liquidacao"))) operations.push({ ticker, kind: kind.includes("venda") || kind.includes("sell") || flow.includes("debito") || flow.includes("saida") ? "sell" : "buy", date, quantity, price, fees: 0, note: `Importado da B3: ${asset.name}` });
    const dividendRow = amount > 0 && paymentDate && (dividendAmountCol >= 0 || paymentCol >= 0 || kind.includes("rendimento") || kind.includes("amort"));
    if (dividendRow && !movementStatement) dividends.push({ ticker, paymentDate, dateCom: date || paymentDate, amountPerShare: amount, kind: kind.includes("amort") ? "amortization" : "income", source: "manual", note: `Importado da B3: ${asset.name}` });
  }
  const consolidated = new Map<string, NewOperation>();
  for (const operation of operations) {
    const key = `${operation.ticker}|${operation.kind}|${operation.date}`;
    const previous = consolidated.get(key);
    if (!previous) consolidated.set(key, { ...operation });
    else {
      const quantity = previous.quantity + operation.quantity;
      previous.price = quantity ? (previous.price * previous.quantity + operation.price * operation.quantity) / quantity : previous.price;
      previous.quantity = quantity;
    }
  }
  const normalizedOperations = [...consolidated.values()];
  if (movementStatement && normalizedOperations.length) warnings.push("Extrato de movimentação importado. Os proventos serão buscados nas divulgações de cada ativo para usar a data-com correta.");
  if (!normalizedOperations.length && !dividends.length) warnings.push("Nenhuma operação ou provento reconhecível foi encontrado; confira os cabeçalhos exportados pela B3.");
  return { operations: normalizedOperations, dividends, fileName: asset.name, warnings };
}
