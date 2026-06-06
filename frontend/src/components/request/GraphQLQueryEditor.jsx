import React from "react";
import { Textarea, Input } from "@/components/ui";

/**
 * GraphQLQueryEditor — a focused editor for GraphQL queries.
 * Includes operation name selector and monospace query textarea.
 */
export function GraphQLQueryEditor({
  query = "",
  operationName = "",
  onQueryChange,
  onOperationNameChange,
}) {
  return (
    <div className="space-y-2 flex flex-col h-full">
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-muted-foreground shrink-0">
          Operation
        </label>
        <Input
          value={operationName}
          onChange={(e) => onOperationNameChange?.(e.target.value)}
          placeholder="(optional, e.g. GetUsers)"
          className="h-7 text-xs font-mono flex-1 max-w-[240px]"
        />
      </div>
      <label className="text-xs font-medium text-muted-foreground">Query</label>
      <Textarea
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={`query GetUsers($limit: Int!) {\n  users(limit: $limit) {\n    id\n    name\n    email\n  }\n}`}
        className="flex-1 min-h-[200px] font-mono text-sm leading-relaxed"
        spellCheck={false}
      />
    </div>
  );
}
