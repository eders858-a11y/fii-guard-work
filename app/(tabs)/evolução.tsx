import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  Dimensions,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { calcularEvolucaoPortfolio, DatasetEvolucao } from '../../lib/evolução';

const screenWidth = Dimensions.get('window').width;

export default function EvolucaoScreen() {
  const [dados, setDados] = useState<DatasetEvolucao | null>(null);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [atualizando, setAtualizando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);
  const [periodoSelecionado, setPeriodoSelecionado] = useState('Todo o período');

  const carregarDados = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setAtualizando(true);
      else setCarregando(true);

      setErro(null);
      const resultado = await calcularEvolucaoPortfolio();
      setDados(resultado);
    } catch (err: any) {
      console.error('[EvolucaoScreen] Erro:', err);
      setErro(err?.message || 'Não foi possível carregar a evolução da carteira.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  if (carregando && !dados) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#E91E63" />
        <Text style={styles.loadingText}>Carregando evolução da carteira...</Text>
      </View>
    );
  }

  if (erro && !dados) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{erro}</Text>
      </View>
    );
  }

  // Prepara os dados para o gráfico
  const labels = dados?.carteira?.map((p) => p.label || '') || [];
  const valoresCarteira = dados?.carteira?.map((p) => p.value) || [100];
  const valoresIfix = dados?.ifix?.map((p) => p.value) || [100];
  const valoresCdi = dados?.cdi?.map((p) => p.value) || [100];
  const valoresIpca = dados?.ipca?.map((p) => p.value) || [100];

  const ultimaCarteira = Number((valoresCarteira[valoresCarteira.length - 1] ?? 100).toFixed(2));
  const ultimoIfix = Number((valoresIfix[valoresIfix.length - 1] ?? 100).toFixed(2));
  const ultimoCdi = Number((valoresCdi[valoresCdi.length - 1] ?? 100).toFixed(2));
  const ultimoIpca = Number((valoresIpca[valoresIpca.length - 1] ?? 100).toFixed(2));

  const rentabilidadeCarteiraPct = Number((ultimaCarteira - 100).toFixed(1));
  const rentabilidadeIfixPct = Number((ultimoIfix - 100).toFixed(1));
  const rentabilidadeCdiPct = Number((ultimoCdi - 100).toFixed(1));
  const rentabilidadeIpcaPct = Number((ultimoIpca - 100).toFixed(1));

  // Cálculo de pontos percentuais (p.p.) comparativos
  const diffIpca = Number((rentabilidadeCarteiraPct - rentabilidadeIpcaPct).toFixed(1));
  const diffIfix = Number((rentabilidadeCarteiraPct - rentabilidadeIfixPct).toFixed(1));
  const diffCdi = Number((rentabilidadeCarteiraPct - rentabilidadeCdiPct).toFixed(1));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={atualizando}
          onRefresh={() => carregarDados(true)}
          tintColor="#E91E63"
          colors={['#E91E63']}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Evolução</Text>
          <Text style={styles.subtitle}>Evolução da sua carteira vs. mercado</Text>
        </View>
        <TouchableOpacity style={styles.periodButton}>
          <Text style={styles.periodButtonText}>{periodoSelecionado}</Text>
          <Ionicons name="chevron-down" size={16} color="#B0BEC5" />
        </TouchableOpacity>
      </View>

      {/* Seção Gráfico Base 100 */}
      {valoresCarteira.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitleText}>Evolução comparativa • Base 100</Text>
            <Ionicons name="information-circle-outline" size={18} color="#90A4AE" />
          </View>

          <LineChart
            data={{
              labels: labels.length > 6 ? labels.filter((_, i) => i % Math.ceil(labels.length / 6) === 0) : labels,
              datasets: [
                {
                  data: valoresCarteira,
                  color: (opacity = 1) => `rgba(233, 30, 99, ${opacity})`, // Rosa
                  strokeWidth: 2,
                },
                {
                  data: valoresIfix,
                  color: (opacity = 1) => `rgba(33, 150, 243, ${opacity})`, // Azul
                  strokeWidth: 2,
                },
                {
                  data: valoresCdi,
                  color: (opacity = 1) => `rgba(156, 39, 176, ${opacity})`, // Roxo
                  strokeWidth: 2,
                },
                {
                  data: valoresIpca,
                  color: (opacity = 1) => `rgba(255, 152, 0, ${opacity})`, // Laranja
                  strokeWidth: 2,
                },
              ],
              legend: ['Carteira', 'IFIX', 'CDI', 'IPCA'],
            }}
            width={screenWidth - 48}
            height={220}
            chartConfig={{
              backgroundColor: '#121824',
              backgroundGradientFrom: '#121824',
              backgroundGradientTo: '#121824',
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(144, 164, 174, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(144, 164, 174, ${opacity})`,
              style: { borderRadius: 16 },
              propsForDots: {
                r: '4',
                strokeWidth: '2',
              },
            }}
            bezier
            style={styles.chartStyle}
          />

          {/* Legenda Customizada */}
          <View style={styles.legendContainer}>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: '#E91E63' }]} />
              <Text style={styles.legendText}>Carteira: {ultimaCarteira.toFixed(1).replace('.', ',')} ({rentabilidadeCarteiraPct >= 0 ? `+${rentabilidadeCarteiraPct}` : rentabilidadeCarteiraPct}%)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: '#2196F3' }]} />
              <Text style={styles.legendText}>IFIX: {ultimoIfix.toFixed(1).replace('.', ',')} ({rentabilidadeIfixPct >= 0 ? `+${rentabilidadeIfixPct}` : rentabilidadeIfixPct}%)</Text>
            </View>
            <View style={[styles.legendItem, { marginTop: 8 }]}>
              <View style={[styles.dot, { backgroundColor: '#9C27B0' }]} />
              <Text style={styles.legendText}>CDI: {ultimoCdi.toFixed(1).replace('.', ',')} ({rentabilidadeCdiPct >= 0 ? `+${rentabilidadeCdiPct}` : rentabilidadeCdiPct}%)</Text>
            </View>
            <View style={[styles.legendItem, { marginTop: 8 }]}>
              <View style={[styles.dot, { backgroundColor: '#FF9800' }]} />
              <Text style={styles.legendText}>IPCA: {ultimoIpca.toFixed(1).replace('.', ',')} ({rentabilidadeIpcaPct >= 0 ? `+${rentabilidadeIpcaPct}` : rentabilidadeIpcaPct}%)</Text>
            </View>
          </View>
        </View>
      )}

      {/* Grid de Cards Superiores (2x2) */}
      <View style={styles.gridRow}>
        <View style={styles.smallCard}>
          <MaterialCommunityIcons name="chart-line" size={22} color="#E91E63" />
          <Text style={styles.smallCardTitle}>Minha Carteira</Text>
          <Text style={[styles.smallCardValue, { color: rentabilidadeCarteiraPct >= 0 ? '#00E676' : '#E91E63' }]}>
            {rentabilidadeCarteiraPct >= 0 ? `+${rentabilidadeCarteiraPct}%` : `${rentabilidadeCarteiraPct}%`}
          </Text>
          <Text style={styles.smallCardSub}>Base 100 = {ultimaCarteira}</Text>
        </View>

        <View style={styles.smallCard}>
          <MaterialCommunityIcons name="chart-bar" size={22} color="#2196F3" />
          <Text style={styles.smallCardTitle}>IFIX</Text>
          <Text style={[styles.smallCardValue, { color: '#2196F3' }]}>
            {rentabilidadeIfixPct >= 0 ? `+${rentabilidadeIfixPct}%` : `${rentabilidadeIfixPct}%`}
          </Text>
          <Text style={styles.smallCardSub}>Base 100 = {ultimoIfix}</Text>
        </View>
      </View>

      <View style={styles.gridRow}>
        <View style={styles.smallCard}>
          <MaterialCommunityIcons name="wallet-outline" size={22} color="#9C27B0" />
          <Text style={styles.smallCardTitle}>CDI</Text>
          <Text style={[styles.smallCardValue, { color: '#FFF' }]}>
            {rentabilidadeCdiPct >= 0 ? `+${rentabilidadeCdiPct}%` : `${rentabilidadeCdiPct}%`}
          </Text>
          <Text style={styles.smallCardSub}>Base 100 = {ultimoCdi}</Text>
        </View>

        <View style={styles.smallCard}>
          <MaterialCommunityIcons name="chart-line" size={22} color="#FF9800" />
          <Text style={styles.smallCardTitle}>Inflação (IPCA)</Text>
          <Text style={[styles.smallCardValue, { color: '#FFF' }]}>
            {rentabilidadeIpcaPct >= 0 ? `+${rentabilidadeIpcaPct}%` : `${rentabilidadeIpcaPct}%`}
          </Text>
          <Text style={styles.smallCardSub}>Base 100 = {ultimoIpca}</Text>
        </View>
      </View>

      {/* Cards de Comparação (Superando IPCA, IFIX, CDI) */}
      <View style={styles.comparisonCard}>
        <View style={styles.compHeader}>
          <Ionicons name="alert-circle" size={22} color={diffIpca >= 0 ? '#00E676' : '#FF5252'} />
          <Text style={styles.compTitle}>Superando o IPCA?</Text>
        </View>
        <Text style={[styles.compResult, { color: diffIpca >= 0 ? '#00E676' : '#FF5252' }]}>
          {diffIpca >= 0 ? 'Sim ' : 'Não '}
          <Text style={styles.compDiff}>{diffIpca >= 0 ? `+${diffIpca} p.p.` : `${diffIpca} p.p.`}</Text>
        </Text>
        <Text style={styles.compDesc}>{diffIpca >= 0 ? 'Acima da inflação no período' : 'Abaixo da inflação no período'}</Text>
      </View>

      <View style={styles.comparisonCard}>
        <View style={styles.compHeader}>
          <Ionicons name={diffIfix >= 0 ? "checkmark-circle" : "close-circle"} size={22} color={diffIfix >= 0 ? '#00E676' : '#FF5252'} />
          <Text style={styles.compTitle}>Superando o IFIX?</Text>
        </View>
        <Text style={[styles.compResult, { color: diffIfix >= 0 ? '#00E676' : '#FF5252' }]}>
          {diffIfix >= 0 ? 'Sim ' : 'Não '}
          <Text style={styles.compDiff}>{diffIfix >= 0 ? `+${diffIfix} p.p.` : `${diffIfix} p.p.`}</Text>
        </Text>
        <Text style={styles.compDesc}>{diffIfix >= 0 ? 'Acima do índice de FIIs' : 'Abaixo do índice de FIIs'}</Text>
      </View>

      <View style={styles.comparisonCard}>
        <View style={styles.compHeader}>
          <Ionicons name="alert-circle" size={22} color={diffCdi >= 0 ? '#00E676' : '#FF5252'} />
          <Text style={styles.compTitle}>Superando o CDI?</Text>
        </View>
        <Text style={[styles.compResult, { color: diffCdi >= 0 ? '#00E676' : '#FF5252' }]}>
          {diffCdi >= 0 ? 'Sim ' : 'Não '}
          <Text style={styles.compDiff}>{diffCdi >= 0 ? `+${diffCdi} p.p.` : `${diffCdi} p.p.`}</Text>
        </Text>
        <Text style={styles.compDesc}>{diffCdi >= 0 ? 'Acima do CDI no período' : 'Abaixo do CDI no período'}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E17',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#0A0E17',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#90A4AE',
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    color: '#FF5252',
    fontSize: 14,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 13,
    color: '#90A4AE',
    marginTop: 2,
  },
  periodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E2736',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  periodButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    marginRight: 6,
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#121824',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E2736',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitleText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  chartStyle: {
    marginVertical: 8,
    borderRadius: 16,
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1E2736',
    paddingTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  legendText: {
    color: '#B0BEC5',
    fontSize: 12,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  smallCard: {
    backgroundColor: '#121824',
    borderRadius: 16,
    padding: 16,
    width: '48%',
    borderWidth: 1,
    borderColor: '#1E2736',
  },
  smallCardTitle: {
    color: '#90A4AE',
    fontSize: 13,
    marginTop: 8,
  },
  smallCardValue: {
    fontSize: 22,
    fontWeight: 'bold',
    marginVertical: 4,
  },
  smallCardSub: {
    color: '#607D8B',
    fontSize: 11,
  },
  comparisonCard: {
    backgroundColor: '#121824',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E2736',
  },
  compHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  compTitle: {
    color: '#B0BEC5',
    fontSize: 14,
    marginLeft: 8,
    fontWeight: '500',
  },
  compResult: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  compDiff: {
    fontSize: 20,
  },
  compDesc: {
    color: '#607D8B',
    fontSize: 12,
  },
});