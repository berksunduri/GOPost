import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@/components/ui";
import { t } from "@/i18n";

export function BodyEditor({ bodyMode = "raw", body = "", onModeChange, onBodyChange }) {
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
    </div>
  );
}
