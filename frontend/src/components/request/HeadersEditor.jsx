import React from "react";
import { Input, Button } from "@/components/ui";
import { Trash2, Plus } from "lucide-react";
import { t } from "@/i18n";

export function HeadersEditor({ headers = [], onChange }) {
  const add = () => onChange([...headers, { key: "", value: "" }]);
  const remove = (index) => onChange(headers.filter((_, i) => i !== index));
  const update = (index, field, value) => {
    const next = [...headers];
    next[index] = { ...next[index], [field]: value };
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {headers.map((h, i) => (
        <div key={i} className="flex gap-2 items-center">
          <Input
            value={h.key}
            onChange={(e) => update(i, "key", e.target.value)}
            placeholder="Header name"
            className="flex-1"
          />
          <Input
            value={h.value}
            onChange={(e) => update(i, "value", e.target.value)}
            placeholder="Header value"
            className="flex-1"
          />
          {headers.length > 1 && (
            <Button variant="ghost" size="icon" onClick={() => remove(i)} className="shrink-0">
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add}>
        <Plus className="h-4 w-4" />
        {t("addHeader")}
      </Button>
    </div>
  );
}
