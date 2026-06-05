import React from "react";
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";
import { t } from "@/i18n";

export function AuthEditor({ authType = "none", auth = {}, onTypeChange, onAuthChange }) {
  const update = (field, value) => onAuthChange({ ...auth, [field]: value });

  return (
    <div className="space-y-3">
      <Select value={authType} onValueChange={onTypeChange}>
        <SelectTrigger className="w-[200px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t("noAuth")}</SelectItem>
          <SelectItem value="bearer">{t("bearerToken")}</SelectItem>
          <SelectItem value="basic">{t("basicAuth")}</SelectItem>
          <SelectItem value="apikey">{t("apiKey")}</SelectItem>
        </SelectContent>
      </Select>

      {authType === "bearer" && (
        <Input
          value={auth.token || ""}
          onChange={(e) => update("token", e.target.value)}
          placeholder="Token"
          type="password"
        />
      )}
      {authType === "basic" && (
        <>
          <Input
            value={auth.username || ""}
            onChange={(e) => update("username", e.target.value)}
            placeholder="Username"
          />
          <Input
            value={auth.password || ""}
            onChange={(e) => update("password", e.target.value)}
            placeholder="Password"
            type="password"
          />
        </>
      )}
      {authType === "apikey" && (
        <>
          <Input
            value={auth.apiKey || ""}
            onChange={(e) => update("apiKey", e.target.value)}
            placeholder="Key name"
          />
          <Input
            value={auth.apiKeyValue || ""}
            onChange={(e) => update("apiKeyValue", e.target.value)}
            placeholder="Key value"
            type="password"
          />
          <Select value={auth.apiKeyIn || "header"} onValueChange={(v) => update("apiKeyIn", v)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="header">Header</SelectItem>
              <SelectItem value="query">Query</SelectItem>
            </SelectContent>
          </Select>
        </>
      )}
    </div>
  );
}
