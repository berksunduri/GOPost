import React, { useEffect, useState, useCallback } from "react";
import { useCollections } from "@/context/CollectionsContext";
import { Button } from "@/components/ui";
import {
  GitBranch, Plus, Check, FileText, GitCommit,
  Upload, Download, Link, ChevronRight, ChevronDown, FolderGit,
} from "lucide-react";
import { api } from "@/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const GitPanel = React.memo(function GitPanel() {
  const { collections, selectCollection } = useCollections();
  const [statuses, setStatuses] = useState({});
  const [expanded, setExpanded] = useState({});
  const [commitMsgs, setCommitMsgs] = useState({});
  const [showRemote, setShowRemote] = useState({});
  const [remoteUrls, setRemoteUrls] = useState({});

  const fetchAll = useCallback(async () => {
    const results = {};
    for (const col of collections) {
      try { const s = await api.GitStatus(col.id); if (s) results[col.id] = s; } catch (_) {}
    }
    setStatuses((prev) => ({ ...prev, ...results }));
  }, [collections]);

  useEffect(() => { fetchAll(); const iv = setInterval(fetchAll, 3000); return () => clearInterval(iv); }, [fetchAll]);

  const refresh = async (cid) => {
    try { const s = await api.GitStatus(cid); setStatuses((p) => ({ ...p, [cid]: s })); } catch (_) {}
  };

  if (collections.length === 0) {
    return <div className="flex flex-col items-center gap-2 py-8 px-4 text-center"><FolderGit className="h-8 w-8 text-muted-foreground/30" /><p className="text-xs text-muted-foreground">Create a collection first to use Git version control</p></div>;
  }

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Source Control</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {collections.map((col) => {
          const s = statuses[col.id];
          const isOpen = expanded[col.id];
          return (
            <div key={col.id} className="border-b border-border/40">
              <button onClick={() => { selectCollection(col); setExpanded((p) => ({ ...p, [col.id]: !p[col.id] })); }} className="w-full flex items-center gap-1.5 px-3 py-2 hover:bg-accent/50 transition-colors text-left">
                {isOpen ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                <span className="text-xs truncate flex-1">{col.name}</span>
                {s?.is_repo ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[9px] text-muted-foreground font-mono">{s.branch || "main"}</span>
                    {s.has_changes && <span className="text-[9px] bg-yellow-500/20 text-yellow-400 px-1 rounded">{s.files?.length || 0}Δ</span>}
                    {s.has_remote && (
                      <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-4 w-4" onClick={async (e) => { e.stopPropagation(); try { await api.GitPull(col.id, "origin"); await refresh(col.id); toast.success("Pulled"); } catch (er) { toast.error(er.message); } }} title="Pull"><Download className="h-2.5 w-2.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-4 w-4" onClick={async (e) => { e.stopPropagation(); try { await api.GitPush(col.id, "origin"); toast.success("Pushed"); } catch (er) { toast.error(er.message); } }} title="Push"><Upload className="h-2.5 w-2.5" /></Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="h-5 text-[9px] px-1.5 shrink-0" onClick={async (e) => { e.stopPropagation(); try { await api.GitInit(col.id); await refresh(col.id); toast.success("Repo initialized"); } catch (er) { toast.error(er.message); } }}><Plus className="h-2.5 w-2.5 mr-0.5" />Init</Button>
                )}
              </button>
              {isOpen && s?.is_repo && (
                <div className="px-4 pb-2 space-y-1.5">
                  {s.has_remote ? <p className="text-[9px] text-muted-foreground/60 truncate">{s.remote_url}</p> : (
                    <div>
                      <Button variant="ghost" size="sm" className="h-5 text-[9px]" onClick={() => setShowRemote((p) => ({ ...p, [col.id]: !showRemote[col.id] }))}><Link className="h-2.5 w-2.5 mr-1" />Add remote</Button>
                      {showRemote[col.id] && (
                        <div className="flex gap-1 mt-1">
                          <input value={remoteUrls[col.id] || ""} onChange={(e) => setRemoteUrls((p) => ({ ...p, [col.id]: e.target.value }))} placeholder="git@github.com:user/repo.git" className="flex-1 h-6 rounded border border-input bg-transparent px-2 text-[10px]" onKeyDown={async (e) => { if (e.key === "Enter") { const url = remoteUrls[col.id]?.trim(); if (!url) { toast.error("Enter a remote URL"); return; } try { await api.GitAddRemote(col.id, "origin", url); await refresh(col.id); setShowRemote((p) => ({ ...p, [col.id]: false })); toast.success("Remote added"); } catch (er) { toast.error(er.message); } } }} />
                          <Button size="sm" className="h-6 text-[9px] px-2" onClick={async () => { const url = remoteUrls[col.id]?.trim(); if (!url) { toast.error("Enter a remote URL"); return; } try { await api.GitAddRemote(col.id, "origin", url); await refresh(col.id); setShowRemote((p) => ({ ...p, [col.id]: false })); toast.success("Remote added"); } catch (er) { toast.error(er.message); } }}>Add</Button>
                        </div>
                      )}
                    </div>
                  )}
                  {s.has_changes && s.files?.length > 0 && (
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Changes</span>
                      {s.files.map((f, i) => (
                        <div key={i} className="flex items-center gap-1 text-[10px] text-foreground/80">
                          <span className={cn("font-mono text-[9px] w-3", f.status === "added" ? "text-green-400" : f.status === "deleted" ? "text-red-400" : "text-yellow-400")}>{f.status === "added" ? "A" : f.status === "deleted" ? "D" : "M"}</span>
                          <FileText className="h-3 w-3 shrink-0 text-muted-foreground" /><span className="truncate">{f.path}</span>
                        </div>
                      ))}
                      <div className="flex gap-1 pt-1">
                        <input value={commitMsgs[col.id] || ""} onChange={(e) => setCommitMsgs((p) => ({ ...p, [col.id]: e.target.value }))} onKeyDown={async (e) => { if (e.key === "Enter") { const m = commitMsgs[col.id]?.trim(); if (!m) { toast.error("Enter a commit message"); return; } try { await api.GitCommit(col.id, m); setCommitMsgs((p) => ({ ...p, [col.id]: "" })); await refresh(col.id); toast.success("Committed"); } catch (er) { toast.error(er.message); } } }} placeholder="Commit message (Enter)" className="flex-1 h-6 rounded border border-input bg-transparent px-2 text-[10px]" />
                        <Button size="sm" className="h-6 text-[9px] px-2 shrink-0" onClick={async () => { const m = commitMsgs[col.id]?.trim(); if (!m) { toast.error("Enter a commit message"); return; } try { await api.GitCommit(col.id, m); setCommitMsgs((p) => ({ ...p, [col.id]: "" })); await refresh(col.id); toast.success("Committed"); } catch (er) { toast.error(er.message); } }}><Check className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  )}
                  {!s.has_changes && <p className="text-[10px] text-green-400">✓ Clean</p>}
                  {s.commits?.length > 0 && (
                    <div className="space-y-0.5 pt-1">
                      <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">History</span>
                      {s.commits.slice(0, 5).map((c, i) => (<div key={i} className="text-[10px] leading-relaxed pl-1"><div className="flex items-center gap-1"><GitCommit className="h-3 w-3 text-muted-foreground shrink-0" /><span className="text-foreground/80 truncate">{c.message}</span></div><div className="flex items-center gap-1.5 pl-4 text-muted-foreground/50 text-[9px]"><span className="font-mono">{c.hash}</span><span>{c.author}</span></div></div>))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});