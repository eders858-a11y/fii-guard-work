import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as XLSX from "xlsx";

type NewOperation = {
  ticker: string;
  kind: "buy" | "sell";
  date: string;
  quantity: number;
  price: number;
  fees?: number;
  note?: string;
};

type NewDividend = {
  ticker: string;
  paymentDate: string;
  dateCom?: string;
  amountPerShare: number;
  kind: "income" | "amortization";
  source?: "manual" | "yfinance" | "brapi" | "b3";
  quantity?: number;
  note?: string;
};

export type B3ImportResult = {
  operations: NewOperation[];
  dividends: NewDividend[];
  fileName: string;
  warnings: string[];
};

const normalizeTicker = (value: string) =>
  value?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/SA$/, "") || "";

// Extrai o ticker (ex: GGRC11) de forma agressiva
const extractTicker = (text: any) => {
  const cleaned = String(text || "").trim().toUpperCase();
  if (!cleaned) return "";

  // 1. Busca padrão AAAA11 ou AAAA11B
  const match = cleaned.match(/([A-Z]{4}\d{1,2}[A-Z]?)/);
  if (match) return match[1];

  // 2. Se não achou, pega a primeira palavra e limpa
  return normalizeTicker(cleaned.split(/[\s\-]/)[0]);
};

const key = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const asDate = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed
      ? `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`
      : "";
  }
  let text = String(value ?? "").trim();
  if (!text) return "";

  const m = text.match(/^(\d{1,2})[\/\-](?:\d{1,2}|[a-z]{3})[\/\-](\d{2,4})$/i);
  if (m) {
    let [_, d, y] = m;
    const parts = text.split(/[\/\-]/);
    const monthPart = parts[1];
    let mon = parseInt(monthPart, 10);
    if (isNaN(mon)) {
      const months = [
        "jan",
        "fev",
        "mar",
        "abr",
        "mai",
        "jun",
        "jul",
        "ago",
        "set",
        "out",
        "nov",
        "dez",
      ];
      mon = months.findIndex((x) => monthPart.toLowerCase().startsWith(x)) + 1;
    }
    if (mon >= 1 && mon <= 12) {
      if (y.length === 2) y = "20" + y;
      return `${y}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return "";
};

const asNumber = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let text = String(value ?? "")
    .replace(/R\$\s?/gi, "")
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "");
  if (text.includes(",")) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if ((text.match(/\./g) ?? []).length > 1) {
    text = text.replace(/\./g, "");
  }
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
};

// ============================================================
// CALENDÁRIO DE NÃO NEGOCIAÇÃO DA B3
// Calculado automaticamente para qualquer ano.
// ============================================================

const calcularPascoa = (ano: number): Date => {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);

  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(ano, mes - 1, dia);
};

const adicionarDias = (data: Date, dias: number): Date => {
  const resultado = new Date(data);
  resultado.setDate(resultado.getDate() + dias);
  return resultado;
};

const formatarDataIso = (data: Date): string => {
  return [
    data.getFullYear(),
    String(data.getMonth() + 1).padStart(2, "0"),
    String(data.getDate()).padStart(2, "0"),
  ].join("-");
};

const obterFeriadosB3 = (ano: number): Set<string> => {
  const pascoa = calcularPascoa(ano);

  return new Set([
    // Feriados fixos
    `${ano}-01-01`,
    `${ano}-04-21`,
    `${ano}-05-01`,
    `${ano}-09-07`,
    `${ano}-10-12`,
    `${ano}-11-02`,
    `${ano}-11-15`,
    `${ano}-11-20`,
    `${ano}-12-25`,

    // Feriados móveis
    formatarDataIso(adicionarDias(pascoa, -48)), // Segunda-feira de Carnaval
    formatarDataIso(adicionarDias(pascoa, -47)), // Terça-feira de Carnaval
    formatarDataIso(adicionarDias(pascoa, -2)), // Sexta-feira Santa
    formatarDataIso(adicionarDias(pascoa, 60)), // Corpus Christi

    // Dias sem negociação na B3
    `${ano}-12-24`,
    `${ano}-12-31`,
  ]);
};

const ehDiaNaoUtilB3 = (data: Date): boolean => {
  const diaSemana = data.getDay();

  if (diaSemana === 0 || diaSemana === 6) {
    return true;
  }

  const dataString = formatarDataIso(data);

  return obterFeriadosB3(data.getFullYear()).has(dataString);
};

const retrocederDiasUteis = (dataIso: string, dias: number) => {
  if (!dataIso) return "";
  let d = new Date(dataIso + "T12:00:00");
  let contador = dias;
  while (contador > 0) {
    d.setDate(d.getDate() - 1);
    if (!ehDiaNaoUtilB3(d)) {
      contador--;
    }
  }
  return d.toISOString().slice(0, 10);
};

const find = (headers: string[], names: string[]) =>
  headers.findIndex((header) => names.some((name) => header.includes(name)));

export async function importB3Spreadsheet(): Promise<B3ImportResult | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel.sheet.macroEnabled.12",
      "application/octet-stream",
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (picked.canceled || !picked.assets?.[0]) return null;
  const asset = picked.assets[0];

  const base64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const workbook = XLSX.read(base64, { type: "base64", cellDates: true });
  const rows = workbook.SheetNames.flatMap((sheetName) =>
    XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
    })
  );

  if (!rows.length) throw new Error("A planilha B3 está vazia.");

  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => {
      const h = key(cell);
      return (
        h.includes("ticker") ||
        h.includes("ativo") ||
        h.includes("fii") ||
        h.includes("data")
      );
    })
  );

  if (headerIndex < 0)
    throw new Error("Não encontrei cabeçalhos reconhecíveis na planilha B3.");

  const headers = rows[headerIndex].map(key);

  const tickerCol = find(headers, [
    "ticker",
    "ativo",
    "fii",
    "codigo",
    "codigodenegociacao",
    "produto",
    "produtonegociado",
  ]);
  const dateCol = find(headers, [
    "data",
    "datacom",
    "datalimite",
    "datainclusao",
    "dataoperacao",
    "datadonegocio",
    "datamovimentacao",
  ]);
  const paymentCol = find(headers, [
    "datapagamento",
    "datacredito",
    "pagamento",
    "dataderecebimento",
  ]);
  const dividendAmountCol = find(headers, [
    "valorporcota",
    "valorporativo",
    "valorcota",
    "valorunitario",
    "rendimento",
    "valorporevento",
    "valordistribuido",
  ]);
  const amountCol =
    dividendAmountCol >= 0 ? dividendAmountCol : find(headers, ["valor"]);
  const quantityCol = find(headers, [
    "quantidade",
    "qtde",
    "qtd",
    "posicao",
    "quantidadetotal",
  ]);
  const priceCol = find(headers, [
    "precomedio",
    "precounitario",
    "preco",
    "valorcompra",
    "valoroperacao",
    "preconegociado",
  ]);
  const kindCol = find(headers, [
    "tipo",
    "operacao",
    "movimentacao",
    "tipodemovimentacao",
  ]);
  const flowCol = find(headers, [
    "entradasaida",
    "entrada",
    "saida",
    "credito",
    "debito",
  ]);

  const movementStatement =
    headers.includes("entradasaida") &&
    headers.includes("movimentacao") &&
    headers.includes("produto");

  const operations: NewOperation[] = [];
  const dividends: NewDividend[] = [];

  for (const row of rows.slice(headerIndex + 1)) {
    const rawProduct = String(row[tickerCol] ?? "");
    const ticker = extractTicker(rawProduct);
    if (!ticker) continue;

    const date = asDate(row[dateCol >= 0 ? dateCol : 0]);
    const paymentDate =
      asDate(row[paymentCol >= 0 ? paymentCol : dateCol >= 0 ? dateCol : 0]) ||
      date;

    const quantity = quantityCol >= 0 ? asNumber(row[quantityCol]) : 0;
    const price = priceCol >= 0 ? asNumber(row[priceCol]) : 0;

    const kind = key(row[kindCol] ?? "");
    const flow = key(row[flowCol] ?? "");

    const isDividend =
      kind.includes("rendimento") ||
      kind.includes("amortizacao") ||
      kind.includes("dividendo");

    const amount =
      isDividend && priceCol >= 0
        ? asNumber(row[priceCol])
        : amountCol >= 0
        ? asNumber(row[amountCol])
        : 0;

    if (
      !isDividend &&
      quantity > 0 &&
      price > 0 &&
      date &&
      (kind.includes("compra") ||
        kind.includes("buy") ||
        kind.includes("aquisi") ||
        kind.includes("liquidacao"))
    ) {
      operations.push({
        ticker,
        kind:
          kind.includes("venda") ||
          kind.includes("sell") ||
          flow.includes("debito") ||
          flow.includes("saida")
            ? "sell"
            : "buy",
        date,
        quantity,
        price,
        fees: 0,
        note: `Importado da B3: ${asset.name}`,
      });
    }

    const dividendRow =
      amount > 0 &&
      paymentDate &&
      (dividendAmountCol >= 0 ||
        paymentCol >= 0 ||
        kind.includes("rendimento") ||
        kind.includes("amort"));

    if (dividendRow && !movementStatement) {
      dividends.push({
        ticker,
        paymentDate,
        dateCom: date || paymentDate,
        amountPerShare: amount,
        kind: kind.includes("amort") ? "amortization" : "income",
        source: "manual",
        note: `Importado da B3: ${asset.name}`,
      });
    }
  }

  // Consolidação de Operações
  const consolidatedOpsMap = new Map<string, NewOperation>();
  for (const op of operations) {
    const opKey = `${op.ticker}|${op.kind}|${op.date}`;
    const prev = consolidatedOpsMap.get(opKey);
    if (!prev) {
      consolidatedOpsMap.set(opKey, { ...op });
    } else {
      const newQty = prev.quantity + op.quantity;
      if (newQty > 0) {
        prev.price =
          (prev.price * prev.quantity + op.price * op.quantity) / newQty;
      }
      prev.quantity = newQty;
    }
  }

  // Consolidação de Proventos
  const consolidatedDivsMap = new Map<string, NewDividend>();
  for (const div of dividends) {
    const divKey = `${div.ticker}|${div.paymentDate}|${div.kind}`;
    const prev = consolidatedDivsMap.get(divKey);
    if (!prev) {
      consolidatedDivsMap.set(divKey, { ...div });
    } else {
      const totalOld = (prev.quantity || 0) * prev.amountPerShare;
      const totalNew = (div.quantity || 0) * div.amountPerShare;
      const newQty = (prev.quantity || 0) + (div.quantity || 0);
      prev.quantity = newQty;
      if (newQty > 0) {
        prev.amountPerShare = (totalOld + totalNew) / newQty;
      }
    }
  }

  const normalizedOperations = Array.from(consolidatedOpsMap.values());
  const normalizedDividends = Array.from(consolidatedDivsMap.values());

  return {
    operations: normalizedOperations,
    dividends: normalizedDividends,
    fileName: asset.name,
    warnings:
      normalizedOperations.length || normalizedDividends.length
        ? []
        : ["Nenhuma movimentação reconhecível foi encontrada."],
  };
}