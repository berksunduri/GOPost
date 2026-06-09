import { useEffect } from "react";
import { useCollections } from "@/context/CollectionsContext";
import { useEnvironments } from "@/context/EnvironmentsContext";
import { useHistory } from "@/context/HistoryContext";

export function AppBootstrap({ children }) {
  const { loadCollections } = useCollections();
  const { loadEnvironments } = useEnvironments();
  const { loadHistory } = useHistory();

  useEffect(() => {
    loadCollections();
    loadEnvironments();
    loadHistory();
  }, [loadCollections, loadEnvironments, loadHistory]);

  return children;
}
