import React from "react";
import { Input, Button } from "@/components/ui";
import { Send } from "lucide-react";
import { t } from "@/i18n";

export function URLBar({ url, onChange, onSend, loading, onSave, children }) {
  return (
    <div className="flex gap-2 items-center">
      <Input
        type="url"
        value={url}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://api.example.com/endpoint"
        className="flex-1 font-mono text-sm"
      />
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
  );
}
