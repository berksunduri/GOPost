import React, { useRef, useState, useCallback } from "react";
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
import Collections from "@/components/Collections";
import RequestEditor from "@/components/RequestEditor";
import EnvironmentManager from "@/components/EnvironmentManager";
import HistoryPanel from "@/components/HistoryPanel";
import { TabBar } from "@/components/TabBar";
import { TerminalPanel } from "@/components/TerminalPanel";
import { GitPanel } from "@/components/GitPanel";
import { ActivityBar } from "@/components/ActivityBar";
import { t } from "@/i18n";
import { api } from "@/api";
import { Palette, Terminal } from "lucide-react";
import { toast } from "sonner";
import "./App.css";

// Embedded terminal disabled — flip to true in config/features.js to re-enable.
const TERMINAL_ENABLED = false;

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
    loadRequests,
  } = useApp();

  const { themeId, setThemeId, themeList } = useTheme();
  const importInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const [importModeState, setImportModeState] = React.useState("replace");
  const [showTerminal, setShowTerminal] = useState(false);
  const [terminalPct, setTerminalPct] = useState(25);
  const [activity, setActivity] = useState("explorer");
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);

  const handleSidebarResize = useCallback(
    (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = sidebarWidth;
      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        setSidebarWidth(Math.min(Math.max(startW + dx, 200), 500));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [sidebarWidth],
  );

  const handleTerminalResize = useCallback(
    (e) => {
      e.preventDefault();
      const startY = e.clientY;
      const startPct = terminalPct;
      const onMove = (ev) => {
        const dy = startY - ev.clientY;
        const h = document.getElementById("main-area")?.clientHeight || 600;
        setTerminalPct(Math.min(Math.max(startPct + (dy / h) * 100, 15), 50));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [terminalPct],
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
      if (TERMINAL_ENABLED && mod && e.key === "`") {
        e.preventDefault();
        setShowTerminal((s) => !s);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (lastRunReport) {
      const { total, passed, failed } = lastRunReport;
      if (failed === 0)
        toast.success(
          `Collection run complete \u2014 ${passed}/${total} passed`,
        );
      else
        toast.error(
          `Collection run complete \u2014 ${passed} passed, ${failed} failed`,
        );
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
          `Preview: ${result.collections} collections, ${result.requests} requests`,
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

  // --- Drag & Drop .http / .rest file import ---
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer?.types?.includes("Files")) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDrop = useCallback(
    async (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      dragCounter.current = 0;

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const httpFiles = Array.from(files).filter(
        (f) =>
          f.name.endsWith(".http") ||
          f.name.endsWith(".rest") ||
          f.name.endsWith(".gopost.json"),
      );
      if (httpFiles.length === 0) return;

      for (const file of httpFiles) {
        try {
          const content = await file.text();

          if (file.name.endsWith(".gopost.json")) {
            const data = JSON.parse(content);
            const result = await api.ImportDataContent(data, importModeState);
            if (importModeState === "preview") {
              toast.info(
                `Preview: ${result.collections} collections, ${result.requests} requests`,
                { duration: 5000 },
              );
            } else {
              await loadCollections();
              await loadEnvironments();
              await loadHistory();
              toast.success(`Imported ${file.name}`);
            }
            continue;
          }

          let targetCollectionId = selectedCollection?.id;

          if (!targetCollectionId) {
            const colName =
              file.name.replace(/\.(http|rest)$/, "") || "Imported API";
            const col = await api.CreateCollection(colName);
            targetCollectionId = col.id;
            await loadCollections();
          }

          const result = await api.ImportHTTPContent(
            targetCollectionId,
            content,
          );
          toast.success(
            `Imported ${result.count} request${result.count !== 1 ? "s" : ""} from ${file.name}`,
          );
          await loadRequests(targetCollectionId);
        } catch (err) {
          toast.error(`Failed to import ${file.name}: ${err.message}`);
        }
      }
    },
    [
      selectedCollection,
      importModeState,
      loadCollections,
      loadEnvironments,
      loadHistory,
      loadRequests,
    ],
  );

  return (
    <div
      className="flex h-screen bg-background text-foreground relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag-over visual overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/20 border-2 border-dashed border-primary rounded-lg pointer-events-none">
          <div className="bg-card rounded-xl px-8 py-6 shadow-2xl border text-center">
            <p className="text-lg font-semibold mb-1">
              Drop .http file to import
            </p>
            <p className="text-sm text-muted-foreground">
              Supports .http, .rest, and GoPost .json exports
            </p>
          </div>
        </div>
      )}
      {/* Activity Bar — far left */}
      <ActivityBar active={activity} onSelect={setActivity} />

      {/* Sidebar Panel */}
      <div
        className="bg-sidebar border-r flex flex-col shrink-0 relative"
        style={{ width: sidebarWidth }}
      >
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
          {activity === "explorer" && (
            <>
              <Collections />
              <Separator />
              <EnvironmentManager />
            </>
          )}
          {activity === "git" && <GitPanel />}
          {activity === "history" && <HistoryPanel />}
        </div>

        {/* Resize handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 transition-colors z-10"
          onMouseDown={handleSidebarResize}
        />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
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
          {TERMINAL_ENABLED && (
            <Button
              variant={showTerminal ? "default" : "outline"}
              size="sm"
              onClick={() => setShowTerminal((s) => !s)}
              title="Toggle Terminal (Ctrl+`)"
            >
              <Terminal className="h-4 w-4" />
            </Button>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {bridgeMode === "native" ? t("bridgeNative") : t("bridgeFallback")}
          </span>
          {loadingState && (
            <Badge variant="secondary" className="text-[10px]">
              {t("loading")}
            </Badge>
          )}
        </div>

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

        <div id="main-area" className="flex-1 flex min-h-0 overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0">
            <TabBar />
            <div className="flex-1 min-h-0">
              <RequestEditor />
            </div>
            {TERMINAL_ENABLED && showTerminal && (
              <>
                <div
                  onMouseDown={handleTerminalResize}
                  className="h-1.5 shrink-0 bg-border hover:bg-primary/50 active:bg-primary cursor-row-resize transition-colors"
                />
                <div
                  style={{ height: `${terminalPct}%` }}
                  className="min-h-[60px] shrink-0"
                >
                  <TerminalPanel />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
