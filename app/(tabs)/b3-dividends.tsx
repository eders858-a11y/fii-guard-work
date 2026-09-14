import { Stack } from "expo-router";
import { Alert, FlatList, Pressable, StyleSheet, Text, View, ScrollView } from "react-native";
import { useMemo, useState } from "react";
import { usePortfolio, type Dividend, quantityAt } from "@/lib/portfolio";
import { ScreenContainer } from "@/components/screen-container";
import { EmptyState, LoadingState } from "@/components/portfolio-ui";
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

  return (
    <View style={[styles.row, { borderBottomColor: "#4A4D50" }]}>
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

export default function B3DividendsScreen() {
  const { ready, dividends, operations, settings } = usePortfolio();
  const [selected, setSelected] = useState(new Date().toISOString().slice(0, 7));
  const colors = themeColors(settings.themeName);

  const b3Dividends = useMemo(() => {
    return dividends.filter(d => d.source === 'b3');
  }, [dividends]);

  const periodData = useMemo(() => {
    return b3Dividends.filter((item) => {
      return item.paymentDate.startsWith(selected);
    }).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate) || a.ticker.localeCompare(b.ticker));
  }, [b3Dividends, selected]);

  const monthTotal = useMemo(() => {
    return periodData.reduce((sum, item) => {
      const q = quantityAt(operations, item.ticker, item.dateCom || item.paymentDate);
      return sum + (q * item.amountPerShare);
    }, 0);
  }, [periodData, operations]);

  const historyTotal = useMemo(() => {
    return b3Dividends.reduce((sum, item) => {
      const q = quantityAt(operations, item.ticker, item.dateCom || item.paymentDate);
      return sum + (q * item.amountPerShare);
    }, 0);
  }, [b3Dividends, operations]);

  const currentYear = selected.slice(0, 4);
  const currentMonthNum = parseInt(selected.slice(5, 7), 10);

  if (!ready) return <LoadingState />;
  const borderColor = "#4A4D50";

  return <ScreenContainer style={{ backgroundColor: colors.cardColor }} edges={["top", "left", "right"]}>
    <Stack.Screen options={{ headerShown: false }} />
    <FlatList
      data={periodData}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={<View>
        <View style={styles.topBar}>
          <Text style={[styles.title, { color: colors.textColor, flex: 1 }]}>🏦 Extrato Oficial B3</Text>
        </View>
        <View style={styles.filters}>
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
                return (
                  <Pressable key={nm} onPress={() => setSelected(mKey)}
                    style={[styles.mesChip, isSelected && { backgroundColor: '#123c52', borderColor: colors.accent, borderWidth: 1 }]}>
                    <Text style={[styles.mesChipTxt, isSelected && { color: colors.accent }]}>{nm}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>

        <View style={[styles.sectionBar, { borderColor }]}><Text style={[styles.sectionTitle, { color: colors.textColor }]}>Valores Oficiais B3</Text></View>
        <View style={[styles.tableHeader, { borderColor }]}><Text style={[styles.dateCell, styles.headerText, { color: colors.textColor }]}>Data</Text><Text style={[styles.tickerCell, styles.headerText, { color: colors.textColor }]}>Ativo</Text><Text style={[styles.kindCell, styles.headerText, { color: colors.textColor }]}>Tipo</Text><Text style={[styles.quantityCell, styles.headerText, { color: colors.textColor }]}>Qtde.</Text><Text style={[styles.unitCell, styles.headerText, { color: colors.textColor }]}>Unit.</Text><Text style={[styles.totalCell, styles.headerText, { color: colors.textColor }]}>Total</Text></View>
      </View>}
      renderItem={({ item }) => <DividendTableRow item={item} operations={operations} colors={colors} />}
      ListEmptyComponent={<EmptyState title="Sem dados B3" description="Importe sua planilha B3 nos Ajustes." />}
      ListFooterComponent={<View style={{ paddingBottom: 20 }}>
        <View style={[styles.totalLine, { backgroundColor: "#17232C", padding: 12, borderRadius: 12, marginTop: 10 }]}>
          <View style={{ flex: 1 }}><Text style={{ color: colors.textColor, fontSize: 10 }}>Recebido no mês</Text><Text style={{ color: "#FFF", fontSize: 16, fontWeight: "bold" }}>{currency(monthTotal)}</Text></View>
          <View style={{ width: 1, height: 30, backgroundColor: "#4A4D50", marginHorizontal: 15 }} />
          <View style={{ flex: 1 }}><Text style={{ color: colors.accent, fontSize: 10 }}>Total B3 Acumulado</Text><Text style={{ color: colors.accent, fontSize: 16, fontWeight: "bold" }}>{currency(historyTotal)}</Text></View>
        </View>
      </View>}
    />
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 5, paddingBottom: 30 },
  topBar: { alignItems: "center", flexDirection: "row", height: 60, justifyContent: "space-between" },
  title: { fontSize: 17, fontWeight: "800", textAlign: "center" },
  filters: { alignItems: "center", flexDirection: "row", height: 50 },
  filterMonth: { borderBottomWidth: 1, flex: 0.9, fontSize: 14, paddingBottom: 4, textAlign: "center" },
  filterYear: { borderBottomWidth: 1, flex: 0.65, fontSize: 14, marginLeft: 8, paddingBottom: 4, textAlign: "center" },
  arrow: { fontSize: 28, paddingHorizontal: 5 },
  mesesRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 4 },
  mesChip: { backgroundColor: '#2e2e2e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', minWidth: 44 },
  mesChipTxt: { color: '#bbb', fontSize: 10, fontWeight: '600' },
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
});
