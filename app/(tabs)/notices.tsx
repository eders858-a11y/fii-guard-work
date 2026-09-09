import React, { useState, useMemo, useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, Pressable, Linking, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from "@/components/screen-container";
import { usePortfolio } from "@/lib/portfolio";
import { useColors } from "@/hooks/use-colors";
import { currency } from "@/lib/format";

interface RelatorioItem {
  id: string;
  ticker: string;
  titulo: string;
  subtitulo: string;
  dataEntrega: string;
  dataReferencia: string;
  protocoloId: string;
}

export default function NoticesScreen() {
  const { snapshot, ready } = usePortfolio();
  const colors = useColors();
  const [loading, setLoading] = useState<boolean>(true);
  const [relatorios, setRelatorios] = useState<RelatorioItem[]>([]);

  const tickersKey = useMemo(() => {
    return snapshot.active.map(p => p.ticker).sort().join(',');
  }, [snapshot.active]);

  useEffect(() => {
    if (ready && tickersKey) {
      buscarRelatorios();
    }
  }, [ready, tickersKey]);

  const buscarRelatorios = async () => {
    if (!tickersKey) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // TENTA PRIMEIRO A SUA API NO RENDER (NOVA CONFIGURAÇÃO)
      const renderUrl = `https://fii-guard-work.onrender.com/relatorios?tickers=${tickersKey}`;
      const response = await fetch(renderUrl);

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          setRelatorios(data);
          setLoading(false);
          return;
        }
      }

      // SE A RENDER FALHAR OU ESTIVER VAZIA, TENTA A BRAPI (BACKUP)
      const token = snapshot.settings?.brapiToken || 'fZh138TebUi2JYGBJG75C6';
      const brapiUrl = `https://brapi.dev/api/v2/fii/reports?symbols=${tickersKey}&token=${token}`;
      const resB = await fetch(brapiUrl);
      const dataB = await resB.json();

      if (dataB && dataB.results) {
        const mapped: RelatorioItem[] = [];
        dataB.results.forEach((fund: any) => {
          if (fund.reports) {
            fund.reports.forEach((rep: any) => {
              mapped.push({
                id: rep.id?.toString() || Math.random().toString(),
                ticker: fund.symbol,
                titulo: rep.category || 'Comunicado',
                subtitulo: rep.label || 'Informe Oficial',
                dataEntrega: rep.deliveryDate || '',
                dataReferencia: rep.referenceDate || '',
                protocoloId: rep.id?.toString() || ''
              });
            });
          }
        });
        setRelatorios(mapped.sort((a, b) => b.dataEntrega.localeCompare(a.dataEntrega)).slice(0, 30));
      }
    } catch (error) {
      console.error("Erro ao buscar relatórios:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenProtocol = async (protocoloId: string) => {
    const url = `https://fnet.bmfbovespa.com.br/fnet/publico/visualizarDocumento?cvm=true&id=${protocoloId}`;
    try {
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert("Erro", "Não foi possível acessar o protocolo.");
    }
  };

  const getNoticeConfig = (titulo: string) => {
    const t = titulo.toUpperCase();
    if (t.includes("FATO RELEVANTE")) return { icon: "🚨", label: "Fato Relevante", color: "#FF5252" };
    if (t.includes("RENDIMENTO")) return { icon: "💰", label: "Rendimento", color: "#26D39A" };
    if (t.includes("AMORTIZA")) return { icon: "💸", label: "Amortização", color: "#FFD700" };
    return { icon: "📄", label: "Relatório Geral", color: "#00E5FF" };
  };

  const renderItem = ({ item }: { item: RelatorioItem }) => {
    const config = getNoticeConfig(item.titulo);

    return (
      <View style={[styles.noticeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.headerCard}>
          <View style={styles.typeTag}>
            <Text style={styles.iconText}>{config.icon}</Text>
            <Text style={[styles.typeLabel, { color: config.color }]}>{config.label}</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.ticker}</Text>
          </View>
        </View>

        <View style={styles.contentBody}>
          <Text style={styles.datesText}>
            Entrega: {item.dataEntrega}  •  Ref: {item.dataReferencia}
          </Text>

          <Text style={[styles.mainTitle, { color: colors.text }]}>{item.titulo}</Text>
          <Text style={styles.subTitle}>{item.subtitulo}</Text>

          <Pressable
            style={({ pressed }) => [styles.protocolBtn, pressed && styles.pressed]}
            onPress={() => handleOpenProtocol(item.protocoloId)}
          >
            <Ionicons name="document-text-outline" size={16} color="#00E5FF" style={{ marginRight: 8 }} />
            <Text style={styles.protocolText}>Protocolo {item.protocoloId} (FNET)</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <ScreenContainer style={styles.center} edges={["top"]}>
        <ActivityIndicator size="large" color="#00E5FF" />
        <Text style={{ color: '#888', marginTop: 15, fontWeight: '600' }}>Sincronizando anúncios...</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
      <View style={styles.topHeader}>
        <Text style={styles.eyebrow}>CENTRAL DE COMUNICADOS</Text>
        <Text className="mt-1 text-3xl font-bold text-foreground">Avisos</Text>
      </View>

      <FlatList
        data={relatorios}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={<View style={{ marginTop: 8, marginBottom: 16 }}><SectionHeader title="Publicações recentes" /></View>}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Nenhum comunicado recente encontrado para sua carteira.</Text>
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#071219' },
  topHeader: { paddingVertical: 16 },
  eyebrow: { color: "#888", fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  noticeCard: { borderRadius: 20, borderWidth: 1, marginBottom: 15, padding: 18 },
  headerCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  typeTag: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconText: { fontSize: 18 },
  typeLabel: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  badge: { backgroundColor: '#063F39', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  badgeText: { color: '#26D39A', fontSize: 12, fontWeight: '900' },
  contentBody: { flex: 1 },
  datesText: { color: '#718096', fontSize: 11, marginBottom: 8, fontWeight: '700' },
  mainTitle: { fontSize: 16, fontWeight: "800", lineHeight: 22, marginBottom: 4 },
  subTitle: { color: "#AAB6BE", fontSize: 13, marginBottom: 18, lineHeight: 18 },
  protocolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,229,255,0.08)',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12
  },
  protocolText: { color: "#00E5FF", fontSize: 13, fontWeight: "700" },
  emptyText: { color: '#718096', textAlign: 'center', marginTop: 40, paddingHorizontal: 40, lineHeight: 20 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] }
});
