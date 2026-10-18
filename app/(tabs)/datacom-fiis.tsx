import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { usePortfolio } from "@/lib/portfolio";
import {
  obterDiasUteisB3,
  obterRegraDataCom,
  type DataComRegra,
} from "@/lib/datacom";

type DataComItem = {
  ticker: string;
  regra: DataComRegra;
  data: string | null;
  ordem: number;
};

function normalizarTicker(value: string): string {
  return value.toUpperCase().trim();
}

function formatarData(iso: string | null): string {
  if (!iso) return "Não calculada";

  const partes = iso.split("-");
  if (partes.length !== 3) return iso;

  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function nomeMes(mes: number): string {
  const nomes = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  return nomes[mes - 1] || "";
}

function descricaoRegra(regra: DataComRegra): string {
  if (regra.tipo === "dia") {
    return `${regra.dia}º dia útil`;
  }

  if (regra.tipo === "faixa") {
    return `Entre o ${regra.inicio}º e o ${regra.fim}º dia útil`;
  }

  return "Último dia útil";
}

function obterDataPeloDiaUtil(
  diasUteis: string[],
  regra: DataComRegra
): string | null {
  if (!diasUteis.length) return null;

  if (regra.tipo === "dia") {
    return diasUteis[regra.dia - 1] || null;
  }

  if (regra.tipo === "faixa") {
    return (
      diasUteis[regra.inicio - 1] ||
      diasUteis[regra.fim - 1] ||
      null
    );
  }

  return diasUteis[diasUteis.length - 1] || null;
}

function ordenarPorData(
  a: DataComItem,
  b: DataComItem
): number {
  if (!a.data && !b.data) {
    return a.ticker.localeCompare(b.ticker);
  }

  if (!a.data) return 1;
  if (!b.data) return -1;

  if (a.data === b.data) {
    return a.ticker.localeCompare(b.ticker);
  }

  return a.data.localeCompare(b.data);
}

export default function DataComScreen() {
  const { snapshot, operations } = usePortfolio();

  const [ano, setAno] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(new Date().getMonth() + 1);

  // BUSCA AUTOMÁTICA DE TODOS OS FIIS ATIVOS NA CARTEIRA DO USUÁRIO
  const tickersCarteira = useMemo(() => {
    if (snapshot?.active && snapshot.active.length > 0) {
      return snapshot.active
        .filter(
          (position: { ticker: string; quantity: number }) =>
            position.ticker && Number(position.quantity) > 0
        )
        .map((position: { ticker: string }) =>
          normalizarTicker(position.ticker)
        );
    }

    // Fallback caso snapshot não esteja pronto: extrai tickers únicos das operações
    if (operations && operations.length > 0) {
      const setTickers = new Set<string>();
      operations.forEach((op: { ticker?: string }) => {
        if (op.ticker) setTickers.add(normalizarTicker(op.ticker));
      });
      return Array.from(setTickers);
    }

    return [];
  }, [snapshot?.active, operations]);

  // CÁLCULO 100% OFFLINE DOS DIAS ÚTEIS DA B3
  const diasUteis = useMemo(() => {
    return obterDiasUteisB3(ano, mes);
  }, [ano, mes]);

  const itens = useMemo<DataComItem[]>(() => {
    return tickersCarteira
      .map((ticker: string) => {
        const regra = obterRegraDataCom(ticker) || { tipo: "ultimo" as const };

        return {
          ticker,
          regra,
          data: obterDataPeloDiaUtil(diasUteis, regra),
          ordem:
            regra.tipo === "dia"
              ? regra.dia
              : regra.tipo === "faixa"
              ? regra.inicio
              : 999,
        };
      })
      .sort(ordenarPorData);
  }, [tickersCarteira, diasUteis]);

  const avancarMes = () => {
    if (mes === 12) {
      setAno((valor) => valor + 1);
      setMes(1);
      return;
    }

    setMes((valor) => valor + 1);
  };

  const voltarMes = () => {
    if (mes === 1) {
      setAno((valor) => valor - 1);
      setMes(12);
      return;
    }

    setMes((valor) => valor - 1);
  };

  const hoje = new Date();

  const mesAtual =
    hoje.getFullYear() === ano &&
    hoje.getMonth() + 1 === mes;

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 32,
        }}
      >
        <Text
          style={{
            fontSize: 28,
            fontWeight: "800",
            color: "#FFFFFF",
            marginBottom: 4,
          }}
        >
          Data Com
        </Text>

        <Text
          style={{
            fontSize: 14,
            opacity: 0.85,
            color: "#FFFFFF",
            marginBottom: 12,
          }}
        >
          Calendário estimado pela regra histórica de cada FII
          usando o calendário oficial de dias úteis da B3 (offline).
        </Text>

        {/* SELETOR DE MÊS COM ESTILO AZUL (#0B4F6C) */}
        <View style={styles.periodPicker}>
          <Pressable onPress={voltarMes} style={styles.periodBtn}>
            <Text style={styles.periodArrow}>‹</Text>
          </Pressable>

          <View style={{ alignItems: "center" }}>
            <Text style={styles.periodText}>
              {nomeMes(mes)} {ano}
            </Text>

            {mesAtual && (
              <Text style={styles.periodSubText}>
                Mês atual
              </Text>
            )}
          </View>

          <Pressable onPress={avancarMes} style={styles.periodBtn}>
            <Text style={styles.periodArrow}>›</Text>
          </Pressable>
        </View>

        {itens.length === 0 && (
          <View
            style={{
              padding: 20,
              borderRadius: 16,
              backgroundColor: "#1E1E1E",
              borderColor: "#2C2C2C",
              borderWidth: 1,
              marginTop: 8,
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "800",
                color: "#FFFFFF",
                marginBottom: 6,
              }}
            >
              Nenhum FII ativo encontrado na sua carteira
            </Text>

            <Text style={{ opacity: 0.7, color: "#FFFFFF" }}>
              Quando você cadastrar operações de compra de FIIs na sua carteira,
              as datas-com previstas para cada um aparecerão aqui automaticamente.
            </Text>
          </View>
        )}

        {/* CARDS DOS FIIS COM AZUL (#0B4F6C) COMO NA ABA EVENTOS */}
        {itens.map((item) => (
          <View
            key={`${item.ticker}-${item.data}`}
            style={styles.card}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.ticker}>
                  {item.ticker}
                </Text>

                <Text style={styles.regraText}>
                  {descricaoRegra(item.regra)}
                </Text>
              </View>

              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.dataText}>
                  {formatarData(item.data)}
                </Text>

                <Text style={styles.dataSubText}>
                  Data Com prevista
                </Text>
              </View>
            </View>
          </View>
        ))}

        {itens.length > 0 && (
          <View
            style={{
              marginTop: 8,
              padding: 14,
              borderRadius: 14,
              backgroundColor: "#1E1E1E",
              borderColor: "#2C2C2C",
              borderWidth: 1,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                lineHeight: 18,
                opacity: 0.8,
                color: "#FFFFFF",
              }}
            >
              A data exibida é calculada a partir da regra da base Data Com e
              do calendário oficial de negociação da B3 (100% offline). Ela
              serve como referência de planejamento; uma eventual divulgação
              oficial diferente deverá prevalecer.
            </Text>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  periodPicker: {
    marginVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2c2c2c",
    backgroundColor: "#1e1e1e",
    padding: 8,
    marginBottom: 16,
  },

  periodBtn: {
    alignItems: "center",
    borderRadius: 10,
    height: 38,
    justifyContent: "center",
    width: 38,
    backgroundColor: "#0B4F6C",
  },

  periodArrow: {
    fontSize: 22,
    color: "#FFFFFF",
    fontWeight: "bold",
  },

  periodText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF",
  },

  periodSubText: {
    fontSize: 11,
    marginTop: 2,
    color: "#08A6C7",
    fontWeight: "600",
  },

  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    backgroundColor: "#0B4F6C",
    borderColor: "#0B4F6C",
  },

  ticker: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  regraText: {
    marginTop: 4,
    fontSize: 13,
    color: "#FFFFFF",
    opacity: 0.85,
  },

  dataText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  dataSubText: {
    fontSize: 11,
    color: "#FFFFFF",
    opacity: 0.75,
    marginTop: 2,
  },
});
