import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/use-colors";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { usePortfolio } from "@/lib/portfolio";
import { monthLabel } from "@/lib/format";
import {
  buscarEventosFnet,
  type FnetEvent,
} from "@/lib/fnet";

type EventoComTicker = FnetEvent & {
  ticker: string;
};

type SecaoEventos = {
  key: string;
  title: string;
  data: EventoComTicker[];
};

const MESES = [
  "JANEIRO",
  "FEVEREIRO",
  "MARÇO",
  "ABRIL",
  "MAIO",
  "JUNHO",
  "JULHO",
  "AGOSTO",
  "SETEMBRO",
  "OUTUBRO",
  "NOVEMBRO",
  "DEZEMBRO",
];

const EVENTOS_STORAGE_KEY =
  "@fii-guard:eventos-fnet:v3";

const shiftMonth = (
  key: string,
  delta: number
) => {
  const [year, month] =
    key.split("-").map(Number);

  if (!year || !month) {
    return key;
  }

  const d = new Date(
    Date.UTC(
      year,
      month - 1 + delta,
      1
    )
  );

  return d.toISOString().slice(0, 7);
};

function eventoPermitido(
  evento: FnetEvent
): boolean {
  if (
    evento.url?.includes(
      "sistemasweb.b3.com.br/PlantaoNoticias/"
    )
  ) {
    return false;
  }

  const texto = [
    evento.categoriaDocumento,
    evento.tipoDocumento,
    evento.descricaoFundo,
    evento.nomePregao,
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toUpperCase();

  return (
    texto.includes("ASSEMBLEIA") ||
    texto.includes("AGE") ||
    texto.includes("AGO") ||
    texto.includes("CONVOCACAO") ||
    texto.includes("RELATORIO") ||
    texto.includes("GERENCIAL") ||
    texto.includes("FATO RELEVANTE") ||
    texto.includes("AVISO AOS COTISTAS") ||
    texto.includes("COMUNICADO AO MERCADO") ||
    texto.includes("INFORME MENSAL") ||
    texto.includes("INFORME TRIMESTRAL") ||
    texto.includes("INFORME SEMANAL") ||
    texto.includes("RENDIMENTOS E AMORTIZACOES")
  );
}

function converterDataFnet(
  data: string
): number {
  if (!data) {
    return 0;
  }

  const parte =
    data.trim().split(" ")[0];

  if (parte.includes("/")) {
    const partes =
      parte.split("/");

    if (partes.length === 3) {
      return new Date(
        Number(partes[2]),
        Number(partes[1]) - 1,
        Number(partes[0])
      ).getTime();
    }

    if (partes.length === 2) {
      return new Date(
        Number(partes[1]),
        Number(partes[0]) - 1,
        1
      ).getTime();
    }
  }

  if (parte.includes("-")) {
    const partesIso =
      parte.split("-");

    if (partesIso.length >= 3) {
      return new Date(
        Number(partesIso[0]),
        Number(partesIso[1]) - 1,
        Number(partesIso[2])
      ).getTime();
    }

    if (partesIso.length === 2) {
      return new Date(
        Number(partesIso[0]),
        Number(partesIso[1]) - 1,
        1
      ).getTime();
    }
  }

  return 0;
}

function obterChaveMes(
  data: string
): string {
  if (!data) {
    return "0000-00";
  }

  const parte =
    data.trim().split(" ")[0];

  if (parte.includes("/")) {
    const partes =
      parte.split("/");

    if (partes.length === 3) {
      return `${partes[2]}-${partes[1].padStart(
        2,
        "0"
      )}`;
    }

    if (partes.length === 2) {
      return `${partes[1]}-${partes[0].padStart(
        2,
        "0"
      )}`;
    }
  }

  if (parte.includes("-")) {
    const partesIso =
      parte.split("-");

    if (partesIso.length >= 2) {
      return `${partesIso[0]}-${partesIso[1].padStart(
        2,
        "0"
      )}`;
    }
  }

  return "0000-00";
}

function formatarMes(
  chave: string
): string {
  const [ano, mes] =
    chave.split("-").map(Number);

  if (
    !ano ||
    !mes ||
    !MESES[mes - 1]
  ) {
    return chave;
  }

  return `${MESES[mes - 1]}/${ano}`;
}

function ehEventoAssembleia(
  evento: FnetEvent
): boolean {
  const texto = [
    evento.categoriaDocumento,
    evento.tipoDocumento,
    evento.descricaoFundo,
    evento.nomePregao,
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toUpperCase();

  return (
    texto.includes("ASSEMBLEIA") ||
    /\bAGE\b/.test(texto) ||
    /\bAGO\b/.test(texto)
  );
}

function obterDataPrincipalEvento(
  evento: FnetEvent
): string {
  if (ehEventoAssembleia(evento)) {
    return (
      evento.dataEntrega?.trim() ||
      evento.dataReferencia?.trim() ||
      ""
    );
  }

  return (
    evento.dataReferencia?.trim() ||
    evento.dataEntrega?.trim() ||
    ""
  );
}

function obterDataExibicaoEvento(
  evento: FnetEvent
): string {
  return (
    obterDataPrincipalEvento(evento) ||
    "Data não informada"
  );
}

async function carregarHistoricoEventos(): Promise<
  EventoComTicker[]
> {
  try {
    const salvo =
      await AsyncStorage.getItem(
        EVENTOS_STORAGE_KEY
      );

    console.log(
      "[EVENTOS DEBUG STORAGE]",
      salvo
    );

    if (!salvo) {
      return [];
    }

    const dados =
      JSON.parse(salvo);

    if (!Array.isArray(dados)) {
      return [];
    }

    return dados.filter(
      (
        item
      ): item is EventoComTicker =>
        item &&
        typeof item === "object" &&
        typeof item.id === "number" &&
        typeof item.ticker === "string" &&
        eventoPermitido(item)
    );
  } catch (error) {
    console.warn(
      "[EVENTOS] ERRO AO LER HISTÓRICO:",
      error
    );

    return [];
  }
}

async function salvarHistoricoEventos(
  eventos: EventoComTicker[]
): Promise<void> {
  try {
    const eventosPermitidos =
      eventos.filter(
        eventoPermitido
      );

    await AsyncStorage.setItem(
      EVENTOS_STORAGE_KEY,
      JSON.stringify(
        eventosPermitidos
      )
    );
  } catch (error) {
    console.warn(
      "[EVENTOS] ERRO AO SALVAR HISTÓRICO:",
      error
    );
  }
}

function mesclarEventos(
  historico: EventoComTicker[],
  novos: EventoComTicker[]
): EventoComTicker[] {
  const mapa =
    new Map<
      string,
      EventoComTicker
    >();

  function normalizar(
    texto: string | undefined
  ): string {
    return (texto || "")
      .trim()
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .toUpperCase();
  }

  function chaveDocumento(
    evento: EventoComTicker
  ): string {
    const ticker =
      normalizar(evento.ticker);

    const tipo =
      normalizar(
        evento.tipoDocumento ||
          evento.categoriaDocumento
      );

    const descricao =
      normalizar(
        evento.descricaoFundo
      );

    const data =
      obterDataPrincipalEvento(
        evento
      )
        .trim()
        .split(" ")[0];

    return `${ticker}|${tipo}|${descricao}|${data}`;
  }

  function adicionar(
    evento: EventoComTicker
  ) {
    if (
      !eventoPermitido(evento)
    ) {
      return;
    }

    const chave =
      chaveDocumento(evento);

    mapa.set(
      chave,
      evento
    );
  }

  historico.forEach(adicionar);
  novos.forEach(adicionar);

  const resultado =
    Array.from(
      mapa.values()
    );

  resultado.sort(
    (a, b) => {
      const dataA =
        converterDataFnet(
          obterDataPrincipalEvento(
            a
          )
        );

      const dataB =
        converterDataFnet(
          obterDataPrincipalEvento(
            b
          )
        );

      return dataB - dataA;
    }
  );

  return resultado;
}

function montarSecoesEventos(
  eventos: EventoComTicker[]
): SecaoEventos[] {
  const grupos: Record<
    string,
    EventoComTicker[]
  > = {};

  eventos.forEach(
    (evento) => {
      const data =
        obterDataPrincipalEvento(
          evento
        );

      const chave =
        obterChaveMes(data);

      if (
        chave === "0000-00"
      ) {
        return;
      }

      if (!grupos[chave]) {
        grupos[chave] = [];
      }

      grupos[chave].push(
        evento
      );
    }
  );

  const chavesOrdenadas =
    Object.keys(
      grupos
    ).sort(
      (a, b) =>
        b.localeCompare(a)
    );

  return chavesOrdenadas.map(
    (chave) => {
      const eventosDoMes =
        grupos[chave];

      eventosDoMes.sort(
        (a, b) => {
          const dataA =
            converterDataFnet(
              obterDataPrincipalEvento(
                a
              )
            );

          const dataB =
            converterDataFnet(
              obterDataPrincipalEvento(
                b
              )
            );

          if (
            dataB !== dataA
          ) {
            return (
              dataB - dataA
            );
          }

          return (
            Number(b.id) -
            Number(a.id)
          );
        }
      );

      return {
        key: chave,
        title:
          formatarMes(
            chave
          ),
        data:
          eventosDoMes,
      };
    }
  );
}

function chaveEvento(
  evento: EventoComTicker
): string {
  return `${evento.ticker
    .trim()
    .toUpperCase()}|${evento.id}`;
}

export default function EventosScreen() {
  const colors =
    useColors();

  const {
    ready,
    snapshot,
    settings,
  } = usePortfolio();

  const [
    secoes,
    setSecoes,
  ] =
    useState<SecaoEventos[]>(
      []
    );

  const [
    carregando,
    setCarregando,
  ] =
    useState(false);

  const [
    erro,
    setErro,
  ] =
    useState<string | null>(
      null
    );

  const [
    selectedMonth,
    setSelectedMonth,
  ] =
    useState(() =>
      new Date()
        .toISOString()
        .slice(0, 7)
    );

  const [
    mostrarTodos,
    setMostrarTodos,
  ] =
    useState(false);

  const [
    modoConfiguracao,
    setModoConfiguracao,
  ] =
    useState(false);

  const [
    eventoSelecionado,
    setEventoSelecionado,
  ] =
    useState<EventoComTicker | null>(
      null
    );

  const [
    eventoDesfeito,
    setEventoDesfeito,
  ] =
    useState<EventoComTicker | null>(
      null
    );

  async function carregarEventos() {
    if (!ready) {
      return;
    }

    setCarregando(true);
    setErro(null);

    try {
      const historico =
        await carregarHistoricoEventos();

      if (
        historico.length > 0
      ) {
        setSecoes(
          montarSecoesEventos(
            historico
          )
        );
      }

      const resultado: EventoComTicker[] =
        [];

      const ativos =
        snapshot.active || [];

      console.log(
        "[EVENTOS] ATIVOS DA CARTEIRA:",
        ativos.map(
          (
            p: {
              ticker: string;
              quantity: number;
            }
          ) => ({
            ticker: p.ticker,
            quantity:
              p.quantity,
          })
        )
      );

      for (
        const position of ativos
      ) {
        if (
          !position.ticker ||
          position.quantity <= 0
        ) {
          continue;
        }

        const ticker =
          position.ticker
            .trim()
            .toUpperCase();

        try {
          const documentos =
            await buscarEventosFnet(
              ticker,
              10,
              settings?.marketServiceUrl
            );

          console.log(
            `[EVENTOS] ${ticker}: ${documentos.length} documentos recebidos`
          );

          const documentosPermitidos =
            documentos.filter(
              eventoPermitido
            );

          console.log(
            `[EVENTOS] ${ticker}: ${documentosPermitidos.length} documentos permitidos`
          );

          documentosPermitidos.forEach(
            (documento) => {
              resultado.push({
                ...documento,
                ticker,
              });
            }
          );
        } catch (error) {
          console.warn(
            `[EVENTOS] ERRO NO ${ticker}:`,
            error
          );
        }
      }

      const eventosFinais =
        mesclarEventos(
          historico,
          resultado
        );

      await salvarHistoricoEventos(
        eventosFinais
      );

      setSecoes(
        montarSecoesEventos(
          eventosFinais
        )
      );
    } catch (error) {
      console.error(
        "Erro geral ao carregar eventos:",
        error
      );

      setErro(
        "Falha ao sincronizar o mural de eventos."
      );
    } finally {
      setCarregando(false);
    }
  }

  async function excluirEvento(
    evento: EventoComTicker
  ) {
    Alert.alert(
      "Excluir evento",
      `Deseja excluir este evento do armazenamento?\n\n${evento.ticker} — ID ${evento.id}`,
      [
        {
          text: "Cancelar",
          style: "cancel",
        },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            try {
              const salvo =
                await AsyncStorage.getItem(
                  EVENTOS_STORAGE_KEY
                );

              if (!salvo) {
                return;
              }

              const dados =
                JSON.parse(salvo);

              if (
                !Array.isArray(dados)
              ) {
                return;
              }

              const chave =
                chaveEvento(evento);

              const filtrados =
                dados.filter(
                  (item) => {
                    if (
                      !item ||
                      typeof item !==
                        "object"
                    ) {
                      return true;
                    }

                    if (
                      typeof item.id !==
                        "number" ||
                      typeof item.ticker !==
                        "string"
                    ) {
                      return true;
                    }

                    return (
                      chaveEvento(
                        item as EventoComTicker
                      ) !== chave
                    );
                  }
                );

              await AsyncStorage.setItem(
                EVENTOS_STORAGE_KEY,
                JSON.stringify(
                  filtrados
                )
              );

              const historico =
                await carregarHistoricoEventos();

              setSecoes(
                montarSecoesEventos(
                  historico
                )
              );

              setEventoDesfeito(
                evento
              );

              setEventoSelecionado(
                null
              );

              console.log(
                "[EVENTOS] EVENTO EXCLUÍDO:",
                evento.ticker,
                evento.id
              );
            } catch (error) {
              console.error(
                "[EVENTOS] ERRO AO EXCLUIR EVENTO:",
                error
              );

              Alert.alert(
                "Erro",
                "Não foi possível excluir o evento."
              );
            }
          },
        },
      ]
    );
  }

  async function desfazerExclusao() {
    if (!eventoDesfeito) {
      return;
    }

    try {
      const salvo =
        await AsyncStorage.getItem(
          EVENTOS_STORAGE_KEY
        );

      const dados =
        salvo
          ? JSON.parse(salvo)
          : [];

      const lista =
        Array.isArray(dados)
          ? dados
          : [];

      const chave =
        chaveEvento(
          eventoDesfeito
        );

      const jaExiste =
        lista.some(
          (item) => {
            if (
              !item ||
              typeof item !==
                "object"
            ) {
              return false;
            }

            if (
              typeof item.id !==
                "number" ||
              typeof item.ticker !==
                "string"
            ) {
              return false;
            }

            return (
              chaveEvento(
                item as EventoComTicker
              ) === chave
            );
          }
        );

      if (!jaExiste) {
        lista.push(
          eventoDesfeito
        );
      }

      await AsyncStorage.setItem(
        EVENTOS_STORAGE_KEY,
        JSON.stringify(lista)
      );

      const historico =
        await carregarHistoricoEventos();

      setSecoes(
        montarSecoesEventos(
          historico
        )
      );

      console.log(
        "[EVENTOS] EXCLUSÃO DESFEITA:",
        eventoDesfeito.ticker,
        eventoDesfeito.id
      );

      setEventoDesfeito(
        null
      );
    } catch (error) {
      console.error(
        "[EVENTOS] ERRO AO DESFAZER EXCLUSÃO:",
        error
      );

      Alert.alert(
        "Erro",
        "Não foi possível restaurar o evento."
      );
    }
  }

  useEffect(() => {
    if (ready) {
      carregarEventos();
    }
  }, [ready]);

  const secoesExibidas =
    useMemo(() => {
      if (mostrarTodos) {
        return secoes;
      }

      return secoes.filter(
        (secao) =>
          secao.key ===
          selectedMonth
      );
    }, [
      secoes,
      selectedMonth,
      mostrarTodos,
    ]);

  if (!ready) {
    return (
      <ScreenContainer>
        <View
          style={styles.center}
        >
          <Text
            style={styles.info}
          >
            Carregando carteira...
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  if (
    modoConfiguracao &&
    eventoSelecionado
  ) {
    const nomePregao =
      eventoSelecionado.nomePregao
        ?.trim() ||
      eventoSelecionado.descricaoFundo
        ?.trim() ||
      "FII";

    const tipoDocumento =
      eventoSelecionado.tipoDocumento
        ?.trim() ||
      eventoSelecionado.categoriaDocumento
        ?.trim() ||
      "Documento";

    const dataExibicao =
      obterDataExibicaoEvento(
        eventoSelecionado
      );

    return (
      <ScreenContainer>
        <View
          style={[
            styles.container,
            {
              backgroundColor:
                colors.background,
            },
          ]}
        >
          <Pressable
            style={
              styles.backButton
            }
            onPress={() =>
              setEventoSelecionado(
                null
              )
            }
          >
            <Text
              style={
                styles.backButtonText
              }
            >
              ‹ Voltar
            </Text>
          </Pressable>

          <Text
            style={[
              styles.title,
              {
                color:
                  colors.foreground,
              },
            ]}
          >
            Evento selecionado
          </Text>

          <View
            style={
              styles.detailCard
            }
          >
            <Text
              style={
                styles.detailTicker
              }
            >
              {eventoSelecionado.ticker}
            </Text>

            <Text
              style={
                styles.detailName
              }
            >
              {nomePregao}
            </Text>

            <Text
              style={
                styles.detailLabel
              }
            >
              Tipo do documento
            </Text>

            <Text
              style={
                styles.detailValue
              }
            >
              {tipoDocumento}
            </Text>

            <Text
              style={
                styles.detailLabel
              }
            >
              Data
            </Text>

            <Text
              style={
                styles.detailValue
              }
            >
              {dataExibicao}
            </Text>

            <Text
              style={
                styles.detailLabel
              }
            >
              Origem
            </Text>

            <Text
              style={
                styles.detailValue
              }
            >
              {eventoSelecionado.origem ||
                "Não informada"}
            </Text>

            <Text
              style={
                styles.detailLabel
              }
            >
              ID
            </Text>

            <Text
              style={
                styles.detailValue
              }
            >
              {eventoSelecionado.id}
            </Text>

            {eventoSelecionado.url && (
              <>
                <Text
                  style={
                    styles.detailLabel
                  }
                >
                  Documento
                </Text>

                <Text
                  style={
                    styles.detailUrl
                  }
                  numberOfLines={4}
                >
                  {eventoSelecionado.url}
                </Text>
              </>
            )}
          </View>

          <Pressable
            style={
              styles.deleteButton
            }
            onPress={() =>
              excluirEvento(
                eventoSelecionado
              )
            }
          >
            <Text
              style={
                styles.deleteButtonText
              }
            >
              EXCLUIR EVENTO
            </Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  if (modoConfiguracao) {
    const eventosConfiguracao =
      secoes.flatMap(
        (secao) =>
          secao.data
      );

    return (
      <ScreenContainer>
        <View
          style={[
            styles.container,
            {
              backgroundColor:
                colors.background,
            },
          ]}
        >
          <View
            style={
              styles.configHeader
            }
          >
            <View
              style={
                styles.configHeaderText
              }
            >
              <Text
                style={[
                  styles.title,
                  {
                    color:
                      colors.foreground,
                  },
                ]}
              >
                Configurar eventos
              </Text>

              <Text
                style={[
                  styles.subtitle,
                  {
                    color:
                      colors.foreground,
                  },
                ]}
              >
                Selecione um evento para ver os detalhes ou excluir.
              </Text>
            </View>

            <Pressable
              style={
                styles.closeConfigButton
              }
              onPress={() => {
                setModoConfiguracao(
                  false
                );
                setEventoSelecionado(
                  null
                );
              }}
            >
              <Text
                style={
                  styles.closeConfigButtonText
                }
              >
                FECHAR
              </Text>
            </Pressable>
          </View>

          {eventoDesfeito && (
            <View
              style={
                styles.undoBar
              }
            >
              <Text
                style={
                  styles.undoText
                }
              >
                {eventoDesfeito.ticker} — ID{" "}
                {eventoDesfeito.id} excluído.
              </Text>

              <Pressable
                style={
                  styles.undoButton
                }
                onPress={
                  desfazerExclusao
                }
              >
                <Text
                  style={
                    styles.undoButtonText
                  }
                >
                  DESFAZER
                </Text>
              </Pressable>
            </View>
          )}

          {eventosConfiguracao.length ===
            0 ? (
            <View
              style={
                styles.emptyContainer
              }
            >
              <Text
                style={
                  styles.info
                }
              >
                Nenhum evento armazenado.
              </Text>
            </View>
          ) : (
            <SectionList
              sections={secoes}
              keyExtractor={(
                item
              ) =>
                `${item.ticker}-${item.id}`
              }
              contentContainerStyle={
                styles.list
              }
              showsVerticalScrollIndicator={
                false
              }
              stickySectionHeadersEnabled={
                false
              }
              renderSectionHeader={({
                section,
              }) => (
                <View
                  style={
                    styles.monthHeader
                  }
                >
                  <Text
                    style={
                      styles.monthTitle
                    }
                  >
                    {section.title}
                  </Text>
                </View>
              )}
              renderItem={({
                item,
              }) => (
                <Pressable
                  style={
                    styles.configEventCard
                  }
                  onPress={() =>
                    setEventoSelecionado(
                      item
                    )
                  }
                >
                  <Text
                    style={
                      styles.configTicker
                    }
                  >
                    {item.ticker}
                  </Text>

                  <Text
                    style={
                      styles.configType
                    }
                    numberOfLines={2}
                  >
                    {item.tipoDocumento ||
                      item.categoriaDocumento ||
                      "Documento"}
                  </Text>

                  <Text
                    style={
                      styles.configDate
                    }
                  >
                    {obterDataExibicaoEvento(
                      item
                    )}
                  </Text>

                  <Text
                    style={
                      styles.configId
                    }
                  >
                    ID {item.id}
                  </Text>
                </Pressable>
              )}
            />
          )}
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View
        style={[
          styles.container,
          {
            backgroundColor:
              colors.background,
          },
        ]}
      >
        <View
          style={
            styles.titleRow
          }
        >
          <View
            style={
              styles.titleBlock
            }
          >
            <Text
              style={[
                styles.title,
                {
                  color:
                    colors.foreground,
                },
              ]}
            >
              Eventos
            </Text>

            <Text
              style={[
                styles.subtitle,
                {
                  color:
                    colors.foreground,
                },
              ]}
            >
              Comunicados e documentos dos FIIs da sua carteira
            </Text>
          </View>

          <Pressable
            style={
              styles.settingsButton
            }
            onPress={() => {
              setEventoDesfeito(
                null
              );
              setModoConfiguracao(
                true
              );
            }}
          >
            <Text
              style={
                styles.settingsButtonText
              }
            >
              ⚙
            </Text>
          </Pressable>
        </View>

        <View
          style={styles.periodPicker}
        >
          <Pressable
            onPress={() =>
              setSelectedMonth(
                shiftMonth(
                  selectedMonth,
                  -1
                )
              )
            }
            style={
              styles.periodBtn
            }
          >
            <Text
              style={
                styles.periodArrow
              }
            >
              ‹
            </Text>
          </Pressable>

          <Text
            style={
              styles.periodText
            }
          >
            {monthLabel(
              selectedMonth
            )}
          </Text>

          <Pressable
            onPress={() =>
              setSelectedMonth(
                shiftMonth(
                  selectedMonth,
                  1
                )
              )
            }
            style={
              styles.periodBtn
            }
          >
            <Text
              style={
                styles.periodArrow
              }
            >
              ›
            </Text>
          </Pressable>
        </View>

        <View
          style={styles.filterRow}
        >
          <Pressable
            style={[
              styles.toggleFilterBtn,
              !mostrarTodos &&
                styles.toggleFilterBtnActive,
            ]}
            onPress={() =>
              setMostrarTodos(
                false
              )
            }
          >
            <Text
              style={[
                styles.toggleFilterText,
                !mostrarTodos &&
                  styles.toggleFilterTextActive,
              ]}
            >
              Mês selecionado
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.toggleFilterBtn,
              mostrarTodos &&
                styles.toggleFilterBtnActive,
            ]}
            onPress={() =>
              setMostrarTodos(
                true
              )
            }
          >
            <Text
              style={[
                styles.toggleFilterText,
                mostrarTodos &&
                  styles.toggleFilterTextActive,
              ]}
            >
              Todos os meses
            </Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.button}
          onPress={
            carregarEventos
          }
          disabled={
            carregando
          }
        >
          <Text
            style={
              styles.buttonText
            }
          >
            {carregando
              ? "Buscando..."
              : "Atualizar eventos"}
          </Text>
        </Pressable>

        {carregando && (
          <View
            style={styles.loading}
          >
            <ActivityIndicator
              color="#0B4F6C"
            />

            <Text
              style={styles.info}
            >
              Consultando FNET e BRFIIS...
            </Text>
          </View>
        )}

        {erro && (
          <Text
            style={styles.error}
          >
            {erro}
          </Text>
        )}

        {!carregando &&
          secoesExibidas.length ===
            0 &&
          !erro && (
            <View
              style={
                styles.emptyContainer
              }
            >
              <Text
                style={
                  styles.info
                }
              >
                {!mostrarTodos
                  ? `Nenhum evento encontrado para ${monthLabel(
                      selectedMonth
                    )}.`
                  : "Nenhum evento encontrado para os FIIs da carteira."}
              </Text>

              {!mostrarTodos &&
                secoes.length >
                  0 && (
                  <Pressable
                    style={
                      styles.showAllBtn
                    }
                    onPress={() =>
                      setMostrarTodos(
                        true
                      )
                    }
                  >
                    <Text
                      style={
                        styles.showAllBtnText
                      }
                    >
                      Ver todos os meses
                    </Text>
                  </Pressable>
                )}
            </View>
          )}

        <SectionList
          sections={
            Array.isArray(
              secoesExibidas
            )
              ? secoesExibidas
              : []
          }
          keyExtractor={(
            item
          ) =>
            `${item.ticker}-${item.id}`
          }
          contentContainerStyle={
            styles.list
          }
          showsVerticalScrollIndicator={
            false
          }
          stickySectionHeadersEnabled={
            false
          }
          renderSectionHeader={({
            section,
          }) => (
            <View
              style={
                styles.monthHeader
              }
            >
              <Text
                style={
                  styles.monthTitle
                }
              >
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({
            item,
          }) => {
            const nomePregao =
              item.nomePregao
                ?.trim() ||
              item.descricaoFundo
                ?.trim() ||
              "FII";

            const tipoDocumento =
              item.tipoDocumento
                ?.trim() ||
              item.categoriaDocumento
                ?.trim() ||
              "Documento";

            const dataExibicao =
              obterDataExibicaoEvento(
                item
              );

            const ehB3 =
              item.origem ===
              "b3";

            return (
              <View
                style={
                  styles.card
                }
              >
                <Text
                  style={
                    styles.ticker
                  }
                  numberOfLines={
                    2
                  }
                >
                  {item.ticker} —{" "}
                  {nomePregao}
                </Text>

                <Text
                  style={
                    styles.category
                  }
                  numberOfLines={
                    2
                  }
                >
                  {tipoDocumento}
                </Text>

                <Text
                  style={
                    styles.date
                  }
                >
                  {dataExibicao}
                </Text>

                {ehB3 ? (
                  <View
                    style={
                      styles.sourceLabel
                    }
                  >
                    <Text
                      style={
                        styles.sourceLabelText
                      }
                    >
                      B3
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    style={
                      styles.pdfButton
                    }
                    onPress={async () => {
                      const evento =
                        item as FnetEvent;

                      const link =
                        evento.url ||
                        (evento.id
                          ? `https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?id=${evento.id}&cvm=true`
                          : "");

                      console.log(
                        "[EVENTOS] ABRINDO DOCUMENTO:",
                        "Ticker:",
                        item.ticker,
                        "Nome:",
                        item.nomePregao,
                        "ID:",
                        item.id,
                        "Origem:",
                        item.origem,
                        "Tipo:",
                        item.tipoDocumento,
                        "URL:",
                        item.url,
                        "Link:",
                        link
                      );

                      if (!link) {
                        console.warn(
                          "[EVENTOS] DOCUMENTO SEM LINK:",
                          item
                        );
                        return;
                      }

                      try {
                        await Linking.openURL(
                          link
                        );
                      } catch (
                        error
                      ) {
                        console.error(
                          "[EVENTOS] ERRO AO ABRIR DOCUMENTO:",
                          error
                        );
                      }
                    }}
                  >
                    <Text
                      style={
                        styles.pdfButtonText
                      }
                    >
                      ABRIR PDF
                    </Text>
                  </Pressable>
                )}

                <Text
                  style={
                    styles.documentId
                  }
                >
                  ID {item.id}
                </Text>
              </View>
            );
          }}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  titleBlock: {
    flex: 1,
    paddingRight: 10,
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 4,
  },

  subtitle: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 12,
  },

  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#0B4F6C",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },

  settingsButtonText: {
    fontSize: 24,
    color: "#FFFFFF",
  },

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
    fontSize: 15,
    fontWeight: "bold",
    textTransform: "capitalize",
    color: "#FFFFFF",
  },

  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },

  toggleFilterBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2c2c2c",
    backgroundColor: "#1e1e1e",
    alignItems: "center",
  },

  toggleFilterBtnActive: {
    backgroundColor: "#0B4F6C",
    borderColor: "#0B4F6C",
  },

  toggleFilterText: {
    fontSize: 13,
    color: "#AAAAAA",
    fontWeight: "600",
  },

  toggleFilterTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },

  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#0B4F6C",
    alignItems: "center",
    marginBottom: 14,
  },

  buttonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },

  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },

  info: {
    marginTop: 10,
    opacity: 0.7,
  },

  emptyContainer: {
    alignItems: "center",
    marginVertical: 16,
  },

  showAllBtn: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#0B4F6C",
  },

  showAllBtnText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 13,
  },

  error: {
    color: "#B00020",
    marginBottom: 12,
  },

  list: {
    paddingBottom: 30,
  },

  monthHeader: {
    paddingTop: 10,
    paddingBottom: 10,
    marginBottom: 8,
  },

  monthTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0B4F6C",
  },

  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    backgroundColor: "#0B4F6C",
    borderColor: "#0B4F6C",
  },

  ticker: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 6,
  },

  category: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
    color: "#FFFFFF",
  },

  date: {
    fontSize: 13,
    opacity: 0.9,
    color: "#FFFFFF",
    marginBottom: 10,
  },

  pdfButton: {
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    borderColor: "#FFFFFF",
  },

  pdfButtonText: {
    fontWeight: "700",
    color: "#FFFFFF",
  },

  sourceLabel: {
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    borderColor: "#FFFFFF",
    backgroundColor:
      "rgba(255,255,255,0.08)",
  },

  sourceLabelText: {
    fontWeight: "700",
    color: "#FFFFFF",
  },

  documentId: {
    fontSize: 12,
    opacity: 0.75,
    color: "#FFFFFF",
    textAlign: "center",
    marginTop: 8,
  },

  backButton: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 10,
  },

  backButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0B4F6C",
  },

  configHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  configHeaderText: {
    flex: 1,
    paddingRight: 10,
  },

  closeConfigButton: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#0B4F6C",
  },

  closeConfigButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },

  configEventCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    backgroundColor: "#1e1e1e",
    borderColor: "#2c2c2c",
  },

  configTicker: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0B4F6C",
    marginBottom: 5,
  },

  configType: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 5,
  },

  configDate: {
    fontSize: 13,
    color: "#AAAAAA",
  },

  configId: {
    fontSize: 12,
    color: "#888888",
    marginTop: 6,
  },

  detailCard: {
    borderRadius: 14,
    padding: 16,
    marginTop: 10,
    marginBottom: 16,
    backgroundColor: "#1e1e1e",
    borderWidth: 1,
    borderColor: "#2c2c2c",
  },

  detailTicker: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0B4F6C",
    marginBottom: 4,
  },

  detailName: {
    fontSize: 15,
    color: "#FFFFFF",
    marginBottom: 18,
  },

  detailLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#888888",
    marginTop: 10,
    marginBottom: 3,
    textTransform: "uppercase",
  },

  detailValue: {
    fontSize: 15,
    color: "#FFFFFF",
  },

  detailUrl: {
    fontSize: 12,
    color: "#AAAAAA",
    lineHeight: 18,
  },

  deleteButton: {
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: "#B00020",
    alignItems: "center",
  },

  deleteButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },

  undoBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    backgroundColor: "#1e1e1e",
    borderWidth: 1,
    borderColor: "#0B4F6C",
  },

  undoText: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 12,
    paddingRight: 8,
  },

  undoButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#0B4F6C",
  },

  undoButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
});

