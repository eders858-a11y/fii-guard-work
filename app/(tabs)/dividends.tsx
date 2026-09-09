import { router, Stack } from "expo-router";
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMemo, useState, useEffect } from "react";
import { usePortfolio, type Dividend, normalizeTicker, quantityAt } from "@/lib/portfolio";
import { ScreenContainer } from "@/components/screen-container";
import { Button, EmptyState, LoadingState } from "@/components/portfolio-ui";
import { currency, date, monthLabel } from "@/lib/format";
import { themeColors } from "@/lib/theme-presets";

const MESES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const shift = (key: string, delta: number) => {
  const [year, month] = key.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};

function DividendTableRow({ item, operations, colors }: { item: Dividend; operations: any[]; colors: ReturnType<typeof themeColors> }) {
  const referenceDate = item.dateCom || item.paymentDate;
  const quantity = Math.max(0, referenceDate ? quantityAt(operations, item.ticker, referenceDate) : 0);
  const unitValue = Number(item.amountPerShare || 0);
  const computedTotal = quantity * unitValue;

  const today = new Date().toISOString().slice(0, 10);
  const isPaymentDay = item.paymentDate === today;

  return (
    <View style={[styles.row, { borderBottomColor: "#4A4D50" }, isPaymentDay && { backgroundColor: "rgba(0, 166, 199, 0.15)" }]}>
      <Text style={[styles.dateCell, { color: colors.textColor }]}>
        {unitValue > 0 ? date(item.paymentDate) : "—"}
      </Text>
      <Text style={[styles.tickerCell, { color: colors.textColor }]}>{item.ticker}</Text>
      <Text style={[styles.kindCell, { color: colors.textColor }]}>{item.kind === "income" ? "Rendimento" : "Amortização"}</Text>
      <Text style={[styles.quantityCell, { color: colors.textColor }]}>{quantity || "—"}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.unitCell, { color: colors.textColor }]}>
        {unitValue > 0 ? unitValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : "—"}
      </Text>
      <View style={styles.totalCell}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.totalText, { color: colors.textColor }]}>
          {computedTotal > 0 ? currency(computedTotal) : "—"}
        </Text>
      </View>
    </View>
  );
}

