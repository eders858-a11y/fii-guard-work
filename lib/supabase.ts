import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Configure EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY no arquivo .env."
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

const STORAGE_KEY = '@fii_guard_portfolio_v1'; // Chave onde sua carteira fica salva localmente

export const CloudBackupService = {
  async checkBackupExists(userId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('user_backups')
      .select('updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    return !error && !!data;
  },

  async uploadLocalToCloud(userId: string) {
    const localData = await AsyncStorage.getItem(STORAGE_KEY);
    if (!localData) throw new Error('Nenhum dado local encontrado para backup.');

    const portfolioJson = JSON.parse(localData);

    const { error } = await supabase.from('user_backups').upsert({
      user_id: userId,
      portfolio_data: portfolioJson,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    if (error) throw new Error(error.message);
  },

  async restoreCloudPortfolio(userId: string) {
    const { data, error } = await supabase
      .from('user_backups')
      .select('portfolio_data')
      .eq('user_id', userId)
      .single();

    if (error || !data) throw new Error('Nenhum backup encontrado na nuvem.');

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data.portfolio_data));
  }
};