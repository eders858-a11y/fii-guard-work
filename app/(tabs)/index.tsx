import { router, Stack } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useEffect, useRef, useMemo } from "react";
import { usePortfolio, monthReport } from "@/lib/portfolio";
import { ScreenContainer } from "@/components/screen-container";
import { Button, EmptyState, LoadingState, SectionHeader } from "@/components/portfolio-ui";
import { currency, dateTime, number } from "@/lib/format";

export default function HomeScreen() {
  const { ready, snapshot, operations, dividends, settings, syncMarketData } = usePortfolio();

  useEffect(() => {
    if (ready) {
      syncMarketData().catch(() => undefined);
    }
  }, [ready, syncMarketData]);

  const key = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const report = useMemo(() => monthReport(operations, dividends, key), [operations, dividends, key]);
  const hasData = snapshot.active.length > 0;

  const cardColor = settings.cardColor || "#1E1E1E";
  const textColor = settings.textColor || "#FFFFFF";
  const topPositions = snapshot.active;

  const totalProventosRecebidos = useMemo(() => {
    const raw = snapshot.totalDividends || 0;
    return Number.isFinite(raw) && raw < 1000000 ? raw : 0;
  }, [snapshot.totalDividends]);

  const yieldOnCostCalc = useMemo(() => snapshot.investedCost > 0 ? (totalProventosRecebidos / snapshot.investedCost) * 100 : 0, [totalProventosRecebidos, snapshot.investedCost]);
  const lucroPuro = snapshot.totalResult || 0;
  const porcentagemLucro = useMemo(() => snapshot.investedCost > 0 ? (lucroPuro / snapshot.investedCost) * 100 : 0, [lucroPuro, snapshot.investedCost]);
  const resultadoComProventos = useMemo(() => lucroPuro + totalProventosRecebidos, [lucroPuro, totalProventosRecebidos]);
  const porcentagemComProventos = useMemo(() => snapshot.investedCost > 0 ? (resultadoComProventos / snapshot.investedCost) * 100 : 0, [resultadoComProventos, snapshot.investedCost]);

  if (!ready) return <LoadingState />;

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <FlatList
        data={topPositions}
        keyExtractor={(item) => item.ticker}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <View className="mb-5 flex-row items-center justify-between pt-2">
              <View>
                <Text style={styles.eyebrow}>FII GUARD · VALORIZAÇÃO</Text>
                <Text className="mt-1 text-3xl font-bold text-foreground">Meus Fiis</Text>
              </View>
              <Pressable onPress={() => router.push("/settings" as any)} style={styles.settings}>
                <Text style={styles.settingsText}>⚙</Text>
              </Pressable>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Valor de Mercado</Text>
              <Text style={styles.summaryMainValue}>{hasData ? currency(snapshot.marketValue) : "R$ 0,00"}</Text>
              <Text style={styles.summarySubTitle}>Custo de Aquisição</Text>
              <Text style={styles.summarySubValue}>{currency(snapshot.investedCost)}</Text>

              <View style={styles.metricsRow}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Lucro/Prejuízo</Text>
                  <Text style={[styles.metricText, { color: snapshot.totalResult < 0 ? "#ff5252" : "#00B894" }]}>{porcentagemLucro.toFixed(2)}%</Text>
                  <Text style={[styles.metricSubText, { color: snapshot.totalResult < 0 ? "#ff5252" : "#00B894" }]}>{currency(snapshot.totalResult)}</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Proventos</Text>
                  <Text style={styles.metricValue}>{currency(totalProventosRecebidos)}</Text>
                  <Text style={styles.metricLabel}>Yield on Cost</Text>
                  <Text style={styles.metricSubText}>{yieldOnCostCalc.toFixed(2)}%</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Lucro c/ Proventos</Text>
                  <Text style={[styles.metricText, { color: resultadoComProventos < 0 ? "#ff5252" : "#00B894" }]}>{porcentagemComProventos.toFixed(2)}%</Text>
                  <Text style={[styles.metricSubText, { color: resultadoComProventos < 0 ? "#ff5252" : "#00B894" }]}>{currency(resultadoComProventos)}</Text>
                </View>
              </View>
            </View>

            <View className="mt-4 flex-row gap-3">
              <View style={[styles.smallMetric, { backgroundColor: cardColor, borderColor: "#2c2c2c" }]}>
                <Text style={styles.customCardLabel}>FIIs ativos</Text>
                <Text style={[styles.customCardValue, { color: textColor }]}>{number(snapshot.fundCount, 0)}</Text>
              </View>
              <View style={[styles.smallMetric, { backgroundColor: cardColor, borderColor: "#2c2c2c" }]}>
                <Text style={styles.customCardLabel}>Proventos no mês</Text>
                <Text style={[styles.customCardValue, { color: "#00B894" }]}>{currency(report.incomeTotal + report.amortizationTotal)}</Text>
              </View>
            </View>

            <View className="mt-7"><SectionHeader title="Ações rápidas" /></View>
            <View style={styles.actionRow}>
              <View style={styles.actionItem}><Button compact title="Comprar / vender" onPress={() => router.push("/transaction-form" as any)} /></View>
              <View style={styles.actionItem}><Button compact title="Ver proventos" variant="secondary" onPress={() => router.push("/(tabs)/dividends" as any)} /></View>
            </View>

            <View className="mt-7"><SectionHeader title="Posições da Carteira" /></View>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 1.2 }]}>Ativo</Text>
              <Text style={[styles.th, { flex: 0.6 }]}>Qtde.</Text>
              <Text style={[styles.th, { flex: 1.2 }]}>Custo Aquisição</Text>
              <Text style={[styles.th, { flex: 1.1 }]}>Valor Atual</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/fund/${item.ticker}` as any)} style={styles.tableRow}>
            <Text style={[styles.tdTicker, { flex: 1.2 }]}>{item.ticker}</Text>
            <Text style={[styles.td, { flex: 0.6 }]}>{number(item.quantity, 0)}</Text>
            <Text style={[styles.td, { flex: 1.2 }]}>{currency(item.costBasis)}</Text>
            <Text style={[styles.td, { flex: 1.1 }]}>{currency(item.marketValue ?? item.costBasis)}</Text>
          </Pressable>
        )}
        ListFooterComponent={<Text style={styles.footer}>Última consulta: {dateTime(settings.lastSyncAt)} · {settings.lastSyncMessage}</Text>}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 36 },
  eyebrow: { color: "#888", fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  settings: { alignItems: "center", backgroundColor: "#263B72", borderRadius: 16, height: 46, justifyContent: "center", width: 46 },
  settingsText: { color: "#FFF", fontSize: 20 },
  summaryCard: { backgroundColor: "#1e1e1e", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 12, borderWidth: 1, borderColor: "#2c2c2c" },
  summaryTitle: { color: "#aaa", fontSize: 12 },
  summaryMainValue: { color: "#ff5252", fontSize: 26, fontWeight: "bold", marginBottom: 10 },
  summarySubTitle: { color: "#aaa", fontSize: 11 },
  summarySubValue: { color: "#fff", fontSize: 16, fontWeight: "600", marginBottom: 15 },
  metricsRow: { flexDirection: "row", justifyContent: "space-between", width: "100%", borderTopWidth: 1, borderTopColor: "#2c2c2c", paddingTop: 12 },
  metricItem: { flex: 1, alignItems: "center" },
  metricLabel: { color: "#888", fontSize: 10 },
  metricText: { fontSize: 13, fontWeight: "bold", marginTop: 2 },
  metricValue: { color: "#fff", fontSize: 13, fontWeight: "bold", marginTop: 2 },
  metricSubText: { fontSize: 11, marginTop: 2 },
  smallMetric: { borderRadius: 12, borderWidth: 1, flex: 1, padding: 14 },
  customCardLabel: { color: "#888888", fontSize: 11, fontWeight: "600" },
  customCardValue: { fontSize: 20, fontWeight: "bold", marginVertical: 4 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  actionItem: { flex: 1 },
  tableHeader: { flexDirection: "row", backgroundColor: "#1a1a1a", paddingVertical: 10, paddingHorizontal: 8, borderTopLeftRadius: 6, borderTopRightRadius: 6, marginTop: 10 },
  th: { color: "#aaa", fontSize: 11, fontWeight: "bold" },
  tableRow: { flexDirection: "row", backgroundColor: "#1e1e1e", paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: "#2c2c2c", alignItems: "center" },
  td: { color: "#ddd", fontSize: 12 },
  tdTicker: { color: "#fff", fontSize: 13, fontWeight: "bold" },
  footer: { color: "#666", fontSize: 11, textAlign: "center", marginTop: 20 }
});
