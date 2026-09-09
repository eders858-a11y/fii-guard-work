import { router, Stack } from "expo-router";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { usePortfolio } from "@/lib/portfolio";
import { ScreenContainer } from "@/components/screen-container";
import { Button, Card } from "@/components/portfolio-ui";
import { Field, Help } from "@/components/form-fields";
import { dateTime } from "@/lib/format";
import { DEFAULT_THEME, THEME_PRESETS, type ThemeName } from "@/lib/theme-presets";

const isHex = (value: string) => /^#[0-9A-F]{6}$/i.test(value.trim());

export default function SettingsScreen() {
  const {
    settings,
    updateSettings,
    syncMarket,
    syncMarketData,
    exportData,
    importData,
    importB3,
    clearManualOperations,
    clearB3Operations,
  } = usePortfolio();

  const [url, setUrl] = useState(settings.marketServiceUrl);
  const [brapiToken, setBrapiToken] = useState(settings.brapiToken || "");
  const [busy, setBusy] = useState(false);
  const [themeName, setThemeName] = useState<ThemeName>(
    (settings.themeName as ThemeName) || DEFAULT_THEME
  );
  const [cardColor, setCardColor] = useState(
    settings.cardColor || THEME_PRESETS.Oceano.cardColor
  );
  const [textColor, setTextColor] = useState(
    settings.textColor || THEME_PRESETS.Oceano.textColor
  );

  useEffect(() => {
    setUrl(settings.marketServiceUrl);
    setBrapiToken(settings.brapiToken || "");
    setThemeName((settings.themeName as ThemeName) || DEFAULT_THEME);
    setCardColor(settings.cardColor || THEME_PRESETS.Oceano.cardColor);
    setTextColor(settings.textColor || THEME_PRESETS.Oceano.textColor);
  }, [
    settings.marketServiceUrl,
    settings.themeName,
    settings.cardColor,
    settings.textColor,
  ]);

  const save = () => {
    if (!isHex(cardColor) || !isHex(textColor)) {
      Alert.alert(
        "Cores inválidas",
        "Use o formato hexadecimal completo, por exemplo #EAF4F1."
      );
      return false;
    }
    updateSettings({
      marketServiceUrl: url.trim(),
      brapiToken: brapiToken.trim(),
      themeName,
      cardColor: cardColor.trim().toUpperCase(),
      textColor: textColor.trim().toUpperCase(),
      autoSync: true,
    });
    return true;
  };

  const sync = async () => {
    try {
      setBusy(true);
      if (!save()) return;
      if (typeof syncMarket === "function") {
        await syncMarket();
      } else if (typeof syncMarketData === "function") {
        await syncMarketData();
      } else {
        throw new Error("Função de sincronização de mercado não encontrada.");
      }
      Alert.alert(
        "Atualização",
        "Consulta concluída. Confira a hora e a mensagem abaixo."
      );
    } catch (error) {
      Alert.alert(
        "Não foi possível atualizar",
        error instanceof Error ? error.message : "Verifique sua conexão."
      );
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    try {
      const ok = await importData();
      if (ok)
        Alert.alert(
          "Backup restaurado",
          "Os dados locais foram substituídos pelo arquivo selecionado."
        );
    } catch (error) {
      Alert.alert(
        "Backup inválido",
        error instanceof Error ? error.message : "Não foi possível restaurar."
      );
    }
  };

  const runB3Import = async (mode: "merge" | "update") => {
    try {
      const result = await importB3(mode);
      if (result)
        Alert.alert(
          "Importação B3 concluída",
          `${
            mode === "update"
              ? "Operações do período atualizadas"
              : `${result.imported} itens novos adicionados`
          } e ${result.duplicates} duplicidades ignoradas.${
            result.warnings.length ? `\n\n${result.warnings.join("\n")}` : ""
          }`
        );
    } catch (error) {
      Alert.alert(
        "Não foi possível importar",
        error instanceof Error ? error.message : "Confira se o arquivo é XLS, XLSX ou XLSM."
      );
    }
  };

  const importB3File = () => {
    Alert.alert(
      "Como importar o extrato B3?",
      "Mesclar substitui toda a carteira pelo arquivo selecionado: use somente quando o arquivo tiver todo o histórico que deseja manter. Atualizar período apenas corrige operações existentes com o mesmo ativo, tipo e data; não adiciona novas e preserva as demais.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Mesclar carteira inteira",
          style: "destructive",
          onPress: () => void runB3Import("merge"),
        },
        { text: "Atualizar período", onPress: () => void runB3Import("update") },
      ]
    );
  };

  const clearManual = () =>
    Alert.alert(
      "O que você deseja remover?",
      "Escolha se quer apagar os lançamentos feitos à mão ou os importados pelo extrato da B3.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover Manuais",
          style: "destructive",
          onPress: () =>
            Alert.alert(
              "Limpeza concluída",
              `${clearManualOperations()} lançamentos manuais removidos.`
            ),
        },
        {
          text: "Remover B3",
          style: "destructive",
          onPress: () =>
            Alert.alert(
              "Limpeza concluída",
              `${clearB3Operations()} lançamentos da B3 removidos.`
            ),
        },
      ]
    );

  const previewText = isHex(textColor) ? textColor : THEME_PRESETS.Oceano.textColor;
  const previewCard = isHex(cardColor) ? cardColor : THEME_PRESETS.Oceano.cardColor;

  return (
    <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-8">
        <View className="mb-6 flex-row items-center pt-2">
          <Button
            compact
            title="‹ Voltar"
            variant="secondary"
            onPress={() => router.back()}
          />
          <View className="ml-4">
            <Text className="text-sm font-medium text-muted">Preferências</Text>
            <Text className="mt-1 text-3xl font-bold text-foreground">Ajustes</Text>
          </View>
        </View>

        <Card className="mb-5">
          <Text className="text-lg font-bold text-foreground">Atualização automática</Text>
          <Text className="mt-2 text-sm leading-5 text-muted">
            Ao abrir a carteira ou tocar em atualizar, o app consulta automaticamente o
            Yahoo Finance. Se você tiver um serviço próprio com yfinance, informe o
            endereço opcional abaixo.
          </Text>
          <View className="mt-5">
            <Field
              label="Token Brapi (opcional)"
              value={brapiToken}
              onChangeText={setBrapiToken}
              placeholder="Digite sua chave de API Brapi"
              optional
              secureTextEntry
            />
            <Field
              label="Serviço próprio de mercado (opcional)"
              value={url}
              onChangeText={setUrl}
              placeholder="Deixe vazio para consulta automática"
              optional
            />
            <Help>
              O serviço próprio deve expor GET /market/sync?symbols=HGLG11,MXRF11. Sem
              endereço, a consulta automática usa dados públicos do Yahoo Finance. A opção B3
              importa o XLS/XLSX/XLSM exportado pela Área do Investidor e verifica duplicidades.
            </Help>
            <Button
              title={busy ? "Sincronizando…" : "Sincronizar mercado"}
              onPress={sync}
              disabled={busy}
            />
            <View className="mt-3">
              <Button
                title="Sincronizar B3 / importar planilha"
                variant="secondary"
                onPress={importB3File}
              />
            </View>
          </View>
          <Text className="mt-4 text-xs text-muted">
            Última consulta: {dateTime(settings.lastSyncAt)}
          </Text>
          {settings.lastSyncMessage ? (
            <Text className="mt-2 text-xs leading-5 text-muted">
              {settings.lastSyncMessage}
            </Text>
          ) : null}
        </Card>

        <Card className="mb-5">
          <Text className="text-lg font-bold text-foreground">Cores e visibilidade</Text>
          <Text className="mt-2 text-sm text-muted">
            Escolha um tema pelo nome. A seleção é aplicada automaticamente aos quadros,
            letras e botão de configuração em todas as abas.
          </Text>
          <View className="mt-4 gap-2">
            {(Object.keys(THEME_PRESETS) as ThemeName[]).map((name) => (
              <Pressable
                key={name}
                onPress={() => {
                  const palette = THEME_PRESETS[name];
                  setThemeName(name);
                  setCardColor(palette.cardColor);
                  setTextColor(palette.textColor);
                  updateSettings({
                    themeName: name,
                    cardColor: palette.cardColor,
                    textColor: palette.textColor,
                  });
                }}
                className={`rounded-2xl border p-4 ${
                  themeName === name ? "border-primary" : "border-border"
                }`}
              >
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text className="font-bold text-foreground">{name}</Text>
                    <Text className="mt-1 text-xs text-muted">
                      {THEME_PRESETS[name].preview}
                    </Text>
                  </View>
                  <View
                    className="h-8 w-8 rounded-full border border-border"
                    style={{ backgroundColor: THEME_PRESETS[name].cardColor }}
                  />
                </View>
              </Pressable>
            ))}
          </View>
          <View
            className="mt-4 rounded-2xl border border-border p-4"
            style={{ backgroundColor: previewCard }}
          >
            <Text style={{ color: previewText, fontSize: 16, fontWeight: "800" }}>
              Pré-visualização: {themeName}
            </Text>
            <Text style={{ color: previewText, marginTop: 5 }}>
              FII Guard · R$ 72,95 · texto legível
            </Text>
          </View>
          <View className="mt-4">
            <Button title="Salvar tema" onPress={save} />
          </View>
        </Card>

        <Card className="mb-5">
          <Text className="text-lg font-bold text-foreground">Dados locais</Text>
          <Text className="mt-2 text-sm leading-5 text-muted">
            Faça exportações periódicas para guardar uma cópia dos seus lançamentos.
          </Text>
          <View className="mt-5 gap-3">
            <Button title="Importar planilha da B3 (XLS/XLSX/XLSM)" onPress={importB3File} />
            <Button
              title="Limpar carteira (Manuais / B3)"
              variant="secondary"
              onPress={clearManual}
            />
            <Button
              title="Exportar backup JSON"
              onPress={() =>
                exportData().catch((error) =>
                  Alert.alert(
                    "Não foi possível exportar",
                    error instanceof Error ? error.message : "Tente novamente."
                  )
                )
              }
            />
            <Button title="Restaurar backup JSON" variant="secondary" onPress={restore} />
          </View>
        </Card>

        <Card>
          <Text className="text-lg font-bold text-foreground">Sobre os dados</Text>
          <Text className="mt-2 text-sm leading-5 text-muted">
            Cotações e proventos são referências e devem ser conferidos nos informes
            oficiais antes de decisões financeiras ou fiscais.
          </Text>
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}