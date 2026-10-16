import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import type { Vertical } from "../api/types";

export type Palette = {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  sand: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  danger: string;
};

const creativeLight: Palette = {
  bg: "#f6f1e8",
  surface: "#fbf8f3",
  ink: "#1c1714",
  muted: "#5c534c",
  line: "#d9cfc2",
  sand: "#e7dfd2",
  accent: "#5b21b6",
  accentSoft: "#efe7fb",
  onAccent: "#ffffff",
  danger: "#9f1239",
};

const creativeDark: Palette = {
  bg: "#14110f",
  surface: "#1e1a17",
  ink: "#f6f1e8",
  muted: "#cbbfb2",
  line: "#3a332c",
  sand: "#2a241f",
  accent: "#d6c4ff",
  accentSoft: "#2c2440",
  onAccent: "#1c1028",
  danger: "#fda4af",
};

const wellLight: Palette = {
  bg: "#f3f6f2",
  surface: "#fbfcfb",
  ink: "#14201b",
  muted: "#4d5e56",
  line: "#d5e0d8",
  sand: "#e4eee8",
  accent: "#1f6b56",
  accentSoft: "#e5f3ed",
  onAccent: "#ffffff",
  danger: "#9f1239",
};

const wellDark: Palette = {
  bg: "#0f1714",
  surface: "#17211d",
  ink: "#eef6f1",
  muted: "#b7c9c0",
  line: "#2c3d36",
  sand: "#1c2b25",
  accent: "#9fe0cc",
  accentSoft: "#1a3330",
  onAccent: "#0f1714",
  danger: "#fda4af",
};

export function paletteFor(vertical: Vertical, scheme: "light" | "dark"): Palette {
  if (vertical === "wellness") return scheme === "dark" ? wellDark : wellLight;
  return scheme === "dark" ? creativeDark : creativeLight;
}

export function swatch(hue: number, vertical: Vertical): string {
  const creative = ["#5b21b6", "#7c3aed", "#9a3412", "#1d4ed8", "#3f6212", "#9d174d"];
  const well = ["#1f6b56", "#0f766e", "#3f6212", "#155e75", "#365314", "#115e59"];
  const list = vertical === "wellness" ? well : creative;
  return list[Math.abs(hue) % list.length];
}

type ThemeValue = {
  vertical: Vertical;
  scheme: "light" | "dark";
  colors: Palette;
  fonts: { display: string; body: string; medium: string };
};

const ThemeContext = createContext<ThemeValue>({
  vertical: "creative",
  scheme: "light",
  colors: creativeLight,
  fonts: { display: "Georgia", body: "System", medium: "System" },
});

export function ThemeProvider({
  vertical,
  schemePreference,
  fonts,
  children,
}: {
  vertical: Vertical;
  schemePreference: "system" | "light" | "dark";
  fonts: { display: string; body: string; medium: string };
  children: ReactNode;
}) {
  const system = useColorScheme();
  const scheme = schemePreference === "system" ? (system === "dark" ? "dark" : "light") : schemePreference;
  const value = useMemo<ThemeValue>(
    () => ({ vertical, scheme, colors: paletteFor(vertical, scheme), fonts }),
    [vertical, scheme, fonts],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
