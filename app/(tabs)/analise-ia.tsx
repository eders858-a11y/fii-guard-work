// Substitua o topo das importações por:
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { suggestFunds, findFund } from '@/lib/fii-catalog';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScreenContainer } from '@/components/screen-container';
import { usePortfolio, normalizeTicker } from '@/lib/portfolio';
import {
  AiAnalysisType,
  FiiDataForAi,
  FonteCitada,
  MensagemChat,
  buscarDadosFiiParaAnalise,
  conversarComAnalista,
  perguntaInicialPorTipo,
} from '@/lib/gemini-ai';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';

interface MensagemTela {
  id: string;
  papel: 'usuario' | 'ia';
  texto: string;
  fontes: FonteCitada[];
}

const PERGUNTAS_RAPIDAS = [
  'Quais os principais riscos deste fundo?',
  'Está barato ou caro agora?',
  'O dividendo atual é sustentável?',
  'Como ele se compara a outros FIIs do setor?',
];

const GERAR_ID = () => `m${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const msgErroIa = (err: unknown) =>
  `Não consegui responder agora: ${err instanceof Error ? err.message : 'falha inesperada.'}`;

/* ------------------------------------------------------------------ */
/* Renderizador leve de Markdown (zero dependências): títulos, listas, */
/* negrito, itálico, código, links, citações e divisórias.              */
/* ------------------------------------------------------------------ */

const PADRAO_INLINE =
  /(\*\*[^*]+\*\*|__[^_]+__|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(texto: string, prefixoChave: string): React.ReactNode[] {
  const partes = texto.split(PADRAO_INLINE).filter(parte => parte !== '');
  return partes.map((parte, indice) => {
    const chave = `${prefixoChave}-i${indice}`;
    const negrito = parte.match(/^\*\*(.+)\*\*$/) ?? parte.match(/^__(.+)__$/);

    if (negrito) {
      return (
        <Text key={chave} style={styles.mdNegrito}>
          {negrito[1]}
        </Text>
      );
    }

    const codigo = parte.match(/^`([^`]+)`$/);
    if (codigo) {
      return (
        <Text key={chave} style={styles.mdCodigo}>
          {codigo[1]}
        </Text>
      );
    }

    const link = parte.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      const url = link[2];
      return (
        <Text
          key={chave}
          style={styles.mdLink}
          onPress={() => {
            void Linking.openURL(url);
          }}
        >
          {link[1]}
        </Text>
      );
    }

    const italico = parte.match(/^\*([^*]+)\*$/) ?? parte.match(/^_([^_]+)_$/);
    if (italico) {
      return (
        <Text key={chave} style={styles.mdItalico}>
          {italico[1]}
        </Text>
      );
    }

    return <Text key={chave}>{parte}</Text>;
  });
}

function renderMarkdown(texto: string): React.ReactNode[] {
  const linhas = texto.replace(/\r\n/g, '\n').split('\n');
  const blocos: React.ReactNode[] = [];
  let listaAtual: { ordenada: boolean; itens: string[] } | null = null;

  const fecharLista = () => {
    if (!listaAtual) return;
    const lista = listaAtual;
    const prefixo = `lista-${blocos.length}`;

    blocos.push(
      <View key={prefixo} style={styles.mdLista}>
        {lista.itens.map((item, i) => (
          <View key={`${prefixo}-${i}`} style={styles.mdListaItem}>
            <Text style={styles.mdListaMarcador}>
              {lista.ordenada ? `${i + 1}.` : '•'}
            </Text>
            <Text style={styles.aiResultText}>
              {renderInline(item, `${prefixo}-${i}`)}
            </Text>
          </View>
        ))}
      </View>,
    );

    listaAtual = null;
  };

  linhas.forEach((linhaBruta, indice) => {
    const linha = linhaBruta.trimEnd();
    const naoOrdenada = linha.match(/^\s*[-*•]\s+(.*)$/);
    const ordenada = linha.match(/^\s*\d+[.)]\s+(.*)$/);
    const titulo = linha.match(/^#{1,6}\s+(.*)$/);
    const citacao = linha.match(/^>\s?(.*)$/);
    const divisoria = /^(-{3,}|\*{3,}|_{3,})$/.test(linha.trim());

    if (naoOrdenada) {
      if (!listaAtual || listaAtual.ordenada) {
        fecharLista();
        listaAtual = { ordenada: false, itens: [] };
      }
      listaAtual?.itens.push(naoOrdenada[1]);
      return;
    }

    if (ordenada) {
      if (!listaAtual || !listaAtual.ordenada) {
        fecharLista();
        listaAtual = { ordenada: true, itens: [] };
      }
      listaAtual?.itens.push(ordenada[1]);
      return;
    }

    fecharLista();

    if (!linha.trim()) {
      blocos.push(<View key={`espaco-${indice}`} style={styles.mdEspaco} />);
      return;
    }

    if (titulo) {
      blocos.push(
        <Text key={`titulo-${indice}`} style={styles.mdTitulo}>
          {renderInline(titulo[1], `t${indice}`)}
        </Text>,
      );
      return;
    }

    if (citacao) {
      blocos.push(
        <View key={`citacao-${indice}`} style={styles.mdCitacao}>
          <Text style={styles.aiResultText}>
            {renderInline(citacao[1], `c${indice}`)}
          </Text>
        </View>,
      );
      return;
    }

    if (divisoria) {
      blocos.push(<View key={`div-${indice}`} style={styles.mdDivisoria} />);
      return;
    }

    blocos.push(
      <Text key={`p-${indice}`} style={styles.aiResultText}>
        {renderInline(linha, `p${indice}`)}
      </Text>,
    );
  });

  fecharLista();
  return blocos;
}

/* ------------------------------------------------------------------ */
/* Tela                                                               */
/* ------------------------------------------------------------------ */

