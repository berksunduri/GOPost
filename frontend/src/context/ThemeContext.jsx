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
};

const ThemeContext = createContext(null);

function applyThemeCSS(css) {
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
}

export function ThemeProvider({ children }) {
  // Delegate theme state to UserConfigContext (must be wrapped by UserConfigProvider)
  const {
    themeId: ucThemeId,
    setThemeId: ucSetThemeId,
    loaded,
  } = useUserConfig();

  const theme = THEMES[ucThemeId] || THEMES["github-dark"];

  useEffect(() => {
    applyThemeCSS(theme.css);
  }, [ucThemeId, theme.css]);

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
    }),
    [ucThemeId, ucSetThemeId, theme, themeList],
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