function HistoryChart({ values, colors }: { values: { key: string; value: number }[]; colors: ReturnType<typeof themeColors> }) {
  const max = Math.max(...values.map((item) => item.value), 0);
  return (
    <View style={styles.chartContainer}>
      <View style={styles.chart}>
        <View style={styles.yAxis}>{[20, 15, 10, 5, 0].map((v) => <Text key={v} style={[styles.axisText, { color: colors.textColor }]}>{v}</Text>)}</View>
        <View style={styles.chartColumns}>
          {values.map((item) => {
            const height = max ? Math.max(6, (item.value / max) * 140) : 6;
            return (
              <View key={item.key} style={styles.barColumn}>
                <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.barValue, { color: colors.textColor }]}>
                  {item.value > 0 ? item.value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : ""}
                </Text>
                <View style={[styles.bar, { height, backgroundColor: colors.accent }]} />
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={[styles.barLabel, { color: colors.textColor }]}
                >
                  {MESES_NOMES[parseInt(item.key.slice(5, 7), 10) - 1].toUpperCase()}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default function DividendsScreen() {
  const { ready, dividends, operations, settings, syncMarketData } = usePortfolio();
  const [selected, setSelected] = useState(new Date().toISOString().slice(0, 7));
  const [refreshing, setRefreshing] = useState(false);
  const colors = themeColors(settings.themeName);

  const onRefresh = async (silent = false) => {
    if (!ready || operations.length === 0) return;
    setRefreshing(true);
    try {
      await syncMarketData();
      if (!silent) Alert.alert("Sincronização", "Dados atualizados.");
    } catch (e) {
      if (!silent) Alert.alert("Erro", "Não foi possível conectar ao serviço.");
    } finally { setRefreshing(false); }
  };

  useEffect(() => {
    if (ready && operations.length > 0) {
        onRefresh(true);
    }
  }, [ready]);

  const dataSorted = useMemo(() => {
    const unique = new Map();
    dividends.forEach(d => {
       const key = `${d.ticker}-${d.paymentDate}-${d.amountPerShare}`;
       if (!unique.has(key)) unique.set(key, d);
    });
    return Array.from(unique.values()).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  }, [dividends]);

  const periodData = useMemo(() => {
    return dataSorted.filter((item) => {
      const paymentMonth = (item.paymentDate || "").slice(0, 7);
      if (paymentMonth !== selected) return false;

      // REGRA RÍGIDA: Só mostra se tinha cotas na Data Com e existe anúncio real
      const referenceDate = item.dateCom || item.paymentDate;
      const q = quantityAt(operations, item.ticker, referenceDate);
      return q > 0 && item.amountPerShare > 0;
    }).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate) || a.ticker.localeCompare(b.ticker));
  }, [dataSorted, selected, operations]);

  const totalForPeriod = (items: Dividend[]) => {
    return items.reduce((sum, item) => {
      const q = quantityAt(operations, item.ticker, item.dateCom || item.paymentDate);
      return sum + (q * item.amountPerShare);
    }, 0);
  };

  const monthTotal = useMemo(() => totalForPeriod(periodData), [periodData, operations]);
  const historyTotal = useMemo(() => totalForPeriod(dataSorted), [dataSorted, operations]);

  const currentYear = selected.slice(0, 4);
  const currentMonthNum = parseInt(selected.slice(5, 7), 10);

  const chart = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = String(i + 1).padStart(2, '0');
      const key = `${currentYear}-${m}`;
      const mItems = dataSorted.filter(d => d.paymentDate.startsWith(key));
      return { key, value: totalForPeriod(mItems) };
    });
  }, [dataSorted, operations, currentYear]);

  if (!ready) return <LoadingState />;
  const borderColor = "#4A4D50";

  return <ScreenContainer style={{ backgroundColor: colors.cardColor }} edges={["top", "left", "right"]}>
    <Stack.Screen options={{ headerShown: false }} />
    <FlatList
      data={periodData}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      onRefresh={() => onRefresh(false)}
      refreshing={refreshing}
      ListHeaderComponent={<View>
        <View style={styles.topBar}>
          <Text style={[styles.menu, { color: colors.textColor }]}>☰</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.textColor }]}>Agenda Dividendos</Text>
            <Text style={{ color: "#888", fontSize: 10, textAlign: "center" }}>{dataSorted.length} eventos registrados</Text>
          </View>
          <Pressable onPress={() => onRefresh(false)}>
            <Text style={[styles.headerIcon, { color: colors.accent }]}>◉</Text>
          </Pressable>
          <Text style={[styles.search, { color: colors.textColor }]}>⌕</Text>
        </View>
        <View style={styles.filters}>
          <Text style={[styles.filterFund, { color: colors.textColor }]}>▣  Meus FIIs⌄</Text>
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1.6 }}>
            <Pressable onPress={() => setSelected(shift(selected, -1))} hitSlop={10}><Text style={[styles.arrow, { color: colors.textColor }]}>‹</Text></Pressable>
            <Text style={[styles.filterMonth, { color: colors.textColor, flex: 1 }]}>{monthLabel(selected).split(" ")[0]}</Text>
            <Pressable onPress={() => setSelected(shift(selected, 1))} hitSlop={10}><Text style={[styles.arrow, { color: colors.textColor }]}>›</Text></Pressable>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1.4, marginLeft: 8 }}>
            <Pressable onPress={() => setSelected(shift(selected, -12))} hitSlop={10}><Text style={[styles.arrow, { color: colors.textColor }]}>‹</Text></Pressable>
            <Text style={[styles.filterYear, { color: colors.textColor, flex: 1 }]}>{currentYear}</Text>
            <Pressable onPress={() => setSelected(shift(selected, 12))} hitSlop={10}><Text style={[styles.arrow, { color: colors.textColor }]}>›</Text></Pressable>
          </View>
        </View>

        <View style={{ height: 48, marginBottom: 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.mesesRow}>
              {MESES_NOMES.map((nm, i) => {
                const mStr = String(i + 1).padStart(2, '0');
                const isSelected = currentMonthNum === (i + 1);
                const mKey = `${currentYear}-${mStr}`;
                const mVal = totalForPeriod(dataSorted.filter(d => d.paymentDate.startsWith(mKey)));
                return (
                  <Pressable key={nm} onPress={() => setSelected(mKey)}
                    style={[styles.mesChip, isSelected && { backgroundColor: '#123c52', borderColor: colors.accent, borderWidth: 1 }]}>
                    <Text style={[styles.mesChipTxt, isSelected && { color: colors.accent }]}>{nm}</Text>
                    <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.mesChipVal, isSelected && { color: colors.accent }]}>
                        {mVal > 0 ? mVal.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : "—"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>

        <View style={[styles.sectionBar, { borderColor }]}><Text style={[styles.sectionTitle, { color: colors.textColor }]}>$  Proventos: Meus FIIs</Text></View>
        <View style={[styles.tableHeader, { borderColor }]}><Text style={[styles.dateCell, styles.headerText, { color: colors.textColor }]}>Pagamento</Text><Text style={[styles.tickerCell, styles.headerText, { color: colors.textColor }]}>Ativo</Text><Text style={[styles.kindCell, styles.headerText, { color: colors.textColor }]}>Tipo</Text><Text style={[styles.quantityCell, styles.headerText, { color: colors.textColor }]}>Qtde.</Text><Text style={[styles.unitCell, styles.headerText, { color: colors.textColor }]}>Vl.unit.</Text><Text style={[styles.totalCell, styles.headerText, { color: colors.textColor }]}>Total</Text></View>
      </View>}
      renderItem={({ item }) => <DividendTableRow item={item} operations={operations} colors={colors} />}
      ListEmptyComponent={<EmptyState title="Vazio" description="Sem pagamentos reais para este mês." />}
      ListFooterComponent={<View style={{ paddingBottom: 20 }}>
        <View style={[styles.totalLine, { backgroundColor: "#17232C", padding: 12, borderRadius: 12, marginTop: 10 }]}>
          <View style={{ flex: 1 }}><Text style={{ color: colors.textColor, fontSize: 10 }}>No mês</Text><Text style={{ color: "#FFF", fontSize: 16, fontWeight: "bold" }}>{currency(monthTotal)}</Text></View>
          <View style={{ width: 1, height: 30, backgroundColor: "#4A4D50", marginHorizontal: 15 }} />
          <View style={{ flex: 1 }}><Text style={{ color: colors.accent, fontSize: 10 }}>Acumulado</Text><Text style={{ color: colors.accent, fontSize: 16, fontWeight: "bold" }}>{currency(historyTotal)}</Text></View>
        </View>
        <View style={[styles.sectionBar, styles.historyBar, { borderColor, marginTop: 20 }]}><Text style={[styles.sectionTitle, { color: colors.textColor }]}>▥  Evolução Dividendos</Text></View>
        <HistoryChart values={chart} colors={colors} />
      </View>}
    />
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 5, paddingBottom: 30 },
  topBar: { alignItems: "center", flexDirection: "row", height: 60, justifyContent: "space-between" },
  menu: { fontSize: 24, width: 30 },
  title: { flex: 1, fontSize: 17, fontWeight: "800", textAlign: "center" },
  headerIcon: { fontSize: 20, marginLeft: 8 },
  search: { fontSize: 24, marginLeft: 8 },
  filters: { alignItems: "center", flexDirection: "row", height: 50 },
  filterFund: { flex: 1, fontSize: 13 },
  filterMonth: { borderBottomWidth: 1, flex: 0.9, fontSize: 14, paddingBottom: 4, textAlign: "center" },
  filterYear: { borderBottomWidth: 1, flex: 0.65, fontSize: 14, marginLeft: 8, paddingBottom: 4, textAlign: "center" },
  arrow: { fontSize: 28, paddingHorizontal: 5 },
  mesesRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 4 },
  mesChip: { backgroundColor: '#2e2e2e', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 6, alignItems: 'center', minWidth: 44 },
  mesChipTxt: { color: '#bbb', fontSize: 9, fontWeight: '600' },
  mesChipVal: { color: '#888', fontSize: 8, marginTop: 2 },
  sectionBar: { alignItems: "center", borderRadius: 4, borderWidth: 1, flexDirection: "row", height: 36, paddingHorizontal: 8 },
  sectionTitle: { fontSize: 13, fontWeight: "bold" },
  tableHeader: { alignItems: "center", borderBottomWidth: 1, flexDirection: "row", height: 32, paddingHorizontal: 2 },
  headerText: { fontSize: 9, fontWeight: "800" },
  row: { alignItems: "center", borderBottomWidth: 1, flexDirection: "row", minHeight: 40, paddingHorizontal: 2 },
  dateCell: { flex: 1.1, fontSize: 9 },
  tickerCell: { flex: 1, fontSize: 10, fontWeight: "bold" },
  kindCell: { flex: 1.1, fontSize: 9 },
  quantityCell: { flex: 0.6, fontSize: 10, textAlign: "right" },
  unitCell: { flex: 0.8, fontSize: 9, textAlign: "right" },
  totalCell: { alignItems: "flex-end", flex: 1.1 },
  totalText: { fontSize: 9, fontWeight: "800" },
  totalLine: { flexDirection: "row", alignItems: "center" },
  historyBar: { marginBottom: 10 },
  chartContainer: { width: "100%", alignItems: "center", overflow: "hidden" },
  chart: { flexDirection: "row", height: 180, width: "100%", paddingRight: 5 },
  yAxis: { justifyContent: "space-between", paddingBottom: 25, width: 22 },
  axisText: { fontSize: 8 },
  chartColumns: { alignItems: "flex-end", borderTopColor: "rgba(255,255,255,0.1)", borderTopWidth: 1, flexDirection: "row", flex: 1, justifyContent: "space-around", paddingHorizontal: 0 },
  barColumn: { alignItems: "center", justifyContent: "flex-end", height: 160, width: 20 },
  barValue: { fontSize: 7, marginBottom: 2 },
  bar: { borderRadius: 3, width: 16 },
  barLabel: { fontSize: 7, fontWeight: "800", marginTop: 4, textAlign: "center", width: "100%" },
});
