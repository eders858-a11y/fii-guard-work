import { Stack } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View, ScrollView, Dimensions } from "react-native";
import { useMemo, useState, useRef, useEffect } from "react";
import { usePortfolio, type Dividend } from "@/lib/portfolio";
import { ScreenContainer } from "@/components/screen-container";
import { EmptyState, LoadingState } from "@/components/portfolio-ui";
import { currency, date, monthLabel } from "@/lib/format";
import { themeColors } from "@/lib/theme-presets";

const MESES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const SCREEN_WIDTH = Dimensions.get("window").width;
const CHIP_WIDTH = 52; // Largura aproximada de cada chip de mês + gap

const shift = (key: string, delta: number) => {
  const [year, month] = key.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};

function DividendTableRow({ item, colors }: { item: Dividend; colors: ReturnType<typeof themeColors> }) {
  const unitValue = Number(item.amountPerShare || 0);
  const computedTotal = item.quantity && item.quantity > 0 && unitValue > 0
    ? item.quantity * unitValue
    : unitValue;

  return (
    <View style={[styles.row, { borderBottomColor: "#27343D" }]}>
      <Text style={[styles.dateCell, { color: colors.textColor }]}>
        {item.paymentDate ? date(item.paymentDate) : "—"}
      </Text>
      <Text style={[styles.tickerCell, { color: colors.textColor }]}>{item.ticker}</Text>
      <Text style={[styles.kindCell, { color: colors.textColor }]}>
        {item.kind === "income" ? "Rend." : "Amort."}
      </Text>
      <Text style={[styles.quantityCell, { color: colors.textColor }]}>
        {item.quantity ? item.quantity.toLocaleString("pt-BR") : "—"}
      </Text>
      <Text style={[styles.unitCell, { color: colors.textColor }]}>
        {unitValue > 0 ? unitValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : "—"}
      </Text>
      <Text style={[styles.totalCell, { color: colors.accent }]}>
        {computedTotal > 0 ? currency(computedTotal) : "—"}
      </Text>
    </View>
  );
}

