import { router, Stack } from "expo-router";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { usePortfolio } from "@/lib/portfolio";
import { ScreenContainer } from "@/components/screen-container";
import { Button, Card } from "@/components/portfolio-ui";
import { Field, Help } from "@/components/form-fields";
import { dateTime } from "@/lib/format";
import { DEFAULT_THEME, THEME_PRESETS, type ThemeName } from "@/lib/theme-presets";
import { supabase } from "@/lib/supabase"; // Certifique-se que o caminho do seu supabase.ts está correto

const isHex = (value: string) => /^#[0-9A-F]{6}$/i.test(value.trim());

// Componente visual do card de Conta e Backup na Nuvem (preservando o seu layout original)
function ActionButton({
  title,
  onPress,
  disabled,
  secondary = false,
  destructive = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`mt-3 min-h-[46px] items-center justify-center rounded-xl px-3.5 ${
        secondary
          ? "border border-border bg-transparent"
          : destructive
          ? "bg-danger"
          : "bg-primary"
      } ${disabled ? "opacity-50" : "opacity-100"}`}
    >
      <Text
        className={`text-center text-sm font-bold ${
          secondary ? "text-foreground" : "text-foreground"
        }`}
      >
        {title}
      </Text>
    </Pressable>
  );
}

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

  // Estados do Supabase / Backup na Nuvem
  const [account, setAccount] = useState<any>(null);
  const [backupAvailable, setBackupAvailable] = useState(false);
  const [checkingBackup, setCheckingBackup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isBusyAuth = busy || submitting;

  useEffect(() => {
    setThemeName((settings.themeName as ThemeName) || DEFAULT_THEME);
    setCardColor(settings.cardColor || THEME_PRESETS.Oceano.cardColor);
    setTextColor(settings.textColor || THEME_PRESETS.Oceano.textColor);
  }, [
    settings.themeName,
    settings.cardColor,
    settings.textColor,
  ]);

  // Monitora a sessão do Supabase
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setAccount(session.user);
        verificarBackup(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccount(session?.user ?? null);
      if (session?.user) {
        verificarBackup(session.user.id);
      } else {
        setBackupAvailable(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const verificarBackup = async (userId: string) => {
    setCheckingBackup(true);
    try {
      const { data, error } = await supabase
        .from('user_backups')
        .select('updated_at')
        .eq('user_id', userId)
        .maybeSingle();

      setBackupAvailable(!error && !!data);
    } catch (e) {
      console.warn('Erro ao checar backup', e);
    } finally {
      setCheckingBackup(false);
    }
  };

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Atenção", "Informe e-mail e senha.");
      return;
    }
    setSubmitting(true);
    try {
      const { error, data } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      if (data.user) {
        setAccount(data.user);
        await verificarBackup(data.user.id);
        setEmail("");
        setPassword("");
        Alert.alert("Sucesso", "Login realizado com sucesso.");
      }
    } catch (error) {
      Alert.alert("Erro ao entrar", error instanceof Error ? error.message : "Verifique suas credenciais.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Atenção", "Informe e-mail e senha para criar a conta.");
      return;
    }
    setSubmitting(true);
    try {
      const { error, data } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      if (data.user) {
        setAccount(data.user);
        Alert.alert("Conta criada", "Verifique seu e-mail se necessário ou faça login.");
      }
    } catch (error) {
      Alert.alert("Erro ao criar conta", error instanceof Error ? error.message : "Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setAccount(null);
      setBackupAvailable(false);
      Alert.alert("Sessão encerrada", "Você saiu da conta com segurança.");
    } catch (error) {
      Alert.alert("Erro ao sair", error instanceof Error ? error.message : "Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const uploadLocalToCloud = async (replaceExisting: boolean) => {
    if (!account) return;
    setSubmitting(true);
    try {
      // Pega o backup atual em formato JSON exportado pela função do portfolio
      const portfolioData = await exportData(true); // Se exportData aceitar string ou objeto, ajuste conforme sua lib. Caso contrário, use o AsyncStorage direto:
      // Alternativa segura se exportData for apenas download de arquivo: use AsyncStorage.getItem('@fii_guard_portfolio_v1')
      const localData = await import("@react-native-async-storage/async-storage").then(m => m.default.getItem('@fii_guard_portfolio_v1'));

      if (!localData) throw new Error("Nenhum dado local encontrado para backup.");

      const portfolioJson = JSON.parse(localData);

      const { error } = await supabase.from('user_backups').upsert({
        user_id: account.id,
        portfolio_data: portfolioJson,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      if (error) throw error;

      setBackupAvailable(true);
      Alert.alert("Backup concluído", "Cópia da carteira enviada para a nuvem com sucesso.");
    } catch (error) {
      Alert.alert("Não foi possível fazer o backup", error instanceof Error ? error.message : "Erro desconhecido.");
    } finally {
      setSubmitting(false);
    }
  };

  const restoreCloudPortfolio = async () => {
    if (!account) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('user_backups')
        .select('portfolio_data')
        .eq('user_id', account.id)
        .single();

      if (error || !data) throw new Error("Nenhum backup encontrado na nuvem.");

      await import("@react-native-async-storage/async-storage").then(m =>
        m.default.setItem('@fii_guard_portfolio_v1', JSON.stringify(data.portfolio_data))
      );

      Alert.alert("Backup restaurado", "Os dados da nuvem foram aplicados. Reinicie o aplicativo se necessário para atualizar a tela.");
    } catch (error) {
      Alert.alert("Não foi possível restaurar o backup", error instanceof Error ? error.message : "Erro desconhecido.");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmUpload = () => {
    const replaceExisting = backupAvailable;
    Alert.alert(
      replaceExisting ? "Substituir backup da nuvem?" : "Criar backup na nuvem?",
      replaceExisting
        ? "O backup existente será substituído por uma cópia da carteira local deste dispositivo. A carteira local não será alterada."
        : "Será criada uma cópia da carteira local na nuvem. A carteira local não será alterada.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: replaceExisting ? "Substituir backup" : "Criar backup",
          style: replaceExisting ? "destructive" : "default",
          onPress: () => void uploadLocalToCloud(replaceExisting),
        },
      ]
    );
  };

  const confirmRestore = () => {
    if (!backupAvailable) {
      Alert.alert("Backup indisponível", "Não há um backup disponível na nuvem para esta conta.");
      return;
    }

    Alert.alert(
      "Restaurar backup da nuvem?",
      "A carteira local será substituída pelos dados do backup. Esta ação não pode ser desfeita.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Restaurar backup",
          style: "destructive",
          onPress: () => void restoreCloudPortfolio(),
        },
      ]
    );
  };

  const saveThemeOnly = () => {
    if (!isHex(cardColor) || !isHex(textColor)) {
      Alert.alert(
        "Cores inválidas",
        "Use o formato hexadecimal completo, por exemplo #EAF4F1."
      );
      return false;
    }
    updateSettings({
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
      if (!saveThemeOnly()) return;
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

  const restoreLocalJson = async () => {
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

        {/* CARD DE CONTA E BACKUP NA NUVEM (SUPABASE) */}
        <Card className="mb-5">
          <Text className="text-lg font-bold text-foreground">Conta e backup na nuvem</Text>
          <Text className="mt-2 text-sm leading-5 text-muted">
            O login não altera sua carteira local. Você decide quando enviar uma cópia para a nuvem ou restaurar um backup existente.
          </Text>
          <Text className="mt-4 text-sm font-semibold text-foreground">
            Estado: {account ? "Conectado" : "Desconectado"}
          </Text>

          {!account ? (
            <View className="mt-4">
              <Text className="mb-1.5 mt-3 text-sm font-semibold text-foreground">E-mail</Text>
              <Field
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                placeholder="voce@exemplo.com"
              />
              <Text className="mb-1.5 mt-3 text-sm font-semibold text-foreground">Senha</Text>
              <Field
                autoCapitalize="none"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                placeholder="Digite sua senha"
              />
              <ActionButton
                title={isBusyAuth ? "Entrando…" : "Entrar"}
                disabled={isBusyAuth}
                onPress={handleSignIn}
              />
              <ActionButton
                title={isBusyAuth ? "Aguarde…" : "Criar conta"}
                disabled={isBusyAuth}
                secondary
                onPress={handleSignUp}
              />
            </View>
          ) : (
            <View className="mt-2">
              <Text className="mt-2 text-xs text-muted">
                Conta: {account.email || account.id}
              </Text>
              <Text className="mt-2 text-sm leading-5 text-muted">
                {checkingBackup
                  ? "Verificando backup na nuvem…"
                  : backupAvailable
                  ? "Há um backup disponível na nuvem. Você pode restaurá-lo ou substituí-lo manualmente."
                  : "Nenhum backup foi identificado na nuvem. A carteira local foi preservada."}
              </Text>

              <ActionButton
                title={checkingBackup ? "Verificando…" : "Verificar backup"}
                disabled={isBusyAuth || checkingBackup}
                secondary
                onPress={() => account ? verificarBackup(account.id) : Promise.resolve()}
              />
              <ActionButton
                title={
                  isBusyAuth
                    ? "Aguarde…"
                    : backupAvailable
                    ? "Substituir backup da nuvem"
                    : "Fazer backup da carteira local"
                }
                disabled={isBusyAuth || checkingBackup}
                onPress={confirmUpload}
              />
              <ActionButton
                title={isBusyAuth ? "Aguarde…" : "Restaurar backup da nuvem"}
                disabled={isBusyAuth || checkingBackup || !backupAvailable}
                destructive
                onPress={confirmRestore}
              />
              <ActionButton
                title={isBusyAuth ? "Aguarde…" : "Sair da conta"}
                disabled={isBusyAuth}
                secondary
                onPress={handleSignOut}
              />
            </View>
          )}
        </Card>

        {/* CARD DE ATUALIZAÇÃO DE MERCADO */}
        <Card className="mb-5">
          <Text className="text-lg font-bold text-foreground">Atualização automática</Text>
          <Text className="mt-2 text-sm leading-5 text-muted">
            Ao abrir a carteira ou tocar em atualizar, o app consulta automaticamente os dados públicos de mercado.
          </Text>
          <View className="mt-5">
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

        {/* CARD DE CORES E TEMA */}
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
              FII Guard · legível
            </Text>
          </View>
          <View className="mt-4">
            <Button title="Salvar tema" onPress={saveThemeOnly} />
          </View>
        </Card>

        {/* CARD DE DADOS LOCAIS E BACKUP JSON */}
        <Card className="mb-5">
          <Text className="text-lg font-bold text-foreground">Dados locais</Text>
          <Text className="mt-2 text-sm leading-5 text-muted">
            Faça exportações periódicas para guardar uma cópia local dos seus lançamentos.
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
            <Button title="Restaurar backup JSON" variant="secondary" onPress={restoreLocalJson} />
          </View>
        </Card>

        {/* CARD SOBRE OS DADOS */}
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