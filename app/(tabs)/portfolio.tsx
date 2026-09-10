import { router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View, Dimensions } from "react-native";
import Svg, { G, Path, Circle, Text as SvgText } from "react-native-svg";
import React, { useMemo } from "react";
import { usePortfolio } from "@/lib/portfolio";
import { findFund } from "@/lib/fii-catalog";
import { ScreenContainer } from "@/components/screen-container";
import { Button, EmptyState, LoadingState } from "@/components/portfolio-ui";
import { currency, number } from "@/lib/format";

const SCREEN_WIDTH = Dimensions.get("window").width;

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

function ChartCard({ title, slices, marketValue, investedCost }: { title: string; slices: Slice[]; marketValue: number; investedCost: number }) {
  const cardWidth = SCREEN_WIDTH - 24;
  const chartHeight = 350;
  const centerX = cardWidth / 2;
  const centerY = chartHeight / 2 - 25; // Subido um pouco para dar espaço embaixo
  const radius = 85;

  const slicesData = useMemo(() => {
    let cumulativeAngle = 0;

    const initialSlices = slices.map((slice, index) => {
      const percentage = marketValue > 0 ? (slice.value / marketValue) * 100 : 0;
      const angle = (percentage / 100) * 360;
      const startAngle = cumulativeAngle;
      const endAngle = cumulativeAngle + angle;
      const midAngle = startAngle + angle / 2;
      cumulativeAngle += angle;

      const radians = ((midAngle - 90) * Math.PI) / 180;
      const isRight = Math.cos(radians) >= 0;

      const x1 = centerX + radius * Math.cos(radians);
      const y1 = centerY + radius * Math.sin(radians);
      const x2 = centerX + (radius + 20) * Math.cos(radians);
      const y2 = centerY + (radius + 20) * Math.sin(radians);

      return {
        ...slice,
        index,
        percentage,
        startAngle,
        endAngle,
        radians,
        isRight,
        color: CHART_COLORS[index % CHART_COLORS.length],
        x1, y1, x2, y2,
        shiftedY: y2
      };
    }).filter(s => s.percentage > 0);

    const minSpacing = 14;
    const adjustGroup = (group: any[]) => {
      if (group.length < 2) return;
      group.sort((a, b) => a.y2 - b.y2);
      for (let iter = 0; iter < 20; iter++) {
        let changed = false;
        for (let i = 0; i < group.length - 1; i++) {
          const s1 = group[i];
          const s2 = group[i+1];
          const diff = s2.shiftedY - s1.shiftedY;
          if (diff < minSpacing) {
            const overlap = (minSpacing - diff) / 2;
            s1.shiftedY -= overlap;
            s2.shiftedY += overlap;
            changed = true;
          }
        }
        if (!changed) break;
      }
      const minY = 20;
      const maxY = chartHeight - 70; // Espaço para os valores de mercado/custo
      group.forEach(s => {
        if (s.shiftedY < minY) s.shiftedY = minY;
        if (s.shiftedY > maxY) s.shiftedY = maxY;
      });
    };

    const rightSide = initialSlices.filter(s => s.isRight);
    const leftSide = initialSlices.filter(s => !s.isRight);
    adjustGroup(rightSide);
    adjustGroup(leftSide);

    return initialSlices.map(s => {
      const isRight = s.isRight;
      const x3Base = isRight ? s.x2 + 8 : s.x2 - 8;
      const x3Clamped = Math.max(30, Math.min(cardWidth - 30, x3Base));

      return {
        ...s,
        textX: isRight ? x3Clamped + 4 : x3Clamped - 4,
        textY: s.shiftedY + 3,
        x3: x3Clamped,
        textAnchor: isRight ? "start" : "end" as any
      };
    });
  }, [slices, marketValue]);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.pieContainer}>
        <Svg width={cardWidth} height={chartHeight}>
          <G>
            {slicesData.map((slice, index) => {
              const pathData = describeArc(centerX, centerY, radius, slice.startAngle, slice.endAngle);
              return (
                <React.Fragment key={`slice-group-${index}`}>
                  <Path d={pathData} fill={slice.color} stroke="#17232C" strokeWidth={2} />
                  <Path d={`M ${slice.x1},${slice.y1} L ${slice.x2},${slice.shiftedY} L ${slice.x3},${slice.shiftedY}`} stroke={slice.color} strokeWidth={1.2} fill="none" />
                  <Circle cx={slice.x1} cy={slice.y1} r={1.5} fill="#FFFFFF" />
                  <SvgText x={slice.textX} y={slice.textY} fill="#FFFFFF" fontSize="8.5" fontWeight="800" textAnchor={slice.textAnchor}>
                    {`${slice.label.length > 10 ? slice.label.slice(0, 8) + '.' : slice.label} (${slice.percentage.toFixed(0)}%)`}
                  </SvgText>
                </React.Fragment>
              );
            })}
          </G>
        </Svg>
      </View>
      <View style={styles.legendGrid}>
        {slicesData.map((slice, index) => (
          <View key={`legend-${index}`} style={styles.legendItem}>
            <View style={[styles.legendColorBox, { backgroundColor: slice.color }]} />
            <Text style={styles.legendText} numberOfLines={1} adjustsFontSizeToFit>{slice.label} <Text style={styles.legendPct}>{slice.percentage.toFixed(0)}%</Text></Text>
          </View>
        ))}
      </View>
      <View style={styles.pieTotal}>
        <View style={styles.totalRow}>
          <View style={styles.totalBlock}>
            <Text style={styles.centerLabel}>Valor de Mercado</Text>
            <Text style={styles.centerValue}>{currency(marketValue)}</Text>
          </View>
          <View style={styles.totalBlock}>
            <Text style={styles.centerLabel}>Custo de Aquisição</Text>
            <Text style={styles.centerValueSmall}>{currency(investedCost)}</Text>
          </View>
        </View>
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
    upperTicker.startsWith("GARE") ||
    upperTicker.startsWith("GALG") ||
    upperTicker.startsWith("BTLG");

  const isDevelopment =
    rawText.includes("DESENVOLVIMENTO") ||
    upperTicker.startsWith("MFII");

  if (field === "sector") {
    if (isDevelopment || isBrick) return "Tijolo";
    if (isPaper) return "Papel";
    return "Tijolo";
  }

  if (field === "segment") {
    if (isDevelopment) return "Desenv.";
    if (rawText.includes("LOGÍSTICA") || upperTicker.startsWith("HGLG") || upperTicker.startsWith("BTLG") || upperTicker.startsWith("GALG")) return "Logística";
    if (rawText.includes("RENDA URBANA") || upperTicker.startsWith("GARE") || upperTicker.startsWith("HGRU")) return "Renda Urbana";
    if (rawText.includes("SHOPPING") || upperTicker.startsWith("HGBS") || upperTicker.startsWith("HSML")) return "Shopping";
    if (rawText.includes("LAJES") || rawText.includes("CORPORATIVAS")) return "Lajes Corp.";
    if (isPaper) return "Recebíveis Imob.";
    if (rawText.includes("RESIDENCIAL")) return "Residencial";

    if (rawValue && rawValue !== "Outros" && rawValue.trim() !== "") return rawValue;
    return "Logística";
  }

  return rawValue || "Outros";
}