export default function B3DividendsScreen() {
  const { ready, dividends, settings } = usePortfolio();
  const [selected, setSelected] = useState(new Date().toISOString().slice(0, 7));
  const colors = themeColors(settings.themeName);
  const monthsScrollViewRef = useRef<ScrollView>(null);

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
      const val = (item.quantity && item.quantity > 0 && item.amountPerShare)
        ? item.quantity * item.amountPerShare
        : Number(item.amountPerShare || 0);
      return sum + val;
    }, 0);
  }, [periodData]);

  const historyTotal = useMemo(() => {
    return b3Dividends.reduce((sum, item) => {
      const val = (item.quantity && item.quantity > 0 && item.amountPerShare)
        ? item.quantity * item.amountPerShare
        : Number(item.amountPerShare || 0);
      return sum + val;
    }, 0);
  }, [b3Dividends]);

  const currentYear = selected.slice(0, 4);
  const currentMonthNum = parseInt(selected.slice(5, 7), 10);

  // Centraliza o mês ativo no ScrollView horizontal
  useEffect(() => {
    const monthIndex = currentMonthNum - 1;
    const targetOffset = (monthIndex * CHIP_WIDTH) - (SCREEN_WIDTH / 2) + (CHIP_WIDTH / 2);
    monthsScrollViewRef.current?.scrollTo({
      x: Math.max(0, targetOffset),
      animated: true,
    });
  }, [selected, currentMonthNum]);

  const chartData = useMemo(() => {
    return MESES_NOMES.map((_, index) => {
      const mStr = String(index + 1).padStart(2, '0');
      const mKey = `${currentYear}-${mStr}`;
      const total = b3Dividends
        .filter(item => item.paymentDate.startsWith(mKey))
        .reduce((sum, item) => {
          const val = (item.quantity && item.quantity > 0 && item.amountPerShare)
            ? item.quantity * item.amountPerShare
            : Number(item.amountPerShare || 0);
          return sum + val;
        }, 0);
      return { monthKey: mKey, label: MESES_NOMES[index], total };
    });
  }, [b3Dividends, currentYear]);

  const maxChartValue = useMemo(() => {
    const max = Math.max(...chartData.map(d => d.total), 15);
    return Math.ceil(max / 5) * 5;
  }, [chartData]);

  if (!ready) return <LoadingState />;
  const borderColor = "#4A4D50";

  return (
    <ScreenContainer style={{ backgroundColor: colors.cardColor }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <FlatList
        data={periodData}
        keyExtractor={(item, index) => item.id || `${item.ticker}-${item.paymentDate}-${index}`}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* Título Principal */}
            <View style={styles.topBar}>
              <Text style={[styles.title, { color: colors.textColor }]}>🏦 Extrato Oficial B3</Text>
            </View>

            {/* Controles de Navegação (Mês por Extenso e Ano) */}
            <View style={styles.filters}>
              <View style={{ flexDirection: "row", alignItems: "center", flex: 1.6, justifyContent: "center" }}>
                <Pressable onPress={() => setSelected(shift(selected, -1))} hitSlop={10}>
                  <Text style={[styles.arrow, { color: colors.textColor }]}>‹</Text>
                </Pressable>
                <Text style={[styles.filterMonth, { color: colors.textColor }]}>
                  {monthLabel(selected).split(" ")[0]}
                </Text>
                <Pressable onPress={() => setSelected(shift(selected, 1))} hitSlop={10}>
                  <Text style={[styles.arrow, { color: colors.textColor }]}>›</Text>
                </Pressable>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", flex: 1.4, justifyContent: "center", marginLeft: 8 }}>
                <Pressable onPress={() => setSelected(shift(selected, -12))} hitSlop={10}>
                  <Text style={[styles.arrow, { color: colors.textColor }]}>‹</Text>
                </Pressable>
                <Text style={[styles.filterYear, { color: colors.textColor }]}>{currentYear}</Text>
                <Pressable onPress={() => setSelected(shift(selected, 12))} hitSlop={10}>
                  <Text style={[styles.arrow, { color: colors.textColor }]}>›</Text>
                </Pressable>
              </View>
            </View>

            {/* Carrossel de Mêses (Com Rolagem Autocentralizada) */}
            <View style={{ height: 44, marginBottom: 8, marginTop: 4 }}>
              <ScrollView
                ref={monthsScrollViewRef}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                <View style={styles.mesesRow}>
                  {MESES_NOMES.map((nm, i) => {
                    const mStr = String(i + 1).padStart(2, '0');
                    const isSelected = currentMonthNum === (i + 1);
                    const mKey = `${currentYear}-${mStr}`;
                    return (
                      <Pressable key={nm} onPress={() => setSelected(mKey)}
                        style={[styles.mesChip, isSelected && { backgroundColor: '#123c52', borderColor: colors.accent, borderWidth: 1 }]}>
                        <Text style={[styles.mesChipTxt, isSelected && { color: colors.accent, fontWeight: "700" }]}>{nm}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </View>

            <View style={[styles.sectionBar, { borderColor }]}><Text style={[styles.sectionTitle, { color: colors.textColor }]}>Valores Oficiais B3</Text></View>

            {/* Cabeçalho de Colunas da Tabela */}
            <View style={[styles.tableHeader, { borderColor }]}>
              <Text style={[styles.dateCell, styles.headerText, { color: colors.textColor }]}>Data</Text>
              <Text style={[styles.tickerCell, styles.headerText, { color: colors.textColor }]}>Ativo</Text>
              <Text style={[styles.kindCell, styles.headerText, { color: colors.textColor }]}>Tipo</Text>
              <Text style={[styles.quantityCell, styles.headerText, { color: colors.textColor }]}>Qtde.</Text>
              <Text style={[styles.unitCell, styles.headerText, { color: colors.textColor }]}>Unit.</Text>
              <Text style={[styles.totalCell, styles.headerText, { color: colors.textColor }]}>Total</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => <DividendTableRow item={item} colors={colors} />}
        ListEmptyComponent={<EmptyState title="Sem dados B3" description="Importe sua planilha B3 nos Ajustes." />}
        ListFooterComponent={
          <View style={{ paddingBottom: 24, marginTop: 10 }}>
            <View style={[styles.totalLine, { backgroundColor: "#17232C", padding: 12, borderRadius: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#7E8B94", fontSize: 10 }}>Recebido no mês</Text>
                <Text style={{ color: colors.accent, fontSize: 16, fontWeight: "bold", marginTop: 2 }}>{currency(monthTotal)}</Text>
              </View>
              <View style={{ width: 1, height: 32, backgroundColor: "#4A4D50", marginHorizontal: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#7E8B94", fontSize: 10 }}>Total B3 Acumulado</Text>
                <Text style={{ color: colors.accent, fontSize: 16, fontWeight: "bold", marginTop: 2 }}>{currency(historyTotal)}</Text>
              </View>
            </View>

            <View style={[styles.sectionBar, { borderColor, marginTop: 16, marginBottom: 10 }]}>
              <Text style={[styles.sectionTitle, { color: colors.textColor }]}>Evolução Dividendos B3</Text>
            </View>

            <View style={styles.chartContainer}>
              <View style={styles.chart}>
                <View style={styles.yAxis}>
                  <Text style={[styles.axisText, { color: colors.textColor }]}>{maxChartValue}</Text>
                  <Text style={[styles.axisText, { color: colors.textColor }]}>{Math.round(maxChartValue * 0.75)}</Text>
                  <Text style={[styles.axisText, { color: colors.textColor }]}>{Math.round(maxChartValue * 0.5)}</Text>
                  <Text style={[styles.axisText, { color: colors.textColor }]}>{Math.round(maxChartValue * 0.25)}</Text>
                  <Text style={[styles.axisText, { color: colors.textColor }]}>0</Text>
                </View>
                <View style={styles.chartColumns}>
                  {chartData.map((item) => {
                    const barHeight = maxChartValue > 0 ? Math.min(130, Math.max(4, (item.total / maxChartValue) * 130)) : 4;
                    const isSelectedMonth = item.monthKey === selected;
                    return (
                      <Pressable key={item.monthKey} onPress={() => setSelected(item.monthKey)} style={styles.barColumn}>
                        {item.total > 0 && (
                          <Text style={[styles.barValue, { color: colors.textColor }]}>
                            {item.total.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Text>
                        )}
                        <View style={[styles.bar, { height: barHeight, backgroundColor: isSelectedMonth ? colors.accent : "#009688" }]} />
                        <Text style={[styles.barLabel, { color: isSelectedMonth ? colors.accent : colors.textColor }]}>
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          </View>
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 4,
    paddingBottom: 20,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    height: 48,
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  filters: {
    alignItems: "center",
    flexDirection: "row",
    height: 42,
    marginBottom: 6,
    justifyContent: "space-between",
  },
  filterMonth: {
    borderBottomWidth: 1,
    borderBottomColor: "#4A4D50",
    fontSize: 15,
    paddingBottom: 2,
    textAlign: "center",
    fontWeight: "600",
    textTransform: "lowercase",
  },
  filterYear: {
    borderBottomWidth: 1,
    borderBottomColor: "#4A4D50",
    fontSize: 15,
    paddingBottom: 2,
    textAlign: "center",
    fontWeight: "600",
  },
  arrow: {
    fontSize: 24,
    paddingHorizontal: 8,
  },
  mesesRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 4,
  },
  mesChip: {
    backgroundColor: "#1c2833",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: "center",
    minWidth: 46,
  },
  mesChipTxt: {
    color: "#95a5a6",
    fontSize: 11,
    fontWeight: "600",
  },
  sectionBar: {
    alignItems: "center",
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: "row",
    height: 34,
    paddingHorizontal: 8,
    backgroundColor: "#17232C",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
  },
  tableHeader: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    height: 28,
    paddingHorizontal: 2,
  },
  headerText: {
    fontSize: 10,
    fontWeight: "700",
  },
  row: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    minHeight: 28,
    paddingHorizontal: 2,
  },
  dateCell: {
    width: 66,
    textAlign: "center",
    fontSize: 9.5,
    marginLeft: 0,
  },
  tickerCell: {
    width: 62,
    textAlign: "center",
    fontSize: 9.5,
    fontWeight: "700",
    marginLeft: 2,
  },
  kindCell: {
    width: 68,
    textAlign: "center",
    fontSize: 9.5,
    marginLeft: 4,
  },
  quantityCell: {
    width: 44,
    fontSize: 9.5,
    textAlign: "center",
    marginLeft: 2,
  },
  unitCell: {
    width: 42,
    fontSize: 9.5,
    textAlign: "center",
    marginLeft: 8,
  },
  totalCell: {
    flex: 1,
    width: 62,
    fontSize: 9.5,
    fontWeight: "700",
    textAlign: "center",
    marginLeft: 2,
  },
  totalLine: {
    flexDirection: "row",
    alignItems: "center",
  },
  chartContainer: {
    width: "100%",
    backgroundColor: "#17232C",
    borderRadius: 10,
    padding: 8,
    marginTop: 2,
  },
  chart: {
    flexDirection: "row",
    height: 150,
    width: "100%",
    alignItems: "flex-end",
  },
  yAxis: {
    justifyContent: "space-between",
    paddingBottom: 20,
    width: 24,
    height: "100%",
  },
  axisText: {
    fontSize: 8,
    textAlign: "right",
    paddingRight: 2,
  },
  chartColumns: {
    alignItems: "flex-end",
    borderTopColor: "rgba(255,255,255,0.1)",
    borderTopWidth: 1,
    flexDirection: "row",
    flex: 1,
    justifyContent: "space-around",
    height: "100%",
    paddingTop: 6,
  },
  barColumn: {
    alignItems: "center",
    justifyContent: "flex-end",
    height: "100%",
    width: 20,
  },
  barValue: {
    fontSize: 7,
    marginBottom: 2,
  },
  bar: {
    borderRadius: 2,
    width: 12,
  },
  barLabel: {
    fontSize: 7.5,
    fontWeight: "700",
    marginTop: 3,
    textAlign: "center",
    width: "100%",
  },
});