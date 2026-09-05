import { router, Stack } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useMemo, useState } from "react";
import { usePortfolio, type Dividend } from "@/lib/portfolio";
import { ScreenContainer } from "@/components/screen-container";
import { Button, EmptyState, LoadingState } from "@/components/portfolio-ui";
import { currency, date, monthLabel } from "@/lib/format";
import { themeColors } from "@/lib/theme-presets";

const shift = (key: string, delta: number) => {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 7);
};

const cleanTicker = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/SA$/, "");
const quantityAt = (ticker: string, reference: string, operations: { ticker: string; date: string; kind: "buy" | "sell"; quantity: number }[]) =>
  operations.filter((item) => cleanTicker(item.ticker) === cleanTicker(ticker) && item.date <= reference).reduce((total, item) => total + (item.kind === "buy" ? item.quantity : -item.quantity), 0);

function DividendTableRow({ item, operations, colors }: { item: Dividend; operations: { ticker: string; date: string; kind: "buy" | "sell"; quantity: number }[]; colors: ReturnType<typeof themeColors> }) {
  const referenceDate = item.dateCom || (item.source === "manual" ? item.paymentDate : "");
  const quantity = Math.max(0, referenceDate ? quantityAt(item.ticker, referenceDate, operations) : 0);
  const total = quantity * item.amountPerShare;
  return (
    <View style={[styles.row, { borderBottomColor: "#4A4D50" }]}>
      <Text style={[styles.dateCell, { color: colors.textColor }]}>{date(item.paymentDate)}{item.dateCom ? `\n${date(item.dateCom)}` : "\n—"}</Text>
      <Text style={[styles.tickerCell, { color: colors.textColor }]}>{item.ticker}</Text>
      <Text style={[styles.kindCell, { color: colors.textColor }]}>{item.kind === "income" ? "Rendimento" : "Amortização"}</Text>
      <Text style={[styles.quantityCell, { color: colors.textColor }]}>{quantity || "—"}</Text>
      <Text style={[styles.unitCell, { color: colors.textColor }]}>{item.amountPerShare.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
      <View style={styles.totalCell}><Text style={[styles.totalText, { color: colors.textColor }]}>{currency(total)}</Text></View>
    </View>
  );
}

function HistoryChart({ values, colors }: { values: { key: string; value: number }[]; colors: ReturnType<typeof themeColors> }) {
  const max = Math.max(...values.map((item) => item.value), 0);
  return (
    <View style={styles.chart}>
      <View style={styles.yAxis}>{[20, 15, 10, 5, 0].map((value) => <Text key={value} style={[styles.axisText, { color: colors.textColor }]}>{value}</Text>)}</View>
      <View style={styles.chartColumns}>
        {values.map((item) => {
          const height = max ? Math.max(10, item.value / max * 245) : 10;
          return <View key={item.key} style={styles.barColumn}><Text style={[styles.barValue, { color: colors.textColor }]}>{item.value ? item.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "—"}</Text><View style={[styles.bar, { height, backgroundColor: colors.accent }]} /><Text style={[styles.barLabel, { color: colors.textColor }]}>{monthLabel(item.key).slice(0, 3).toUpperCase()}</Text></View>;
        })}
      </View>
    </View>
  );
}

export default function DividendsScreen() {
  const { ready, dividends, operations, deleteDividend, settings } = usePortfolio();
  const [selected, setSelected] = useState(new Date().toISOString().slice(0, 7));
  const colors = themeColors(settings.themeName);
  const data = useMemo(() => [...dividends].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)), [dividends]);
  const periodData = useMemo(() => data.filter((item) => item.paymentDate.slice(0, 7) === selected && (item.dateCom || item.source === "manual") && quantityAt(item.ticker, item.dateCom || item.paymentDate, operations) > 0), [data, selected, operations]);
  const totalFor = (items: Dividend[]) => items.reduce((sum, item) => sum + ((item.dateCom || item.source === "manual") ? Math.max(0, quantityAt(item.ticker, item.dateCom || item.paymentDate, operations)) * item.amountPerShare : 0), 0);
  const monthTotal = useMemo(() => totalFor(periodData), [periodData, operations]);
  const chart = useMemo(() => Array.from({ length: 6 }, (_, index) => { const key = shift(selected, index - 5); return { key, value: totalFor(data.filter((item) => item.paymentDate.slice(0, 7) === key && (item.dateCom || item.source === "manual") && quantityAt(item.ticker, item.dateCom || item.paymentDate, operations) > 0)) }; }), [data, operations, selected]);
  if (!ready) return <LoadingState />;
  const surface = colors.cardColor;
  const borderColor = "#4A4D50";
  return <ScreenContainer style={{ backgroundColor: surface }} edges={["top", "left", "right"]}>
    <Stack.Screen options={{ headerShown: false }} />
    <FlatList data={periodData} keyExtractor={(item) => item.id} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
      ListHeaderComponent={<View>
        <View style={styles.topBar}><Text style={[styles.menu, { color: colors.textColor }]}>☰</Text><Text style={[styles.title, { color: colors.textColor }]}>Agenda Dividendos</Text><Text style={[styles.headerIcon, { color: colors.textColor }]}>◉</Text><Text style={[styles.search, { color: colors.textColor }]}>⌕</Text></View>
        <View style={styles.filters}><Text style={[styles.filterFund, { color: colors.textColor }]}>▣  Meus FIIs⌄</Text><Pressable onPress={() => setSelected((value) => shift(value, -1))}><Text style={[styles.arrow, { color: colors.textColor }]}>‹</Text></Pressable><Text style={[styles.filterMonth, { color: colors.textColor }]}>{monthLabel(selected).split(" ")[0]}⌄</Text><Text style={[styles.filterYear, { color: colors.textColor }]}>{selected.slice(0, 4)}⌄</Text><Pressable onPress={() => setSelected((value) => shift(value, 1))}><Text style={[styles.arrow, { color: colors.textColor }]}>›</Text></Pressable></View>
        <View style={[styles.sectionBar, { borderColor }]}><Text style={[styles.sectionTitle, { color: colors.textColor }]}>$  Proventos: Meus FIIs</Text><Pressable onPress={() => router.push("/dividend-form" as any)}><Text style={[styles.chevron, { color: colors.accent }]}>›</Text></Pressable></View>
        <View style={[styles.tableHeader, { borderColor }]}><Text style={[styles.dateCell, styles.headerText, { color: colors.textColor }]}>Pgto. / Com.</Text><Text style={[styles.tickerCell, styles.headerText, { color: colors.textColor }]}>Ativo</Text><Text style={[styles.kindCell, styles.headerText, { color: colors.textColor }]}>Tipo</Text><Text style={[styles.quantityCell, styles.headerText, { color: colors.textColor }]}>Qtde.</Text><Text style={[styles.unitCell, styles.headerText, { color: colors.textColor }]}>Vl.unit.</Text><Text style={[styles.totalCell, styles.headerText, { color: colors.textColor }]}>Total</Text></View>
      </View>}
      renderItem={({ item }) => <DividendTableRow item={item} operations={operations} colors={colors} />}
      ListEmptyComponent={<EmptyState title="Nenhum provento registrado" description="Ao sincronizar a carteira, os eventos encontrados serão preenchidos aqui usando as quantidades dos seus FIIs." action={<Button title="Registrar provento" onPress={() => router.push("/dividend-form" as any)} />} />}
      ListFooterComponent={<View>
        <View style={styles.totalLine}><Text style={[styles.totalLineText, { color: colors.textColor }]}>¹Total no mês: {currency(monthTotal)}</Text><Text style={[styles.info, { color: colors.accent }]}>●</Text></View>
        <View style={[styles.note, { borderColor }]}><Text style={[styles.noteText, { color: colors.textColor }]}>¹ - Valores podem conter variações; ² - Quantidade do ativo na data-com; ³ - Data provável do pagamento.</Text></View>
        <View style={[styles.sectionBar, styles.historyBar, { borderColor }]}><Text style={[styles.sectionTitle, { color: colors.textColor }]}>▥  Histórico: Meus FIIs</Text><Text style={[styles.chevron, { color: colors.accent }]}>›</Text></View>
        <HistoryChart values={chart} colors={colors} />
        <Text style={[styles.footer, { color: colors.textColor }]}>Os valores podem variar e devem ser conferidos nos informes oficiais do fundo.</Text>
      </View>}
    />
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 8, paddingBottom: 30 }, topBar: { alignItems: "center", flexDirection: "row", height: 64, justifyContent: "space-between" }, menu: { fontSize: 25, width: 40 }, title: { flex: 1, fontSize: 19, fontWeight: "800", textAlign: "center" }, headerIcon: { fontSize: 22, marginLeft: 8 }, search: { fontSize: 28, marginLeft: 8 }, filters: { alignItems: "center", flexDirection: "row", height: 64 }, filterFund: { flex: 1, fontSize: 15 }, filterMonth: { borderBottomWidth: 1, flex: 0.9, fontSize: 15, paddingBottom: 8, textAlign: "center" }, filterYear: { borderBottomWidth: 1, flex: 0.65, fontSize: 15, marginLeft: 8, paddingBottom: 8, textAlign: "center" }, arrow: { fontSize: 32, paddingHorizontal: 8 }, sectionBar: { alignItems: "center", borderRadius: 4, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 42, paddingHorizontal: 10 }, sectionTitle: { fontSize: 15 }, chevron: { fontSize: 28 }, tableHeader: { alignItems: "center", borderBottomWidth: 1, flexDirection: "row", minHeight: 38, paddingHorizontal: 4 }, headerText: { fontSize: 10, fontWeight: "800" }, row: { alignItems: "center", borderBottomWidth: 1, flexDirection: "row", minHeight: 44, paddingHorizontal: 4 }, dateCell: { flex: 1.28, fontSize: 10 }, tickerCell: { flex: 1.05, fontSize: 12 }, kindCell: { flex: 1.35, fontSize: 10 }, quantityCell: { flex: 0.72, fontSize: 12, textAlign: "right" }, unitCell: { flex: 0.83, fontSize: 11, textAlign: "right" }, totalCell: { alignItems: "flex-end", flex: 0.95 }, totalText: { fontSize: 12, fontWeight: "800" }, actions: { flexDirection: "row", gap: 5, marginTop: 3 }, action: { fontSize: 7, fontWeight: "800" }, deleteAction: { color: "#F08080", fontSize: 7, fontWeight: "800" }, totalLine: { alignItems: "center", flexDirection: "row", justifyContent: "flex-end", minHeight: 46, paddingRight: 10 }, totalLineText: { fontSize: 14 }, info: { fontSize: 12, marginLeft: 5 }, note: { borderBottomWidth: 1, borderTopWidth: 1, paddingHorizontal: 4, paddingVertical: 10 }, noteText: { fontSize: 10, lineHeight: 16 }, historyBar: { marginTop: 14 }, chart: { flexDirection: "row", height: 300, paddingTop: 20 }, yAxis: { justifyContent: "space-between", paddingBottom: 28, width: 28 }, axisText: { fontSize: 10 }, chartColumns: { alignItems: "flex-end", borderTopColor: "rgba(255,255,255,0.06)", borderTopWidth: 1, flex: 1, flexDirection: "row", justifyContent: "space-around", paddingHorizontal: 6 }, barColumn: { alignItems: "center", justifyContent: "flex-end", height: 270, width: 40 }, barValue: { fontSize: 10, marginBottom: 5 }, bar: { borderRadius: 4, minHeight: 8, width: 32 }, barLabel: { fontSize: 10, fontWeight: "800", marginTop: 7 }, footer: { fontSize: 10, lineHeight: 15, marginTop: 16, textAlign: "center" },
});
