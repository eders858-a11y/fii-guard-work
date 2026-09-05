export type ThemeName = "Oceano" | "Floresta" | "Ameixa" | "Alto contraste";

export const THEME_PRESETS: Record<ThemeName, { cardColor: string; textColor: string; accent: string; preview: string }> = {
  Oceano: { cardColor: "#303234", textColor: "#F5F7FA", accent: "#08A6C7", preview: "Grafite e azul oceano" },
  Floresta: { cardColor: "#EAF6E8", textColor: "#173B2D", accent: "#28734A", preview: "Verde natural" },
  Ameixa: { cardColor: "#F5ECF7", textColor: "#3E1D4D", accent: "#7B3F8C", preview: "Roxo suave" },
  "Alto contraste": { cardColor: "#FFF8E1", textColor: "#111111", accent: "#9A6700", preview: "Máxima leitura" },
};

export const DEFAULT_THEME: ThemeName = "Oceano";
export function themeColors(name?: string) { return THEME_PRESETS[(name as ThemeName) || DEFAULT_THEME] ?? THEME_PRESETS[DEFAULT_THEME]; }
