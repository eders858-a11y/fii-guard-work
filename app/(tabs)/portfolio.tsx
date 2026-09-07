import { router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View, Dimensions } from "react-native";
import Svg, { G, Path, Circle, Text as SvgText, Rect } from "react-native-svg";
import { useMemo } from "react";
import { usePortfolio } from "@/lib/portfolio";
import { findFund } from "@/lib/fii-catalog";
import { ScreenContainer } from "@/components/screen-container";
import { Button, EmptyState, LoadingState } from "@/components/portfolio-ui";
import { currency, number } from "@/lib/format";

const SCREEN_WIDTH = Dimensions.get("window").width;

// Cores vivas e contrastantes que se sobrepõem perfeitamente ao fundo escuro (sem tons cinzas apagados)
const CHART_COLORS = [
  "#FF5252", "#00E5FF", "#FFD700", "#26D39A", "#FF7043",
  "#AB47BC", "#29B6F6", "#FFEE58", "#66BB6A", "#EC407A",
  "#7E57C2", "#26A69A", "#FFA726", "#42A5F5", "#9CCC65",
  "#CA4040", "#00B0FF", "#FFCA28", "#00C853", "#F06292"
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
  const chartHeight = 190; // Compactado para abrir espaço para as legendas em grid horizontal abaixo
  const centerX = cardWidth / 2;
  const centerY = chartHeight / 2 + 5;
  const radius = 58;

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

      {/* Legendas organizadas em blocos compactos lado a lado (estilo Donut com tags horizontais) */}
      <View style={styles.legendGrid}>
        {slicesData.map((slice, index) => {
          if (slice.percentage <= 0) return null;
          return (
            <View key={`legend-${index}`} style={styles.legendItem}>
              <View style={[styles.legendColorBox, { backgroundColor: slice.color }]} />
              <Text style={styles.legendText} numberOfLines={1}>
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

export default function PortfolioScreen() {
  const { ready, snapshot } = usePortfolio();
  const positions = snapshot.active;
  const total = positions.reduce((sum, item) => sum + (item.marketValue ?? item.costBasis), 0);

  const assetSlices = useMemo(() =>
    positions.map((item) => ({ label: item.ticker, value: item.marketValue ?? item.costBasis }))
      .sort((a, b) => b.value - a.value),
  [positions]);

  const groupSlices = (field: "sector" | "segment") => {
    const map = new Map<string, number>();
    positions.forEach((item) => {
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
                <Text style={styles.brandTitle}>Meus Ativos</Text>
              </View>
              <Pressable onPress={() => router.push("/settings" as any)}>
                <Text style={styles.exit}>⚙</Text>
              </Pressable>
            </View>
            <ChartCard title="Peso por ativo" slices={assetSlices} total={total} />
            <ChartCard title="Peso por setor" slices={sectorSlices} total={total} />
            <ChartCard title="Peso por segmento" slices={segmentSlices} total={total} />
            <Text style={styles.sectionTitle}>Ativos</Text>
          </View>
        }
        renderItem={({ item }) => {
          const fund = findFund(item.ticker);
          const segment = getNormalizedCategory(item.ticker, "segment", fund?.segment);
          const currentPrice = item.lastPrice ?? item.averagePrice;
          const isLoss = item.unrealizedResult !== undefined && item.unrealizedResult < 0;

          return (
            <Pressable
              onPress={() => router.push(`/fund/${item.ticker}` as any)}
              style={({ pressed }) => [styles.assetRow, pressed && styles.pressed]}
            >
              <View style={styles.assetLeft}>
                <Text style={styles.ticker}>{item.ticker}</Text>
                <Text style={styles.sub}>
                  {number(item.quantity, 0)} cotas · PM {currency(item.averagePrice)} · Cot. {currency(currentPrice)}
                </Text>
                <Text style={isLoss ? styles.loss : styles.gain}>
                  {isLoss ? "▼ " : "▲ +"}{currency(item.unrealizedResult, { sign: true })}
                </Text>
              </View>
              <View style={styles.assetRight}>
                <Text style={styles.market}>{currency(item.marketValue ?? item.costBasis)}</Text>
                <Text style={styles.sector}>{segment}</Text>
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
  brandTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" },
  exit: { color: "#00E5FF", fontSize: 22 },
  card: {
    backgroundColor: "#17232C",
    borderColor: "#293943",
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 18,
    padding: 16,
  },
  cardTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", marginBottom: 8 },
  pieContainer: { alignItems: "center", justifyContent: "center", marginVertical: 2 },

  // Grid horizontal compacta para acomodar até 20 ativos perfeitamente embaixo do gráfico
  legendGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 6,
    marginTop: 10,
    marginBottom: 4,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F181F",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#293943",
    minWidth: '22%',
    maxWidth: '31%',
    flexGrow: 1,
  },
  legendColorBox: {
    width: 8,
    height: 8,
    borderRadius: 2,
    marginRight: 4,
  },
  legendText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    flexShrink: 1,
  },
  legendPct: {
    color: "#00E5FF",
    fontWeight: "800",
  },

  pieTotal: {
    alignItems: "center",
    borderTopColor: "#293943",
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 12,
  },
  centerLabel: { color: "#00E5FF", fontSize: 12, fontWeight: "600" },
  centerValue: { color: "#FFFFFF", fontSize: 20, fontWeight: "800", marginTop: 2 },
  sectionTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "800", marginBottom: 15, marginTop: 32 },

  assetRow: {
    backgroundColor: "#17232C",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderColor: "#293943",
    borderWidth: 1,
  },
  assetLeft: { flex: 1, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  assetRight: { alignItems: "flex-end", justifyContent: "center", minWidth: 90 },
  ticker: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },

  sub: { color: "#FFD700", fontSize: 10, fontWeight: "700" },
  sector: { color: "#00E5FF", fontSize: 10, fontWeight: "700" },
  market: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  gain: { color: "#26D39A", fontSize: 10, fontWeight: "700" },
  loss: { color: "#FF5252", fontSize: 10, fontWeight: "700" },
  pressed: { opacity: 0.7 },
});