import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useUserConfig } from "@/context/UserConfigContext";

const THEMES = {
  "github-dark": {
    name: "GitHub Dark",
    icon: "circle",
    css: `
      --background: 215 21% 11%;
      --foreground: 210 17% 82%;
      --card: 215 21% 13%;
      --card-foreground: 210 17% 82%;
      --popover: 215 21% 13%;
      --popover-foreground: 210 17% 82%;
      --primary: 212 92% 58%;
      --primary-foreground: 0 0% 100%;
      --secondary: 215 21% 16%;
      --secondary-foreground: 210 17% 82%;
      --muted: 215 21% 16%;
      --muted-foreground: 215 13% 55%;
      --accent: 215 21% 18%;
      --accent-foreground: 210 17% 90%;
      --destructive: 0 72% 55%;
      --destructive-foreground: 0 0% 100%;
      --border: 215 21% 22%;
      --input: 215 21% 22%;
      --ring: 212 92% 58%;
      --radius: 0.5rem;
      --sidebar: 215 21% 9%;
      --sidebar-foreground: 210 17% 82%;
      --sidebar-border: 215 21% 20%;
      --sidebar-accent: 215 21% 16%;
      --sidebar-accent-foreground: 210 17% 90%;
    `,
  },
  "high-contrast": {
    name: "High Contrast",
    icon: "contrast",
    css: `
      --background: 0 0% 7%;
      --foreground: 0 0% 95%;
      --card: 0 0% 9%;
      --card-foreground: 0 0% 95%;
      --popover: 0 0% 9%;
      --popover-foreground: 0 0% 95%;
      --primary: 210 100% 60%;
      --primary-foreground: 0 0% 100%;
      --secondary: 0 0% 15%;
      --secondary-foreground: 0 0% 95%;
      --muted: 0 0% 15%;
      --muted-foreground: 0 0% 70%;
      --accent: 0 0% 18%;
      --accent-foreground: 0 0% 98%;
      --destructive: 0 85% 58%;
      --destructive-foreground: 0 0% 100%;
      --border: 0 0% 25%;
      --input: 0 0% 25%;
      --ring: 210 100% 60%;
      --radius: 0.5rem;
      --sidebar: 0 0% 5%;
      --sidebar-foreground: 0 0% 95%;
      --sidebar-border: 0 0% 18%;
      --sidebar-accent: 0 0% 15%;
      --sidebar-accent-foreground: 0 0% 98%;
    `,
  },
  dracula: {
    name: "Dracula",
    icon: "moon",
    css: `
      --background: 231 15% 18%;
      --foreground: 60 30% 96%;
      --card: 232 14% 20%;
      --card-foreground: 60 30% 96%;
      --popover: 232 14% 20%;
      --popover-foreground: 60 30% 96%;
      --primary: 326 100% 74%;
      --primary-foreground: 231 15% 18%;
      --secondary: 232 14% 25%;
      --secondary-foreground: 60 30% 96%;
      --muted: 232 14% 25%;
      --muted-foreground: 225 10% 65%;
      --accent: 232 14% 28%;
      --accent-foreground: 60 30% 96%;
      --destructive: 0 100% 67%;
      --destructive-foreground: 60 30% 96%;
      --border: 232 14% 31%;
      --input: 232 14% 31%;
      --ring: 326 100% 74%;
      --radius: 0.5rem;
      --sidebar: 231 15% 15%;
      --sidebar-foreground: 60 30% 96%;
      --sidebar-border: 232 14% 25%;
      --sidebar-accent: 232 14% 25%;
      --sidebar-accent-foreground: 60 30% 96%;
    `,
  },
  light: {
    name: "Light",
    icon: "sun",
    css: `
      --background: 0 0% 100%;
      --foreground: 222 47% 11%;
      --card: 0 0% 98%;
      --card-foreground: 222 47% 11%;
      --popover: 0 0% 98%;
      --popover-foreground: 222 47% 11%;
      --primary: 210 100% 45%;
      --primary-foreground: 0 0% 100%;
      --secondary: 210 40% 96%;
      --secondary-foreground: 222 47% 11%;
      --muted: 210 40% 96%;
      --muted-foreground: 215 16% 47%;
      --accent: 210 40% 94%;
      --accent-foreground: 222 47% 11%;
      --destructive: 0 84% 50%;
      --destructive-foreground: 0 0% 100%;
      --border: 214 32% 91%;
      --input: 214 32% 91%;
      --ring: 210 100% 45%;
      --radius: 0.5rem;
      --sidebar: 0 0% 96%;
      --sidebar-foreground: 222 47% 11%;
      --sidebar-border: 214 32% 88%;
      --sidebar-accent: 210 40% 94%;
      --sidebar-accent-foreground: 222 47% 11%;
    `,
  },
  "one-dark": {
    name: "One Dark",
    icon: "star",
    css: `
      --background: 220 13% 18%;
      --foreground: 219 14% 71%;
      --card: 220 13% 20%;
      --card-foreground: 219 14% 71%;
      --popover: 220 13% 20%;
      --popover-foreground: 219 14% 71%;
      --primary: 207 82% 66%;
      --primary-foreground: 220 13% 18%;
      --secondary: 220 13% 25%;
      --secondary-foreground: 219 14% 75%;
      --muted: 220 13% 25%;
      --muted-foreground: 220 10% 55%;
      --accent: 220 13% 28%;
      --accent-foreground: 219 14% 80%;
      --destructive: 355 65% 65%;
      --destructive-foreground: 220 13% 18%;
      --border: 220 13% 28%;
      --input: 220 13% 28%;
      --ring: 207 82% 66%;
      --radius: 0.5rem;
      --sidebar: 220 13% 15%;
      --sidebar-foreground: 219 14% 71%;
      --sidebar-border: 220 13% 24%;
      --sidebar-accent: 220 13% 25%;
      --sidebar-accent-foreground: 219 14% 80%;
    `,
  },
  fleafy: {
    name: "Fleafy",
    icon: "leaf",
    css: `
      --background: 281 22% 12%;
      --foreground: 237 18% 72%;
      --card: 281 22% 15%;
      --card-foreground: 237 18% 72%;
      --popover: 281 22% 15%;
      --popover-foreground: 237 18% 72%;
      --primary: 45 88% 57%;
      --primary-foreground: 281 22% 12%;
      --secondary: 33 20% 16%;
      --secondary-foreground: 33 89% 65%;
      --muted: 281 15% 18%;
      --muted-foreground: 237 14% 55%;
      --accent: 281 20% 22%;
      --accent-foreground: 237 18% 78%;
      --destructive: 16 90% 51%;
      --destructive-foreground: 0 0% 100%;
      --border: 281 18% 25%;
      --input: 281 18% 25%;
      --ring: 45 88% 57%;
      --radius: 0.5rem;
      --sidebar: 281 22% 8%;
      --sidebar-foreground: 237 18% 68%;
      --sidebar-border: 281 18% 20%;
      --sidebar-accent: 281 20% 18%;
      --sidebar-accent-foreground: 237 18% 75%;
    `,
  },
};

