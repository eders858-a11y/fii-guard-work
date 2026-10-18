import { router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View, Dimensions } from "react-native";
import Svg, { G, Path, Circle, Text as SvgText } from "react-native-svg";
import React, { useMemo, useEffect, useState } from "react";
import { usePortfolio } from "@/lib/portfolio";
import { findFund } from "@/lib/fii-catalog";
import { ScreenContainer } from "@/components/screen-container";
import { Button, EmptyState, LoadingState } from "@/components/portfolio-ui";
import { currency, number } from "@/lib/format";

const SCREEN_WIDTH = Dimensions.get("window").width;

/* ============================================================
   AJUSTE FÁCIL DO TAMANHO DA FONTE DOS TÍTULOS DOS CARDS
   ============================================================ */
const TAB_FONT_SIZE = 15;

const CHART_COLORS = [
  "#FF5252", "#40E0D0", "#FFD700", "#26D39A", "#FF7043",
  "#AB47BC", "#29B6F6", "#FFEE58", "#66BB6A", "#EC407A",
  "#7E57C2", "#26A69A", "#FFA726", "#42A5F5", "#9CCC65",
  "#CA4040", "#00B0FF", "#FFCA28", "#00C853", "#F06292"
];

type Slice = { label: string; marketVal: number; costVal: number };

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

