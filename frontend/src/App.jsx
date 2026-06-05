import React, { useRef } from "react";
import { useApp } from "@/context/AppContext";
import { useTheme } from "@/context/ThemeContext";
import { Button, Input, Separator, Badge } from "@/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { useResizablePanels } from "@/lib/useResizablePanels";
import Collections from "@/components/Collections";
import RequestEditor from "@/components/RequestEditor";
import EnvironmentManager from "@/components/EnvironmentManager";
import RequestList from "@/components/RequestList";
import HistoryPanel from "@/components/HistoryPanel";
import { t } from "@/i18n";
import { api } from "@/api";
import { Palette } from "lucide-react";
import { toast } from "sonner";
import "./App.css";

function App() {
  const {
    selectedCollection,
    errorMessage,
    loadingState,
    lastRunReport,
    bridgeMode,
    searchQuery,
    setSearchQuery,
    setErrorMessage,
    setLastRunReport,
    searchRequests,
    loadCollections,
    loadEnvironments,
    loadHistory,
    runCollection,
  } = useApp();

  const { themeId, setThemeId, themeList } = useTheme();

  const importInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const [importModeState, setImportModeState] = React.useState("replace");

  const { widths, getHandleProps, containerRef } = useResizablePanels(
    [20, 55, 25],
    [14, 30, 16],
  );

  React.useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (mod && e.key.toLowerCase() === "i") {
        e.preventDefault();
        importInputRef.current?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Toast on collection run complete
  React.useEffect(() => {
    if (lastRunReport) {
      const { total, passed, failed } = lastRunReport;
      if (failed === 0) {
        toast.success(
          `Collection run complete \u2014 ${passed}/${total} passed`,
        );
      } else {
        toast.error(
          `Collection run complete \u2014 ${passed} passed, ${failed} failed`,
        );
      }
    }
  }, [lastRunReport]);

  const handleImport = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    try {
      const raw = await file.text();
      const data = JSON.parse(raw);
      const result = await api.ImportDataContent(data, importModeState);
      if (importModeState === "preview") {
        toast.info(
          `Preview: ${result.collections} collections, ${result.requests} requests, ${result.environments} environments, ${result.history} history entries`,
          { duration: 5000 },
        );
      } else {
        await loadCollections();
        await loadEnvironments();
        await loadHistory();
        toast.success(t("importSuccess"));
      }
    } catch (err) {
      toast.error(`${t("importFailed")}: ${err.message}`);
    } finally {
      if (e?.target) e.target.value = "";
    }
  };

  const handleExport = async () => {
    try {
      const data = await api.ExportDataContent();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `gopost-export-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(a.href);
      a.remove();
      alert(t("exportSuccess"));
    } catch (err) {
      toast.error(`${t("exportFailed")}: ${err.message}`);
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar */}
      <div className="w-64 bg-sidebar border-r flex flex-col shrink-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h1 className="text-base font-bold tracking-tight">GoPost</h1>
          <Select value={themeId} onValueChange={setThemeId}>
            <SelectTrigger className="w-[130px] h-7 text-xs">
              <Palette className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {themeList.map((t) => (
                <SelectItem key={t.id} value={t.id} className="text-xs">
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <Collections />
          <Separator />
          <EnvironmentManager />
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Error banner */}
        {errorMessage && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-destructive/15 border-b">
            <span className="text-sm flex-1 truncate">{errorMessage}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setErrorMessage("")}
            >
              {t("dismiss")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                loadCollections();
                loadEnvironments();
                loadHistory();
              }}
            >
              {t("retry")}
            </Button>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b">
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchRequests()}
            placeholder={t("searchPlaceholder")}
            className="flex-1 min-w-[180px] max-w-sm h-8 text-sm"
          />
          <Button variant="outline" size="sm" onClick={searchRequests}>
            {t("search")}
          </Button>

          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImport}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => importInputRef.current?.click()}
          >
            {t("import")}
          </Button>

          <Select value={importModeState} onValueChange={setImportModeState}>
            <SelectTrigger className="w-[110px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="replace">{t("importReplace")}</SelectItem>
              <SelectItem value="merge">{t("importMerge")}</SelectItem>
              <SelectItem value="preview">{t("importPreview")}</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={handleExport}>
            {t("export")}
          </Button>

          <Button
            size="sm"
            onClick={runCollection}
            disabled={!selectedCollection}
          >
            {t("runCollection")}
          </Button>

          <span className="ml-auto text-[11px] text-muted-foreground">
            {bridgeMode === "native" ? t("bridgeNative") : t("bridgeFallback")}
          </span>

          {loadingState && (
            <Badge variant="secondary" className="text-[10px]">
              {t("loading")}
            </Badge>
          )}
        </div>

        {/* Run report */}
        {lastRunReport && (
          <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 border-b text-xs text-muted-foreground">
            <span>
              {t("runSummary")}: <strong>{lastRunReport.total}</strong> total,{" "}
              <strong className="text-green-400">{lastRunReport.passed}</strong>{" "}
              passed,{" "}
              <strong className="text-red-400">{lastRunReport.failed}</strong>{" "}
              failed
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs ml-auto"
              onClick={() => setLastRunReport(null)}
            >
              {t("dismiss")}
            </Button>
          </div>
        )}

        {/* Content area with resizable panels */}
        <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
          {selectedCollection ? (
            <div ref={containerRef} className="flex h-full w-full">
              <div
                style={{ width: `${widths[0]}%` }}
                className="h-full min-w-0 border-r"
              >
                <RequestList />
              </div>
              <div
                {...getHandleProps(0)}
                className="w-1.5 shrink-0 bg-border hover:bg-primary/50 active:bg-primary cursor-col-resize transition-colors"
              />
              <div
                style={{ width: `${widths[1]}%` }}
                className="h-full min-w-0"
              >
                <RequestEditor />
              </div>
              <div
                {...getHandleProps(1)}
                className="w-1.5 shrink-0 bg-border hover:bg-primary/50 active:bg-primary cursor-col-resize transition-colors"
              />
              <div
                style={{ width: `${widths[2]}%` }}
                className="h-full min-w-0 border-l"
              >
                <HistoryPanel />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-lg">{t("selectCollection")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
