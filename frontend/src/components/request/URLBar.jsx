import React, { useMemo, useState } from "react";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { Send } from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Parse a URL string and return segments, distinguishing plain text
 * from {{VARIABLE}} tokens and their resolved values.
 */
function parseURLWithVars(url, envVars) {
  if (!url || !envVars) return { segments: [], resolved: url };

  const regex = /\{\{(\w+)\}\}/g;
  const segments = [];
  let lastIdx = 0;
  let match;

  while ((match = regex.exec(url)) !== null) {
    if (match.index > lastIdx) {
      segments.push({ text: url.slice(lastIdx, match.index), type: "text" });
    }
    const varName = match[1];
    const value = envVars[varName];
    segments.push({
      text: match[0],
      type: "variable",
      varName,
      resolved: value !== undefined ? String(value) : null,
    });
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < url.length) {
    segments.push({ text: url.slice(lastIdx), type: "text" });
  }

  const resolved = url.replace(regex, (_, name) =>
    envVars[name] !== undefined ? String(envVars[name]) : `{{${name}}}`,
  );

  return { segments, resolved };
}

export function URLBar({
  url,
  onChange,
  onSend,
  loading,
  onSave,
  onPaste,
  placeholder,
  extraButtons,
  children,
  envVars,
}) {
  const [focused, setFocused] = useState(false);

  const { segments } = useMemo(
    () => parseURLWithVars(url, envVars),
    [url, envVars],
  );

  const hasVars = segments.some((s) => s.type === "variable");

  const handleChange = (e) => {
    onChange(e.target.value.replace(/\n/g, ""));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading) onSend?.();
    }
    if (e.key === "Escape") {
      e.currentTarget.blur();
    }
  };

  return (
    <div className="flex flex-col gap-1 min-w-0 w-full">
      <div className="flex gap-2 items-start">
        <textarea
          rows={focused ? 4 : 1}
          value={url}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={onPaste}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder || "https://api.example.com/endpoint"}
          spellCheck={false}
          className={cn(
            "flex-1 min-w-0 resize-none rounded-md border border-input",
            "bg-transparent px-3 font-mono text-sm shadow-sm",
            "placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "transition-[min-height] duration-150 ease-out",
            focused
              ? "min-h-[96px] py-2 leading-5 break-all overflow-y-auto"
              : "h-9 min-h-9 py-2 leading-5 overflow-hidden whitespace-nowrap",
          )}
        />
        <div
          className="flex gap-2 items-center shrink-0 pt-0.5"
          onMouseDown={(e) => e.preventDefault()}
        >
          {extraButtons}
          {onSave && (
            <Button variant="outline" size="sm" onClick={onSave}>
              {t("saveRequest")}
            </Button>
          )}
          <Button onClick={onSend} disabled={loading} size="sm">
            <Send className="h-4 w-4" />
            {loading ? t("sending") : t("send")}
          </Button>
          {children}
        </div>
      </div>

      {/* Inline variable preview */}
      {hasVars && (
        <div className="flex items-center gap-1 px-3 py-1 text-[11px] font-mono text-muted-foreground/70 truncate">
          <span className="text-[10px] text-muted-foreground/50 shrink-0 select-none">
            Resolves to:
          </span>
          {segments.map((seg, i) =>
            seg.type === "variable" ? (
              <Tooltip key={i} delayDuration={100}>
                <TooltipTrigger asChild>
                  <span className="px-1 rounded bg-primary/10 text-primary/80 cursor-default truncate max-w-[200px]">
                    {seg.resolved !== null ? seg.resolved : seg.text}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs max-w-xs">
                  <div className="space-y-1">
                    <div>
                      <span className="text-muted-foreground">Variable: </span>
                      <code className="bg-muted px-1 rounded">{seg.text}</code>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Value: </span>
                      <span
                        className={
                          seg.resolved !== null
                            ? "text-green-400"
                            : "text-red-400"
                        }
                      >
                        {seg.resolved !== null ? seg.resolved : "(not set)"}
                      </span>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            ) : (
              <span key={i} className="opacity-50">
                {seg.text}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
