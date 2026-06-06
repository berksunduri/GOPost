import React, { useState, useCallback } from "react";
import { Button, Input, Separator, Badge, ScrollArea } from "@/components/ui";
import { Database, RefreshCw, ChevronRight, ChevronDown, Search } from "lucide-react";
import { api } from "@/api";
import { toast } from "sonner";

/**
 * GraphQLSchemaExplorer — introspects a GraphQL endpoint and displays
 * the schema in a browseable tree of types, queries, mutations, and fields.
 *
 * Props:
 *  - schemaURL: the GraphQL endpoint URL
 *  - onSchemaURLChange: setter for the endpoint URL
 *  - onInsertField: callback when user clicks a field (inserts into query)
 */
export function GraphQLSchemaExplorer({ schemaURL, onSchemaURLChange, onInsertField }) {
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedTypes, setExpandedTypes] = useState({});
  const [search, setSearch] = useState("");

  const handleIntrospect = useCallback(async () => {
    if (!schemaURL?.trim()) {
      toast.error("Enter a GraphQL endpoint URL first");
      return;
    }
    setLoading(true);
    try {
      const result = await api.IntrospectGraphQLSchema(schemaURL.trim());
      setSchema(result);
      toast.success("Schema loaded");
    } catch (e) {
      toast.error(e.message || "Introspection failed");
    } finally {
      setLoading(false);
    }
  }, [schemaURL]);

  const toggleType = (name) => {
    setExpandedTypes((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  // Extract types from the introspection result
  const types = schema?.data?.__schema?.types || [];
  const queryTypeName = schema?.data?.__schema?.queryType?.name;
  const mutationTypeName = schema?.data?.__schema?.mutationType?.name;

  const filteredTypes = search
    ? types.filter(
        (t) =>
          t.name &&
          t.name.toLowerCase().includes(search.toLowerCase()),
      )
    : types;

  // Sort: root types first, then alphabetical
  const rootNames = new Set([queryTypeName, mutationTypeName, "Subscription"].filter(Boolean));
  const sortedTypes = [...filteredTypes].sort((a, b) => {
    const aRoot = rootNames.has(a.name) ? 0 : 1;
    const bRoot = rootNames.has(b.name) ? 0 : 1;
    if (aRoot !== bRoot) return aRoot - bRoot;
    return (a.name || "").localeCompare(b.name || "");
  });

  const typeKindBadge = (kind) => {
    const colors = {
      OBJECT: "bg-blue-500/10 text-blue-400 border-blue-500/30",
      INPUT_OBJECT: "bg-purple-500/10 text-purple-400 border-purple-500/30",
      SCALAR: "bg-green-500/10 text-green-400 border-green-500/30",
      ENUM: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
      INTERFACE: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
      UNION: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    };
    return colors[kind] || "bg-muted text-muted-foreground";
  };

  const renderFieldType = (type) => {
    if (!type) return <span className="text-muted-foreground">?</span>;
    if (type.kind === "NON_NULL") {
      return (
        <span>
          {renderFieldType(type.ofType)}
          <span className="text-red-400">!</span>
        </span>
      );
    }
    if (type.kind === "LIST") {
      return (
        <span>
          <span className="text-muted-foreground">[</span>
          {renderFieldType(type.ofType)}
          <span className="text-muted-foreground">]</span>
        </span>
      );
    }
    return (
      <span
        className="text-blue-400 cursor-pointer hover:underline"
        onClick={(e) => {
          e.stopPropagation();
          onInsertField?.(type.name);
        }}
        title="Click to insert type name"
      >
        {type.name || type.kind}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Introspection bar */}
      <div className="px-3 py-2 space-y-2">
        <div className="flex items-center gap-2">
          <Input
            value={schemaURL || ""}
            onChange={(e) => onSchemaURLChange?.(e.target.value)}
            placeholder="https://api.example.com/graphql"
            className="h-8 text-xs font-mono"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            onClick={handleIntrospect}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <Separator />

      {/* Schema tree */}
      <ScrollArea className="flex-1">
        {!schema && (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
            <Database className="h-6 w-6 opacity-30" />
            <p className="text-xs text-center px-4">
              Introspect a GraphQL endpoint to browse its schema
            </p>
          </div>
        )}

        {schema && (
          <div className="py-1">
            {/* Search */}
            <div className="px-3 pb-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter types..."
                  className="h-7 pl-7 text-xs"
                />
              </div>
            </div>

            {/* Schema stats */}
            <div className="px-3 pb-2 flex gap-2">
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {types.length} types
              </Badge>
              {queryTypeName && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  query: {queryTypeName}
                </Badge>
              )}
            </div>

            <Separator className="mb-1" />

            {sortedTypes.map((type) => {
              if (!type.name || type.name.startsWith("__")) return null;
              const isExpanded = expandedTypes[type.name];
              const hasFields =
                (type.fields && type.fields.length > 0) ||
                (type.inputFields && type.inputFields.length > 0) ||
                (type.enumValues && type.enumValues.length > 0);

              return (
                <div key={type.name}>
                  <button
                    className="w-full flex items-center gap-1.5 px-3 py-1 hover:bg-accent/50 text-left text-xs"
                    onClick={() => hasFields && toggleType(type.name)}
                  >
                    {hasFields ? (
                      isExpanded ? (
                        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )
                    ) : (
                      <span className="w-3" />
                    )}
                    <span className="font-mono font-medium truncate">{type.name}</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1 py-0 ml-auto shrink-0 ${typeKindBadge(type.kind)}`}
                    >
                      {type.kind?.replace("_", " ")}
                    </Badge>
                  </button>

                  {isExpanded && hasFields && (
                    <div className="pl-7 pr-2 py-0.5 space-y-0.5 border-l border-border ml-3">
                      {type.description && (
                        <p className="text-[10px] text-muted-foreground italic px-2 py-0.5">
                          {type.description}
                        </p>
                      )}

                      {/* Object / Interface fields */}
                      {(type.fields || []).map((field) => (
                        <button
                          key={field.name}
                          className="w-full flex items-center gap-1.5 py-0.5 px-2 rounded hover:bg-accent/50 text-xs text-left group"
                          onClick={() => onInsertField?.(field.name)}
                          title="Click to insert field name"
                        >
                          <span className="font-mono text-foreground group-hover:text-blue-400">
                            {field.name}
                          </span>
                          <span className="text-muted-foreground shrink-0">
                            {renderFieldType(field.type)}
                          </span>
                        </button>
                      ))}

                      {/* Input fields */}
                      {(type.inputFields || []).map((field) => (
                        <div
                          key={field.name}
                          className="flex items-center gap-1.5 py-0.5 px-2 text-xs"
                        >
                          <span className="font-mono text-foreground">{field.name}</span>
                          <span className="text-muted-foreground">:</span>
                          {renderFieldType(field.type)}
                        </div>
                      ))}

                      {/* Enum values */}
                      {(type.enumValues || []).map((ev) => (
                        <div
                          key={ev.name}
                          className="flex items-center gap-1.5 py-0.5 px-2 text-xs"
                        >
                          <span className="font-mono text-yellow-400">{ev.name}</span>
                          {ev.isDeprecated && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-red-500/30 text-red-400">
                              deprecated
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
