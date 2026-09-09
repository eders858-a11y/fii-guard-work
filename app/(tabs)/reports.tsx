import { Pressable, StyleSheet, Text, View } from "react-native";
import { useState, useMemo } from "react";
import { usePortfolio, monthReport, yearReport } from "@/lib/portfolio";
import { ScreenContainer } from "@/components/screen-container";
import { Card, LoadingState, Metric, SectionHeader } from "@/components/portfolio-ui";
import { currency, monthLabel } from "@/lib/format";

const shift = (key: string, delta: number) => {
  const [year, month] = key.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};

export default function ReportsScreen() {
  const { ready, operations, dividends } = usePortfolio();
  const [selected, setSelected] = useState(new Date().toISOString().slice(0, 7));

  // CÁLCULOS PROTEGIDOS POR CACHE (useMemo)
  const report = useMemo(() => monthReport(operations, dividends, selected), [operations, dividends, selected]);
  const annual = useMemo(() => yearReport(operations, dividends, selected.slice(0, 4)), [operations, dividends, selected]);

  if (!ready) return <LoadingState />;

  const currentYear = selected.slice(0, 4);

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
      <View className="flex-1 pt-2">
        <Text className="text-sm font-medium text-muted">Histórico calculado</Text>
        <Text className="mt-1 text-3xl font-bold text-foreground">Resultados</Text>

        {/* SELETOR DE PERÍODO */}
        <View style={styles.periodPicker}>
          <Pressable onPress={() => setSelected(shift(selected, -1))} style={styles.periodBtn}>
            <Text style={styles.periodArrow}>‹</Text>
          </Pressable>
          <Text style={styles.periodText}>{monthLabel(selected)}</Text>
          <Pressable onPress={() => setSelected(shift(selected, 1))} style={styles.periodBtn}>
            <Text style={styles.periodArrow}>›</Text>
          </Pressable>
        </View>

        {/* CARD DE FLUXO LÍQUIDO (O que entrou vs o que saiu) */}
        <Card className="mb-5 bg-surface" style={{ borderColor: "#2c2c2c", borderWidth: 1 }}>
          <Text style={{ color: "#aaa", fontSize: 12 }}>Fluxo líquido do mês</Text>
          <Text style={{
              marginTop: 4,
              fontSize: 28,
              fontWeight: "bold",
              color: report.netCashFlow >= 0 ? "#00B894" : "#ff5252"
          }}>
            {currency(report.netCashFlow)}
          </Text>
          <Text style={{ color: "#718096", fontSize: 11, marginTop: 8 }}>
            Aportes + proventos acumulados no período.
          </Text>
        </Card>

        <SectionHeader title="Resumo mensal" />

        <Card className="mb-5">
          <View className="flex-row gap-4">
            <Metric label="Aportes" value={currency(report.purchaseTotal)} />
            <Metric label="Vendas líquidas" value={currency(report.saleTotal)} />
          </View>

          <View className="mt-5 flex-row gap-4 border-t border-border pt-4">
            <Metric label="Rendimentos" value={currency(report.incomeTotal)} tone="positive" />
            <Metric label="Amortizações" value={currency(report.amortizationTotal)} tone="warning" />
          </View>

          <View className="mt-5 border-t border-border pt-4">
            <Metric
              label="Resultado realizado"
              value={currency(report.realizedResult, { sign: true })}
              tone={report.realizedResult >= 0 ? "positive" : "negative"}
              helper={`${report.movementCount} movimentações no mês`}
            />
          </View>
        </Card>

        <SectionHeader title={`Acumulado em ${currentYear}`} />

        <Card>
          <View className="flex-row gap-4">
            <Metric label="Rendimentos" value={currency(annual.incomeTotal)} tone="positive" />
            <Metric
              label="Resultado realizado"
              value={currency(annual.realizedResult, { sign: true })}
              tone={annual.realizedResult >= 0 ? "positive" : "negative"}
            />
          </View>
          <View className="mt-4 border-t border-border pt-4">
             <Text className="text-xs text-muted">Total de aportes no ano: {currency(annual.purchaseTotal)}</Text>
          </View>
        </Card>

        <Text className="mt-5 text-center text-xs leading-5 text-muted">
          A virada de mês e ano é automática, baseada na data dos seus lançamentos.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  periodPicker: {
    marginVertical: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2c2c2c",
    backgroundColor: "#1e1e1e",
    padding: 8,
  },
  periodBtn: {
    alignItems: "center",
    borderRadius: 12,
    height: 40,
    justifyContent: "center",
    width: 40,
    backgroundColor: "#263B72",
  },
  periodArrow: {
    fontSize: 22,
    color: "#FFFFFF",
  },
  periodText: {
    fontSize: 16,
    fontWeight: "bold",
    textTransform: "capitalize",
    color: "#FFFFFF",
  },
});
