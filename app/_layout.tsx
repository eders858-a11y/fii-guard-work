import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform } from "react-native";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";

import { trpc, createTRPCClient } from "@/lib/trpc";
import { initManusRuntime } from "@/lib/_core/manus-runtime";
import { PortfolioProvider } from "@/lib/portfolio";

export const unstable_settings = { anchor: "(tabs)" };

export default function RootLayout() {
  // Inicialização ultra-rápida para não travar a compilação
  useEffect(() => { initManusRuntime(); }, []);

  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
  }));
  const [trpcClient] = useState(() => createTRPCClient());

  const content = useMemo(() => (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <PortfolioProvider>
            <ThemeProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="oauth/callback" />
              </Stack>
              <StatusBar style="auto" />
            </ThemeProvider>
          </PortfolioProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </GestureHandlerRootView>
  ), [trpcClient, queryClient]);

  return <SafeAreaProvider initialMetrics={initialWindowMetrics}>{content}</SafeAreaProvider>;
}
