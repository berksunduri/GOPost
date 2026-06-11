import React, { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { t } from "@/i18n";

function parseVars(text, envVars) {
  if (!text || !envVars) return [];
  const regex = /\{\{(\w+)\}\}/g;
  const segments = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    segments.push({
      text: match[0],
      name: match[1],
      resolved:
        envVars[match[1]] !== undefined ? String(envVars[match[1]]) : null,
    });
  }
  return segments;
}

export function BodyEditor({
  bodyMode = "raw",
  body = "",
  onModeChange,
  onBodyChange,
  envVars,
}) {
  const vars = useMemo(() => parseVars(body, envVars), [body, envVars]);

  return (
    <div className="space-y-2">
      <Select value={bodyMode} onValueChange={onModeChange}>
        <SelectTrigger className="w-[200px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="raw">{t("bodyModeRaw")}</SelectItem>
          <SelectItem value="form">{t("bodyModeForm")}</SelectItem>
          <SelectItem value="multipart">{t("bodyModeMultipart")}</SelectItem>
          <SelectItem value="binary">{t("bodyModeBinary")}</SelectItem>
        </SelectContent>
      </Select>
      <Textarea
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        placeholder='{"key": "value"}'
        className="min-h-[200px]"
      />

      {vars.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 text-[11px] font-mono rounded bg-muted/30 border border-border/50">
          <span className="text-[10px] text-muted-foreground/50 shrink-0 mr-1">
            Variables:
          </span>
          {vars.map((v, i) => (
            <Tooltip key={i} delayDuration={100}>
              <TooltipTrigger asChild>
                <span
                  className={`px-1.5 py-0.5 rounded text-[11px] cursor-default ${
                    v.resolved !== null
                      ? "bg-primary/10 text-primary/80"
                      : "bg-destructive/10 text-destructive/80 line-through"
                  }`}
                >
                  {v.text}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-xs">
                <div className="space-y-1">
                  <div>
                    <span className="text-muted-foreground">Variable: </span>
                    <code className="bg-muted px-1 rounded">{v.text}</code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Value: </span>
                    <span
                      className={
                        v.resolved !== null ? "text-green-400" : "text-red-400"
                      }
                    >
                      {v.resolved !== null ? v.resolved : "(not set)"}
                    </span>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
}
