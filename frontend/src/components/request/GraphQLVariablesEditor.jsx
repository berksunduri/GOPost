import React, { useState } from "react";
import { Textarea, Badge } from "@/components/ui";

/**
 * GraphQLVariablesEditor — a JSON editor for GraphQL variables.
 * Validates JSON on every keystroke and shows parsing errors inline.
 */
export function GraphQLVariablesEditor({ variables = "", onChange }) {
  const [parseError, setParseError] = useState(null);

  const handleChange = (e) => {
    const val = e.target.value;
    onChange(val);
    if (val.trim() === "" || val.trim() === "{}") {
      setParseError(null);
      return;
    }
    try {
      JSON.parse(val);
      setParseError(null);
    } catch (err) {
      setParseError(err.message);
    }
  };

  return (
    <div className="space-y-2 flex flex-col h-full">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-muted-foreground">
          Variables
        </label>
        {parseError && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
            Invalid JSON
          </Badge>
        )}
      </div>
      <Textarea
        value={variables}
        onChange={handleChange}
        placeholder='{"limit": 10}'
        className={`flex-1 min-h-[140px] font-mono text-sm leading-relaxed ${
          parseError ? "border-red-500 focus-visible:ring-red-500" : ""
        }`}
        spellCheck={false}
      />
      {parseError && (
        <p className="text-xs text-red-400">{parseError}</p>
      )}
    </div>
  );
}