function ChartCard({
  title,
  slices,
  marketValue,
  investedCost,
}: {
  title: string;
  slices: Slice[];
  marketValue: number;
  investedCost: number;
}) {
  const [viewMode, setViewMode] = useState<"market" | "cost">("market");

  const cardWidth = SCREEN_WIDTH - 24;
  const chartHeight = 350;
  const centerX = cardWidth / 2;
  const centerY = chartHeight / 2 - 25;
  const radius = 85;

  const totalBase = viewMode === "market" ? marketValue : investedCost;

  const slicesData = useMemo(() => {
    let cumulativeAngle = 0;

    const initialSlices = slices.map((slice, index) => {
      const val = viewMode === "market" ? slice.marketVal : slice.costVal;
      const percentage = totalBase > 0 ? (val / totalBase) * 100 : 0;

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
        x1,
        y1,
        x2,
        y2,
        shiftedY: y2
      };
    }).filter(s => s.percentage > 0);

    const minSpacing = 18;

    const adjustGroup = (group: any[]) => {
      if (group.length < 2) return;
      group.sort((a, b) => a.y2 - b.y2);

      for (let iter = 0; iter < 30; iter++) {
        let changed = false;
        for (let i = 0; i < group.length - 1; i++) {
          const s1 = group[i];
          const s2 = group[i + 1];
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

      const minY = 18;
      const maxY = chartHeight - 75;

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
      const x3Clamped = Math.max(28, Math.min(cardWidth - 28, x3Base));
      const textX = isRight ? Math.min(x3Clamped + 5, cardWidth - 8) : Math.max(x3Clamped - 5, 8);

      const displayText = `${s.label} (${s.percentage.toFixed(0)}%)`;
      const labelLength = displayText.length;
      let fontSize = 9.5;

      if (labelLength > 28) fontSize = 7.5;
      else if (labelLength > 23) fontSize = 8;
      else if (labelLength > 18) fontSize = 8.5;

      return {
        ...s,
        textX,
        textY: s.shiftedY + 3,
        x3: x3Clamped,
        textAnchor: isRight ? "start" : "end" as any,
        fontSize,
        displayText
      };
    });
  }, [slices, totalBase, cardWidth, viewMode]);

  return (
    <View style={styles.card}>
      {/* Cabeçalho alinhado de ponta a ponta (Título na esquerda, Peso aportes na direita) */}
      <View style={styles.cardHeaderRow}>
        <Pressable onPress={() => setViewMode("market")}>
          <Text
            style={[
              styles.tabBtnText,
              { fontSize: TAB_FONT_SIZE },
              viewMode === "market" ? styles.tabBtnActive : styles.tabBtnInactive
            ]}
          >
            {title}
          </Text>
        </Pressable>

        <Pressable onPress={() => setViewMode("cost")}>
          <Text
            style={[
              styles.tabBtnText,
              { fontSize: TAB_FONT_SIZE },
              viewMode === "cost" ? styles.tabBtnActive : styles.tabBtnInactive
            ]}
          >
            Peso aportes
          </Text>
        </Pressable>
      </View>

      <View style={styles.pieContainer}>
        <Svg width={cardWidth} height={chartHeight}>
          <G>
            {slicesData.map((slice, index) => {
              const pathData = describeArc(centerX, centerY, radius, slice.startAngle, slice.endAngle);

              return (
                <React.Fragment key={`slice-group-${index}`}>
                  <Path d={pathData} fill={slice.color} stroke="#17232C" strokeWidth={2} />
                  <Path
                    d={`M ${slice.x1},${slice.y1} L ${slice.x2},${slice.shiftedY} L ${slice.x3},${slice.shiftedY}`}
                    stroke={slice.color}
                    strokeWidth={1.2}
                    fill="none"
                  />
                  <Circle cx={slice.x1} cy={slice.y1} r={1.5} fill="#FFFFFF" />
                  <SvgText
                    x={slice.textX}
                    y={slice.textY}
                    fill="#FFFFFF"
                    fontSize={slice.fontSize}
                    fontWeight="800"
                    textAnchor={slice.textAnchor}
                  >
                    {slice.displayText}
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
            <Text style={styles.legendText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {slice.label}{" "}
              <Text style={styles.legendPct}>
                {slice.percentage.toFixed(0)}%
              </Text>
            </Text>
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
  const t = ticker.toUpperCase();
  const rawText = `${rawValue || ""}`.toUpperCase();

  const isUrban = t.startsWith("GARE") || t.startsWith("ALZR") || t.startsWith("TRXF") || t.startsWith("RBVA");
  const isLogistics = t.startsWith("HGLG") || t.startsWith("BTLG") || t.startsWith("GGRC");
  const isShopping = t.startsWith("HGBS") || t.startsWith("XPML") || t.startsWith("HSML");

  const isMultiestrategia =
    t.startsWith("AFHF") || t.startsWith("AZPL") || t.startsWith("BIME") || t.startsWith("BTHF") ||
    t.startsWith("BTRU") || t.startsWith("CCME") || t.startsWith("CPLG") || t.startsWith("CPOF") ||
    t.startsWith("CPTS") || t.startsWith("EMET") || t.startsWith("FZDB") || t.startsWith("GAME") ||
    t.startsWith("GZIT") || t.startsWith("IBBP") || t.startsWith("ITRI") || t.startsWith("JSAF") ||
    t.startsWith("KMNF") || t.startsWith("KNHF") || t.startsWith("MANA") || t.startsWith("MCRE") ||
    t.startsWith("MMVE") || t.startsWith("OXRL") || t.startsWith("PLAG") || t.startsWith("RBRX") ||
    t.startsWith("RVBI") || t.startsWith("SARE") || t.startsWith("SNME") || t.startsWith("SPMO") ||
    t.startsWith("SPXS") || t.startsWith("VGHF") || t.startsWith("VPPR") || t.startsWith("WHGR");

  const isReceivables = t.startsWith("VGIR") || t.startsWith("VGRI") || t.startsWith("KNCR") || rawText.includes("PAPEL") || rawText.includes("RECEBÍVEIS");
  const isInfra = t.startsWith("BODB") || rawText.includes("INFRA");
  const isHibrido = t.startsWith("KNRI") || rawText.includes("HÍBRIDO");
  const isDevelopment = t.startsWith("MFII") || rawText.includes("DESENVOLVIMENTO");
  const isLajes = t.startsWith("RECT") || t.startsWith("HGRE") || t.startsWith("BRCR") || rawText.includes("LAJES") || rawText.includes("CORPORATIVAS");

  if (field === "sector") {
    if (isMultiestrategia) return "Multiestrategia";
    if (isInfra) return "Infraestrutura";
    if (isReceivables) return "Papel";
    if (isHibrido) return "Hibrido";
    return "Tijolo";
  }

  if (field === "segment") {
    if (isMultiestrategia) return "Multiestrategia";
    if (isLogistics) return "Logística";
    if (isShopping) return "Shopping";
    if (isUrban) return "Renda Urban.";
    if (isInfra) return "Infraestrutura";
    if (isLajes) return "Lajes Corpo.";
    if (isDevelopment) return "Desenv.";
    if (isReceivables) return "Recebíveis";
    if (isHibrido) return "Hibrido";
    return "Outros";
  }

  return rawValue || "Outros";
}

export default function PortfolioScreen() {
  const { ready, snapshot, syncMarketData } = usePortfolio();

  useEffect(() => {
    if (!ready) return;
    syncMarketData().catch(() => undefined);
  }, [ready, syncMarketData]);

  const positions = snapshot.active;

  const assetSlices = useMemo(
    () =>
      positions
        .map((item: any) => ({
          label: item.ticker,
          marketVal: item.marketValue ?? item.costBasis,
          costVal: item.costBasis
        }))
        .sort((a: any, b: any) => b.marketVal - a.marketVal),
    [positions]
  );

  const groupSlices = (field: "sector" | "segment") => {
    const map = new Map<string, { marketVal: number; costVal: number }>();

    positions.forEach((item: any) => {
      const fund = findFund(item.ticker);
      const label = getNormalizedCategory(
        item.ticker,
        field,
        field === "sector" ? fund?.sector : fund?.segment
      );

      const current = map.get(label) || { marketVal: 0, costVal: 0 };
      map.set(label, {
        marketVal: current.marketVal + (item.marketValue ?? item.costBasis),
        costVal: current.costVal + item.costBasis
      });
    });

    return [...map]
      .map(([label, val]) => ({ label, marketVal: val.marketVal, costVal: val.costVal }))
      .sort((a, b) => b.marketVal - a.marketVal);
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

            <ChartCard
              title="Peso por ativo"
              slices={assetSlices}
              marketValue={snapshot.marketValue}
              investedCost={snapshot.investedCost}
            />

            <ChartCard
              title="Peso por setor"
              slices={sectorSlices}
              marketValue={snapshot.marketValue}
              investedCost={snapshot.investedCost}
            />

            <ChartCard
              title="Peso por segmento"
              slices={segmentSlices}
              marketValue={snapshot.marketValue}
              investedCost={snapshot.investedCost}
            />

            <Text style={styles.sectionTitle}>Ativos</Text>
          </View>
        }
        renderItem={({ item }) => {
          const fund = findFund(item.ticker);
          const segment = getNormalizedCategory(item.ticker, "segment", fund?.segment);
          const isLoss = item.unrealizedResult !== undefined && item.unrealizedResult < 0;
          const invested = item.costBasis;
          const market = item.marketValue ?? item.costBasis;
          const resultadoPercentual = invested > 0 ? ((market - invested) / invested) * 100 : 0;

          return (
            <Pressable
              onPress={() => router.push(`/fund/${item.ticker}` as any)}
              style={({ pressed }) => [styles.assetRow, pressed && styles.pressed]}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, position: "relative" }}>
                  <View style={{ width: 85 }}>
                    <Text style={styles.ticker}>{item.ticker}</Text>
                    <Text style={{ color: "#40E0D0", marginTop: 1, fontSize: 8, fontWeight: "700" }}>
                      {segment}
                    </Text>
                  </View>

                  <View style={{ width: 100 }}>
                    <Text style={styles.miniLabel}>
                      PM: <Text style={{ color: "#FFD700", fontWeight: "800" }}>{currency(item.averagePrice)}</Text>
                    </Text>
                  </View>

                  <View style={{ position: "absolute", left: 90, right: 0, alignItems: "center", pointerEvents: "none" }}>
                    <Text style={[styles.miniLabel, { color: isLoss ? "#FF5252" : "#26D39A", fontSize: 9 }]}>
                      RP:{" "}
                      <Text style={{ color: resultadoPercentual < 0 ? "#FF5252" : "#26D39A", fontWeight: "900" }}>
                        {resultadoPercentual >= 0 ? "+" : ""}{resultadoPercentual.toFixed(2)}%
                      </Text>
                    </Text>
                  </View>

                  <View style={{ flex: 1, alignItems: "flex-end" }}>
                    <Text style={styles.miniLabel}>
                      VC: <Text style={{ color: "#FFD700", fontWeight: "800" }}>{currency(invested)}</Text>
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", borderTopWidth: 0.5, borderTopColor: "rgba(255,255,255,0.1)", paddingTop: 8 }}>
                  <View style={{ width: 85 }}>
                    <Text style={[styles.miniValue, { color: "#FFD700" }]}>
                      {number(item.quantity, 0)} COTAS
                    </Text>
                  </View>

                  <View style={{ width: 100 }}>
                    <Text style={styles.miniLabel}>
                      PA: <Text style={{ color: "#00E5FF", fontWeight: "800" }}>{currency(item.lastPrice ?? item.averagePrice)}</Text>
                    </Text>
                  </View>

                  <View style={{ flex: 1, flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
                    <Text style={[styles.miniLabel, { color: isLoss ? "#FF5252" : "#26D39A", fontSize: 9 }]}>
                      RA: <Text style={{ fontWeight: "900" }}>{currency(item.unrealizedResult, { sign: true })}</Text>
                    </Text>

                    <Text style={styles.miniLabel}>
                      VM: <Text style={{ color: "#40E0D0", fontWeight: "800" }}>{currency(market)}</Text>
                    </Text>
                  </View>
                </View>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            title="Nenhuma posição ativa"
            description="Registre uma compra para começar a acompanhar a carteira."
            action={
              <Button title="Registrar compra" onPress={() => router.push("/transaction-form" as any)} />
            }
          />
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#071219" },
  content: { paddingBottom: 30, paddingHorizontal: 4 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingBottom: 20, paddingTop: 16 },
  brand: { alignItems: "center", flexDirection: "row", gap: 14 },
  brandIcon: { alignItems: "center", backgroundColor: "#063F39", borderRadius: 24, height: 48, justifyContent: "center", width: 48 },
  brandGlyph: { color: "#26D39A", fontSize: 25, textAlign: "center" },
  brandTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" },
  exit: { color: "#40E0D0", fontSize: 22 },

  card: {
    backgroundColor: "#17232C",
    borderColor: "#293943",
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 12
  },

  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between", // Empurra o título para a esquerda e o "Peso aportes" para a extrema direita
    alignItems: "center",
    marginBottom: 8
  },

  tabBtnText: {
    fontWeight: "700"
  },

  tabBtnActive: {
    color: "#FFFFFF"
  },

  tabBtnInactive: {
    color: "#4A5A65"
  },

  pieContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 2,
    height: 330
  },

  legendGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 6,
    marginTop: 8,
    marginBottom: 4
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
    minWidth: "22%",
    maxWidth: "48%",
    flexGrow: 1
  },

  legendColorBox: { width: 8, height: 8, borderRadius: 2, marginRight: 4 },
  legendText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700", flexShrink: 1 },
  legendPct: { color: "#40E0D0", fontWeight: "800" },

  pieTotal: { borderTopColor: "#293943", borderTopWidth: 1, marginTop: 10, paddingTop: 10 },
  totalRow: { flexDirection: "row", justifyContent: "space-around", alignItems: "center" },
  totalBlock: { alignItems: "center" },
  centerLabel: { color: "#40E0D0", fontSize: 11, fontWeight: "600" },
  centerValue: { color: "#FFFFFF", fontSize: 18, fontWeight: "800", marginTop: 2 },
  centerValueSmall: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", marginTop: 2 },

  sectionTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "800", marginBottom: 15, marginTop: 32 },

  assetRow: {
    backgroundColor: "#17232C",
    borderRadius: 12,
    marginBottom: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderColor: "#293943",
    borderWidth: 1
  },

  ticker: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  miniLabel: { color: "#888", fontSize: 10, fontWeight: "600" },
  miniValue: { color: "#FFF", fontSize: 11, fontWeight: "800" },
  pressed: { opacity: 0.7 }
});