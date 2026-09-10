import React, { useState, useEffect, useMemo } from "react";
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Linking, ActivityIndicator, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { Ionicons } from "@expo/vector-icons";
import { fetchRelatorios } from "@/lib/brapi-proventos";
import { usePortfolio, normalizeTicker } from "@/lib/portfolio";
import { findFund } from "@/lib/fii-catalog";

const ITENS_POR_PAGINA = 15;

export default function EventosScreen() {
  const { operations } = usePortfolio();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState("");
  const [limiteExibicao, setLimiteExibicao] = useState(ITENS_POR_PAGINA);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [eventosList, setEventosList] = useState<any[]>([]);

  // Identifica quais FIIs o usuário realmente possui
  const meusTickers = useMemo(() => {
    const unique = new Set<string>();
    (operations || []).forEach((op: any) => {
      const tk = normalizeTicker(op.ticker);
      if (tk) unique.add(tk);
    });
    return Array.from(unique);
  }, [operations]);

  useEffect(() => {
    async function carregarRelatorios() {
      if (meusTickers.length === 0) {
        setCarregando(false);
        setEventosList([]);
        return;
      }

      setCarregando(true);
      try {
        // Busca documentos reais no FNET/BRAPI apenas para os FIIs da carteira
        const dados = await fetchRelatorios(meusTickers);

        const formatados = dados.map((item: any) => ({
          id: item.id || String(Math.random()),
          categoria: item.titulo || item.categoria || "Relatório",
          dtEntrega: item.dataEntrega || "--/--/----",
          dtReferencia: item.dataReferencia || "--/--/----",
          titulo: item.subtitulo || "Relatório Gerencial",
          subtitulo: item.subtitulo || "Relatório Gerencial",
          protocoloId: item.protocoloId,
          tickerBadge: `FII ${item.ticker}`,
          ticker: item.ticker,
          name: findFund(item.ticker)?.name || ""
        }));

        setEventosList(formatados);
      } catch (err) {
        console.warn("Erro ao buscar eventos:", err);
      } finally {
        setCarregando(false);
      }
    }
    carregarRelatorios();
  }, [meusTickers]);

  const filteredEvents = eventosList.filter(
    (item) =>
      item.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.protocoloId?.includes(searchQuery) ||
      item.categoria.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const eventosExibidos = filteredEvents.slice(0, limiteExibicao);

  const carregarMaisItens = () => {
    if (carregandoMais || limiteExibicao >= filteredEvents.length) return;

    setCarregandoMais(true);
    setTimeout(() => {
      setLimiteExibicao((prev) => prev + ITENS_POR_PAGINA);
      setCarregandoMais(false);
    }, 300);
  };

  const abrirPdfDocumento = async (protocoloId: string) => {
    const url = `https://fnet.bmfbovespa.com.br/fnet/publico/visualizarDocumento?cvm=true&id=${protocoloId}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      }
    } catch (error) {
      console.error("Erro ao abrir PDF FNET:", error);
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={[styles.card, { backgroundColor: "#2A2E33", borderColor: "#3A3F46" }]}>
      <View style={styles.cardTopRow}>
        <Text style={styles.categoryTitle}>{item.categoria}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.tickerBadge}</Text>
        </View>
      </View>

      <Text style={styles.dateText}>
        Dt. Entrega {item.dtEntrega}   &nbsp;&nbsp; Dt. Referência {item.dtReferencia}
      </Text>

      <Text style={styles.mainTitle}>{item.titulo}</Text>
      <Text style={styles.subTitle}>{item.subtitulo} ({item.name})</Text>

      <TouchableOpacity
        style={styles.protocolRow}
        onPress={() => abrirPdfDocumento(item.protocoloId)}
      >
        <Ionicons name="document-text" size={14} color="#4DA6FF" style={{ marginRight: 4 }} />
        <Text style={styles.protocolText}>Abrir Relatório PDF de {item.ticker}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.tint }]}>Anúncios: Meus FIIs ({filteredEvents.length})</Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={20} color={colors.icon || "#888"} style={styles.searchIcon} />
          <TextInput
            style={[styles.input, { color: colors.text }]}
            placeholder="Buscar nos anúncios da carteira..."
            placeholderTextColor={colors.icon || "#888"}
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              setLimiteExibicao(ITENS_POR_PAGINA);
            }}
          />
          {searchQuery.length > 0 && (
            <Ionicons name="close-circle" size={18} color={colors.icon || "#888"} onPress={() => setSearchQuery("")} />
          )}
        </View>
      </View>

      <FlatList
        data={eventosExibidos}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.content}
        onEndReached={carregarMaisItens}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          carregando ? (
            <View style={styles.loaderMore}>
              <ActivityIndicator size="large" color={colors.tint} />
              <Text style={[styles.loaderText, { color: colors.icon || "#888", marginTop: 10 }]}>Buscando protocolos reais da sua carteira...</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          carregandoMais ? (
            <View style={styles.loaderMore}>
              <ActivityIndicator size="small" color={colors.tint} />
              <Text style={[styles.loaderText, { color: colors.icon || "#888" }]}>Carregando mais ativos...</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          !carregando ? (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.icon || "#888" }]}>Nenhum anúncio recente encontrado para sua carteira.</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
  title: { fontSize: 20, fontWeight: "bold", textAlign: "center" },
  searchContainer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  searchBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, height: 44, borderRadius: 10, borderWidth: 1 },
  searchIcon: { marginRight: 8 },
  input: { flex: 1, fontSize: 15 },
  content: { padding: 16, paddingBottom: 40 },
  card: { padding: 16, borderRadius: 10, borderWidth: 1, marginBottom: 12, elevation: 3 },
  cardTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  categoryTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "bold", flex: 1 },
  badge: { backgroundColor: "#2ECC71", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  badgeText: { color: "#000000", fontSize: 11, fontWeight: "bold" },
  dateText: { color: "#AAAAAA", fontSize: 11, marginBottom: 8 },
  mainTitle: { color: "#E0E0E0", fontSize: 13, fontWeight: "500", marginBottom: 2 },
  subTitle: { color: "#CCCCCC", fontSize: 13, marginBottom: 10 },
  protocolRow: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", marginTop: 4, paddingVertical: 2 },
  protocolText: { color: "#4DA6FF", fontSize: 13, fontWeight: "600", textDecorationLine: "underline" },
  loaderMore: { flexDirection: "row", justifyContent: "center", alignItems: "center", paddingVertical: 16, flexWrap: 'wrap' },
  loaderText: { marginLeft: 8, fontSize: 13, textAlign: 'center', width: '100%' },
  emptyContainer: { alignItems: "center", justifyContent: "center", marginTop: 40 },
  emptyText: { fontSize: 14 }
});
