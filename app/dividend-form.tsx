import { router, Stack, useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View, Pressable, ActivityIndicator } from "react-native";
import { useState, useEffect } from "react";
import { usePortfolio } from "@/lib/portfolio";
import { suggestFunds } from "@/lib/fii-catalog";
import { ScreenContainer } from "@/components/screen-container";
import { Field, Help } from "@/components/form-fields";
import { Button } from "@/components/portfolio-ui";
import { brDateToIso, currencyInput, isoDateToBr, parseCurrencyInput } from "@/lib/format";

const dateInput = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length <= 2
    ? digits
    : digits.length <= 4
    ? `${digits.slice(0, 2)}/${digits.slice(2)}`
    : `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const today = isoDateToBr(new Date().toISOString().slice(0, 10));

export default function DividendForm() {
  const params = useLocalSearchParams<{ ticker?: string; id?: string }>();
  const { dividends, addDividend, updateDividend } = usePortfolio();
  const old = dividends.find((item) => item.id === params.id);
  const [kind, setKind] = useState<"income" | "amortization">(old?.kind ?? "income");
  const [ticker, setTicker] = useState(old?.ticker ?? params.ticker ?? "");
  const [paymentDate, setPaymentDate] = useState(old ? isoDateToBr(old.paymentDate) : today);
  const [dateCom, setDateCom] = useState(old?.dateCom ? isoDateToBr(old.dateCom) : "");
  const [amount, setAmount] = useState(old ? currencyInput(String(Math.round(old.amountPerShare * 100))) : "");
  const [note, setNote] = useState(old?.note ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const selected = suggestFunds(ticker);

  // Busca dados da API quando o ticker tiver 6 caracteres
  useEffect(() => {
    const cleanTicker = ticker.trim().toUpperCase();
    if (old || cleanTicker.length !== 6) return;

    let isMounted = true;
    const fetchDividendData = async () => {
      try {
        setLoading(true);
        // Substitua pelo endpoint real da sua API de dividendos
        const res = await fetch(`https://api.exemplo.com/fii/${cleanTicker}/latest-dividend`);
        if (!res.ok) return;

        const data = await res.json();
        if (isMounted && data) {
          if (data.paymentDate) setPaymentDate(isoDateToBr(data.paymentDate));
          if (data.dateCom) setDateCom(isoDateToBr(data.dateCom));
          if (data.amountPerShare) {
            setAmount(currencyInput(String(Math.round(data.amountPerShare * 100))));
          }
        }
      } catch {
        // Em caso de falha na requisição, permite o preenchimento manual
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    const timer = setTimeout(fetchDividendData, 400);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [ticker, old]);

  const save = () => {
    try {
      setError("");
      const input = {
        ticker,
        kind,
        paymentDate: brDateToIso(paymentDate),
        dateCom: dateCom ? brDateToIso(dateCom) : undefined,
        amountPerShare: parseCurrencyInput(amount),
        note: note.trim() || undefined,
      };
      if (old) updateDividend(old.id, input);
      else addDividend(input);
      router.back();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar.");
    }
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-6">
        <Text className="mt-2 text-sm font-medium text-muted">Recebimento manual</Text>
        <Text className="mt-1 text-3xl font-bold text-foreground">
          {old ? "Editar provento" : "Novo provento"}
        </Text>
        <Text className="mt-3 text-sm leading-5 text-muted">
          O total será calculado pela quantidade de cotas na data-com.
        </Text>
        <View className="mt-6 flex-row gap-3 rounded-2xl bg-surface p-2">
          <View className="flex-1">
            <Button
              compact
              title="Rendimento"
              variant={kind === "income" ? "primary" : "secondary"}
              onPress={() => setKind("income")}
            />
          </View>
          <View className="flex-1">
            <Button
              compact
              title="Amortização"
              variant={kind === "amortization" ? "primary" : "secondary"}
              onPress={() => setKind("amortization")}
            />
          </View>
        </View>
        <View className="mt-6">
          <Field
            label="Ticker do FII"
            value={ticker}
            onChangeText={setTicker}
            placeholder="Ex.: HGLG11"
            autoCapitalize="characters"
          />
          {loading ? (
            <View className="-mt-2 mb-3 flex-row items-center gap-2 px-1">
              <ActivityIndicator size="small" />
              <Text className="text-xs text-muted">Buscando dados na API...</Text>
            </View>
          ) : null}
          {selected.slice(0, 4).map((fund) => (
            <Pressable key={fund.ticker} onPress={() => setTicker(fund.ticker)}>
              <Text className="-mt-2 mb-3 rounded-xl bg-[#DFF4FA] p-3 text-xs text-foreground">
                {fund.ticker} · {fund.name}
              </Text>
            </Pressable>
          ))}
          <Field
            label="Data de pagamento"
            value={paymentDate}
            onChangeText={(value) => setPaymentDate(dateInput(value))}
            placeholder="DD/MM/AAAA"
          />
          <Field
            label="Data-com"
            value={dateCom}
            onChangeText={(value) => setDateCom(dateInput(value))}
            placeholder="DD/MM/AAAA"
            optional
          />
          <Help>Se a data-com ficar vazia, será usada a data do pagamento.</Help>
          <Field
            label="Valor por cota"
            value={amount}
            onChangeText={(value) => setAmount(currencyInput(value))}
            placeholder="0,000"
            keyboardType="numeric"
          />
          <Help>Digite 083 para R$ 0,83 ou 7295 para R$ 72,95.</Help>
          <Field
            label="Observação"
            value={note}
            onChangeText={setNote}
            placeholder="Opcional"
            optional
            autoCapitalize="sentences"
          />
        </View>
        {error ? (
          <Text className="mb-4 rounded-xl bg-error/10 p-3 text-sm text-error">{error}</Text>
        ) : null}
        <Button title={old ? "Salvar alterações" : "Salvar provento"} onPress={save} />
        <View className="h-4" />
        <Button title="Cancelar" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </ScreenContainer>
  );
}