import { Tabs, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { usePortfolio } from "@/lib/portfolio";

export default function TabLayout() {
  const colors = useColors(); const insets = useSafeAreaInsets(); const bottom = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8); const { settings } = usePortfolio();
  const buttonColor = settings.cardColor || colors.surface; const buttonText = settings.textColor || colors.tint;
  return <View style={styles.root}><Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.tint, tabBarButton: HapticTab, tabBarStyle: { height: 64 + bottom, paddingTop: 8, paddingBottom: bottom, backgroundColor: colors.background, borderTopColor: colors.border } }}>
    <Tabs.Screen name="index" options={{ title: "Início", tabBarIcon: ({ color }) => <IconSymbol size={26} name="house.fill" color={color} /> }} />
    <Tabs.Screen name="portfolio" options={{ title: "Carteira", tabBarIcon: ({ color }) => <IconSymbol size={26} name="rectangle.stack.fill" color={color} /> }} />
    <Tabs.Screen name="dividends" options={{ title: "Proventos", tabBarIcon: ({ color }) => <IconSymbol size={26} name="banknote.fill" color={color} /> }} />
    <Tabs.Screen name="reports" options={{ title: "Resultados", tabBarIcon: ({ color }) => <IconSymbol size={26} name="chart.bar.fill" color={color} /> }} />
    <Tabs.Screen name="darf" options={{ title: "DARF", tabBarIcon: ({ color }) => <IconSymbol size={26} name="doc.text.fill" color={color} /> }} />
  </Tabs><Pressable accessibilityRole="button" accessibilityLabel="Abrir configurações" onPress={() => router.push("/settings" as any)} style={({ pressed }) => [styles.settings, { backgroundColor: buttonColor }, pressed && styles.pressed]}><Text style={{ color: buttonText, fontSize: 20, fontWeight: "800" }}>⚙</Text></Pressable></View>;
}
const styles = StyleSheet.create({ root: { flex: 1 }, settings: { alignItems: "center", borderColor: "#B8D6D0", borderRadius: 18, borderWidth: 1, elevation: 4, height: 46, justifyContent: "center", position: "absolute", right: 16, shadowColor: "#102A43", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 5, top: 54, width: 46, zIndex: 20 }, pressed: { opacity: 0.7, transform: [{ scale: 0.96 }] } });
