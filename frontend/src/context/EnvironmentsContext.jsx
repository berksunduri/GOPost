import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { api } from "@/api";
import log from "@/lib/log";
import { useAppStatus } from "@/context/AppStatusContext";
import { toast } from "sonner";

const EnvironmentsContext = createContext(null);

export function EnvironmentsProvider({ children }) {
  const { runWithStatus, setIsLoading } = useAppStatus();
  const [environments, setEnvironments] = useState([]);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState(null);

  const selectedEnvironment = useMemo(
    () => environments.find((e) => e.id === selectedEnvironmentId) || null,
    [environments, selectedEnvironmentId],
  );

  // Show diff toast when switching environments
  const selectEnvironment = useCallback(
    (id) => {
      const prev = environments.find((e) => e.id === selectedEnvironmentId);
      const next = environments.find((e) => e.id === id);

      setSelectedEnvironmentId(id);

      if (prev && next && prev.id !== next.id) {
        const prevVars = prev.variables || {};
        const nextVars = next.variables || {};
        const allKeys = new Set([
          ...Object.keys(prevVars),
          ...Object.keys(nextVars),
        ]);
        const changes = [];
        for (const k of allKeys) {
          const pv = String(prevVars[k] ?? "(not set)");
          const nv = String(nextVars[k] ?? "(not set)");
          if (pv !== nv) {
            changes.push({ key: k, prev: pv, next: nv });
          }
        }

        if (changes.length > 0) {
          const maxShow = 5;
          const lines = changes
            .slice(0, maxShow)
            .map(
              (c) =>
                `  ${c.key}: ${c.prev.length > 30 ? c.prev.slice(0, 30) + "…" : c.prev} → ${c.next.length > 30 ? c.next.slice(0, 30) + "…" : c.next}`,
            );
          let msg = `Switched to ${next.name}\n${lines.join("\n")}`;
          if (changes.length > maxShow)
            msg += `\n  …and ${changes.length - maxShow} more`;
          toast(msg, {
            duration: 4000,
            style: { whiteSpace: "pre-line", fontFamily: "monospace" },
          });
        } else {
          toast(`Switched to ${next.name} (no changes)`);
        }
      }
    },
    [environments, selectedEnvironmentId],
  );

  const loadEnvironments = useCallback(async () => {
    setIsLoading((prev) => ({ ...prev, environments: true }));
    try {
      const result = await runWithStatus("environments", () =>
        api.GetEnvironments(),
      );
      setEnvironments(result || []);
    } catch (e) {
      log.error("Error loading environments:", e);
    } finally {
      setIsLoading((prev) => ({ ...prev, environments: false }));
    }
  }, [runWithStatus, setIsLoading]);

  const createEnvironment = useCallback(
    async (name) => {
      await runWithStatus("createEnvironment", () =>
        api.CreateEnvironment(name, {}),
      );
      await loadEnvironments();
    },
    [runWithStatus, loadEnvironments],
  );

  const deleteEnvironment = useCallback(
    async (id) => {
      await runWithStatus("deleteEnvironment", () => api.DeleteEnvironment(id));
      await loadEnvironments();
      if (selectedEnvironmentId === id) {
        setSelectedEnvironmentId(null);
      }
    },
    [runWithStatus, loadEnvironments, selectedEnvironmentId],
  );

  const updateEnvironment = useCallback(
    async (id, name, variables) => {
      await runWithStatus("updateEnvironment", () =>
        api.UpdateEnvironment(id, name, variables),
      );
      await loadEnvironments();
    },
    [runWithStatus, loadEnvironments],
  );

  const value = useMemo(
    () => ({
      environments,
      selectedEnvironment,
      selectedEnvironmentId,
      setSelectedEnvironmentId: selectEnvironment,
      loadEnvironments,
      createEnvironment,
      deleteEnvironment,
      updateEnvironment,
    }),
    [
      environments,
      selectedEnvironment,
      selectedEnvironmentId,
      selectEnvironment,
      loadEnvironments,
      createEnvironment,
      deleteEnvironment,
      updateEnvironment,
    ],
  );

  return (
    <EnvironmentsContext.Provider value={value}>
      {children}
    </EnvironmentsContext.Provider>
  );
}

export function useEnvironments() {
  const ctx = useContext(EnvironmentsContext);
  if (!ctx) {
    throw new Error("useEnvironments must be used within EnvironmentsProvider");
  }
  return ctx;
}
