import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import { SymbolWeight } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<string, ComponentProps<typeof MaterialIcons>["name"]>;

const MAPPING = {
  "house.fill": "home",
  "rectangle.stack.fill": "account-balance-wallet",
  "banknote.fill": "payments",
  "chart.xyaxis.line": "show-chart",
  "chart.bar.fill": "bar-chart",
  "paperplane.fill": "send",
  "globe": "public",
  "calendar.fill": "calendar-month",
  "calendar.badge.clock": "event-available",
  "building.columns.fill": "account-balance",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "brain": "extension", // Mapeado para um ícone válido do MaterialIcons como fallback seguro
} as IconMapping;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: string;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  if (name === "brain") {
    return <FontAwesome5 name="brain" size={size} color={color} style={style} />;
  }
  return <MaterialIcons color={color} size={size} name={MAPPING[name] || "help"} style={style} />;
}