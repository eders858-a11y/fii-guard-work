import { router, Stack } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useEffect, useRef } from "react";
import { usePortfolio, monthReport } from "@/lib/portfolio";
import { ScreenContainer } from "@/components/screen-container";
import { Button, Card, EmptyState, LoadingState, Metric, SectionHeader } from "@/components/portfolio-ui";
import { currency, dateTime, number } from "@/lib/format";
import { findFund } from "@/lib/fii-catalog";

const NAVY = "#172554";
const CYAN = "#00A6C7";
const MINT = "#00B894";
const RED = "#C2413A";
const TRACK = "#D7DEE8";
const CHART_COLORS = ["#00A6C7", "#00B894", "#5B5FEF", "#F39C12", "#E84393", "#6C5CE7", "#16A085", "#D35400", "#2980B9", "#8E44AD"];

function Donut({ values, colors, center, caption }: { values: number[]; colors: string[]; center: string; caption: string }) {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <View style={styles.donutWrap}>
      <Svg width={140} height={140} viewBox="0 0 160 160">
        <Circle cx="80" cy="80" r={radius} stroke={TRACK} strokeWidth="12" fill="none" />
        {values.map((value, index) => {
          const segment = total ? (Math.max(0, value) / total) * circumference : 0;
          const currentOffset = offset;
          offset += segment;
          if (segment === 0) return null;
          return (
            <Circle
              key={`${index}-${value}`}
              cx="80"
              cy="80"
              r={radius}
              stroke={colors[index % colors.length] ?? CYAN}
              strokeWidth="12"
              fill="none"
              strokeDasharray={`${segment} ${circumference}`}
              strokeDashoffset={-currentOffset}
              strokeLinecap="round"
              rotation="-90"
              origin="80,80"
            />
          );
        })}
      </Svg>
      <View style={styles.donutCenter}>
        <Text style={styles.donutValue}>{center}</Text>
        <Text style={styles.donutCaption}>{caption}</Text>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { ready, snapshot, operations, dividends, settings, syncMarketData } = usePortfolio();
  const opened = useRef(false);

  useEffect(() => {
    if (ready && !opened.current) {
      opened.current = true;
      syncMarketData().catch(() => undefined);
    }
  }, [ready, syncMarketData]);

  if (!ready) return <LoadingState />;

  const key = new Date().toISOString().slice(0, 7);
  const report = monthReport(operations, dividends, key);
  const allocation = snapshot.active.map((position) => position.marketValue ?? position.costBasis);
  const hasData = snapshot.active.length > 0;

  const sectorMap = new Map<string, number>();
  snapshot.active.forEach((position) => {
    const sector = findFund(position.ticker)?.segment ?? "Não classificado";
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + (position.marketValue ?? position.costBasis));
  });

  const sectors = [...sectorMap.entries()].sort((a, b) => b[1] - a[1]);
  const sectorValues = sectors.map((item) => item[1]);
  const cardColor = settings.cardColor || "#1E1E1E";
  const textColor = settings.textColor || "#FFFFFF";
  const topPositions = snapshot.active;

  // Cálculos consolidados para a barra de resumo estilo referência
  const totalProventosRecebidos = dividends.reduce((acc, d) => acc + (d.value * (d.quantity || 1)), 0) || report.incomeTotal + report.amortizationTotal;
  const yieldOnCostCalc = snapshot.investedCost > 0 ? (totalProventosRecebidos / snapshot.investedCost) * 100 : 0;
  const resultadoComProventos = snapshot.totalResult + totalProventosRecebidos;
  const porcentagemComProventos = snapshot.investedCost > 0 ? (resultadoComProventos / snapshot.investedCost) * 100 : 0;
  const porcentagemLucro = snapshot.investedCost > 0 ? (snapshot.totalResult / snapshot.investedCost) * 100 : 0;

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
              <Pressable
                accessibilityLabel="Abrir ajustes"
                onPress={() => router.push("/settings" as any)}
                style={({ pressed }) => [styles.settings, pressed && styles.pressed]}
              >
                <Text style={styles.settingsText}>⚙</Text>
              </Pressable>
            </View>

            {/* CARD DE RESUMO PRINCIPAL ESTILO PORTFÓLIO */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Valor da Carteira</Text>
              <Text style={styles.summaryMainValue}>{hasData ? currency(snapshot.marketValue) : "R$ 0,00"}</Text>

              <Text style={styles.summarySubTitle}>Custo de Aquisição</Text>
              <Text style={styles.summarySubValue}>{currency(snapshot.investedCost)}</Text>

              <View style={styles.metricsRow}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Lucro/Prejuízo</Text>
                  <Text style={[styles.metricText, { color: snapshot.totalResult < 0 ? "#ff5252" : "#00B894" }]}>
                    {porcentagemLucro.toFixed(2)}%
                  </Text>
                  <Text style={[styles.metricSubText, { color: snapshot.totalResult < 0 ? "#ff5252" : "#00B894" }]}>
                    {currency(snapshot.totalResult, { sign: true })}
                  </Text>
                </View>

                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Proventos</Text>
                  <Text style={styles.metricValue}>{currency(totalProventosRecebidos)}</Text>
                  <Text style={styles.metricLabel}>Yield on Cost</Text>
                  <Text style={styles.metricSubText}>{yieldOnCostCalc.toFixed(2)}%</Text>
                </View>

                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Lucro c/ Proventos</Text>
                  <Text style={[styles.metricText, { color: resultadoComProventos < 0 ? "#ff5252" : "#00B894" }]}>
                    {porcentagemComProventos.toFixed(2)}%
                  </Text>
                  <Text style={[styles.metricSubText, { color: resultadoComProventos < 0 ? "#ff5252" : "#00B894" }]}>
                    {currency(resultadoComProventos, { sign: true })}
                  </Text>
                </View>
              </View>
            </View>

            {/* BLOCO LADO A LADO: FIIs ATIVOS (13) & PROVENTOS DO MÊS */}
            <View className="mt-4 flex-row gap-3">
              <View style={[styles.smallMetric, { backgroundColor: cardColor, borderColor: "#2c2c2c" }]}>
                <Metric label="FIIs ativos" value={number(snapshot.fundCount, 0)} helper="posições" />
              </View>
              <View style={[styles.smallMetric, { backgroundColor: cardColor, borderColor: "#2c2c2c" }]}>
                <Metric label="Proventos no mês" value={currency(report.incomeTotal + report.amortizationTotal)} tone="positive" helper="recebidos" />
              </View>
            </View>

            {/* GRÁFICOS */}
            <View className="mt-6">
              <SectionHeader title="Leitura da carteira" action="Atualizar" onAction={() => syncMarketData().catch(() => undefined)} />
            </View>
            <View style={styles.chartsRow}>
              <Card className="flex-1 p-3" style={{ backgroundColor: cardColor }}>
                <Text style={[styles.chartTitle, { color: textColor }]}>Ativos</Text>
                {hasData ? (
                  <Donut values={allocation} colors={CHART_COLORS} center={`${snapshot.fundCount}`} caption="FIIs" />
                ) : (
                  <View style={styles.emptyChart}>
                    <Donut values={[]} colors={[CYAN]} center="—" caption="sem dados" />
                    <Text style={styles.emptyChartText}>Adicione uma compra para visualizar</Text>
                  </View>
                )}
              </Card>
              <Card className="flex-1 p-3" style={{ backgroundColor: cardColor }}>
                <Text style={[styles.chartTitle, { color: textColor }]}>Setores</Text>
                {hasData ? (
                  <Donut values={sectorValues} colors={CHART_COLORS} center="100%" caption="carteira" />
                ) : (
                  <View style={styles.emptyChart}>
                    <Donut values={[]} colors={[MINT]} center="—" caption="sem dados" />
                    <Text style={styles.emptyChartText}>O gráfico aparece após o primeiro lançamento</Text>
                  </View>
                )}
              </Card>
            </View>

            {/* AÇÕES RÁPIDAS */}
            <View className="mt-7">
              <SectionHeader title="Ações rápidas" />
            </View>
            <View style={styles.actionRow}>
              <View style={styles.actionItem}>
                <Button compact title="Comprar / vender" onPress={() => router.push("/transaction-form" as any)} />
              </View>
              <View style={styles.actionItem}>
                <Button compact title="Ver proventos" variant="secondary" onPress={() => router.push("/(tabs)/dividends" as any)} />
              </View>
            </View>

            {/* CABEÇALHO DA TABELA DE ATIVOS */}
            <View className="mt-7">
              <SectionHeader title="Posições da Carteira" />
            </View>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 1.2 }]}>Ativo</Text>
              <Text style={[styles.th, { flex: 0.6 }]}>Qtde.</Text>
              <Text style={[styles.th, { flex: 1.2 }]}>Custo Aquisição</Text>
              <Text style={[styles.th, { flex: 1.1 }]}>Valor Atual</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/fund/${item.ticker}` as any)}
            style={({ pressed }) => [styles.tableRow, pressed && styles.pressed]}
          >
            <Text style={[styles.tdTicker, { flex: 1.2 }]}>{item.ticker}</Text>
            <Text style={[styles.td, { flex: 0.6 }]}>{number(item.quantity, 0)}</Text>
            <Text style={[styles.td, { flex: 1.2 }]}>{currency(item.costBasis)}</Text>
            <Text style={[styles.td, { flex: 1.1 }]}>{currency(item.marketValue ?? item.costBasis)}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <EmptyState
            title="Sua carteira começa aqui"
            description="Registre a primeira compra e acompanhe PM, patrimônio, cotação e proventos em um dashboard completo."
            action={
              <View style={styles.emptyButton}>
                <Button title="Adicionar primeira compra" onPress={() => router.push("/transaction-form" as any)} />
              </View>
            }
          />
        }
        ListFooterComponent={
          <Text style={styles.footer}>
            Última consulta: {dateTime(settings.lastSyncAt)} · {settings.lastSyncMessage ?? "Configure o serviço de mercado em Ajustes."}
          </Text>
        }
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
  chartsRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  chartTitle: { fontSize: 14, fontWeight: "800" },
  donutWrap: { alignItems: "center", justifyContent: "center", marginVertical: 8, position: "relative" },
  donutCenter: { alignItems: "center", position: "absolute" },
  donutValue: { fontSize: 11, fontWeight: "800", maxWidth: 70, textAlign: "center" },
  donutCaption: { color: "#718096", fontSize: 9, marginTop: 2 },
  emptyChart: { alignItems: "center" },
  emptyChartText: { color: "#718096", fontSize: 10, lineHeight: 14, textAlign: "center" },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  actionItem: { flex: 1 },
  tableHeader: { flexDirection: "row", backgroundColor: "#1a1a1a", paddingVertical: 10, paddingHorizontal: 8, borderTopLeftRadius: 6, borderTopRightRadius: 6, marginTop: 10 },
  th: { color: "#aaa", fontSize: 11, fontWeight: "bold" },
  tableRow: { flexDirection: "row", backgroundColor: "#1e1e1e", paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: "#2c2c2c", alignItems: "center" },
  tdTicker: { color: "#4dabf7", fontWeight: "bold", fontSize: 12 },
  td: { color: "#fff", fontSize: 11 },
  emptyButton: { width: "100%" },
  footer: { color: "#718096", fontSize: 9, lineHeight: 15, marginTop: 18, textAlign: "center" },
  pressed: { opacity: 0.7, transform: [{ scale: 0.99 }] }
});