import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

function ScrollableTabBar(props: any) {
  const {
    state,
    descriptors,
    navigation,
  } = props;

  const insets = useSafeAreaInsets();
  const colors = useColors();

  const bottom =
    Platform.OS === "web"
      ? 12
      : Math.max(
          insets.bottom,
          8
        );

  return (
    <View
      style={{
        backgroundColor: colors.background,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingBottom: bottom,
        paddingTop: 6,
        height: 64 + bottom,
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 8,
          alignItems: "center",
        }}
      >
        {state.routes.map(
          (
            route: any,
            index: number
          ) => {
            const { options } = descriptors[route.key];

            const label =
              options.tabBarLabel !== undefined
                ? options.tabBarLabel
                : options.title !== undefined
                ? options.title
                : route.name;

            const isFocused = state.index === index;

            const onPress = () => {
              const event = navigation.emit(
                {
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                }
              );

              if (
                !isFocused &&
                !event.defaultPrevented
              ) {
                navigation.navigate(
                  route.name
                );
              }
            };

            const color = isFocused
              ? colors.tint
              : "#888888";

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={
                  isFocused
                    ? { selected: true }
                    : {}
                }
                accessibilityLabel={
                  options.tabBarAccessibilityLabel
                }
                onPress={onPress}
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 12,
                  minWidth: 72,
                }}
              >
                {options.tabBarIcon
                  ? options.tabBarIcon(
                      {
                        focused: isFocused,
                        color,
                        size: 24,
                      }
                    )
                  : null}

                <Text
                  style={{
                    color,
                    fontSize: 11,
                    fontWeight: isFocused
                      ? "700"
                      : "500",
                    marginTop: 3,
                    textAlign: "center",
                  }}
                >
                  {typeof label === "string"
                    ? label
                    : route.name}
                </Text>
              </Pressable>
            );
          }
        )}
      </ScrollView>
    </View>
  );
}

export default function TabLayout() {
  const colors = useColors();

  return (
    <View style={styles.root}>
      <Tabs
        tabBar={(props) => (
          <ScrollableTabBar
            {...props}
          />
        )}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor:
            colors.tint,
          tabBarInactiveTintColor:
            "#888888",
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Início",
            tabBarIcon: ({ color }) => (
              <IconSymbol
                size={24}
                name="house.fill"
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="portfolio"
          options={{
            title: "Carteira",
            tabBarIcon: ({ color }) => (
              <IconSymbol
                size={24}
                name="rectangle.stack.fill"
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="dividends"
          options={{
            title: "Proventos",
            tabBarIcon: ({ color }) => (
              <IconSymbol
                size={24}
                name="globe"
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="b3-dividends"
          options={{
            title: "B3 Oficial",
            tabBarIcon: ({ color }) => (
              <IconSymbol
                size={24}
                name="building.columns.fill"
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="reports"
          options={{
            title: "Resultados",
            tabBarIcon: ({ color }) => (
              <IconSymbol
                size={24}
                name="chart.bar.fill"
                color={color}
              />
            ),
          }}
        />

       <Tabs.Screen
                 name="evolução"
                 options={{
                   title: "Evolução",
                   tabBarIcon: ({ color }) => (
                     <IconSymbol
                       size={24}
                       name="chart.xyaxis.line"
                       color={color}
                     />
                   ),
                 }}
               />

        <Tabs.Screen
          name="darf"
          options={{
            title: "DARF",
            tabBarIcon: ({ color }) => (
              <IconSymbol
                size={24}
                name="banknote.fill"
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="eventos"
          options={{
            title: "Eventos",
            tabBarIcon: ({ color }) => (
              <IconSymbol
                size={24}
                name="calendar.fill"
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="datacom-fiis"
          options={{
            title: "Data Com",
            tabBarIcon: ({ color }) => (
              <IconSymbol
                size={24}
                name="calendar.badge.clock"
                color={color}
              />
            ),
          }}
        />

       <Tabs.Screen
                 name="analise-ia"
                 options={{
                   title: "Análise IA",
                   tabBarIcon: ({ color }) => (
                     <IconSymbol
                       size={24}
                       name="brain"
                       color={color}
                     />
                   ),
                 }}
               />
      </Tabs>
    </View>
  );
}

const styles =
  StyleSheet.create({
    root: {
      flex: 1,
    },
  });