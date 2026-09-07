import { router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View, Dimensions } from "react-native";
import Svg, { G, Path, Circle } from "react-native-svg";
import { useMemo, useEffect } from "react";
import { usePortfolio } from "@/lib/portfolio";
import { findFund } from "@/lib/fii-catalog";
import { ScreenContainer } from "@/components/screen-container";
import { Button, EmptyState, LoadingState } from "@/components/portfolio-ui";
import { currency, number } from "@/lib/format";

const SCREEN_WIDTH = Dimensions.get("window").width;

const CHART_COLORS = [
  "#C8504B", "#2A3B4C", "#56888A", "#D17F61", "#80B3A2",
  "#538165", "#C87C1E", "#B19992", "#66717E", "#5B6C7C",
  "#A3AEB5", "#899980", "#29404E", "#D86B5A", "#9BB8A9",
  "#395E66", "#D39E82", "#A26769", "#6B8E23", "#4682B4"
];

type Slice = { label: string; value: number };

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M", x, y,
    "L", start.x, start.y,
    "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y,
    "Z"
  ].join(" ");
}

function ChartCard({ title, slices, total }: { title: string; slices: Slice[]; total: number }) {
  const cardWidth = SCREEN_WIDTH - 40;
  const chartHeight = 220;
  const centerX = cardWidth / 2;
  const centerY = chartHeight / 2;
  const radius = 75;

  let cumulativeAngle = 0;

  const slicesData = useMemo(() => {
    return slices.map((slice, index) => {
      const percentage = total > 0 ? (slice.value / total) * 100 : 0;
      const angle = (percentage / 100) * 360;

      const startAngle = cumulativeAngle;
      const endAngle = cumulativeAngle + angle;
      const midAngle = startAngle + angle / 2;

      cumulativeAngle += angle;

      const color = CHART_COLORS[index % CHART_COLORS.length];

      return {
        ...slice,
        percentage,
        startAngle,
        endAngle,
        color,
      };
    });
  }, [slices, total]);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>

      <View style={styles.pieContainer}>
        <Svg width={cardWidth} height={chartHeight}>
          <G>
            {slicesData.map((slice, index) => {
              if (slice.percentage === 0) return null;
              const pathData = describeArc(centerX, centerY, radius, slice.startAngle, slice.endAngle);

              return (
                <Path
                  key={`slice-${index}`}
                  d={pathData}
                  fill={slice.color}
                  stroke="#17232C"
                  strokeWidth={1.5}
                />
              );
            })}
          </G>
        </Svg>
      </View>

      <View style={styles.legendContainer}>
        {slicesData.map((slice, index) => {
          if (slice.percentage <= 0) return null;
          return (
            <View key={`legend-${index}`} style={styles.legendItem}>
              <View style={[styles.legendColorBox, { backgroundColor: slice.color }]} />
              <Text style={styles.legendText}>
                {slice.label} <Text style={styles.legendPct}>{slice.percentage.toFixed(0)}%</Text>
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.pieTotal}>
        <Text style={styles.centerLabel}>Total em carteira</Text>
        <Text style={styles.centerValue}>{currency(total)}</Text>
      </View>
    </View>
  );
}

// Motor universal e inteligente para classificar qualquer FII atual ou futuro sem cair em "Outros"
function getNormalizedCategory(ticker: string, field: "sector" | "segment", rawValue?: string): string {
  const upperTicker = ticker.toUpperCase();
  const rawText = `${rawValue || ""}`.toUpperCase();

  const isPaper =
    rawText.includes("PAPEL") ||
    rawText.includes("RECEBÍVEIS") ||
    rawText.includes("CRV") ||
    rawText.includes("FINANCEIRO") ||
    upperTicker.startsWith("VGIR") ||
    upperTicker.startsWith("RBRX") ||
    upperTicker.startsWith("PCIP") ||
    upperTicker.startsWith("KNCR") ||
    upperTicker.startsWith("XPCI") ||
    upperTicker.startsWith("CPTS");

  const isDevelopment =
    rawText.includes("DESENVOLVIMENTO") ||
    upperTicker.startsWith("MFII");

  const isBrick =
    rawText.includes("TIJOLO") ||
    rawText.includes("LOGÍSTICA") ||
    rawText.includes("LAJES") ||
    rawText.includes("SHOPPING") ||
    rawText.includes("RESIDENCIAL") ||
    rawText.includes("EDUCACIONAL") ||
    rawText.includes("HOSPITAL") ||
    upperTicker.startsWith("HGLG") ||
    upperTicker.startsWith("HGBS") ||
    upperTicker.startsWith("HSML") ||
    upperTicker.startsWith("BTLG");

  if (field === "sector") {
    if (isDevelopment || isBrick || rawText.includes("TIJOLO")) return "Tijolo";
    if (isPaper || rawText.includes("PAPEL")) return "Papel";

    if (rawValue && rawValue !== "Outros" && rawValue.trim() !== "") {
      if (rawValue.toUpperCase().includes("PAPEL") || rawValue.toUpperCase().includes("RECEBÍVEL")) return "Papel";
      return "Tijolo";
    }
    return "Tijolo";
  }

  if (field === "segment") {
    if (isDevelopment || rawText.includes("DESENVOLVIMENTO")) return "Desenvolvimento";
    if (rawText.includes("LOGÍSTICA") || upperTicker.startsWith("HGLG") || upperTicker.startsWith("BTLG")) return "Logística";
    if (rawText.includes("SHOPPING") || upperTicker.startsWith("HGBS") || upperTicker.startsWith("HSML")) return "Shopping";
    if (rawText.includes("LAJES") || rawText.includes("CORPORATIVAS")) return "Lajes Corporativas";
    if (rawText.includes("PAPEL") || rawText.includes("RECEBÍVEIS") || isPaper) return "Recebíveis Imobiliários";
    if (rawText.includes("RESIDENCIAL")) return "Residencial";

    if (rawValue && rawValue !== "Outros" && rawValue.trim() !== "") {
      return rawValue;
    }

    if (isPaper) return "Recebíveis Imobiliários";
    return "Logística";
  }

  return rawValue || "Outros";
}

// Função auxiliar para buscar cotações online (via brapi)
async function fetchLiveQuotes(tickers: string[]): Promise<Record<string, number>> {
  if (tickers.length === 0) return {};
  try {
    const symbols = tickers.map(t => `${t}.SA`).join(",");
    const response = await fetch(`https://brapi.dev/api/quote/${symbols}`);
    const data = await response.json();
    const quotes: Record<string, number> = {};
    if (data && data.results) {
      data.results.forEach((item: any) => {
        if (item.symbol && typeof item.regularMarketPrice === "number") {
          const cleanTicker = item.symbol.replace(".SA", "").toUpperCase();
          quotes[cleanTicker] = item.regularMarketPrice;
        }
      });
    }
    return quotes;
  } catch (error) {
    console.error("Erro ao atualizar cotações online:", error);
    return {};
  }
}

export default function PortfolioScreen() {
  const { ready, snapshot, updatePrices } = usePortfolio() as any;
  const positions = snapshot.active;

  // Atualiza as cotações automaticamente ao carregar a tela inicial
  useEffect(() => {
    async function loadQuotes() {
      if (!positions || positions.length === 0) return;
      const tickers = positions.map((p: any) => p.ticker);
      const livePrices = await fetchLiveQuotes(tickers);
      if (typeof updatePrices === "function" && Object.keys(livePrices).length > 0) {
        updatePrices(livePrices);
      }
    }
    loadQuotes();
  }, [positions.length]);

  const total = positions.reduce((sum: number, item: any) => sum + (item.marketValue ?? item.costBasis), 0);

  const assetSlices = useMemo(() =>
    positions.map((item: any) => ({ label: item.ticker, value: item.marketValue ?? item.costBasis }))
      .sort((a, b) => b.value - a.value),
  [positions]);

  const groupSlices = (field: "sector" | "segment") => {
    const map = new Map<string, number>();
    positions.forEach((item: any) => {
      const fund = findFund(item.ticker);
      const rawValue = field === "sector" ? fund?.sector : fund?.segment;
      const label = getNormalizedCategory(item.ticker, field, rawValue);
      map.set(label, (map.get(label) || 0) + (item.marketValue ?? item.costBasis));
    });
    return [...map].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };

  const sectorSlices = useMemo(() => groupSlices("sector"), [positions]);
  const segmentSlices = useMemo(() => groupSlices("segment"), [positions]);

  if (!ready) return <LoadingState />;

  return (
    <ScreenContainer style={styles.screen} edges={["top", "left", "right"]}>
      <FlatList
        data={positions}
        keyExtractor={(item) => item.ticker}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View style={styles.brand}>
                <View style={styles.brandIcon}>
                  <Text style={styles.brandGlyph}>▥</Text>
                </View>
                <Text style={styles.brandTitle}>Carteira FIIs</Text>
              </View>
              <Pressable onPress={() => router.push("/settings" as any)}>
                <Text style={styles.exit}>Ajustes</Text>
              </Pressable>
            </View>
            <ChartCard title="Peso por ativo" slices={assetSlices} total={total} />
            <ChartCard title="Peso por setor" slices={sectorSlices} total={total} />
            <ChartCard title="Peso por segmento" slices={segmentSlices} total={total} />
            <Text style={styles.sectionTitle}>Meus Ativos</Text>
          </View>
        }
        renderItem={({ item }) => {
          const fund = findFund(item.ticker);
          const sector = getNormalizedCategory(item.ticker, "sector", fund?.sector);

          // Calcula a cotação unitária atual baseada no valor de mercado atualizado ou preço médio
          const currentUnitPrice = item.quantity > 0 ? (item.marketValue ?? item.costBasis) / item.quantity : item.averagePrice;

          return (
            <Pressable
              onPress={() => router.push(`/fund/${item.ticker}` as any)}
              style={({ pressed }) => [styles.assetRow, pressed && styles.pressed]}
            >
              <View style={styles.assetLeft}>
                <Text style={styles.ticker}>{item.ticker}</Text>
                <Text style={styles.sub}>
                  {number(item.quantity, 0)} cotas · PM {currency(item.averagePrice)} · Cot. {currency(currentUnitPrice)}
                </Text>
                <Text style={item.unrealizedResult !== undefined && item.unrealizedResult < 0 ? styles.loss : styles.gain}>
                  {item.unrealizedResult !== undefined && item.unrealizedResult < 0 ? "▼" : "▲"} {currency(item.unrealizedResult, { sign: true })}
                </Text>
              </View>
              <View style={styles.assetRight}>
                <Text style={styles.market}>{currency(item.marketValue ?? item.costBasis)}</Text>
                <Text style={styles.sector}>{sector}</Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            title="Nenhuma posição ativa"
            description="Registre uma compra para começar a acompanhar a carteira."
            action={<Button title="Registrar compra" onPress={() => router.push("/transaction-form" as any)} />}
          />
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#071219" },
  content: { paddingBottom: 30, paddingHorizontal: 20 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 20,
    paddingTop: 16,
  },
  brand: { alignItems: "center", flexDirection: "row", gap: 14 },
  brandIcon: {
    alignItems: "center",
    backgroundColor: "#063F39",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  brandGlyph: { color: "#26D39A", fontSize: 25 },
  brandTitle: { color: "#F4F7F8", fontSize: 22, fontWeight: "800" },
  exit: { color: "#9AA7AF", fontSize: 16, fontWeight: "600" },
  card: {
    backgroundColor: "#17232C",
    borderColor: "#293943",
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 18,
    padding: 20,
  },
  cardTitle: { color: "#F4F7F8", fontSize: 18, fontWeight: "700", marginBottom: 12 },
  pieContainer: { alignItems: "center", justifyContent: "center", marginVertical: 4 },

  legendContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 4,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#101920",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderColor: "#293943",
    borderWidth: 1,
  },
  legendColorBox: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendText: {
    color: "#D0D7DE",
    fontSize: 11,
    fontWeight: "600",
  },
  legendPct: {
    color: "#84939C",
    fontWeight: "400",
  },

  pieTotal: {
    alignItems: "center",
    borderTopColor: "#293943",
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 16,
  },
  centerLabel: { color: "#87949D", fontSize: 14, fontWeight: "500" },
  centerValue: { color: "#F5F7F8", fontSize: 22, fontWeight: "800", marginTop: 4 },
  sectionTitle: { color: "#F4F7F8", fontSize: 22, fontWeight: "800", marginBottom: 15, marginTop: 32 },

  assetRow: {
    backgroundColor: "#17232C",
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    padding: 16,
    borderColor: "#293943",
    borderWidth: 1,
  },
  assetLeft: { flex: 1 },
  assetRight: { alignItems: "flex-end", justifyContent: "center" },
  ticker: { color: "#EEF4F5", fontSize: 18, fontWeight: "800" },

  sub: { color: "#9AA7AF", fontSize: 13, marginTop: 4, fontWeight: "500" },
  sector: { color: "#84939C", fontSize: 13, marginTop: 4, fontWeight: "500" },
  market: { color: "#F4F7F8", fontSize: 17, fontWeight: "800" },
  gain: { color: "#26D39A", fontSize: 13, fontWeight: "700", marginTop: 4 },
  loss: { color: "#FF6B78", fontSize: 13, fontWeight: "700", marginTop: 4 },
  pressed: { opacity: 0.7 },
});