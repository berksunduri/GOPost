import React from "react";
import { Input, Button, Switch } from "@/components/ui";
import { Trash2, Plus } from "lucide-react";
import { t } from "@/i18n";

export function ParamsEditor({ params = [], onChange }) {
  const add = () => onChange([...params, { key: "", value: "", enabled: true }]);
  const remove = (i) => onChange(params.filter((_, idx) => idx !== i));
  const update = (i, field, val) => {
    const next = [...params];
    next[i] = { ...next[i], [field]: val };
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {params.map((p, i) => (
        <div key={i} className="flex gap-2 items-center">
          <Input
            value={p.key}
            onChange={(e) => update(i, "key", e.target.value)}
            placeholder={t("key")}
            className="flex-1"
          />
          <Input
            value={p.value}
            onChange={(e) => update(i, "value", e.target.value)}
            placeholder={t("value")}
            className="flex-1"
          />
          <input
            type="checkbox"
            checked={p.enabled}
            onChange={(e) => update(i, "enabled", e.target.checked)}
            className="shrink-0 h-4 w-4"
          />
          {params.length > 1 && (
            <Button variant="ghost" size="icon" onClick={() => remove(i)} className="shrink-0">
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add}>
        <Plus className="h-4 w-4" />
        {t("addParam")}
      </Button>
    </div>
  );
}
