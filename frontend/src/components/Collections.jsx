import React, { useState, useRef } from "react";
import { useApp } from "@/context/AppContext";
import {
  Button,
  Input,
  ScrollArea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui";
import {
  Plus,
  Pencil,
  Trash2,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  FolderSearch,
  FileDown,
  FileUp,
} from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { api } from "@/api";

function Collections() {
  const {
    collections,
    selectedCollection,
    isLoading,
    selectCollection,
    createCollection,
    deleteCollection,
    updateCollection,
    requests,
    openTab,
    loadRequests,
  } = useApp();

  const [showDialog, setShowDialog] = useState(false);
  const [dialogName, setDialogName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [expanded, setExpanded] = useState({});
  const fileInputRef = useRef(null);

  const toggleExpand = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  const openCreate = () => {
    setEditingId(null);
    setDialogName("");
    setShowDialog(true);
  };
  const openRename = (col) => {
    setEditingId(col.id);
    setDialogName(col.name);
    setShowDialog(true);
  };

  const handleSubmit = () => {
    const trimmed = dialogName.trim();
    if (!trimmed) return;
    if (editingId) {
      updateCollection(editingId, trimmed);
      toast.success(`Renamed to "${trimmed}"`);
    } else {
      createCollection(trimmed);
      toast.success(`Created "${trimmed}"`);
    }
    setShowDialog(false);
  };

  // --- .http file import ---
  const handleImportHTTP = async (collectionId) => {
    fileInputRef.current?.click();
    fileInputRef.current._targetCollectionId = collectionId;
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    const collectionId = e.target._targetCollectionId;
    e.target.value = ""; // Reset so same file can be re-selected
    if (!file || !collectionId) return;

    try {
      const content = await file.text();
      const result = await api.ImportHTTPContent(collectionId, content);
      toast.success(
        `Imported ${result.count} request${result.count !== 1 ? "s" : ""} from ${file.name}`,
      );
      loadRequests(collectionId);
    } catch (err) {
      toast.error(err.message || "Failed to import .http file");
    }
  };

  // --- .http file export ---
  const handleExportHTTP = async (collectionId, collectionName) => {
    try {
      const result = await api.ExportCollectionAsHTTPFile(collectionId);
      if (result.cancelled) return;
      toast.success(`Saved to ${result.path}`);
    } catch (err) {
      toast.error(err.message || "Failed to export .http file");
    }
  };

  const methodColor = (method) => {
    const colors = {
      GET: "text-green-400",
      POST: "text-yellow-400",
      PUT: "text-blue-400",
      DELETE: "text-red-400",
      PATCH: "text-purple-400",
      HEAD: "text-gray-400",
      OPTIONS: "text-gray-400",
      GRAPHQL: "text-pink-400",
    };
    return colors[method] || "text-gray-400";
  };

  return (
    <div className="flex flex-col min-h-0">
      {/* Hidden file input for .http import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".http,.rest,.txt"
        className="hidden"
        onChange={handleFileSelected}
      />

      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {t("collections")}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (selectedCollection?.id) {
                handleImportHTTP(selectedCollection.id);
              } else {
                toast.error("Select a collection first");
              }
            }}
            className="h-6 w-6"
            title="Import .http file"
          >
            <FileUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={openCreate}
            className="h-6 w-6"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 px-2 pb-1">
        {collections.length === 0 ? (
          <div className="text-xs text-muted-foreground py-6 text-center">
            {isLoading.collections ? t("loading") : t("noCollectionsYet")}
          </div>
        ) : (
          <div className="space-y-0.5">
            {collections.map((col) => {
              const isActive = selectedCollection?.id === col.id;
              const isOpen = expanded[col.id];
              const colRequests = isActive ? requests : [];

              return (
                <div key={col.id}>
                  <div className="group relative">
                    <button
                      onClick={() => {
                        selectCollection(col);
                        toggleExpand(col.id);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-left transition-colors",
                        isActive
                          ? "bg-primary/20 text-foreground font-medium"
                          : "hover:bg-accent text-foreground/80",
                      )}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <FolderOpen
                        className={cn(
                          "h-4 w-4 shrink-0",
                          isActive ? "text-primary" : "text-muted-foreground",
                        )}
                      />
                      <span className="truncate flex-1">{col.name}</span>
                    </button>
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 hidden group-hover:flex gap-0.5 bg-card/80 rounded p-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Export as .http"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExportHTTP(col.id, col.name);
                        }}
                      >
                        <FileDown className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          openRename(col);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDelete(col);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Reveal in Finder"
                        onClick={(e) => {
                          e.stopPropagation();
                          api
                            .RevealInFinder(col.id)
                            .catch(() => toast.error("Could not open folder"));
                        }}
                      >
                        <FolderSearch className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Nested requests */}
                  {isOpen && isActive && (
                    <div className="ml-5 border-l border-border pl-2 space-y-0.5">
                      {colRequests.length === 0 ? (
                        <div className="text-[10px] text-muted-foreground py-1.5 pl-2">
                          No requests
                        </div>
                      ) : (
                        colRequests.map((req) => (
                          <button
                            key={req.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              openTab(req);
                            }}
                            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-left text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                          >
                            <span
                              className={cn(
                                "text-[9px] font-mono font-bold shrink-0 w-10",
                                methodColor(req.method),
                              )}
                            >
                              {req.method}
                            </span>
                            <span className="truncate">{req.name}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Rename Collection" : "New Collection"}
            </DialogTitle>
          </DialogHeader>
          <Input
            value={dialogName}
            onChange={(e) => setDialogName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="Collection name"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              {t("dismiss")}
            </Button>
            <Button onClick={handleSubmit}>
              {editingId ? t("updateRequest") : t("saveRequest")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!confirmDelete}
        onOpenChange={() => setConfirmDelete(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t("delete")} &quot;{confirmDelete?.name}&quot;?
            </DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              {t("dismiss")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const name = confirmDelete.name;
                deleteCollection(confirmDelete.id);
                setConfirmDelete(null);
                toast.success(`Deleted "${name}"`);
              }}
            >
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Collections;
