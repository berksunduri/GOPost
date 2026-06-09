import React, { useState, useRef, useCallback } from "react";
import { useCollections } from "@/context/CollectionsContext";
import { useRequests } from "@/context/RequestsContext";
import { useTabs } from "@/context/TabsContext";
import { useAppStatus } from "@/context/AppStatusContext";
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
  Folder,
  ChevronRight,
  ChevronDown,
  FolderSearch,
  FileDown,
  FileUp,
  FilePlus,
  Copy,
} from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { api } from "@/api";

function Collections() {
  const {
    collections,
    selectedCollection,
    selectCollection,
    createCollection,
    deleteCollection,
    updateCollection,
  } = useCollections();
  const { isLoading } = useAppStatus();
  const {
    getRequestsForCollection,
    loadRequests,
    createRequestInCollection,
    deleteRequest,
  } = useRequests();
  const { openTab } = useTabs();

  const [showDialog, setShowDialog] = useState(false);
  const [dialogName, setDialogName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [creatingRequestId, setCreatingRequestId] = useState(null);
  const fileInputRef = useRef(null);
  const dialogInputRef = useRef(null);

  const toggleExpand = useCallback(
    (col) => {
      let shouldSelect = false;
      setExpanded((p) => {
        const isOpen = p[col.id];
        shouldSelect = !isOpen;
        return { ...p, [col.id]: !isOpen };
      });
      if (shouldSelect) {
        selectCollection(col);
      }
    },
    [selectCollection],
  );

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

  const handleCreateRequest = async (collectionId) => {
    setCreatingRequestId(collectionId);
    try {
      const req = await createRequestInCollection(collectionId);
      if (req) {
        openTab(req);
        if (!expanded[collectionId]) {
          setExpanded((p) => ({ ...p, [collectionId]: true }));
        }
        toast.success(`New request created`);
      }
    } catch (e) {
      toast.error(e.message || "Failed to create request");
    } finally {
      setCreatingRequestId(null);
    }
  };

  // --- .http file import ---
  const handleImportHTTP = (collectionId) => {
    fileInputRef.current._targetCollectionId = collectionId;
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    const collectionId = e.target._targetCollectionId;
    e.target.value = "";
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

  const handleExportHTTP = async (collectionId, collectionName) => {
    try {
      const result = await api.ExportCollectionAsHTTPFile(collectionId);
      if (result.cancelled) return;
      toast.success(`Saved to ${result.path}`);
    } catch (err) {
      toast.error(err.message || "Failed to export .http file");
    }
  };

  const handleDuplicateRequest = async (req, collectionId) => {
    try {
      const duplicated = await api.DuplicateRequest(req.id);
      toast.success(`Duplicated \"${req.name}\" → \"${duplicated.name}\"`);
      loadRequests(collectionId);
    } catch (err) {
      toast.error(err.message || "Failed to duplicate request");
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
      WS: "text-cyan-400",
      SSE: "text-orange-400",
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

      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {t("collections")}
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => {
              if (selectedCollection?.id) {
                handleImportHTTP(selectedCollection.id);
              } else if (collections.length > 0) {
                handleImportHTTP(collections[0].id);
              } else {
                toast.error("Create a collection first");
              }
            }}
            title="Import .http file"
          >
            <FileUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={openCreate}
            className="h-6 w-6"
            title="New collection"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 px-2 pb-1">
        {collections.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-10 px-4 text-center">
            <Folder className="h-10 w-10 text-muted-foreground/20" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                {isLoading.collections ? t("loading") : t("noCollectionsYet")}
              </p>
              {!isLoading.collections && (
                <>
                  <p className="text-xs text-muted-foreground/60 max-w-[200px]">
                    {t("emptyStateDescription")}
                  </p>
                  <div className="flex flex-col gap-1.5 pt-1">
                    <Button
                      variant="default"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={openCreate}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {t("emptyStateCTA")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        if (selectedCollection?.id) {
                          handleImportHTTP(selectedCollection.id);
                        } else {
                          openCreate();
                        }
                      }}
                    >
                      <FileUp className="h-3 w-3 mr-1" />
                      Import .http File
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-0.5">
            {collections.map((col) => {
              const isActive = selectedCollection?.id === col.id;
              const isOpen = expanded[col.id];
              const colRequests = isOpen
                ? (getRequestsForCollection(col.id) ?? [])
                : [];

              return (
                <div key={col.id}>
                  {/* Collection row */}
                  <div className="group relative">
                    <button
                      onClick={() => toggleExpand(col)}
                      className={cn(
                        "w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm text-left transition-colors",
                        isActive
                          ? "bg-primary/15 text-foreground"
                          : "hover:bg-accent text-foreground/80",
                      )}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      {isOpen ? (
                        <FolderOpen
                          className={cn(
                            "h-4 w-4 shrink-0",
                            isActive ? "text-primary" : "text-muted-foreground",
                          )}
                        />
                      ) : (
                        <Folder
                          className={cn(
                            "h-4 w-4 shrink-0",
                            isActive ? "text-primary" : "text-muted-foreground",
                          )}
                        />
                      )}
                      <span className="truncate flex-1 min-w-0 text-[13px]">
                        {col.name}
                      </span>
                    </button>

                    {/* Action buttons — absolute overlay on hover, never affects layout */}
                    <div className="absolute right-0.5 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-px bg-card/90 backdrop-blur-sm rounded px-0.5 py-0.5">
                      <button
                        className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                        title="New request"
                        disabled={creatingRequestId === col.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCreateRequest(col.id);
                        }}
                      >
                        <FilePlus className="h-3 w-3" />
                      </button>
                      <button
                        className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                        title="Export as .http"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExportHTTP(col.id, col.name);
                        }}
                      >
                        <FileDown className="h-3 w-3" />
                      </button>
                      <button
                        className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                        title="Rename"
                        onClick={(e) => {
                          e.stopPropagation();
                          openRename(col);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                        title="Reveal in Finder"
                        onClick={(e) => {
                          e.stopPropagation();
                          api
                            .RevealInFinder(col.id)
                            .catch(() => toast.error("Could not open folder"));
                        }}
                      >
                        <FolderSearch className="h-3 w-3" />
                      </button>
                      <button
                        className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDelete(col);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {/* Nested requests */}
                  {isOpen && (
                    <div className="ml-4 border-l border-border/60 pl-2 space-y-0.5 mt-0.5">
                      {/* "New request" quick-add row */}
                      <button
                        onClick={() => handleCreateRequest(col.id)}
                        disabled={creatingRequestId === col.id}
                        className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-left text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent/50 transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                        <span>New request</span>
                      </button>

                      {colRequests.length === 0 ? (
                        <div className="text-[11px] text-muted-foreground/40 py-1 pl-6 italic">
                          Empty collection
                        </div>
                      ) : (
                        colRequests.map((req) => (
                          <div
                            key={req.id}
                            className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs text-left text-muted-foreground hover:text-foreground hover:bg-accent transition-colors group/req"
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                selectCollection(col);
                                openTab(req);
                              }}
                              className="flex items-center gap-1.5 flex-1 min-w-0"
                            >
                              <span
                                className={cn(
                                  "text-[10px] font-mono font-bold shrink-0 w-10",
                                  methodColor(req.method),
                                )}
                              >
                                {req.method}
                              </span>
                              <span className="truncate">{req.name}</span>
                            </button>
                            <button
                              className="hidden group-hover/req:flex shrink-0 hover:text-foreground p-0.5 rounded"
                              title="Duplicate request"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDuplicateRequest(req, col.id);
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                            <button
                              className="hidden group-hover/req:flex shrink-0 hover:text-destructive p-0.5 rounded"
                              title="Delete request"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteRequest(req.id, col.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
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

      {/* Create/Rename dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Rename Collection" : "New Collection"}
            </DialogTitle>
          </DialogHeader>
          <Input
            ref={dialogInputRef}
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

      {/* Delete confirmation dialog */}
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

export default React.memo(Collections);
