import { router, Stack, useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useState } from "react";
import { usePortfolio } from "@/lib/portfolio";
import { suggestFunds } from "@/lib/fii-catalog";
import { ScreenContainer } from "@/components/screen-container";
import { Field, Help } from "@/components/form-fields";
import { Button } from "@/components/portfolio-ui";
import { brDateToIso, currencyInput, isoDateToBr, parseCurrencyInput } from "@/lib/format";
const dateInput = (value: string) => { const digits = value.replace(/\D/g, "").slice(0, 8); return digits.length <= 2 ? digits : digits.length <= 4 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`; };
const today = isoDateToBr(new Date().toISOString().slice(0, 10));
export default function DividendForm() { const params = useLocalSearchParams<{ ticker?: string; id?: string }>(); const { dividends, addDividend, updateDividend } = usePortfolio(); const old = dividends.find((item) => item.id === params.id); const [kind, setKind] = useState<"income" | "amortization">(old?.kind ?? "income"); const [ticker, setTicker] = useState(old?.ticker ?? params.ticker ?? ""); const [paymentDate, setPaymentDate] = useState(old ? isoDateToBr(old.paymentDate) : today); const [dateCom, setDateCom] = useState(old?.dateCom ? isoDateToBr(old.dateCom) : ""); const [amount, setAmount] = useState(old ? currencyInput(String(Math.round(old.amountPerShare * 100))) : ""); const [note, setNote] = useState(old?.note ?? ""); const [error, setError] = useState(""); const selected = suggestFunds(ticker); const save = () => { try { setError(""); const input = { ticker, kind, paymentDate: brDateToIso(paymentDate), dateCom: dateCom ? brDateToIso(dateCom) : undefined, amountPerShare: parseCurrencyInput(amount), note: note.trim() || undefined }; if (old) updateDividend(old.id, input); else addDividend(input); router.back(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar."); } }; return <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]}><Stack.Screen options={{ headerShown: false }} /><ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-6"><Text className="mt-2 text-sm font-medium text-muted">Recebimento manual</Text><Text className="mt-1 text-3xl font-bold text-foreground">{old ? "Editar provento" : "Novo provento"}</Text><Text className="mt-3 text-sm leading-5 text-muted">O total será calculado pela quantidade de cotas na data-com.</Text><View className="mt-6 flex-row gap-3 rounded-2xl bg-surface p-2"><View className="flex-1"><Button compact title="Rendimento" variant={kind === "income" ? "primary" : "secondary"} onPress={() => setKind("income")} /></View><View className="flex-1"><Button compact title="Amortização" variant={kind === "amortization" ? "primary" : "secondary"} onPress={() => setKind("amortization")} /></View></View><View className="mt-6"><Field label="Ticker do FII" value={ticker} onChangeText={setTicker} placeholder="Ex.: HGLG11" autoCapitalize="characters" />{selected.slice(0, 4).map((fund) => <Text key={fund.ticker} className="-mt-2 mb-3 rounded-xl bg-[#DFF4FA] p-3 text-xs text-foreground">{fund.ticker} · {fund.name}</Text>)}<Field label="Data de pagamento" value={paymentDate} onChangeText={(value) => setPaymentDate(dateInput(value))} placeholder="DD/MM/AAAA" /><Field label="Data-com" value={dateCom} onChangeText={(value) => setDateCom(dateInput(value))} placeholder="DD/MM/AAAA" optional /><Help>Se a data-com ficar vazia, será usada a data do pagamento.</Help><Field label="Valor por cota" value={amount} onChangeText={(value) => setAmount(currencyInput(value))} placeholder="0,00" keyboardType="numeric" /><Help>Digite 083 para R$ 0,83 ou 7295 para R$ 72,95.</Help><Field label="Observação" value={note} onChangeText={setNote} placeholder="Opcional" optional autoCapitalize="sentences" /></View>{error ? <Text className="mb-4 rounded-xl bg-error/10 p-3 text-sm text-error">{error}</Text> : null}<Button title={old ? "Salvar alterações" : "Salvar provento"} onPress={save} /><View className="h-4" /><Button title="Cancelar" variant="secondary" onPress={() => router.back()} /></ScrollView></ScreenContainer>; }
// ============================================================
// brapiProventos.ts — Busca automática de proventos (brapi)
// Cache local de 24h para não estourar o plano gratuito.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';

// >>> Coloque seu token da brapi aqui (grátis em https://brapi.dev)
export const BRAPI_TOKEN = 'SEU_TOKEN_BRAPI_AQUI';

export interface ProventoBrapi {
  ticker: string;
  dataCom: string;        // 'YYYY-MM-DD'
  dataPagamento: string;  // 'YYYY-MM-DD'
  valorUnitario: number;  // R$ por cota
  tipo: string;           // 'Rendimento' | 'JCP' | 'Dividendo' | 'Amortização'
}

const CACHE_PREFIX = '@brapiProv_';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export function mesAnoKey(ano: number, mes1a12: number) {
  return ${ano}-${String(mes1a12).padStart(2, '0')};
}

// ---------- Parsing robusto da resposta da brapi ----------
function parseDateAny(v: any): string | null {
  if (!v) return null;
  if (typeof v === 'string') {
    // dd/mm/yyyy
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return ${m[3]}-${m[2]}-${m[1]};
    // ISO
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  if (typeof v === 'number') { // epoch (s ou ms)
    const ms = v > 1e12 ? v : v * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

function pickTipo(raw: string): string {
  const s = (raw || '').toUpperCase();
  if (s.includes('AMORT')) return 'Amortização';
  if (s.includes('JCP')) return 'JCP';
  if (s.includes('DIVID')) return 'Dividendo';
  return 'Rendimento';
}

// ---------- Busca de um ticker (com cache) ----------
export async function fetchProventosTicker(ticker: string, force = false): Promise<ProventoBrapi[]> {
  const key = CACHE_PREFIX + ticker.toUpperCase();
  if (!force) {
    try {
      const cached = await AsyncStorage.getItem(key);
      if (cached) {
        const { ts, data } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL_MS) return data as ProventoBrapi[];
      }
    } catch {}
  }

  let lista: ProventoBrapi[] = [];
  try {
    const url = https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?dividends=true&token=${BRAPI_TOKEN};
    const r = await fetch(url);
    const j = await r.json();
    const divs = j?.results?.[0]?.dividendsData?.cashDividends || [];
    for (const d of divs) {
      const rate = Number(d.rate ?? d.value ?? d.dividendRate ?? 0);
      const dataCom = parseDateAny(d.lastDatePrior ?? d.dataCom ?? d.exDate ?? d.relatedTo);
      const dataPgto = parseDateAny(d.paymentDate ?? d.approvedOn ?? d.lastDatePrior);
      if (!rate  !(dataCom  dataPgto)) continue;
      lista.push({
        ticker: ticker.toUpperCase(),
        dataCom: dataCom || dataPgto!,
        dataPagamento: dataPgto || dataCom!,
        valorUnitario: rate,
        tipo: pickTipo(d.label ?? d.type ?? ''),
      });
    }
  } catch (e) {
    // sem internet / limite da API -> devolve cache mesmo vencido, se houver
    try {
      const cached = await AsyncStorage.getItem(key);
      if (cached) return JSON.parse(cached).data as ProventoBrapi[];
    } catch {}
  }

  // ordena por data
  lista.sort((a, b) => a.dataPagamento.localeCompare(b.dataPagamento));
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: lista }));
  } catch {}
  return lista;
}

// ---------- Busca de toda a carteira ----------
export async function fetchProventosCarteira(
  tickers: string[],
  onProgress?: (done: number, total: number) => void,
  force = false,
): Promise<Record<string, ProventoBrapi[]>> {
  const out: Record<string, ProventoBrapi[]> = {};
  let done = 0;
  for (const t of tickers) {
    out[t.toUpperCase()] = await fetchProventosTicker(t, force);
    done++;
    onProgress?.(done, tickers.length);
    // pequena pausa p/ respeitar rate-limit do plano grátis
    await new Promise(r => setTimeout(r, 350));
  }
  return out;
}

// ---------- Fallback: média dos últimos rendimentos p/ meses futuros não anunciados ----------
export function mediaHistorica(proventos: ProventoBrapi[], ultimos = 3): number {
  const rends = proventos.filter(p => p.tipo === 'Rendimento' && p.valorUnitario > 0);
  const tail = rends.slice(-ultimos);
  if (!tail.length) return 0;
  return tail.reduce((s, p) => s + p.valorUnitario, 0) / tail.length;
}

export { MESES };

// ============================================================
// proventosLogic.ts — Cálculo de posição na data-com a partir
// das movimentações (extrato B3) + agregação por mês/ano.
// ============================================================
import { ProventoBrapi, mesAnoKey } from './brapiProventos';

// ADAPTE estes tipos aos campos reais do seu extrato B3 já existente.
export interface MovimentacaoB3 {
  ticker: string;            // ex.: 'HGLG11'
  data: string;              // 'YYYY-MM-DD' ou 'DD/MM/YYYY'
  tipo: 'C' | 'V' | string;  // 'C' compra, 'V' venda (ou 'Compra'/'Venda')
  quantidade: number;
}

export interface ItemProventoMes {
  ticker: string;
  tipo: string;
  dataCom: string;
  dataPagamento: string;
  quantidadeNaDataCom: number;
  valorUnitario: number;
  valorTotal: number;
  estimado: boolean; // true = mês futuro sem anúncio (média histórica)
}

export interface ResumoMes {
  key: string;             // 'YYYY-MM'
  ano: number;
  mes: number;             // 1..12
  itens: ItemProventoMes[];
  totalMes: number;
}

export function toISODate(d: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return ${m[3]}-${m[2]}-${m[1]};
  return d;
}

// Quantidade de cotas de um ticker em determinada data (soma compras - vendas até a data)
export function quantidadeNaData(movs: MovimentacaoB3[], ticker: string, dataISO: string): number {
  let q = 0;
  const tk = ticker.toUpperCase();
  for (const m of movs) {
    if ((m.ticker || '').toUpperCase() !== tk) continue;
    const d = toISODate(m.data);
    if (d > dataISO) continue; // ignora movimentos posteriores à data-com
    const tipo = (m.tipo || '').toString().toUpperCase();
    if (tipo.startsWith('C')) q += Math.abs(m.quantidade);
    else if (tipo.startsWith('V')) q -= Math.abs(m.quantidade);
  }
  return Math.max(0, q);
}

// Monta o resumo de um mês/ano de PAGAMENTO
export function resumoDoMes(
  ano: number,
  mes: number, // 1..12
  movs: MovimentacaoB3[],
  proventosPorTicker: Record<string, ProventoBrapi[]>,
  mediaPorTicker: Record<string, number>,
): ResumoMes {
  const key = mesAnoKey(ano, mes);
  const itens: ItemProventoMes[] = [];

  for (const [ticker, lista] of Object.entries(proventosPorTicker)) {
    const doMes = lista.filter(p => p.dataPagamento.slice(0, 7) === key);
    if (doMes.length) {
      for (const p of doMes) {
        const qtd = quantidadeNaData(movs, ticker, p.dataCom);
        if (qtd <= 0) continue;
        itens.push({
          ticker,
          tipo: p.tipo,
          dataCom: p.dataCom,
          dataPagamento: p.dataPagamento,
          quantidadeNaDataCom: qtd,
          valorUnitario: p.valorUnitario,
          valorTotal: qtd * p.valorUnitario,
          estimado: false,
        });
      }
    } else {
      // Mês sem anúncio: estima pela média (só se mês atual/futuro)
      const hojeKey = mesAnoKey(new Date().getFullYear(), new Date().getMonth() + 1);
      if (key >= hojeKey) {
        const media = mediaPorTicker[ticker] || 0;
        if (media > 0) {
          // posição estimada no último dia útil conhecido (usa hoje como referência)
          const qtd = quantidadeNaData(movs, ticker, '9999-12-31');
          if (qtd > 0) {
            itens.push({
              ticker,
              tipo: 'Rendimento',
              dataCom: '',
              dataPagamento: ${key}-15, // data provável
              quantidadeNaDataCom: qtd,
              valorUnitario: media,
              valorTotal: qtd * media,
              estimado: true,
            });
          }
        }
      }
    }
  }

  itens.sort((a, b) => a.dataPagamento.localeCompare(b.dataPagamento) || a.ticker.localeCompare(b.ticker));
  const totalMes = itens.reduce((s, i) => s + i.valorTotal, 0);
  return { key, ano, mes, itens, totalMes };
}

// Resumos de todos os meses do ano
export function resumoDoAno(
  ano: number,
  movs: MovimentacaoB3[],
  proventosPorTicker: Record<string, ProventoBrapi[]>,
  mediaPorTicker: Record<string, number>,
): ResumoMes[] {
  return Array.from({ length: 12 }, (_, i) =>
    resumoDoMes(ano, i + 1, movs, proventosPorTicker, mediaPorTicker));
}

export function fmtBRL(v: number, casas = 2): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: 3 });
}

export function fmtDataBR(iso: string): string {
  if (!iso) return '--/--/--';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return ${d}/${m}/${y.slice(2)};
}

// ============================================================
// ProventosScreen.tsx — Aba "Proventos" (visual = foto enviada)
// Dependências:
//   npx expo install @react-native-async-storage/async-storage
//   npx expo install react-native-svg
//   npm i react-native-chart-kit
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';
import {
  fetchProventosCarteira, mediaHistorica, ProventoBrapi, MESES, BRAPI_TOKEN,
} from './brapiProventos';
import {
  MovimentacaoB3, resumoDoMes, resumoDoAno, ResumoMes, fmtBRL, fmtDataBR,
} from './proventosLogic';

// ============================================================
// >>> PONTO DE INTEGRAÇÃO COM SEU APP <<<
// Troque este stub pela leitura real das movimentações que o
// app já salva ao importar o extrato da B3 (AsyncStorage/SQLite).
// Ex.: return await carregarMovimentacoesDoExtratoB3();
// ============================================================
async function carregarMovimentacoes(): Promise<MovimentacaoB3[]> {
  // EXEMPLO (remover):
  return [
    { ticker: 'BODB11', data: '2026-01-10', tipo: 'C', quantidade: 11 },
    { ticker: 'GARE11', data: '2026-02-05', tipo: 'C', quantidade: 13 },
    { ticker: 'VGHF11', data: '2026-03-01', tipo: 'C', quantidade: 20 },
    { ticker: 'GGRC11', data: '2026-01-20', tipo: 'C', quantidade: 10 },
    { ticker: 'HGBS11', data: '2026-04-15', tipo: 'C', quantidade: 1 },
    { ticker: 'MFII11', data: '2026-01-08', tipo: 'C', quantidade: 5 },
    { ticker: 'RBVA11', data: '2026-05-02', tipo: 'C', quantidade: 10 },
    { ticker: 'TRXF11', data: '2026-06-11', tipo: 'C', quantidade: 1 },
  ];
}

const SCREEN_W = Dimensions.get('window').width;

export default function ProventosScreen() {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1); // 1..12
  const [oculto, setOculto] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [progresso, setProgresso] = useState('');
  const [atualizando, setAtualizando] = useState(false);

  const [movs, setMovs] = useState<MovimentacaoB3[]>([]);
  const [provPorTicker, setProvPorTicker] = useState<Record<string, ProventoBrapi[]>>({});
  const [mediaPorTicker, setMediaPorTicker] = useState<Record<string, number>>({});

  const tickers = useMemo(
    () => [...new Set(movs.map(m => m.ticker.toUpperCase()))],
    [movs],
  );

  const carregar = useCallback(async (force = false) => {
    setCarregando(true);
    setProgresso('Lendo carteira...');
    const m = await carregarMovimentacoes();
    setMovs(m);

    const tks = [...new Set(m.map(x => x.ticker.toUpperCase()))];
    if (!tks.length) { setCarregando(false); return; }

    if (BRAPI_TOKEN.startsWith('SEU_TOKEN')) {
      Alert.alert('Token brapi', 'Cadastre um token grátis em brapi.dev e coloque em brapiProventos.ts');
    }
    const prov = await fetchProventosCarteira(tks, (d, t) => {
      setProgresso(Buscando proventos... ${d}/${t});
    }, force);
    setProvPorTicker(prov);

    const medias: Record<string, number> = {};
    for (const t of tks) medias[t] = mediaHistorica(prov[t] || []);
    setMediaPorTicker(medias);

    setCarregando(false);
    setProgresso('');
  }, []);

  useEffect(() => { carregar(false); }, [carregar]);

  // Recarrega quando a carteira for atualizada (extrato B3 reimportado):
  // se seu app emite um evento ao atualizar, chame carregar(true) lá.
  useEffect(() => {
    // Ex.: const sub = DeviceEventEmitter.addListener('CARTEIRA_ATUALIZADA', () => carregar(true));
    // return () => sub.remove();
  }, [carregar]);

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

  return (
    <View style={st.container}>
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
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

      {carregando ? (
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
            <Text style={st.cardTitulo}>💲 Proventos: Meus FIIs ›</Text>

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
                color: (o = 1) => rgba(41,182,246,${o}),
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

  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingTxt: { color: '#bbb', marginTop: 12 },

  card: {
    backgroundColor: '#2e2e2e', marginHorizontal: 12, marginTop: 8,
    borderRadius: 12, padding: 12,
  },
  cardTitulo: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 10 },

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