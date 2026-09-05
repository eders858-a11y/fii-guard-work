import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Dimensions
} from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import { router, Stack } from "expo-router";
import { usePortfolio } from "@/lib/portfolio";
import { ScreenContainer } from "@/components/screen-container";
import {
  fetchProventosCarteira, mediaHistorica, ProventoBrapi, MESES, BRAPI_TOKEN,
} from '@/lib/brapi-proventos';
import {
  resumoDoMes, resumoDoAno, ResumoMes, fmtBRL, fmtDataBR,
} from '@/lib/proventos-logic';

const SCREEN_W = Dimensions.get('window').width;

export default function DividendsScreen() {
  const { operations, ready } = usePortfolio();
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1); // 1..12
  const [oculto, setOculto] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [progresso, setProgresso] = useState('');
  const [atualizando, setAtualizando] = useState(false);

  const [provPorTicker, setProvPorTicker] = useState<Record<string, ProventoBrapi[]>>({});
  const [mediaPorTicker, setMediaPorTicker] = useState<Record<string, number>>({});

  // Mapeia operações do usePortfolio para o formato esperado pela lógica de proventos
  const movs = useMemo(() => operations.map(op => ({
    ticker: op.ticker,
    data: op.date,
    tipo: op.kind === 'buy' ? 'C' : 'V',
    quantidade: op.quantity
  })), [operations]);

  const carregar = useCallback(async (force = false) => {
    if (!ready) return;
    setCarregando(true);
    setProgresso('Lendo carteira...');

    const tks = [...new Set(movs.map(x => x.ticker.toUpperCase()))];
    if (!tks.length) {
      setCarregando(false);
      setProgresso('');
      return;
    }

    if (BRAPI_TOKEN.startsWith('SEU_TOKEN')) {
      // Omitido alerta repetitivo no console, mas útil para o usuário saber
      console.warn('Token brapi não configurado em lib/brapi-proventos.ts');
    }

    try {
      const prov = await fetchProventosCarteira(tks, (d, t) => {
        setProgresso(`Buscando proventos... ${d}/${t}`);
      }, force);
      setProvPorTicker(prov);

      const medias: Record<string, number> = {};
      for (const t of tks) medias[t] = mediaHistorica(prov[t] || []);
      setMediaPorTicker(medias);
    } catch (e) {
      console.error('Erro ao buscar proventos:', e);
    }

    setCarregando(false);
    setProgresso('');
  }, [movs, ready]);

  useEffect(() => {
    if (ready) carregar(false);
  }, [ready]);

  const resumoMes: ResumoMes = useMemo(
    () => resumoDoMes(ano, mes, movs, provPorTicker, mediaPorTicker),
    [ano, mes, movs, provPorTicker, mediaPorTicker],
  );

  const resumoAno = useMemo(
    () => resumoDoAno(ano, movs, provPorTicker, mediaPorTicker),
    [ano, movs, provPorTicker, mediaPorTicker],
  );
  const totalAno = resumoAno.reduce((s, r) => s + r.totalMes, 0);
  const acumuladoAteMes = resumoAno.filter(r => r.mes <= mes).reduce((s, r) => s + r.totalMes, 0);

  const navegarMes = (dir: 1 | -1) => {
    let m = mes + dir, a = ano;
    if (m < 1) { m = 12; a--; }
    if (m > 12) { m = 1; a++; }
    setMes(m); setAno(a);
  };

  const valorTxt = (v: number, casas = 2) => (oculto ? '••••' : fmtBRL(v, casas));

  if (!ready) return (
    <View style={[st.container, st.loadingBox]}>
      <ActivityIndicator color="#29B6F6" size="large" />
    </View>
  );

  return (
    <View style={st.container}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Cabeçalho */}
      <View style={st.header}>
        <Text style={st.headerIco}>☰</Text>
        <Text style={st.headerTitulo}>Proventos</Text>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <TouchableOpacity onPress={() => setOculto(!oculto)}>
            <Text style={st.headerIco}>{oculto ? '🙈' : '👁'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={async () => {
            setAtualizando(true);
            await carregar(true);
            setAtualizando(false);
          }}>
            <Text style={st.headerIco}>🔄</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Seletores carteira / mês / ano */}
      <View style={st.filtros}>
        <View style={st.dropdown}><Text style={st.dropdownTxt}>Meus FIIs ▾</Text></View>
        <TouchableOpacity style={st.seta} onPress={() => navegarMes(-1)}>
          <Text style={st.setaTxt}>‹</Text>
        </TouchableOpacity>
        <View style={st.dropdown}><Text style={st.dropdownTxt}>{MESES[mes - 1]} ▾</Text></View>
        <View style={st.dropdown}><Text style={st.dropdownTxt}>{ano} ▾</Text></View>
        <TouchableOpacity style={st.seta} onPress={() => navegarMes(1)}>
          <Text style={st.setaTxt}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Grade rápida de meses */}
      <View style={{ height: 60 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={st.mesesRow}>
            {MESES.map((nm, i) => (
              <TouchableOpacity key={nm} onPress={() => setMes(i + 1)}
                style={[st.mesChip, mes === i + 1 && st.mesChipSel]}>
                <Text style={[st.mesChipTxt, mes === i + 1 && st.mesChipTxtSel]}>{nm}</Text>
                <Text style={[st.mesChipVal, mes === i + 1 && st.mesChipTxtSel]}>
                  {valorTxt(resumoAno[i]?.totalMes ?? 0)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {carregando && !atualizando ? (
        <View style={st.loadingBox}>
          <ActivityIndicator color="#29B6F6" size="large" />
          <Text style={st.loadingTxt}>{progresso}</Text>
        </View>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={atualizando} onRefresh={async () => {
              setAtualizando(true); await carregar(true); setAtualizando(false);
            }} tintColor="#29B6F6" />
          }>

          {/* ===== Tabela de proventos do mês ===== */}
          <View style={st.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={st.cardTitulo}>💲 Proventos: Meus FIIs ›</Text>
              <TouchableOpacity onPress={() => router.push("/dividend-form" as any)}>
                <Text style={{ color: '#29B6F6', fontWeight: 'bold' }}>+ Novo</Text>
              </TouchableOpacity>
            </View>

            <View style={[st.linha, st.linhaCab]}>
              <Text style={[st.cel, st.cData, st.cabTxt]}>Dt.Pgto.</Text>
              <Text style={[st.cel, st.cAtivo, st.cabTxt]}>Ativo</Text>
              <Text style={[st.cel, st.cTipo, st.cabTxt]}>Tipo</Text>
              <Text style={[st.cel, st.cNum, st.cabTxt]}>Qtde.</Text>
              <Text style={[st.cel, st.cNum, st.cabTxt]}>Vl.unit.</Text>
              <Text style={[st.cel, st.cNum, st.cabTxt]}>Total</Text>
            </View>

            {resumoMes.itens.length === 0 && (
              <Text style={st.vazio}>Nenhum provento em {MESES[mes - 1]}/{ano}</Text>
            )}

            {resumoMes.itens.map((it, idx) => (
              <View key={idx} style={[st.linha, idx % 2 === 1 && st.linhaAlt]}>
                <Text style={[st.cel, st.cData]}>{fmtDataBR(it.dataPagamento)}</Text>
                <Text style={[st.cel, st.cAtivo, { color: '#29B6F6', fontWeight: '600' }]}>
                  {it.ticker}{it.estimado ? '*' : ''}
                </Text>
                <Text style={[st.cel, st.cTipo]}>{it.tipo}</Text>
                <Text style={[st.cel, st.cNum]}>{it.quantidadeNaDataCom}</Text>
                <Text style={[st.cel, st.cNum]}>{valorTxt(it.valorUnitario, 3)}</Text>
                <Text style={[st.cel, st.cNum, { fontWeight: '600' }]}>{valorTxt(it.valorTotal)}</Text>
              </View>
            ))}

            <View style={st.totalBox}>
              <Text style={st.totalTxt}>Total no mês: R$ {valorTxt(resumoMes.totalMes)}</Text>
              <Text style={st.totalTxtSec}>
                Acumulado no ano até {MESES[mes - 1]}: R$ {valorTxt(acumuladoAteMes)}
              </Text>
              <Text style={st.totalTxtSec}>Total do ano {ano}: R$ {valorTxt(totalAno)}</Text>
            </View>

            <Text style={st.legenda}>
              1 - Valores podem conter variações; 2 - Quantidade do ativo na data-com;
              3 - Data provável do pagamento.  * Estimado pela média dos últimos rendimentos.
            </Text>
          </View>

          {/* ===== Histórico anual (gráfico de barras) ===== */}
          <View style={st.card}>
            <Text style={st.cardTitulo}>📊 Histórico {ano}: Meus FIIs ›</Text>
            <BarChart
              data={{
                labels: MESES,
                datasets: [{ data: resumoAno.map(r => Math.round(r.totalMes * 100) / 100) }],
              }}
              width={SCREEN_W - 48}
              height={220}
              yAxisLabel=""
              yAxisSuffix=""
              fromZero
              chartConfig={{
                backgroundGradientFrom: '#2e2e2e',
                backgroundGradientTo: '#2e2e2e',
                decimalPlaces: 0,
                color: (o = 1) => `rgba(41,182,246,${o})`,
                labelColor: () => '#bbbbbb',
                barPercentage: 0.55,
                propsForBackgroundLines: { stroke: '#444' },
              }}
              style={{ borderRadius: 12, marginTop: 8 }}
              showValuesOnTopOfBars
            />
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#212121' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, backgroundColor: '#1b1b1b',
  },
  headerTitulo: { color: '#fff', fontSize: 17, fontWeight: '600' },
  headerIco: { color: '#fff', fontSize: 18 },

  filtros: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  dropdown: {
    backgroundColor: '#2e2e2e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
  },
  dropdownTxt: { color: '#fff', fontSize: 13, fontWeight: '500' },
  seta: { paddingHorizontal: 4 },
  setaTxt: { color: '#29B6F6', fontSize: 22, fontWeight: '700' },

  mesesRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 10 },
  mesChip: {
    backgroundColor: '#2e2e2e', borderRadius: 8, paddingHorizontal: 10,
    paddingVertical: 6, alignItems: 'center', minWidth: 56,
  },
  mesChipSel: { backgroundColor: '#123c52', borderColor: '#29B6F6', borderWidth: 1 },
  mesChipTxt: { color: '#bbb', fontSize: 12, fontWeight: '600' },
  mesChipVal: { color: '#888', fontSize: 10, marginTop: 2 },
  mesChipTxtSel: { color: '#29B6F6' },

  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 200 },
  loadingTxt: { color: '#bbb', marginTop: 12 },

  card: {
    backgroundColor: '#2e2e2e', marginHorizontal: 12, marginTop: 8,
    borderRadius: 12, padding: 12,
  },
  cardTitulo: { color: '#fff', fontSize: 15, fontWeight: '600' },

  linha: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 4, borderRadius: 6 },
  linhaCab: { borderBottomWidth: 1, borderBottomColor: '#444' },
  linhaAlt: { backgroundColor:'#292929' },
  cabTxt: { color: '#999', fontSize: 11, fontWeight: '600' },
  cel: { color: '#e8e8e8', fontSize: 12 },
  cData: { width: 58 },
  cAtivo: { flex: 1.1 },
  cTipo: { flex: 1.2 },
  cNum: { width: 52, textAlign: 'right' },

  vazio: { color: '#888', textAlign: 'center', paddingVertical: 18 },

  totalBox: {
    marginTop: 10, backgroundColor: '#242424', borderRadius: 8,
    padding: 10, borderLeftWidth: 3, borderLeftColor: '#29B6F6',
  },
  totalTxt: { color: '#29B6F6', fontSize: 14, fontWeight: '700' },
  totalTxtSec: { color: '#bbb', fontSize: 12, marginTop: 3 },
  legenda: { color: '#777', fontSize: 10, marginTop: 10, lineHeight: 14 },
});
