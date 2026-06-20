import React from "react";
import { createRoot } from "react-dom/client";
import { AppProvider } from "@/context/AppProvider";
import { ThemeProvider } from "@/context/ThemeContext";
import { UserConfigProvider } from "@/context/UserConfigContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "sonner";
import App from "@/App";
import "@/App.css";

const toaster = (
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
);

export function render() {
  return (
    <UserConfigProvider>
      <ThemeProvider>
        <AppProvider>
          {toaster}
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </AppProvider>
      </ThemeProvider>
    </UserConfigProvider>
  );
}

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(render());
}
