import { ScrollView, Text, View, StyleSheet } from "react-native";
import { useMemo, useState } from "react";
import { usePortfolio } from "@/lib/portfolio";
import { calculateDarfYear } from "@/lib/darf-calculations";
import { ScreenContainer } from "@/components/screen-container";
import { Button } from "@/components/portfolio-ui";
import { currency, monthLabel } from "@/lib/format";

const card = { backgroundColor: "#17232C", borderColor: "#293943", borderRadius: 26, borderWidth: 1, padding: 22 };

export default function DarfScreen() {
  const { operations } = usePortfolio();
  const [selected, setSelected] = useState(new Date().getFullYear());

  const allRows = useMemo(() => calculateDarfYear(operations, selected), [operations, selected]);

  const totalResult = allRows.reduce((sum, row) => sum + row.realizedResult, 0);
  const finalLoss = allRows.length > 0 ? (allRows.at(-1)?.lossCarry ?? 0) : 0;

  return (
    <ScreenContainer style={{ backgroundColor: "#071219" }} className="px-5" edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={{ color: "#F4F7F8", fontSize: 22, fontWeight: "800" }}>Carteira FIIs</Text>
        </View>

        <Text style={{ color: "#F4F7F8", fontSize: 30, fontWeight: "800", marginTop: 28 }}>DARF</Text>
        <Text style={{ color: "#AAB6BE", fontSize: 16, lineHeight: 23, marginTop: 7 }}>
          Apuração anual. O saldo zera na virada do ano para a declaração anual.
        </Text>

        <View style={styles.yearSelector}>
          <Button compact title="‹ Ano" variant="secondary" onPress={() => setSelected((v) => v - 1)} />
          <Text style={{ color: "#F4F7F8", fontSize: 20, fontWeight: "800" }}>{selected}</Text>
          <Button compact title="Próx. ›" variant="secondary" onPress={() => setSelected((v) => v + 1)} />
        </View>

        {/* RESUMO DO ANO */}
        <View style={{ ...card, marginTop: 18 }}>
          <Text style={{ color: "#F4F7F8", fontSize: 19, fontWeight: "800" }}>Resumo de {selected}</Text>

          <Text style={styles.summaryLabel}>
            Resultado realizado: <Text style={{ color: totalResult < 0 ? "#FF6B78" : "#26D39A", fontWeight: "800" }}>{currency(totalResult)}</Text>
          </Text>

          <Text style={styles.summaryLabel}>
            Prejuízo acumulado: <Text style={{ color: finalLoss < 0 ? "#FF6B78" : "#F4F7F8", fontWeight: "800" }}>{currency(finalLoss)}</Text>
          </Text>
        </View>

        {/* LISTAGEM DOS 12 MESES */}
        {allRows.map((row) => {
          const hasVendas = row.hasSales;
          const prejuizoGeradoNoMes = row.realizedResult < 0;
          const temDarfAPagar = row.taxDue > 0;

          return (
            <View key={row.key} style={{ ...card, marginTop: 12, opacity: hasVendas ? 1 : 0.6 }}>
              <Text style={{ color: "#F4F7F8", fontSize: 18, fontWeight: "800" }}>{monthLabel(row.key).split(" de")[0]}</Text>

              {!hasVendas ? (
                 <Text style={{ color: "#7E8B94", fontSize: 14, marginTop: 10 }}>Sem movimentações no mês</Text>
              ) : (
                <View>
                  <View style={styles.detailsBox}>
                    {row.details.map((d, i) => {
                      const isLoss = d.result < 0;
                      return (
                        <View key={`${row.key}-${d.ticker}-${i}`} style={styles.detailRow}>
                          <Text style={styles.detailText}>
                            ATIVO: {d.ticker}, VENDA, DIA:{d.day}, COTAS:{d.quantity} {" "}
                            <Text style={{ color: isLoss ? "#FF6B78" : "#26D39A", fontWeight: "800" }}>
                              {isLoss ? "PREJUÍZO" : "LUCRO"}: {currency(Math.abs(d.result))}
                            </Text>
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  <Text style={styles.rowLabel}>
                    Vendas líquidas: <Text style={{ color: "#F4F7F8" }}>{currency(row.grossSales - row.saleCosts)}</Text>
                  </Text>

                  <Text style={styles.rowLabel}>
                    {prejuizoGeradoNoMes ? "Prejuízo a compensar" : "Lucro apurado"}:{" "}
                    <Text style={{ color: prejuizoGeradoNoMes ? "#FF6B78" : "#26D39A", fontWeight: "700" }}>
                      {currency(row.realizedResult)}
                    </Text>
                  </Text>

                  <Text style={styles.rowLabel}>
                    Lucro a compensar:{" "}
                    <Text style={{ color: "#26D39A", fontWeight: "700" }}>
                      {row.lossBefore < 0 ? "R$ 0,00" : currency(row.lossBefore)}
                    </Text>
                  </Text>

                  {temDarfAPagar && (
                    <Text style={{ color: "#26D39A", fontSize: 16, fontWeight: "800", marginTop: 12 }}>
                      Valor estimado a pagar: {currency(row.taxDue)}
                    </Text>
                  )}

                  {prejuizoGeradoNoMes && (
                    <Text style={{ color: "#FF6B78", fontSize: 16, fontWeight: "800", marginTop: 12 }}>
                      Prejuízo para carregar: R$ {Math.abs(row.realizedResult).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  )}
                </View>
              )}
            </View>
          );
        })}

        <Text style={styles.footerNote}>
          O prejuízo apurado em um ano deve ser informado na declaração para ser compensado no ano seguinte.
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { borderBottomColor: "#1D2A32", borderBottomWidth: 1, marginHorizontal: -20, paddingHorizontal: 30, paddingBottom: 20, paddingTop: 16 },
  yearSelector: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 20 },
  summaryLabel: { color: "#AAB6BE", fontSize: 16, marginTop: 12 },
  rowLabel: { color: "#AAB6BE", fontSize: 15, marginTop: 8 },
  footerNote: { color: "#7E8B94", fontSize: 12, lineHeight: 18, marginTop: 30, textAlign: "center", paddingHorizontal: 20 },
  detailsBox: { backgroundColor: "rgba(0,0,0,0.2)", borderRadius: 12, padding: 12, marginVertical: 10 },
  detailRow: { paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.1)" },
  detailText: { color: "#F4F7F8", fontSize: 11, fontWeight: "600" }
});
