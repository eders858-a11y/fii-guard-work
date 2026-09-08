import { router, Stack } from "expo-router";
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMemo, useState, useEffect } from "react";
import { usePortfolio, type Dividend, normalizeTicker, quantityAt } from "@/lib/portfolio";
import { ScreenContainer } from "@/components/screen-container";
import { Button, EmptyState, LoadingState } from "@/components/portfolio-ui";
import { currency, date, monthLabel } from "@/lib/format";
import { themeColors } from "@/lib/theme-presets";

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const shift = (key: string, delta: number) => {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 7);
};

const cleanTicker = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/SA$/, "");

function DividendTableRow({ item, operations, colors }: { item: Dividend; operations: any[]; colors: ReturnType<typeof themeColors> }) {
  const referenceDate = item.dateCom || item.paymentDate;
  const quantity = Math.max(0, referenceDate ? quantityAt(operations, item.ticker, referenceDate) : 0);
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
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.chart}>
        <View style={styles.yAxis}>{[20, 15, 10, 5, 0].map((value) => <Text key={value} style={[styles.axisText, { color: colors.textColor }]}>{value}</Text>)}</View>
        <View style={styles.chartColumns}>
          {values.map((item) => {
            const height = max ? Math.max(10, item.value / max * 245) : 10;
            return (
              <View key={item.key} style={styles.barColumn}>
                <Text style={[styles.barValue, { color: colors.textColor }]}>{item.value ? item.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "—"}</Text>
                <View style={[styles.bar, { height, backgroundColor: colors.accent }]} />
                <Text style={[styles.barLabel, { color: colors.textColor }]}>{monthLabel(item.key).slice(0, 3).toUpperCase()}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

export default function DividendsScreen() {
  const { ready, dividends, operations, settings, syncMarketData } = usePortfolio();
  const [selected, setSelected] = useState(new Date().toISOString().slice(0, 7));
  const [refreshing, setRefreshing] = useState(false);
  const colors = themeColors(settings.themeName);

  const onRefresh = async (silent = false) => {
    setRefreshing(true);
    try {
      const result = await syncMarketData();
      if (!silent) {
        Alert.alert("Sincronização", result?.message || "Dados atualizados.");
      }
    } catch (e) {
      if (!silent) {
        Alert.alert("Erro de Sincronização", e instanceof Error ? e.message : "Não foi possível conectar ao serviço.");
      }
    } finally {
      setRefreshing(false);
    }
  };

  // Sincroniza automaticamente sempre que entrar na aba para buscar dados novos na internet
  useEffect(() => {
    if (ready && operations.length > 0) {
      onRefresh(true); // Chamada silenciosa ao abrir a aba
    }
  }, [ready]);

  const data = useMemo(() => [...dividends].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)), [dividends]);

  const periodData = useMemo(() => {
    return data.filter((item) => {
      const paymentMonth = (item.paymentDate || "").slice(0, 7);
      return paymentMonth === selected;
    });
  }, [data, selected]);

  const totalFor = (items: Dividend[]) => {
    return items.reduce((sum, item) => {
      const refDate = item.dateCom || item.paymentDate;
      const q = Math.max(0, quantityAt(operations, item.ticker, refDate));
      return sum + (q * item.amountPerShare);
    }, 0);
  };

  const monthTotal = useMemo(() => totalFor(periodData), [periodData, operations]);
  const historyTotal = useMemo(() => totalFor(data), [data, operations]);
  const currentYear = selected.slice(0, 4);
  const currentYearNum = parseInt(currentYear, 10);
  const currentMonthNum = parseInt(selected.slice(5, 7), 10);

  const shiftYear = (delta: number) => {
    const newYear = currentYearNum + delta;
    setSelected(`${newYear}-${String(currentMonthNum).padStart(2, "0")}`);
  };

  const prevMonth = () => setSelected(shift(selected, -1));
  const nextMonth = () => setSelected(shift(selected, 1));

  const chart = useMemo(() => {
    return Array.from({ length: 12 }, (_, index) => {
      const mStr = String(index + 1).padStart(2, '0');
      const key = `${currentYear}-${mStr}`;
      const monthItems = data.filter((item) => (item.paymentDate || "").slice(0, 7) === key);
      const value = totalFor(monthItems);
      return { key, value };
    });
  }, [data, operations, currentYear]);

  if (!ready) return <LoadingState />;
  const surface = colors.cardColor;
  const borderColor = "#4A4D50";

  return <ScreenContainer style={{ backgroundColor: surface }} edges={["top", "left", "right"]}>
    <Stack.Screen options={{ headerShown: false }} />
    <FlatList
      data={periodData}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      onRefresh={onRefresh}
      refreshing={refreshing}
      ListHeaderComponent={<View>
        <View style={styles.topBar}>
          <Text style={[styles.menu, { color: colors.textColor }]}>☰</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.textColor }]}>Agenda Dividendos</Text>
            <Text style={{ color: "#888", fontSize: 10, textAlign: "center" }}>{data.length} eventos no total</Text>
          </View>
          <Pressable onPress={onRefresh}>
            <Text style={[styles.headerIcon, { color: colors.accent }]}>◉</Text>
          </Pressable>
          <Text style={[styles.search, { color: colors.textColor }]}>⌕</Text>
        </View>
        <View style={styles.filters}>
          <Text style={[styles.filterFund, { color: colors.textColor }]}>▣  Meus FIIs⌄</Text>
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1.6 }}>
            <Pressable onPress={prevMonth} hitSlop={10}><Text style={[styles.arrow, { color: colors.textColor }]}>‹</Text></Pressable>
            <Text style={[styles.filterMonth, { color: colors.textColor, flex: 1 }]}>{monthLabel(selected).split(" ")[0]}</Text>
            <Pressable onPress={nextMonth} hitSlop={10}><Text style={[styles.arrow, { color: colors.textColor }]}>›</Text></Pressable>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1.4, marginLeft: 8 }}>
            <Pressable onPress={() => shiftYear(-1)} hitSlop={10}><Text style={[styles.arrow, { color: colors.textColor }]}>‹</Text></Pressable>
            <Text style={[styles.filterYear, { color: colors.textColor, flex: 1 }]}>{currentYearNum}</Text>
            <Pressable onPress={() => shiftYear(1)} hitSlop={10}><Text style={[styles.arrow, { color: colors.textColor }]}>›</Text></Pressable>
          </View>
        </View>

        {/* Grade horizontal de meses (Jan, Fev, Mar...) */}
        <View style={{ height: 60, marginBottom: 6 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.mesesRow}>
              {MESES.map((nm, i) => {
                const mStr = String(i + 1).padStart(2, '0');
                const keyToCheck = `${currentYear}-${mStr}`;
                const isSelected = currentMonthNum === (i + 1);
                const monthItems = data.filter((item) => (item.paymentDate || "").slice(0, 7) === keyToCheck);
                const mesTotalVal = totalFor(monthItems);

                return (
                  <Pressable key={nm} onPress={() => setSelected(keyToCheck)}
                    style={[styles.mesChip, isSelected && { backgroundColor: '#123c52', borderColor: colors.accent, borderWidth: 1 }]}>
                    <Text style={[styles.mesChipTxt, isSelected && { color: colors.accent }]}>{nm}</Text>
                    <Text style={[styles.mesChipVal, isSelected && { color: colors.accent }]}>
                      {mesTotalVal > 0 ? currency(mesTotalVal) : "—"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>

        <View style={[styles.sectionBar, { borderColor }]}><Text style={[styles.sectionTitle, { color: colors.textColor }]}>$  Proventos: Meus FIIs</Text><Pressable onPress={() => router.push("/dividend-form" as any)}><Text style={[styles.chevron, { color: colors.accent }]}>›</Text></Pressable></View>
        <View style={[styles.tableHeader, { borderColor }]}><Text style={[styles.dateCell, styles.headerText, { color: colors.textColor }]}>Pgto. / Com.</Text><Text style={[styles.tickerCell, styles.headerText, { color: colors.textColor }]}>Ativo</Text><Text style={[styles.kindCell, styles.headerText, { color: colors.textColor }]}>Tipo</Text><Text style={[styles.quantityCell, styles.headerText, { color: colors.textColor }]}>Qtde.</Text><Text style={[styles.unitCell, styles.headerText, { color: colors.textColor }]}>Vl.unit.</Text><Text style={[styles.totalCell, styles.headerText, { color: colors.textColor }]}>Total</Text></View>
      </View>}
      renderItem={({ item }) => <DividendTableRow item={item} operations={operations} colors={colors} />}
      ListEmptyComponent={<EmptyState title="Nenhum provento registrado" description="Ao sincronizar a carteira, os eventos encontrados serão preenchidos aqui usando as quantidades dos seus FIIs." action={<Button title="Registrar provento" onPress={() => router.push("/dividend-form" as any)} />} />}
      ListFooterComponent={<View style={{ paddingBottom: 20 }}>
        <View style={[styles.totalLine, { backgroundColor: "#17232C", padding: 12, borderRadius: 12, marginTop: 10 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.totalLineText, { color: colors.textColor, fontSize: 12 }]}>Total no mês</Text>
            <Text style={[styles.totalLineText, { color: "#FFFFFF", fontSize: 18, fontWeight: "bold" }]}>{currency(monthTotal)}</Text>
          </View>
          <View style={{ width: 1, height: 30, backgroundColor: "#4A4D50", marginHorizontal: 15 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.totalLineText, { color: colors.accent, fontSize: 12 }]}>Acumulado Geral</Text>
            <Text style={[styles.totalLineText, { color: colors.accent, fontSize: 18, fontWeight: "bold" }]}>{currency(historyTotal)}</Text>
          </View>
        </View>
        <View style={[styles.note, { borderColor, marginTop: 15 }]}><Text style={[styles.noteText, { color: colors.textColor }]}>¹ - Valores baseados na sua posição na Data Com; ² - Se você comprou após a Data Com, o valor será zero.</Text></View>
        <View style={[styles.sectionBar, styles.historyBar, { borderColor }]}><Text style={[styles.sectionTitle, { color: colors.textColor }]}>▥  Histórico: Meus FIIs</Text></View>
        <HistoryChart values={chart} colors={colors} />
        <Text style={[styles.footer, { color: colors.textColor }]}>Os valores podem variar e devem ser conferidos nos informes oficiais do fundo.</Text>
      </View>}
    />
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 8, paddingBottom: 30 },
  topBar: { alignItems: "center", flexDirection: "row", height: 64, justifyContent: "space-between" },
  menu: { fontSize: 25, width: 40 },
  title: { flex: 1, fontSize: 19, fontWeight: "800", textAlign: "center" },
  headerIcon: { fontSize: 22, marginLeft: 8 },
  search: { fontSize: 28, marginLeft: 8 },
  filters: { alignItems: "center", flexDirection: "row", height: 64 },
  filterFund: { flex: 1, fontSize: 15 },
  filterMonth: { borderBottomWidth: 1, flex: 0.9, fontSize: 15, paddingBottom: 8, textAlign: "center" },
  filterYear: { borderBottomWidth: 1, flex: 0.65, fontSize: 15, marginLeft: 8, paddingBottom: 8, textAlign: "center" },
  arrow: { fontSize: 32, paddingHorizontal: 8 },
  mesesRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 4, paddingBottom: 6 },
  mesChip: { backgroundColor: '#2e2e2e', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, alignItems: 'center', minWidth: 52 },
  mesChipTxt: { color: '#bbb', fontSize: 9, fontWeight: '600' },
  mesChipVal: { color: '#888', fontSize: 9, marginTop: 2 },
  sectionBar: { alignItems: "center", borderRadius: 4, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 42, paddingHorizontal: 10 },
  sectionTitle: { fontSize: 15 },
  chevron: { fontSize: 28 },
  tableHeader: { alignItems: "center", borderBottomWidth: 1, flexDirection: "row", minHeight: 38, paddingHorizontal: 4 },
  headerText: { fontSize: 10, fontWeight: "800" },
  row: { alignItems: "center", borderBottomWidth: 1, flexDirection: "row", minHeight: 44, paddingHorizontal: 4 },
  dateCell: { flex: 1.28, fontSize: 10 },
  tickerCell: { flex: 1.05, fontSize: 12 },
  kindCell: { flex: 1.35, fontSize: 10 },
  quantityCell: { flex: 0.72, fontSize: 12, textAlign: "right" },
  unitCell: { flex: 0.83, fontSize: 11, textAlign: "right" },
  totalCell: { alignItems: "flex-end", flex: 0.95 },
  totalText: { fontSize: 12, fontWeight: "800" },
  totalLine: { alignItems: "center", flexDirection: "row", justifyContent: "flex-end", minHeight: 46, paddingRight: 10 },
  totalLineText: { fontSize: 14 },
  info: { fontSize: 12, marginLeft: 5 },
  note: { borderBottomWidth: 1, borderTopWidth: 1, paddingHorizontal: 4, paddingVertical: 10 },
  noteText: { fontSize: 10, lineHeight: 16 },
  historyBar: { marginTop: 14 },
  chart: { flexDirection: "row", height: 300, paddingTop: 20 },
  yAxis: { justifyContent: "space-between", paddingBottom: 28, width: 28 },
  axisText: { fontSize: 10 },
  chartColumns: { alignItems: "flex-end", borderTopColor: "rgba(255,255,255,0.06)", borderTopWidth: 1, flexDirection: "row", paddingHorizontal: 6 },
  barColumn: { alignItems: "center", justifyContent: "flex-end", height: 270, width: 45, marginRight: 8 },
  barValue: { fontSize: 9, marginBottom: 5 },
  bar: { borderRadius: 4, minHeight: 8, width: 32 },
  barLabel: { fontSize: 10, fontWeight: "800", marginTop: 7 },
  footer: { fontSize: 10, lineHeight: 15, marginTop: 16, textAlign: "center" },
});