export default function PortfolioScreen() {
  const { ready, snapshot } = usePortfolio();
  const positions = snapshot.active;

  const assetSlices = useMemo(() =>
    positions.map((item) => ({ label: item.ticker, value: item.marketValue ?? item.costBasis }))
      .sort((a, b) => b.value - a.value),
  [positions]);

  const groupSlices = (field: "sector" | "segment") => {
    const map = new Map<string, number>();
    positions.forEach((item) => {
      const fund = findFund(item.ticker);
      const label = getNormalizedCategory(item.ticker, field, field === "sector" ? fund?.sector : fund?.segment);
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
              <View style={styles.brand}><View style={styles.brandIcon}><Text style={styles.brandGlyph}>▥</Text></View><Text style={styles.brandTitle}>Meus Ativos</Text></View>
              <Pressable onPress={() => router.push("/settings" as any)}><Text style={styles.exit}>⚙</Text></Pressable>
            </View>
            <ChartCard title="Peso por ativo" slices={assetSlices} marketValue={snapshot.marketValue} investedCost={snapshot.investedCost} />
            <ChartCard title="Peso por setor" slices={sectorSlices} marketValue={snapshot.marketValue} investedCost={snapshot.investedCost} />
            <ChartCard title="Peso por segmento" slices={segmentSlices} marketValue={snapshot.marketValue} investedCost={snapshot.investedCost} />
            <Text style={styles.sectionTitle}>Ativos</Text>
          </View>
        }
        renderItem={({ item }) => {
          const fund = findFund(item.ticker);
          const segment = getNormalizedCategory(item.ticker, "segment", fund?.segment);
          const isLoss = item.unrealizedResult !== undefined && item.unrealizedResult < 0;
          return (
            <Pressable onPress={() => router.push(`/fund/${item.ticker}` as any)} style={({ pressed }) => [styles.assetRow, pressed && styles.pressed]}>
              <View style={styles.assetLeft}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}><Text style={styles.ticker}>{item.ticker}</Text><Text style={isLoss ? styles.loss : styles.gain}>{isLoss ? "▼ " : "▲ +"}{currency(item.unrealizedResult, { sign: true })}</Text></View><Text style={styles.sub}>{number(item.quantity, 0)} cotas · PM {currency(item.averagePrice)}</Text><Text style={[styles.sub, { color: "#00E5FF", marginTop: 2 }]}>Cot. {currency(item.lastPrice ?? item.averagePrice)}</Text></View>
              <View style={styles.assetRight}><Text style={styles.market}>{currency(item.marketValue ?? item.costBasis)}</Text><Text style={styles.sector}>{segment}</Text></View>
            </Pressable>
          );
        }}
        ListEmptyComponent={<EmptyState title="Nenhuma posição ativa" description="Registre uma compra para começar a acompanhar a carteira." action={<Button title="Registrar compra" onPress={() => router.push("/transaction-form" as any)} />} />}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#071219" },
  content: { paddingBottom: 30, paddingHorizontal: 12 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingBottom: 20, paddingTop: 16 },
  brand: { alignItems: "center", flexDirection: "row", gap: 14 },
  brandIcon: { alignItems: "center", backgroundColor: "#063F39", borderRadius: 24, height: 48, justifyContent: "center", width: 48 },
  brandGlyph: { color: "#26D39A", fontSize: 25, textAlign: "center" },
  brandTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" },
  exit: { color: "#00E5FF", fontSize: 22 },
  card: { backgroundColor: "#17232C", borderColor: "#293943", borderRadius: 24, borderWidth: 1, marginTop: 18, padding: 12 },
  cardTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", marginBottom: 8 },
  pieContainer: { alignItems: "center", justifyContent: "center", marginVertical: 4, height: 350 },
  legendGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", gap: 6, marginTop: 8, marginBottom: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", backgroundColor: "#0F181F", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4, borderWidth: 1, borderColor: "#293943", minWidth: '22%', maxWidth: '48%', flexGrow: 1 },
  legendColorBox: { width: 8, height: 8, borderRadius: 2, marginRight: 4 },
  legendText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700", flexShrink: 1 },
  legendPct: { color: "#00E5FF", fontWeight: "800" },
  pieTotal: { borderTopColor: "#293943", borderTopWidth: 1, marginTop: 10, paddingTop: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  totalBlock: { alignItems: 'center' },
  centerLabel: { color: "#00E5FF", fontSize: 11, fontWeight: "600" },
  centerValue: { color: "#FFFFFF", fontSize: 18, fontWeight: "800", marginTop: 2 },
  centerValueSmall: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", marginTop: 2 },
  sectionTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "800", marginBottom: 15, marginTop: 32 },
  assetRow: { backgroundColor: "#17232C", borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10, borderColor: "#293943", borderWidth: 1 },
  assetLeft: { flex: 1, justifyContent: "center" },
  assetRight: { alignItems: "flex-end", justifyContent: "center", minWidth: 90 },
  ticker: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  sub: { color: "#FFD700", fontSize: 10, fontWeight: "700" },
  sector: { color: "#00E5FF", fontSize: 10, fontWeight: "700" },
  market: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  gain: { color: "#26D39A", fontSize: 10, fontWeight: "700" },
  loss: { color: "#FF5252", fontSize: 10, fontWeight: "700" },
  pressed: { opacity: 0.7 },
});
