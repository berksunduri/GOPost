import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { api } from "@/api";
import { useAppStatus } from "@/context/AppStatusContext";

const EnvironmentsContext = createContext(null);

export function EnvironmentsProvider({ children }) {
  const { runWithStatus, setIsLoading } = useAppStatus();
  const [environments, setEnvironments] = useState([]);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState(null);

  const selectedEnvironment = useMemo(
    () => environments.find((e) => e.id === selectedEnvironmentId) || null,
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
      console.error("Error loading environments:", e);
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
      setSelectedEnvironmentId,
      loadEnvironments,
      createEnvironment,
      deleteEnvironment,
      updateEnvironment,
    }),
    [
      environments,
      selectedEnvironment,
      selectedEnvironmentId,
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