const ThemeContext = createContext(null);

function applyThemeCSS(css, overrides) {
  const root = document.documentElement;
  css.split(";").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const [key, ...rest] = trimmed.split(":");
    const value = rest.join(":").trim();
    if (key && value) {
      root.style.setProperty(key.trim(), value);
    }
  });
  // Apply user custom color overrides on top
  if (overrides) {
    Object.entries(overrides).forEach(([key, value]) => {
      if (value) root.style.setProperty(key, value);
    });
  }
}

export function ThemeProvider({ children }) {
  // Delegate theme state to UserConfigContext (must be wrapped by UserConfigProvider)
  const {
    themeId: ucThemeId,
    setThemeId: ucSetThemeId,
    customColors,
    setCustomColors,
    loaded,
  } = useUserConfig();

  const theme = THEMES[ucThemeId] || THEMES["github-dark"];

  useEffect(() => {
    applyThemeCSS(theme.css, customColors);
  }, [ucThemeId, theme.css, customColors]);

  const themeList = useMemo(
    () => Object.entries(THEMES).map(([id, t]) => ({ id, name: t.name })),
    [],
  );

  const value = useMemo(
    () => ({
      themeId: ucThemeId,
      setThemeId: ucSetThemeId,
      theme,
      themeList,
      customColors,
      setCustomColors,
    }),
    [ucThemeId, ucSetThemeId, theme, themeList, customColors, setCustomColors],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

export { THEMES };

// Editable color variables for the custom theme editor.
// Each entry maps a CSS variable name to a human-readable label and category.
export const COLOR_VARS = [
  {
    group: "Surface",
    vars: [
      { key: "--background", label: "Background" },
      { key: "--foreground", label: "Text" },
      { key: "--card", label: "Card" },
      { key: "--card-foreground", label: "Card Text" },
      { key: "--sidebar", label: "Sidebar" },
      { key: "--sidebar-foreground", label: "Sidebar Text" },
    ],
  },
  {
    group: "Accent",
    vars: [
      { key: "--primary", label: "Primary" },
      { key: "--primary-foreground", label: "Primary Text" },
      { key: "--ring", label: "Focus Ring" },
    ],
  },
  {
    group: "Interactive",
    vars: [
      { key: "--secondary", label: "Secondary" },
      { key: "--secondary-foreground", label: "Secondary Text" },
      { key: "--muted", label: "Muted" },
      { key: "--muted-foreground", label: "Muted Text" },
      { key: "--accent", label: "Accent" },
      { key: "--accent-foreground", label: "Accent Text" },
    ],
  },
  {
    group: "Edges",
    vars: [
      { key: "--border", label: "Border" },
      { key: "--input", label: "Input" },
    ],
  },
  {
    group: "Destructive",
    vars: [
      { key: "--destructive", label: "Destructive" },
      { key: "--destructive-foreground", label: "Destructive Text" },
    ],
  },
];