export default function AnaliseIaScreen() {
  const [showTopButton, setShowTopButton] = useState(false);
  const { snapshot, operations, quotes, dividends } = usePortfolio();
  const [tickerInput, setTickerInput] = useState('MXRF11');
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const sugestoesTicker = useMemo(() => suggestFunds(tickerInput), [tickerInput]);
  const fundoDigitado = useMemo(
    () => findFund(normalizeTicker(tickerInput)),
    [tickerInput],
  );
  const [selectedFocus, setSelectedFocus] = useState<AiAnalysisType>('completa');
  const [aiProvider, setAiProvider] = useState<'groq' | 'gemini'>('groq');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showConfig, setShowConfig] = useState(false);



  useEffect(() => {
    AsyncStorage.getItem('@fii_guard_ai_provider')
      .then(p => {
        if (p === 'groq' || p === 'gemini') setAiProvider(p);
      })
      .catch(() => {});

    AsyncStorage.getItem('@fii_guard_api_key')
      .then(k => {
        if (k) setApiKeyInput(k);
      })
      .catch(() => {});
  }, []);

  const handleSetAiProvider = useCallback((provider: 'groq' | 'gemini') => {
    setAiProvider(provider);
    AsyncStorage.setItem('@fii_guard_ai_provider', provider).catch(() => {});
  }, []);

  const handleSetApiKeyInput = useCallback((text: string) => {
    setApiKeyInput(text);
    AsyncStorage.setItem('@fii_guard_api_key', text).catch(() => {});
  }, []);

  const [fiiDadosResumo, setFiiDadosResumo] = useState<FiiDataForAi | null>(null);
  const [mensagens, setMensagens] = useState<MensagemTela[]>([]);
  const [entrada, setEntrada] = useState('');
  const [loadingBase, setLoadingBase] = useState(false);
  const [loadingIa, setLoadingIa] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const tickersCarteira = useMemo(() => {
    if (snapshot?.active && snapshot.active.length > 0) {
      return snapshot.active
        .filter((p: any) => p.ticker && Number(p.quantity) > 0)
        .map((p: any) => normalizeTicker(p.ticker));
    }

    if (operations && operations.length > 0) {
      const setTk = new Set<string>();
      operations.forEach((op: any) => {
        if (op.ticker) setTk.add(normalizeTicker(op.ticker));
      });
      return Array.from(setTk);
    }

    return ['MXRF11', 'HGLG11', 'XPML11', 'VISC11', 'VGIR11', 'BTLG11'];
  }, [snapshot?.active, operations]);

  const scrollRef = useRef<ScrollView>(null);
  const requisicaoId = useRef(0);
  const ocupada = loadingBase || loadingIa;

  useEffect(() => {}, [mensagens.length, loadingIa]);

  const adicionarMensagem = useCallback(
    (papel: MensagemTela['papel'], textoMsg: string, fontesMsg: FonteCitada[] = []) => {
      setMensagens(atual => [
        ...atual,
        {
          id: GERAR_ID(),
          papel,
          texto: textoMsg,
          fontes: fontesMsg,
        },
      ]);
    },
    [],
  );

  const montarOpcoesIa = useCallback(
    (foco: AiAnalysisType) => {
      const chave = apiKeyInput.trim();

      return {
        tipo: foco,
        aiProvider,
        geminiApiKey: aiProvider === 'gemini' && chave ? chave : undefined,
        groqApiKey: aiProvider === 'groq' && chave ? chave : undefined,
      };
    },
    [aiProvider, apiKeyInput],
  );

  const dispararIa = useCallback(
    async (
      dados: FiiDataForAi,
      foco: AiAnalysisType,
      perguntaAbertura?: string,
      idBase?: number,
    ) => {
      const meuId = idBase ?? ++requisicaoId.current;
      const pergunta = perguntaAbertura?.trim() || perguntaInicialPorTipo(foco);

      adicionarMensagem('usuario', pergunta);
      setLoadingIa(true);

      try {
        const historicoMsgs: MensagemChat[] = mensagens.map(m => ({
          role: m.papel === 'ia' ? ('model' as const) : ('user' as const),
          parts: [{ text: m.texto }],
        }));

        const resposta = await conversarComAnalista(
          dados,
          [...historicoMsgs, { role: 'user', parts: [{ text: pergunta }] }],
          montarOpcoesIa(foco),
        );

        if (requisicaoId.current !== meuId) return;
        adicionarMensagem('ia', resposta.texto, resposta.fontes);
      } catch (err) {
        if (requisicaoId.current !== meuId) return;
        console.error('Erro ao gerar análise da IA:', err);
        adicionarMensagem('ia', msgErroIa(err));
      } finally {
        if (requisicaoId.current === meuId) setLoadingIa(false);
      }
    },
    [adicionarMensagem, montarOpcoesIa, mensagens],
  );

  const handleAnalisar = async (
    tickerAlvo?: string,
    perguntaAbertura?: string,
  ) => {
    Keyboard.dismiss();
    const tk = normalizeTicker(tickerAlvo ?? tickerInput);

    if (!tk) {
      setErro('Digite o ticker do FII.');
      return;
    }

    if (ocupada) return;

    const meuId = ++requisicaoId.current;
    setErro(null);
    setMensagens([]);
    setFiiDadosResumo(null);
    setLoadingBase(true);

    try {
      const dadosConsolidados = await buscarDadosFiiParaAnalise(tk);

      if (requisicaoId.current !== meuId) return;

      const posObj = snapshot?.active?.find(
        (p: any) => normalizeTicker(p.ticker) === tk,
      );

      const qtdHold = posObj
        ? Number(posObj.quantity)
        : dadosConsolidados.quantityHeld;

      const proventosFii = (dividends || []).filter(
        (d: any) => normalizeTicker(d.ticker) === tk,
      );

      const ultProventoLocal = proventosFii.length > 0
        ? Number(
            proventosFii[proventosFii.length - 1].amountPerShare ||
            proventosFii[proventosFii.length - 1].value ||
            0,
          )
        : undefined;

     // Preserva e deriva o Valor Patrimonial por cota (VP)
           const vpFinal =
             dadosConsolidados.patrimonioPorCota ??
             (dadosConsolidados.price && dadosConsolidados.pvp && dadosConsolidados.pvp > 0
               ? dadosConsolidados.price / dadosConsolidados.pvp
               : undefined);

           const dadosFinais: FiiDataForAi = {
             ...dadosConsolidados,
             price: dadosConsolidados.price ?? quotes?.[tk]?.price,
             lastDividend: dadosConsolidados.lastDividend ?? ultProventoLocal,
             quantityHeld: qtdHold,
             patrimonioPorCota: vpFinal,
             dataPatrimonio: dadosConsolidados.dataPatrimonio ?? dadosConsolidados.dataReferencia,
             numeroCotistas:
               dadosConsolidados.numeroCotistas != null &&
               Number.isFinite(Number(dadosConsolidados.numeroCotistas))
                 ? Number(dadosConsolidados.numeroCotistas)
                 : undefined,
             numeroAtivos:
               dadosConsolidados.numeroAtivos != null &&
               Number.isFinite(Number(dadosConsolidados.numeroAtivos))
                 ? Number(dadosConsolidados.numeroAtivos)
                 : undefined,
             numeroImoveis:
               dadosConsolidados.numeroImoveis != null &&
               Number.isFinite(Number(dadosConsolidados.numeroImoveis))
                 ? Number(dadosConsolidados.numeroImoveis)
                 : undefined,
             vacanciaFisica: dadosConsolidados.vacanciaFisica,
             vacancia: dadosConsolidados.vacancia,
             inadimplencia: dadosConsolidados.inadimplencia,
           };
      setFiiDadosResumo(dadosFinais);
      setLoadingBase(false);
      await dispararIa(dadosFinais, selectedFocus, perguntaAbertura, meuId);
    } catch (err) {
      if (requisicaoId.current !== meuId) return;
      console.error('Erro ao buscar dados do FII:', err);
      setErro(err instanceof Error ? err.message : 'Erro ao buscar dados do FII.');
    } finally {
      if (requisicaoId.current === meuId) setLoadingBase(false);
    }
  };

 const enviarMensagem = async (perguntaBruta: string) => {
   const pergunta = perguntaBruta.trim();
   if (!pergunta || ocupada) return;

   if (!fiiDadosResumo) {
     setEntrada('');
     await handleAnalisar(undefined, pergunta);
     return;
   }

   const meuId = ++requisicaoId.current;
   setEntrada('');
   setErro(null);
   adicionarMensagem('usuario', pergunta);
   setLoadingIa(true);

   // 🚀 Rola a tela automaticamente para baixo para acompanhar a resposta
   setTimeout(() => {
     scrollRef.current?.scrollToEnd({ animated: true });
   }, 100);

    const historico: MensagemChat[] = mensagens.map(m => ({
      role: m.papel === 'ia' ? ('model' as const) : ('user' as const),
      parts: [{ text: m.texto }],
    }));

    try {
      const resposta = await conversarComAnalista(
        fiiDadosResumo,
        [...historico, { role: 'user', parts: [{ text: pergunta }] }],
        montarOpcoesIa(selectedFocus),
      );

      if (requisicaoId.current !== meuId) return;
      adicionarMensagem('ia', resposta.texto, resposta.fontes);
    } catch (err) {
      if (requisicaoId.current !== meuId) return;
      console.error('Erro na conversa com a IA:', err);
      adicionarMensagem('ia', msgErroIa(err));
    } finally {
      if (requisicaoId.current === meuId) setLoadingIa(false);
    }
  };

  const reiniciarAnalise = () => {
    if (ocupada || !tickerInput.trim()) return;
    void handleAnalisar(tickerInput.trim().toUpperCase());
  };

  const selecionarFundo = (ticker: string) => {
    Keyboard.dismiss();
    const tickerSelecionado = normalizeTicker(ticker);
    setTickerInput(tickerSelecionado);
    setMostrarSugestoes(false);
    setErro(null);
    void handleAnalisar(tickerSelecionado);
  };

  return (
   <ScreenContainer>
     <KeyboardAvoidingView
           style={{ flex: 1 }}
           behavior={Platform.OS === 'ios' ? 'padding' : undefined}
         >
           <ScrollView
             ref={scrollRef}
             onScroll={(event) => {
               const offsetY = event.nativeEvent.contentOffset.y;
               setShowTopButton(offsetY > 300);
             }}
             scrollEventThrottle={16}
             keyboardShouldPersistTaps="handled"
             contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
             showsVerticalScrollIndicator={false}
           >
           {/* Cabeçalho */}
           <View style={styles.headerRow}>
             <View style={styles.headerIcon}>
               <MaterialCommunityIcons name="auto-fix" size={26} color="#38bdf8" />
             </View>
             <View style={{ flex: 1 }}>
               <Text style={styles.title}>Análise IA FII Guard</Text>
               <Text style={styles.subtitle}>
                 Chat interativo inteligente com o Analista de FIIs
               </Text>
             </View>
             <TouchableOpacity
               style={styles.configBtn}
               onPress={() => setShowConfig(!showConfig)}
             >
               <Ionicons name="key-outline" size={18} color="#94a3b8" />
             </TouchableOpacity>
           </View>

           {/* Configuração de Provedor / Chave */}
           {showConfig && (
             <View style={styles.configCard}>
               <Text style={styles.configTitle}>Provedor de IA</Text>
               <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                 <TouchableOpacity
                   style={[
                     styles.chip,
                     aiProvider === 'groq' && styles.chipSelected,
                     { flex: 1, alignItems: 'center' },
                   ]}
                   onPress={() => handleSetAiProvider('groq')}
                 >
                   <Text
                     style={[
                       styles.chipText,
                       aiProvider === 'groq' && styles.chipTextSelected,
                     ]}
                   >
                     Groq (Llama 3.3)
                   </Text>
                 </TouchableOpacity>
                 <TouchableOpacity
                   style={[
                     styles.chip,
                     aiProvider === 'gemini' && styles.chipSelected,
                     { flex: 1, alignItems: 'center' },
                   ]}
                   onPress={() => handleSetAiProvider('gemini')}
                 >
                   <Text
                     style={[
                       styles.chipText,
                       aiProvider === 'gemini' && styles.chipTextSelected,
                     ]}
                   >
                     Google Gemini
                   </Text>
                 </TouchableOpacity>
               </View>
               <Text style={styles.configTitle}>
                 {aiProvider === 'groq'
                   ? 'Chave API Groq (Opcional)'
                   : 'Chave API Gemini (Opcional)'}
               </Text>
               <TextInput
                 style={styles.apiKeyInput}
                 value={apiKeyInput}
                 onChangeText={handleSetApiKeyInput}
                 placeholder={aiProvider === 'groq' ? 'gsk_... (opcional)' : 'AIza... (opcional)'}
                 placeholderTextColor="#64748b"
                 secureTextEntry
               />
             </View>
           )}

           {/* Seleção de Ticker */}
           <Text style={styles.sectionLabel}>
             Selecione ou digite o Ticker do FII:
           </Text>
           <View style={styles.searchRow}>
             <TextInput
               style={styles.tickerInput}
               value={tickerInput}
               onChangeText={txt => {
                 setTickerInput(txt.toUpperCase());
                 setMostrarSugestoes(true);
               }}
               onFocus={() => setMostrarSugestoes(true)}
               onSubmitEditing={() => {
                 Keyboard.dismiss();
                 setMostrarSugestoes(false);
                 void handleAnalisar(undefined, entrada.trim() || undefined);
                 setEntrada('');
               }}
               placeholder="Ex: MXRF11"
               placeholderTextColor="#64748b"
               autoCapitalize="characters"
               autoCorrect={false}
               maxLength={8}
             />
             <TouchableOpacity
               style={styles.btnAnalisar}
               onPress={() => {
                 Keyboard.dismiss();
                 const pergunta = entrada.trim();
                 setEntrada('');
                 setMostrarSugestoes(false);
                 void handleAnalisar(undefined, pergunta || undefined);
               }}
               disabled={ocupada}
             >
               {loadingBase ? (
                 <ActivityIndicator color="#fff" size="small" />
               ) : (
                 <>
                   <MaterialCommunityIcons
                     name="auto-fix"
                     size={16}
                     color="#fff"
                     style={{ marginRight: 4 }}
                   />
                   <Text style={styles.btnAnalisarText}>Analisar</Text>
                 </>
               )}
             </TouchableOpacity>
           </View>

           {/* Sugestões de FIIs */}
           {mostrarSugestoes && tickerInput.trim().length > 0 && (
             <View style={styles.sugestoesBox}>
               {sugestoesTicker.length > 0 ? (
                 sugestoesTicker.map((fundo: any) => (
                   <TouchableOpacity
                     key={fundo.ticker}
                     style={styles.sugestaoItem}
                     disabled={ocupada}
                     onPress={() => selecionarFundo(fundo.ticker)}
                   >
                     <View style={styles.sugestaoIcone}>
                       <MaterialCommunityIcons
                         name="chart-box-outline"
                         size={20}
                         color="#38bdf8"
                       />
                     </View>
                     <View style={styles.sugestaoTextoBox}>
                       <Text style={styles.sugestaoTicker}>{fundo.ticker}</Text>
                       <Text style={styles.sugestaoNome} numberOfLines={2}>
                         {fundo.name}
                       </Text>
                       <Text style={styles.sugestaoDescricao} numberOfLines={1}>
                         {[fundo.sector, fundo.segment].filter(Boolean).join(' • ')}
                       </Text>
                     </View>
                     <Ionicons name="chevron-forward" size={18} color="#64748b" />
                   </TouchableOpacity>
                 ))
               ) : fundoDigitado ? (
                 <TouchableOpacity
                   style={styles.sugestaoItem}
                   disabled={ocupada}
                   onPress={() => selecionarFundo(fundoDigitado.ticker)}
                 >
                   <View style={styles.sugestaoIcone}>
                     <MaterialCommunityIcons
                       name="chart-box-outline"
                       size={20}
                       color="#38bdf8"
                     />
                   </View>
                   <View style={styles.sugestaoTextoBox}>
                     <Text style={styles.sugestaoTicker}>{fundoDigitado.ticker}</Text>
                     <Text style={styles.sugestaoNome} numberOfLines={2}>
                       {fundoDigitado.name}
                     </Text>
                     <Text style={styles.sugestaoDescricao} numberOfLines={1}>
                       {[fundoDigitado.sector, fundoDigitado.segment]
                         .filter(Boolean)
                         .join(' • ')}
                     </Text>
                   </View>
                   <Ionicons name="chevron-forward" size={18} color="#64748b" />
                 </TouchableOpacity>
               ) : (
                 <View style={styles.sugestaoVazia}>
                   <Text style={styles.sugestaoVaziaTexto}>
                     Nenhum FII encontrado no catálogo. Você ainda pode tentar analisar o ticker digitado.
                   </Text>
                 </View>
               )}
             </View>
           )}

           {/* Chips da Carteira */}
           <ScrollView
             horizontal
             showsHorizontalScrollIndicator={false}
             style={{ marginBottom: 14 }}
           >
             {tickersCarteira.map((tk: string) => {
               const isSel = normalizeTicker(tickerInput) === tk;
               return (
                 <TouchableOpacity
                   key={tk}
                   style={[styles.chip, isSel && styles.chipSelected]}
                   disabled={ocupada}
                   onPress={() => {
                     setTickerInput(tk);
                     setMostrarSugestoes(false);
                     void handleAnalisar(tk);
                   }}
                 >
                   <Text style={[styles.chipText, isSel && styles.chipTextSelected]}>
                     {tk}
                   </Text>
                 </TouchableOpacity>
               );
             })}
           </ScrollView>

           {/* Foco da Análise */}
           <Text style={styles.sectionLabel}>Foco da Análise IA:</Text>
           <View style={styles.focusGrid}>
             {(
               [
                 { id: 'completa', title: '🌟 Completa', sub: 'Visão 360° do FII' },
                 { id: 'dividendos', title: '💰 Dividendos', sub: 'Yield e Recorrência' },
                 { id: 'riscos', title: '⚠️ Riscos', sub: 'Vacância e Crédito' },
                 { id: 'valuation', title: '🎯 Valuation', sub: 'Preço Justo & P/VP' },
               ] as const
             ).map(item => (
               <TouchableOpacity
                 key={item.id}
                 style={[
                   styles.focusCard,
                   selectedFocus === item.id && styles.focusCardActive,
                 ]}
                 onPress={() => setSelectedFocus(item.id)}
               >
                 <Text
                   style={[
                     styles.focusTitle,
                     selectedFocus === item.id && styles.focusTitleActive,
                   ]}
                 >
                   {item.title}
                 </Text>
                 <Text style={styles.focusSub}>{item.sub}</Text>
               </TouchableOpacity>
             ))}
           </View>
           {fiiDadosResumo && mensagens.length > 0 && (
             <Text style={styles.focusHint}>
               O novo foco vale para as próximas perguntas ou ao iniciar uma nova análise.
             </Text>
           )}
           {erro && <Text style={styles.errorText}>{erro}</Text>}

           {/* Grid de Indicadores Base */}
           {fiiDadosResumo && (
             <View style={styles.metricsBox}>
               <Text style={styles.metricsHeader}>
                 Indicadores Base • {fiiDadosResumo.ticker}
               </Text>

               <View style={styles.metricsGrid}>
                 {/* 1. Cotação Atual */}
                 <View style={styles.metricItemBox}>
                   <Text style={styles.metricItemLabel}>Cotação Atual</Text>
                   <Text style={styles.metricItemVal}>
                     {typeof fiiDadosResumo.price === 'number'
                       ? `R$ ${fiiDadosResumo.price.toFixed(2)}`
                       : 'Não informado'}
                   </Text>
                   {fiiDadosResumo?.dataCotacao ? (
                     <Text style={styles.metricItemDate}>
                       Base: {fiiDadosResumo.dataCotacao.split('-').reverse().join('/')}
                     </Text>
                   ) : (
                     <Text style={styles.metricItemDateMissing}>Não informado</Text>
                   )}
                 </View>

                {/* 2. Último Provento */}
                <View style={styles.metricItemBox}>
                  <Text style={styles.metricItemLabel}>Último Provento</Text>
                  <Text style={styles.metricItemVal}>
                    {typeof fiiDadosResumo.lastDividend === 'number'
                      ? `R$ ${fiiDadosResumo.lastDividend.toFixed(2)}`
                      : 'Não informado'}
                  </Text>
                  {fiiDadosResumo?.dataComUltimoProvento ? (
                    <Text style={styles.metricItemDate}>
                      Data-com: {fiiDadosResumo.dataComUltimoProvento.split('-').reverse().join('/')}
                    </Text>
                  ) : (
                    <Text style={styles.metricItemDateMissing}>Data-com: Não informado</Text>
                  )}
                  {fiiDadosResumo?.dataPagamentoUltimoProvento ? (
                    <Text style={styles.metricItemDate}>
                      Pgto: {fiiDadosResumo.dataPagamentoUltimoProvento.split('-').reverse().join('/')}
                    </Text>
                  ) : fiiDadosResumo?.dataUltimoProvento ? (
                    <Text style={styles.metricItemDate}>
                      Pgto: {fiiDadosResumo.dataUltimoProvento.split('-').reverse().join('/')}
                    </Text>
                  ) : (
                    <Text style={styles.metricItemDateMissing}>Pgto: Não informado</Text>
                  )}
                </View>

                 {/* 3. P/VP */}
                 <View style={styles.metricItemBox}>
                   <Text style={styles.metricItemLabel}>P/VP</Text>
                   <Text style={styles.metricItemVal}>
                     {typeof fiiDadosResumo.pvp === 'number'
                       ? fiiDadosResumo.pvp.toFixed(2)
                       : 'Não informado'}
                   </Text>
                   {fiiDadosResumo?.dataReferencia ? (
                     <Text style={styles.metricItemDate}>
                       Base: {fiiDadosResumo.dataReferencia.split('-').reverse().join('/')}
                     </Text>
                   ) : (
                     <Text style={styles.metricItemDateMissing}>Não informado</Text>
                   )}
                 </View>

                 {/* 4. Dividend Yield */}
                 <View style={styles.metricItemBox}>
                   <Text style={styles.metricItemLabel}>Dividend Yield</Text>
                   <Text style={styles.metricItemVal}>
                     {typeof fiiDadosResumo.dividendYield === 'number'
                       ? `${fiiDadosResumo.dividendYield.toFixed(2)}%`
                       : 'Não informado'}
                   </Text>
                   {typeof fiiDadosResumo.dividendYield !== 'number' && (
                     <Text style={styles.metricItemDateMissing}>Não informado</Text>
                   )}
                 </View>

                 {/* 5. Valor Patrimonial (VP) */}
                 <View style={styles.metricItemBox}>
                   <Text style={styles.metricItemLabel}>Valor Patrimonial (VP)</Text>
                   <Text style={styles.metricItemVal}>
                     {typeof fiiDadosResumo.patrimonioPorCota === 'number' &&
                     Number.isFinite(fiiDadosResumo.patrimonioPorCota) &&
                     fiiDadosResumo.patrimonioPorCota > 0
                       ? `R$ ${fiiDadosResumo.patrimonioPorCota.toFixed(2)}`
                       : typeof fiiDadosResumo.price === 'number' &&
                         typeof fiiDadosResumo.pvp === 'number' &&
                         fiiDadosResumo.pvp > 0
                       ? `R$ ${(fiiDadosResumo.price / fiiDadosResumo.pvp).toFixed(2)}`
                       : 'Não informado'}
                   </Text>
                   {fiiDadosResumo?.dataPatrimonio ? (
                     <Text style={styles.metricItemDate}>
                       Base: {fiiDadosResumo.dataPatrimonio.split('-').reverse().join('/')}
                     </Text>
                   ) : (
                     <Text style={styles.metricItemDateMissing}>Não informado</Text>
                   )}
                 </View>

                 {/* 6. Patrimônio Líquido */}
                 <View style={styles.metricItemBox}>
                   <Text style={styles.metricItemLabel}>Patrimônio Líquido</Text>
                   <Text style={styles.metricItemVal}>
                     {typeof fiiDadosResumo?.patrimonioLiquido === 'number' &&
                     Number.isFinite(fiiDadosResumo.patrimonioLiquido)
                       ? fiiDadosResumo.patrimonioLiquido >= 1_000_000_000
                         ? `R$ ${(fiiDadosResumo.patrimonioLiquido / 1_000_000_000).toFixed(2)} bi`
                         : `R$ ${(fiiDadosResumo.patrimonioLiquido / 1_000_000).toFixed(1)} mi`
                       : 'Não informado'}
                   </Text>
                   {!(typeof fiiDadosResumo?.patrimonioLiquido === 'number' &&
                     Number.isFinite(fiiDadosResumo.patrimonioLiquido)) && (
                     <Text style={styles.metricItemDateMissing}>Não informado</Text>
                   )}
                 </View>

                 {/* 7. Nº de Cotistas */}
                 <View style={styles.metricItemBox}>
                   <Text style={styles.metricItemLabel}>Nº de Cotistas</Text>
                   <Text style={styles.metricItemVal}>
                     {fiiDadosResumo.numeroCotistas != null
                       ? Number(fiiDadosResumo.numeroCotistas).toLocaleString('pt-BR')
                       : 'Não informado'}
                   </Text>
                   {fiiDadosResumo.numeroCotistas == null && (
                     <Text style={styles.metricItemDateMissing}>Não informado</Text>
                   )}
                 </View>

                 {/* 8. Card Dinâmico: Nº de Imóveis / CRIs / FIIs / Projetos / Ativos */}
                 {(() => {
                   const tipoOuSetor = (
                     (fiiDadosResumo.tipoFii ?? '') + ' ' +
                     (fiiDadosResumo.sector ?? '') + ' ' +
                     (fiiDadosResumo.estrategia ?? '') + ' ' +
                     (fiiDadosResumo.descricao ?? '')
                   ).toLowerCase();

                   const ehDesenvolvimento =
                     tipoOuSetor.includes('desenvolvimento') ||
                     tipoOuSetor.includes('loteamento') ||
                     tipoOuSetor.includes('spe');

                   const qtdCris = (fiiDadosResumo as any).qtdCris;
                   const qtdImoveis = (fiiDadosResumo as any).qtdImoveis ?? fiiDadosResumo.numeroImoveis;
                   const qtdFiis = (fiiDadosResumo as any).qtdFiis;
                   const qtdProjetos = (fiiDadosResumo as any).qtdProjetos ?? (fiiDadosResumo as any).qtdSpes;

                   const itensDetalhados: Array<{ label: string; count: number }> = [];

                   if (typeof qtdCris === 'number' && qtdCris > 0) {
                     itensDetalhados.push({ label: 'CRIs', count: qtdCris });
                   }
                   if (typeof qtdFiis === 'number' && qtdFiis > 0) {
                     itensDetalhados.push({ label: 'FIIs', count: qtdFiis });
                   }
                   if (typeof qtdImoveis === 'number' && qtdImoveis > 0) {
                     itensDetalhados.push({ label: 'Imóveis', count: qtdImoveis });
                   }
                   if (typeof qtdProjetos === 'number' && qtdProjetos > 0) {
                     itensDetalhados.push({ label: 'Projetos', count: qtdProjetos });
                   }

                   let rotulo = 'Nº de Ativos';
                   let valorTexto = 'Não informado';

                   if (itensDetalhados.length > 1) {
                     rotulo = 'Composição dos Ativos';
                   } else if (itensDetalhados.length === 1) {
                     const item = itensDetalhados[0];
                     if (item.label === 'CRIs') {
                       rotulo = 'Nº de CRIs / Títulos';
                       valorTexto = `${item.count}`;
                     } else if (item.label === 'FIIs') {
                       rotulo = 'Nº de FIIs na Carteira';
                       valorTexto = `${item.count}`;
                     } else if (item.label === 'Imóveis') {
                       rotulo = 'Nº de Imóveis';
                       valorTexto = `${item.count}`;
                     } else if (item.label === 'Projetos') {
                       rotulo = 'Ativos em Desenvolvimento';
                       valorTexto = `${item.count} Projeto${item.count > 1 ? 's / SPEs' : ' / SPE'}`;
                     }
                   } else {
                     if (ehDesenvolvimento) {
                       rotulo = 'Ativos em Desenvolvimento';
                       const val = fiiDadosResumo.numeroAtivos ?? fiiDadosResumo.numeroImoveis;
                       valorTexto = val != null ? `${val} Projeto${val > 1 ? 's / SPEs' : ' / SPE'}` : 'Não informado';
                     } else if (tipoOuSetor.includes('tijolo')) {
                       rotulo = 'Nº de Imóveis';
                       const val = fiiDadosResumo.numeroImoveis ?? fiiDadosResumo.numeroAtivos;
                       valorTexto = val != null ? `${val}` : 'Não informado';
                     } else if (tipoOuSetor.includes('papel') || tipoOuSetor.includes('recebiveis')) {
                       rotulo = 'Nº de CRIs / Títulos';
                       const val = fiiDadosResumo.numeroAtivos;
                       valorTexto = val != null ? `${val}` : 'Não informado';
                     } else if (tipoOuSetor.includes('fundo de fundos') || tipoOuSetor.includes('fof')) {
                       rotulo = 'Nº de FIIs na Carteira';
                       const val = fiiDadosResumo.numeroAtivos;
                       valorTexto = val != null ? `${val}` : 'Não informado';
                     } else {
                       const val = fiiDadosResumo.numeroAtivos ?? fiiDadosResumo.numeroImoveis;
                       valorTexto = val != null ? `${val}` : 'Não informado';
                     }
                   }

                   return (
                     <View style={styles.metricItemBox}>
                       <Text style={styles.metricItemLabel}>{rotulo}</Text>
                       {itensDetalhados.length > 1 ? (
                         <View style={{ marginTop: 2 }}>
                           {itensDetalhados.map((item, idx) => (
                             <Text
                               key={idx}
                               style={{
                                 fontSize: 12,
                                 fontWeight: 'bold',
                                 color: '#38bdf8',
                                 lineHeight: 16,
                               }}
                             >
                               {item.label}: {item.count}
                             </Text>
                           ))}
                         </View>
                       ) : (
                         <>
                           <Text
                             style={styles.metricItemVal}
                             numberOfLines={2}
                             adjustsFontSizeToFit
                             minimumFontScale={0.75}
                           >
                             {valorTexto}
                           </Text>
                           {valorTexto === 'Não informado' && (
                             <Text style={styles.metricItemDateMissing}>Não informado</Text>
                           )}
                         </>
                       )}
                     </View>
                   );
                 })()}

                 {/* 9. Vacância Física */}
                 <View style={styles.metricItemBox}>
                   <Text style={styles.metricItemLabel}>Vacância Física</Text>
                   <Text style={styles.metricItemVal}>
                     {typeof fiiDadosResumo.vacanciaFisica === 'number'
                       ? `${fiiDadosResumo.vacanciaFisica.toFixed(2)}%`
                       : 'Não informado'}
                   </Text>
                   {typeof fiiDadosResumo.vacanciaFisica !== 'number' && (
                     <Text style={styles.metricItemDateMissing}>Não informado</Text>
                   )}
                 </View>



{/* Taxa IPCA+ e Retorno Exigido */}
<View style={styles.metricItemBox}>
  <Text style={styles.metricItemLabel}>Taxa IPCA+ / Retorno Exigido</Text>
  <Text style={styles.metricItemVal}>
    {typeof fiiDadosResumo.taxaTesouroIpcaPrecoTeto === 'number'
      ? `${fiiDadosResumo.taxaTesouroIpcaPrecoTeto.toFixed(2).replace('.', ',')}%`
      : 'Não informado'}
  </Text>
  {typeof fiiDadosResumo.taxaTesouroIpcaPrecoTeto === 'number' && (
    <>
      <Text style={styles.metricItemDateMissing}>
        Prêmio de risco: +{(fiiDadosResumo.premioRiscoPrecoTeto ?? 2).toFixed(2).replace('.', ',')}%
      </Text>
      {typeof fiiDadosResumo.crescimentoEsperadoPrecoTeto === 'number' && fiiDadosResumo.crescimentoEsperadoPrecoTeto > 0 && (
        <Text style={styles.metricItemDateMissing}>
          Crescimento real: {fiiDadosResumo.crescimentoEsperadoPrecoTeto.toFixed(2).replace('.', ',')}%
        </Text>
      )}
      <Text style={styles.metricItemDateMissing}>
        Retorno exigido: {typeof fiiDadosResumo.retornoExigidoPrecoTeto === 'number'
          ? `${fiiDadosResumo.retornoExigidoPrecoTeto.toFixed(2).replace('.', ',')}%`
          : `${(fiiDadosResumo.taxaTesouroIpcaPrecoTeto + (fiiDadosResumo.premioRiscoPrecoTeto ?? 2)).toFixed(2).replace('.', ',')}%`}
      </Text>
    </>
  )}
</View>


                 {/* 10. Inadimplência */}
                 <View style={styles.metricItemBox}>
                   <Text style={styles.metricItemLabel}>Inadimplência</Text>
                   <Text style={styles.metricItemVal}>
                     {typeof fiiDadosResumo.inadimplencia === 'number'
                       ? `${fiiDadosResumo.inadimplencia.toFixed(2)}%`
                       : 'Não informado'}
                   </Text>
                   {typeof fiiDadosResumo.inadimplencia !== 'number' && (
                     <Text style={styles.metricItemDateMissing}>Não informado</Text>
                   )}
                 </View>

                 {/* Gestor */}
                 <View style={styles.metricItemBox}>
                   <Text style={styles.metricItemLabel}>Gestor</Text>
                   <Text style={styles.metricItemVal}>
                     {fiiDadosResumo.gestor || 'Não informado'}
                   </Text>
                   {!fiiDadosResumo.gestor && (
                     <Text style={styles.metricItemDateMissing}>Não informado</Text>
                   )}
                 </View>

                 {/* Administrador */}
                 <View style={styles.metricItemBox}>
                   <Text style={styles.metricItemLabel}>Administrador</Text>
                   <Text style={styles.metricItemVal}>
                     {fiiDadosResumo.administrador || 'Não informado'}
                   </Text>
                   {!fiiDadosResumo.administrador && (
                     <Text style={styles.metricItemDateMissing}>Não informado</Text>
                   )}
                 </View>

                 {/* Total Investido */}
                 <View style={styles.metricItemBox}>
                   <Text style={styles.metricItemLabel}>Total Investido</Text>
                   <Text style={styles.metricItemVal}>
                     {typeof fiiDadosResumo.dadosAdicionais?.totalInvestido === 'number' &&
                     Number.isFinite(fiiDadosResumo.dadosAdicionais.totalInvestido)
                       ? fiiDadosResumo.dadosAdicionais.totalInvestido >= 1_000_000_000
                         ? `R$ ${(fiiDadosResumo.dadosAdicionais.totalInvestido / 1_000_000_000).toFixed(2)} bi`
                         : fiiDadosResumo.dadosAdicionais.totalInvestido >= 1_000_000
                           ? `R$ ${(fiiDadosResumo.dadosAdicionais.totalInvestido / 1_000_000).toFixed(2)} mi`
                           : `R$ ${fiiDadosResumo.dadosAdicionais.totalInvestido.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`
                       : 'Não informado'}
                   </Text>
                   {!(typeof fiiDadosResumo.dadosAdicionais?.totalInvestido === 'number' &&
                     Number.isFinite(fiiDadosResumo.dadosAdicionais.totalInvestido)) && (
                     <Text style={styles.metricItemDateMissing}>Não informado</Text>
                   )}
                 </View>

                 {/* 11. Card de Segmento / Indexador Principal */}
                 {(() => {
                   const catalogFund = findFund(fiiDadosResumo.ticker);

                   const tipoOuSetor = (
                     (catalogFund?.sector ?? fiiDadosResumo.tipoFii ?? '') + ' ' +
                     (catalogFund?.segment ?? fiiDadosResumo.estrategia ?? '') + ' ' +
                     (fiiDadosResumo.estrategia ?? '') + ' ' +
                     (fiiDadosResumo.descricao ?? '') + ' ' +
                     (fiiDadosResumo.ticker ?? '')
                   ).toLowerCase();

                   const ehDesenvolvimento = /desenvolvimento|loteamento|spe|misto/.test(tipoOuSetor);
                   const ehInfra = /infra|deb[eê]ntures?|bodb|fi-infra/.test(tipoOuSetor);
                   const ehPapel = /papel|receb[ií]veis|cr[ií]s?\b|cr[eé]dito/.test(tipoOuSetor);

                   let rotulo = 'Segmento / Setor';
                   let valor = catalogFund?.segment || catalogFund?.sector || fiiDadosResumo.sector || fiiDadosResumo.estrategia || fiiDadosResumo.tipoFii || 'Não informado';

                   if (ehInfra) {
                     rotulo = 'Segmento / Setor';
                     valor = 'FI-Infra (Debêntures)';
                   } else if (ehDesenvolvimento) {
                     rotulo = 'Segmento / Setor';
                     valor = 'Desenvolvimento Imobiliário';
                   } else if (ehPapel) {
                     rotulo = 'Indexador Dominante';
                     valor =
                       fiiDadosResumo.indexadorDominante ??
                       (tipoOuSetor.includes('ipca')
                         ? 'IPCA'
                         : tipoOuSetor.includes('cdi')
                         ? 'CDI'
                         : tipoOuSetor.includes('igpm')
                         ? 'IGP-M'
                         : 'CRIs Diversificados (IPCA/CDI)');
                   }

                   return (
                     <View style={styles.metricItemBox}>
                       <Text style={styles.metricItemLabel}>{rotulo}</Text>
                       <Text style={styles.metricItemVal}>{valor}</Text>
                     </View>
                   );
                 })()}

                 // 12. Card de Preço-Teto & Margem de Segurança
                 {(() => {
                   const temPrecoTeto =
                     fiiDadosResumo.precoTeto !== undefined &&
                     Number.isFinite(fiiDadosResumo.precoTeto) &&
                     fiiDadosResumo.precoTeto > 0;

                   const margem = fiiDadosResumo.margemSegurancaPrecoTeto;
                   const temMargem = margem !== undefined && Number.isFinite(margem);
                   const TAMANHO_TEXTO_PVP_TETO = 10;
                   const pvpTeto = fiiDadosResumo.pvpEstimadoPrecoTeto;
                   const temPvpTeto = pvpTeto !== undefined && Number.isFinite(pvpTeto) && pvpTeto > 0;

                   const corMargem = temMargem
                     ? margem >= 0
                       ? '#10B981'
                       : '#EF4444'
                     : '#6B7280';

                   return (
                     <View style={styles.metricItemBox}>
                       <Text style={styles.metricItemLabel}>Preço-Teto (Gordon)</Text>
                       {temPrecoTeto ? (
                         <>
                           <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' }}>
                             <Text style={styles.metricItemVal}>
                               R$ {fiiDadosResumo.precoTeto!.toFixed(2).replace('.', ',')}
                             </Text>
                             {temPvpTeto && (
                               <Text
                                 style={{
                                   fontSize: TAMANHO_TEXTO_PVP_TETO,
                                   color: pvpTeto > 1 ? '#F59E0B' : '#9CA3AF',
                                   marginLeft: 6,
                                 }}
                               >
                                 P/VP no teto: {pvpTeto.toFixed(2).replace('.', ',')}x
                               </Text>
                             )}
                           </View>
                           {temMargem && (
                             <Text style={{ fontSize: 11, color: corMargem, fontWeight: 'bold', marginTop: 2 }}>
                               {margem >= 0
                                 ? `Margem: +${margem.toFixed(1).replace('.', ',')}%`
                                 : `Acima: ${margem.toFixed(1).replace('.', ',')}%`}
                             </Text>
                           )}
                           {fiiDadosResumo.metodoPrecoTeto && (
                             <Text style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>
                               {fiiDadosResumo.metodoPrecoTeto}
                             </Text>
                           )}
                         </>
                       ) : (
                         <Text style={{ fontSize: 13, color: '#9CA3AF' }}>
                           {fiiDadosResumo.statusPrecoTeto ?? 'Indisponível'}
                         </Text>
                       )}
                     </View>
                   );
                 })()}
               </View>
             </View>
           )}

           {/* Conversa com o Analista IA */}
           <View style={styles.aiBox}>
             <View style={styles.aiHeaderRow}>
               <Text style={styles.aiTitle}>
                 Chat com o Analista IA {fiiDadosResumo ? `${fiiDadosResumo.ticker}` : ''}
               </Text>
               {fiiDadosResumo && (
                 <TouchableOpacity
                   style={styles.btnAtualizarIa}
                   onPress={reiniciarAnalise}
                   disabled={ocupada}
                 >
                   <Text style={styles.btnAtualizarIaText}>
                     {loadingIa ? 'Gerando...' : 'Reiniciar conversa'}
                   </Text>
                 </TouchableOpacity>
               )}
             </View>
             {mensagens.length === 0 && !loadingIa && (
               <Text style={styles.aiPlaceholder}>
                 Digite um ticker e toque em "Analisar". O analista iniciará a conversa automaticamente e você poderá fazer follow-ups abaixo.
               </Text>
             )}
             {mensagens.map(msg => (
               <View
                 key={msg.id}
                 style={[
                   styles.bolha,
                   msg.papel === 'usuario' ? styles.bolhaUsuario : styles.bolhaIa,
                 ]}
               >
                 {msg.papel === 'usuario' ? (
                   <Text style={styles.bolhaUsuarioTexto}>{msg.texto}</Text>
                 ) : (
                   <View>{renderMarkdown(msg.texto)}</View>
                 )}
                 {msg.papel === 'ia' && msg.fontes.length > 0 && (
                   <View style={styles.fontesBloco}>
                     <Text style={styles.fontesTitulo}>Fontes consultadas na web:</Text>
                     {msg.fontes.slice(0, 8).map((fonte, i) => (
                       <Text
                         key={`${fonte.uri}-${i}`}
                         style={styles.fonteLink}
                         numberOfLines={1}
                         onPress={() => {
                           void Linking.openURL(fonte.uri);
                         }}
                       >
                         {fonte.titulo || fonte.uri}
                       </Text>
                     ))}
                   </View>
                 )}
               </View>
             ))}
                    {loadingIa && (
                      <View style={[styles.bolha, styles.bolhaIa, styles.loadingBolha]}>
                        <ActivityIndicator color="#38bdf8" size="small" />
                        <Text style={styles.loadingInlineText}>
                          Analisando dados e pesquisando na web…
                        </Text>
                      </View>
                    )}
                  </View>
                </ScrollView>
                {/* 📍 Rola automaticamente para a resposta nova quando o conteúdo cresce */}
                {/* Certifique-se de que a abertura do seu ScrollView principal (lá em cima) possui o onContentSizeChange como conversamos: */}
                {/* onContentSizeChange={() => chatScrollViewRef.current?.scrollToEnd({ animated: true })} */}
                {/* 🚀 Botão Flutuante Voltar ao Topo */}
                      {showTopButton && (
                        <TouchableOpacity
                          style={styles.floatingTopBtn}
                          onPress={() => {
                            if (scrollRef.current) {
                              scrollRef.current.scrollTo({ y: 0, animated: true });
                            }
                          }}
                        >
                          <Ionicons name="arrow-up" size={22} color="#fff" />
                        </TouchableOpacity>
                      )}
                {/* Perguntas rápidas */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.rapidasRow}
                  contentContainerStyle={styles.rapidasContent}
                >
                  {PERGUNTAS_RAPIDAS.map(pergunta => (
                    <TouchableOpacity
                      key={pergunta}
                      style={[styles.pill, ocupada && styles.pillDesativada]}
                      disabled={ocupada}
                      onPress={() => {
                        Keyboard.dismiss();
                        void enviarMensagem(pergunta);
                      }}
                    >
                      <Text style={styles.pillText}>{pergunta}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Entrada de mensagem */}
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.chatInput}
                    value={entrada}
                    onChangeText={setEntrada}
                    placeholder={
                      fiiDadosResumo
                        ? `Pergunte mais sobre ${fiiDadosResumo.ticker}…`
                        : 'Informe o ticker e pergunte (opcional)…'
                    }
                    placeholderTextColor="#64748b"
                    multiline
                    returnKeyType="send"
                    blurOnSubmit={true}
                    onSubmitEditing={() => {
                      Keyboard.dismiss();
                      if (entrada.trim() && !ocupada) {
                        void enviarMensagem(entrada);
                      }
                    }}
                  />
                  <TouchableOpacity
                    style={[
                      styles.btnEnviar,
                      (!entrada.trim() || ocupada) && styles.btnDesativado,
                    ]}
                    disabled={!entrada.trim() || ocupada}
                    onPress={() => {
                      Keyboard.dismiss();
                      void enviarMensagem(entrada);
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
                      ➤
                    </Text>
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            </ScreenContainer>
          );
        }
const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#0369a1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  configBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#1e293b',
  },
  configCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  configTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  apiKeyInput: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#ffffff',
    fontSize: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
 floatingTopBtn: {
     position: 'absolute',
     right: 20,
     bottom: 85, // Fica logo acima da barra de input de mensagens
     backgroundColor: '#0284c7', // Azul moderno combinando com o tema
     width: 44,
     height: 44,
     borderRadius: 22,
     justifyContent: 'center',
     alignItems: 'center',
     elevation: 5,
     shadowColor: '#000',
     shadowOffset: { width: 0, height: 2 },
     shadowOpacity: 0.3,
     shadowRadius: 3,
     zIndex: 99,
   },
  sectionLabel: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 8,
    marginTop: 8,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  tickerInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#1c2541',
    borderRadius: 8,
    paddingHorizontal: 12,
    color: '#fff',
    fontWeight: 'bold',
  },
  btnAnalisar: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  btnAnalisarText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  sugestoesBox: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    marginTop: -6,
    marginBottom: 12,
    overflow: 'hidden',
  },
  sugestaoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    gap: 10,
  },
  sugestaoIcone: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: '#1c2541',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sugestaoTextoBox: {
    flex: 1,
  },
  sugestaoTicker: {
    color: '#38bdf8',
    fontSize: 14,
    fontWeight: '800',
  },
  sugestaoNome: {
    color: '#e2e8f0',
    fontSize: 12,
    marginTop: 2,
  },
  sugestaoDescricao: {
    color: '#94a3b8',
    fontSize: 10,
    marginTop: 3,
  },
  sugestaoVazia: {
    padding: 12,
  },
  sugestaoVaziaTexto: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
  },
  chip: {
    backgroundColor: '#1c2541',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipSelected: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  chipText: {
    color: '#94a3b8',
    fontWeight: '600',
    fontSize: 12,
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  pill: {
    backgroundColor: '#1c2541',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
  },
  pillText: {
    color: '#94a3b8',
    fontWeight: '600',
    fontSize: 12,
  },
  pillDesativada: {
    opacity: 0.5,
  },
  focusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  focusCard: {
    width: '48%',
    backgroundColor: '#1c2541',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  focusCardActive: {
    borderColor: '#0284c7',
    backgroundColor: '#0f2942',
  },
  focusTitle: {
    color: '#94a3b8',
    fontWeight: 'bold',
    fontSize: 14,
  },
  focusTitleActive: {
    color: '#38bdf8',
  },
  focusSub: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  focusHint: {
    color: '#64748b',
    fontSize: 11,
    marginBottom: 8,
  },
  errorText: {
    color: '#ef4444',
    marginBottom: 12,
  },
  metricsBox: {
    backgroundColor: '#1c2541',
    padding: 14,
    borderRadius: 8,
    marginBottom: 16,
  },
  metricsHeader: {
    color: '#38bdf8',
    fontWeight: 'bold',
    marginBottom: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
 metricItemBox: {
   width: '48%',
   backgroundColor: '#0b132b',
   padding: 10,
   borderRadius: 6,
   minHeight: 78,              // Garante altura uniforme mesmo com textos longos
   justifyContent: 'space-between', // Distribui rótulo, valor e data proporcionalmente
 },
 metricItemLabel: {
   color: '#64748b',
   fontSize: 11,
 },
 metricItemVal: {
   color: '#fff',
   fontWeight: 'bold',
   fontSize: 13,                // Ajustado levemente de 14 para 13
   marginTop: 2,
   flexWrap: 'wrap',            // Permite quebrar linha para não estourar a caixa
 },
  metricItemDate: {
    fontSize: 10,
    color: '#888888',
    marginTop: 2,
    textAlign: 'center',
  },
  metricItemDateMissing: {
    fontSize: 9,
    color: '#ef4444',
    marginTop: 2,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  aiBox: {
    backgroundColor: '#1c2541',
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
  },
  aiHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  aiTitle: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    flex: 1,
    flexShrink: 1,
  },
  btnAtualizarIa: {
    backgroundColor: '#0369a1',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  btnAtualizarIaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  aiPlaceholder: {
    color: '#64748b',
    fontSize: 12,
    fontStyle: 'italic',
  },
  bolha: {
    borderRadius: 12,
    padding: 10,
    marginVertical: 4,
    maxWidth: '92%',
  },
  bolhaUsuario: {
    backgroundColor: '#0284c7',
    alignSelf: 'flex-end',
  },
  bolhaIa: {
    backgroundColor: '#0f2942',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#1e3a5f',
  },
  bolhaUsuarioTexto: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 19,
  },
  fontesBloco: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e3a5f',
    paddingTop: 6,
  },
  fontesTitulo: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  fonteLink: {
    color: '#60a5fa',
    fontSize: 12,
    textDecorationLine: 'underline',
    marginVertical: 1,
  },
  loadingBolha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingInlineText: {
    color: '#94a3b8',
    fontSize: 12,
    flex: 1,
    flexShrink: 1,
  },
  rapidasRow: {
    flexGrow: 0,
    paddingVertical: 4,
  },
  rapidasContent: {
    paddingHorizontal: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  chatInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    backgroundColor: '#1c2541',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    color: '#fff',
    fontSize: 13,
  },
  btnEnviar: {
    backgroundColor: '#0284c7',
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnDesativado: {
    opacity: 0.5,
  },
  mdTitulo: {
    color: '#38bdf8',
    fontWeight: 'bold',
    fontSize: 15,
    marginTop: 8,
    marginBottom: 2,
  },
  mdLista: {
    marginVertical: 4,
  },
  mdListaItem: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingRight: 4,
  },
  mdListaMarcador: {
    color: '#38bdf8',
    width: 18,
    fontSize: 13,
    lineHeight: 19,
  },
  mdEspaco: {
    height: 6,
  },
  mdCitacao: {
    borderLeftWidth: 3,
    borderLeftColor: '#0369a1',
    paddingLeft: 8,
    marginVertical: 4,
  },
  mdDivisoria: {
    height: 1,
    backgroundColor: '#1e3a5f',
    marginVertical: 8,
  },
  mdNegrito: {
    color: '#e2e8f0',
    fontWeight: 'bold',
  },
  mdItalico: {
    color: '#cbd5e1',
    fontStyle: 'italic',
  },
  mdCodigo: {
    color: '#7dd3fc',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
  },
  mdLink: {
    color: '#60a5fa',
    textDecorationLine: 'underline',
  },
  aiResultText: {
    color: '#cbd5e1',
    lineHeight: 19,
    fontSize: 13,
  },
});