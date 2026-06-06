import React, { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui";
import {
  GitBranch,
  Plus,
  Check,
  FileText,
  GitCommit,
  Upload,
  Download,
  Link,
} from "lucide-react";
import { api } from "@/api";
import { toast } from "sonner";

export function GitPanel() {
  const { selectedCollection, gitStatuses, setGitStatuses } = useApp();
  const cid = selectedCollection?.id;
  const s = cid ? gitStatuses[cid] : null;
  const [showRemote, setShowRemote] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState("");

  useEffect(() => {
    if (!cid) return;
    let ok = true;
    const fetch = () => {
      api
        .GitStatus(cid)
        .then((r) => {
          if (ok) setGitStatuses((p) => ({ ...p, [cid]: r }));
        })
        .catch(() => {});
    };
    fetch();
    const iv = setInterval(fetch, 2000);
    return () => {
      ok = false;
      clearInterval(iv);
    };
  }, [cid, setGitStatuses]);

  const refresh = async () => {
    if (!cid) return;
    const r = await api.GitStatus(cid);
    setGitStatuses((p) => ({ ...p, [cid]: r }));
  };

  const handleInit = async () => {
    try {
      await api.GitInit(cid);
      await refresh();
      toast.success("Repo initialized");
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleCommit = async () => {
    const el = document.getElementById("gopost-git-msg");
    const msg = el?.value?.trim();
    if (!msg) {
      toast.error("Enter a message");
      return;
    }
    try {
      await api.GitCommit(cid, msg);
      el.value = "";
      await refresh();
      toast.success("Committed");
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleAddRemote = async () => {
    const url = remoteUrl.trim();
    if (!url) {
      toast.error("Enter a remote URL");
      return;
    }
    try {
      await api.GitAddRemote(cid, "origin", url);
      await refresh();
      setShowRemote(false);
      toast.success("Remote added");
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handlePush = async () => {
    try {
      await api.GitPush(cid, "origin");
      toast.success("Pushed");
    } catch (e) {
      toast.error(e.message);
    }
  };
  const handlePull = async () => {
    try {
      await api.GitPull(cid, "origin");
      await refresh();
      toast.success("Pulled");
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (!cid) return null;

  if (!s?.is_repo) {
    return (
      <div className="px-3 py-3 border-t">
        <div className="flex items-center gap-2 mb-2">
          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Source Control
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground mb-2 leading-relaxed">
          Track API changes with Git. One file per request — clean diffs.
        </p>
        <Button size="sm" className="w-full h-7 text-xs" onClick={handleInit}>
          <Plus className="h-3 w-3 mr-1" /> Initialize Repository
        </Button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col min-h-0 border-t"
      style={{ maxHeight: "40%" }}
    >
      {/* Header: branch + remote + actions */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b shrink-0 gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <GitBranch className="h-3.5 w-3.5 text-green-400 shrink-0" />
          <span className="text-[10px] text-muted-foreground truncate">
            {s.branch || "main"}
          </span>
          <span className="text-[9px] text-muted-foreground/50 shrink-0">
            {s.commit_count}c
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {s.has_remote ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={handlePull}
                title="Pull"
              >
                <Download className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={handlePush}
                title="Push"
              >
                <Upload className="h-3 w-3" />
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => setShowRemote(!showRemote)}
              title="Add Remote"
            >
              <Link className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Remote setup */}
      {showRemote && (
        <div className="flex gap-1 px-3 py-1.5 border-b shrink-0">
          <input
            value={remoteUrl}
            onChange={(e) => setRemoteUrl(e.target.value)}
            placeholder="git@github.com:user/repo.git"
            className="flex-1 h-6 rounded border border-input bg-transparent px-2 text-[10px]"
            onKeyDown={(e) => e.key === "Enter" && handleAddRemote()}
          />
          <Button
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={handleAddRemote}
          >
            Add
          </Button>
        </div>
      )}

      {/* Remote URL */}
      {s.has_remote && (
        <div className="px-3 py-0.5 text-[9px] text-muted-foreground/60 truncate border-b shrink-0">
          {s.remote_url}
        </div>
      )}

      {/* Changes */}
      {s.has_changes && s.files?.length > 0 && (
        <div className="px-3 py-2 space-y-1 shrink-0">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Changes
          </span>
          {s.files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 text-[10px] text-foreground/80"
            >
              <span
                className={
                  f.status === "added"
                    ? "text-green-400"
                    : f.status === "deleted"
                      ? "text-red-400"
                      : "text-yellow-400"
                }
              >
                {f.status === "added"
                  ? "A"
                  : f.status === "deleted"
                    ? "D"
                    : "M"}
              </span>
              <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate flex-1">{f.path}</span>
            </div>
          ))}
          <div className="flex gap-1 pt-1">
            <input
              id="gopost-git-msg"
              placeholder="Message (Enter to commit)"
              className="flex-1 h-7 rounded border border-input bg-transparent px-2 text-[10px]"
              onKeyDown={(e) => e.key === "Enter" && handleCommit()}
            />
            <Button
              size="sm"
              className="h-7 text-[10px] px-2 shrink-0"
              onClick={handleCommit}
            >
              <Check className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {!s.has_changes && (
        <div className="px-3 py-1.5 text-[10px] text-green-400 shrink-0">
          ✓ Working tree clean
        </div>
      )}

      {/* Commit history */}
      {s.commits?.length > 0 && (
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-1 space-y-0.5">
          {s.commits.map((c, i) => (
            <div key={i} className="text-[10px] leading-relaxed">
              <div className="flex items-center gap-1.5">
                <GitCommit className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-foreground/80 truncate">{c.message}</span>
              </div>
              <div className="flex items-center gap-2 pl-4 text-muted-foreground/60">
                <span className="font-mono">{c.hash}</span>
                <span>{c.author}</span>
                <span>{c.time}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
