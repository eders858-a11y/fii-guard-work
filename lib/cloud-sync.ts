import { supabase } from "./supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

const USER_EMAIL = "eders858@gmail.com";
const STORAGE_KEY = "@fii_guard_portfolio_state";

export async function saveCloudBackup() {
  try {
    const localData = await AsyncStorage.getItem(STORAGE_KEY);
    if (!localData) throw new Error("Sem dados locais para enviar.");

    const portfolioJson = JSON.parse(localData);

    // Faz o upsert (insere ou atualiza) na tabela 'user_backups' do Supabase
    const { error } = await supabase
      .from("user_backups")
      .upsert(
        { email: USER_EMAIL, data: portfolioJson, updated_at: new Date() },
        { onConflict: "email" }
      );

    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Erro ao salvar backup na nuvem:", error);
    throw error;
  }
}

export async function restoreCloudBackup() {
  try {
    const { data, error } = await supabase
      .from("user_backups")
      .select("data")
      .eq("email", USER_EMAIL)
      .single();

    if (error || !data) throw new Error("Nenhum backup encontrado na nuvem.");

    // Grava os dados recebidos no armazenamento local do dispositivo
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data.data));
    return true;
  } catch (error) {
    console.error("Erro ao restaurar backup da nuvem:", error);
    throw error;
  }
}