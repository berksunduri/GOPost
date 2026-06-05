import React from "react";
import { createRoot } from "react-dom/client";
import { AppProvider } from "@/context/AppContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { Toaster } from "sonner";
import App from "@/App";
import "@/App.css";

export function render() {
  return (
    <ThemeProvider>
      <AppProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "hsl(var(--card))",
              color: "hsl(var(--foreground))",
              border: "1px solid hsl(var(--border))",
              fontSize: "13px",
            },
          }}
        />
        <App />
      </AppProvider>
    </ThemeProvider>
  );
}

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <ThemeProvider>
      <AppProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "hsl(var(--card))",
              color: "hsl(var(--foreground))",
              border: "1px solid hsl(var(--border))",
              fontSize: "13px",
            },
          }}
        />
        <App />
      </AppProvider>
    </ThemeProvider>,
  );
}
