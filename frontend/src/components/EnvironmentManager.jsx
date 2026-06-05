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
import { Plus, Trash2, Globe, PlusCircle } from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function EnvironmentManager() {
  const {
    environments,
    selectedEnvironment,
    isLoading,
    setSelectedEnvironmentId,
    createEnvironment,
    deleteEnvironment,
    updateEnvironment,
  } = useApp();

  const [showDialog, setShowDialog] = useState(false);
  const [dialogName, setDialogName] = useState("");
  const [editorVariables, setEditorVariables] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const openCreate = () => {
    setDialogName("");
    setShowDialog(true);
  };

  const handleCreate = () => {
    const trimmed = dialogName.trim();
    if (!trimmed) return;
    createEnvironment(trimmed);
    setShowDialog(false);
    toast.success(`Created environment "${trimmed}"`);
  };

  const handleSelect = (env) => {
    setSelectedEnvironmentId(env.id);
    const pairs = Object.entries(env.variables || {}).map(([k, v]) => ({
      key: k,
      value: String(v),
      enabled: true,
    }));
    setEditorVariables(
      pairs.length > 0 ? pairs : [{ key: "", value: "", enabled: true }],
    );
  };

  const handleSave = () => {
    if (!selectedEnvironment) return;
    const vars = {};
    editorVariables.forEach((item) => {
      if (item.enabled && item.key.trim()) vars[item.key.trim()] = item.value;
    });
    updateEnvironment(selectedEnvironment.id, selectedEnvironment.name, vars);
    toast.success(`Saved "${selectedEnvironment.name}"`);
  };

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {t("envVariables")}
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

      <ScrollArea className="px-2 max-h-28">
        {environments.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            {isLoading.environments ? t("loading") : t("noEnvironmentsYet")}
          </div>
        ) : (
          <div className="space-y-0.5">
            {environments.map((env) => {
              const isActive = selectedEnvironment?.id === env.id;
              return (
                <div key={env.id} className="group relative">
                  <button
                    onClick={() => handleSelect(env)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-left transition-colors",
                      isActive
                        ? "bg-primary/20 text-foreground font-medium"
                        : "hover:bg-accent text-foreground/80",
                    )}
                  >
                    <Globe
                      className={cn(
                        "h-4 w-4 shrink-0",
                        isActive ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    <span className="truncate flex-1">{env.name}</span>
                  </button>
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 hidden group-hover:flex">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(env);
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

      {/* Variable editor */}
      {selectedEnvironment && (
        <div className="px-3 py-3 border-t space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground/90 truncate">
              {selectedEnvironment.name}
            </span>
          </div>
          {editorVariables.map((item, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <Input
                value={item.key}
                onChange={(e) => {
                  const next = [...editorVariables];
                  next[i] = { ...next[i], key: e.target.value };
                  setEditorVariables(next);
                }}
                placeholder={t("key")}
                className="h-7 text-xs flex-1"
              />
              <Input
                value={item.value}
                onChange={(e) => {
                  const next = [...editorVariables];
                  next[i] = { ...next[i], value: e.target.value };
                  setEditorVariables(next);
                }}
                placeholder={t("value")}
                className="h-7 text-xs flex-1"
              />
              <input
                type="checkbox"
                checked={item.enabled}
                onChange={(e) => {
                  const next = [...editorVariables];
                  next[i] = { ...next[i], enabled: e.target.checked };
                  setEditorVariables(next);
                }}
                className="shrink-0 h-3.5 w-3.5"
              />
            </div>
          ))}
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={() =>
                setEditorVariables([
                  ...editorVariables,
                  { key: "", value: "", enabled: true },
                ])
              }
            >
              <PlusCircle className="h-3 w-3 mr-1" />
              {t("addVariable")}
            </Button>
            <Button size="sm" className="text-xs h-7" onClick={handleSave}>
              {t("saveEnvironment")}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Environment</DialogTitle>
          </DialogHeader>
          <Input
            value={dialogName}
            onChange={(e) => setDialogName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder={t("envName")}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              {t("dismiss")}
            </Button>
            <Button onClick={handleCreate}>{t("saveEnvironment")}</Button>
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
                deleteEnvironment(confirmDelete.id);
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

export default EnvironmentManager;
