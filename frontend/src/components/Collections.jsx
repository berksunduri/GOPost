import React, { useState } from "react";
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
import { Plus, Pencil, Trash2, FolderOpen } from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function Collections() {
  const {
    collections,
    selectedCollection,
    isLoading,
    selectCollection,
    createCollection,
    deleteCollection,
    updateCollection,
  } = useApp();

  const [showDialog, setShowDialog] = useState(false);
  const [dialogName, setDialogName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

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

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {t("collections")}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={openCreate}
          className="h-6 w-6"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
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
              return (
                <div key={col.id} className="group relative">
                  <button
                    onClick={() => selectCollection(col)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-left transition-colors",
                      isActive
                        ? "bg-primary/20 text-foreground font-medium"
                        : "hover:bg-accent text-foreground/80",
                    )}
                  >
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
                  </div>
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
