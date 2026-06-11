import React, { useState, useCallback } from "react";
import { Button, Input } from "@/components/ui";
import { Plus, Trash2, ArrowDownToLine } from "lucide-react";
import { useEnvironments } from "@/context/EnvironmentsContext";
import { t } from "@/i18n";

const EMPTY_ROW = { name: "", path: "", env: "" };

/**
 * Visual editor for defining response extraction rules.
 * Rows map JSONPath expressions → environment variable names.
 */
export function ExtractEditor({ extracts = [], onChange }) {
  const { environments } = useEnvironments();

  const handleAdd = useCallback(() => {
    onChange([...extracts, { ...EMPTY_ROW }]);
  }, [extracts, onChange]);

  const handleRemove = useCallback(
    (idx) => {
      onChange(extracts.filter((_, i) => i !== idx));
    },
    [extracts, onChange],
  );

  const handleChange = useCallback(
    (idx, field, value) => {
      const next = extracts.map((row, i) =>
        i === idx ? { ...row, [field]: value } : row,
      );
      onChange(next);
    },
    [extracts, onChange],
  );

  return (
    <div className="flex flex-col h-full gap-3 p-4">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Extract values from the response and save to environment variables.
          </p>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">
            After a successful response, JSON paths are resolved and saved to the
            selected environment.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1 shrink-0"
          onClick={handleAdd}
        >
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>

      {extracts.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-muted-foreground/50 text-xs">
          No extraction rules. Click "Add" to extract a value from the response.
        </div>
      ) : (
        <div className="space-y-1.5">
          {/* Table header */}
          <div className="flex items-center gap-2 px-2 text-[10px] text-muted-foreground uppercase tracking-wider">
            <span className="w-[140px] shrink-0">Variable Name</span>
            <span className="flex-1">JSON Path</span>
            <span className="w-[130px] shrink-0">Environment</span>
            <span className="w-7" />
          </div>

          {extracts.map((row, idx) => (
            <div key={idx} className="flex items-center gap-2 group">
              <Input
                value={row.name}
                onChange={(e) => handleChange(idx, "name", e.target.value)}
                placeholder="ACCESS_TOKEN"
                className="w-[140px] h-8 text-xs font-mono shrink-0"
              />
              <Input
                value={row.path}
                onChange={(e) => handleChange(idx, "path", e.target.value)}
                placeholder="$.data.token"
                className="flex-1 h-8 text-xs font-mono"
              />
              <select
                value={row.env}
                onChange={(e) => handleChange(idx, "env", e.target.value)}
                className="w-[130px] h-8 shrink-0 rounded-md border border-input bg-transparent px-2 text-xs"
              >
                <option value="">(select)</option>
                {environments.map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleRemove(idx)}
                className="h-7 w-7 shrink-0 flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
