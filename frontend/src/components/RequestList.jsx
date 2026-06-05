import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import {
  Button,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui";
import { Copy, Trash2, FileText } from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { api } from "@/api";
import { toast } from "sonner";

function RequestList() {
  const {
    requests,
    selectedRequestId,
    collections,
    setSelectedRequestId,
    setVirtualRequest,
    refreshRequests,
  } = useApp();

  const [deleteTarget, setDeleteTarget] = useState(null);

  const handleDuplicate = async (id) => {
    await api.DuplicateRequest(id);
    await refreshRequests();
    toast.success("Request duplicated");
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { id, name } = deleteTarget;
    try {
      await api.DeleteRequest(id);
      if (selectedRequestId === id) setSelectedRequestId(null);
      await refreshRequests();
      toast.success(`Deleted "${name}"`);
    } catch (e) {
      toast.error(e.message || "Delete failed");
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleMove = async (requestId, collectionId) => {
    await api.MoveRequest(requestId, collectionId);
    await refreshRequests();
    toast.success("Request moved");
  };

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-4">
        <FileText className="h-8 w-8 opacity-30" />
        <p className="text-xs text-center">
          No requests yet.
          <br />
          Create one in the editor.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center px-3 py-2.5 border-b">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {t("requests")} ({requests.length})
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-1.5 space-y-0.5">
          {requests.map((req) => {
            const isActive = selectedRequestId === req.id;
            return (
              <div
                key={req.id}
                className={cn(
                  "rounded-md transition-colors cursor-pointer",
                  isActive ? "bg-primary/20" : "hover:bg-accent",
                )}
                onClick={() => {
                  setVirtualRequest(null);
                  setSelectedRequestId(req.id);
                }}
              >
                {/* Top row: method badge + name */}
                <div className="flex items-center gap-2.5 px-2.5 pt-2">
                  <span
                    className={cn(
                      "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0",
                      req.method === "GET" && "bg-green-500/20 text-green-400",
                      req.method === "POST" &&
                        "bg-yellow-500/20 text-yellow-400",
                      req.method === "PUT" && "bg-blue-500/20 text-blue-400",
                      req.method === "DELETE" && "bg-red-500/20 text-red-400",
                      req.method === "PATCH" &&
                        "bg-purple-500/20 text-purple-400",
                      !["GET", "POST", "PUT", "DELETE", "PATCH"].includes(
                        req.method,
                      ) && "bg-gray-500/20 text-gray-400",
                    )}
                  >
                    {req.method}
                  </span>
                  <span
                    className={cn(
                      "truncate flex-1 text-sm",
                      isActive
                        ? "text-foreground font-medium"
                        : "text-foreground/80",
                    )}
                  >
                    {req.name}
                  </span>
                </div>

                {/* Bottom row: always-visible actions — normal flow, never clipped */}
                <div className="flex items-center gap-1 px-2.5 pb-2 pt-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDuplicate(req.id);
                    }}
                    title="Duplicate"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget({ id: req.id, name: req.name });
                    }}
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                  <Select
                    value={req.collection_id}
                    onValueChange={(v) => handleMove(req.id, v)}
                  >
                    <SelectTrigger
                      className="h-6 text-[10px] px-1.5 border-0 w-auto gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-muted-foreground">Move to</span>
                    </SelectTrigger>
                    <SelectContent>
                      {collections.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete &quot;{deleteTarget?.name}&quot;?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("dismiss")}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RequestList;
