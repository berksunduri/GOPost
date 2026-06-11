import { useEffect } from "react";
import { useCollections } from "@/context/CollectionsContext";
import { useEnvironments } from "@/context/EnvironmentsContext";
import { useHistory } from "@/context/HistoryContext";

export function AppBootstrap({ children }) {
  const { loadCollections } = useCollections();
  const { loadEnvironments } = useEnvironments();
  const { loadHistory } = useHistory();

  useEffect(() => {
    // Critical path — load before first interactive paint
    Promise.all([loadCollections(), loadEnvironments()]).then(() => {
      // Deferred — load after UI is visible
      setTimeout(() => loadHistory(), 200);
    });
  }, [loadCollections, loadEnvironments, loadHistory]);

  return children;
}
