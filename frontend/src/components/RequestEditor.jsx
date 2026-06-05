import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useApp } from "@/context/AppContext";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Separator,
} from "@/components/ui";
import { MethodSelector } from "./request/MethodSelector";
import { URLBar } from "./request/URLBar";
import { HeadersEditor } from "./request/HeadersEditor";
import { AuthEditor } from "./request/AuthEditor";
import { ParamsEditor } from "./request/ParamsEditor";
import { BodyEditor } from "./request/BodyEditor";
import { ResponseViewer } from "./request/ResponseViewer";
import { t } from "@/i18n";
import { api } from "@/api";
import { toast } from "sonner";

function RequestEditor() {
  const {
    selectedCollection,
    selectedRequest,
    selectedEnvironment,
    refreshRequests,
    setSelectedRequest,
  } = useApp();

  const [method, setMethod] = useState("GET");
  const [name, setName] = useState("");
  const [url, setURL] = useState("");
  const [headers, setHeaders] = useState([{ key: "", value: "" }]);
  const [body, setBody] = useState("");
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState([{ key: "", value: "", enabled: true }]);
  const [bodyMode, setBodyMode] = useState("raw");
  const [authType, setAuthType] = useState("none");
  const [activeTab, setActiveTab] = useState("headers");
  const [auth, setAuth] = useState({
    token: "",
    username: "",
    password: "",
    apiKey: "",
    apiKeyValue: "",
    apiKeyIn: "header",
  });

  useEffect(() => {
    if (!selectedRequest) return;
    setName(selectedRequest.name || "");
    setMethod(selectedRequest.method || "GET");
    setURL(selectedRequest.url || "");
    setBody(selectedRequest.body || "");
    setAuthType(selectedRequest.auth?.type || "none");
    setAuth({
      token: selectedRequest.auth?.token || "",
      username: selectedRequest.auth?.username || "",
      password: selectedRequest.auth?.password || "",
      apiKey: selectedRequest.auth?.api_key || "",
      apiKeyValue: selectedRequest.auth?.api_key_value || "",
      apiKeyIn: selectedRequest.auth?.api_key_in || "header",
    });
    const hydrated = Object.entries(selectedRequest.headers || {}).map(
      ([k, v]) => ({ key: k, value: v }),
    );
    setHeaders(hydrated.length > 0 ? hydrated : [{ key: "", value: "" }]);
    setResponse(null);
  }, [selectedRequest]);

  const envVars = selectedEnvironment?.variables || {};

  const applyEnv = useCallback(
    (val) => {
      let out = val;
      Object.keys(envVars).forEach((k) => {
        out = out.replace(
          new RegExp(`\\{\\{${k}\\}\\}`, "g"),
          String(envVars[k]),
        );
      });
      return out;
    },
    [envVars],
  );

  const mapHeaders = useCallback(() => {
    const m = {};
    headers.forEach((h) => {
      if (h.key.trim()) m[applyEnv(h.key.trim())] = applyEnv(h.value.trim());
    });
    return m;
  }, [headers, applyEnv]);

  const effectiveURL = useMemo(() => {
    const base = applyEnv(url);
    const active = params.filter((p) => p.enabled && p.key.trim());
    if (active.length === 0) return base;
    const sep = base.includes("?") ? "&" : "?";
    const qs = active
      .map(
        (p) =>
          `${encodeURIComponent(applyEnv(p.key.trim()))}=${encodeURIComponent(applyEnv(p.value.trim()))}`,
      )
      .join("&");
    return `${base}${sep}${qs}`;
  }, [params, url, applyEnv]);

  const upsertRequest = useCallback(async () => {
    const h = mapHeaders();
    const u = effectiveURL;
    const b = applyEnv(body);
    if (selectedRequest?.id) {
      const updated = await api.UpdateRequest(
        selectedRequest.id,
        name || selectedRequest.name,
        method,
        u,
        h,
        b,
        "",
      );
      await api.SetRequestAuth(
        updated.id,
        authType,
        auth.token,
        auth.username,
        auth.password,
        auth.apiKey,
        auth.apiKeyValue,
        auth.apiKeyIn,
      );
      return updated;
    }
    if (!selectedCollection?.id) throw new Error("No collection selected");
    const created = await api.CreateRequest(
      selectedCollection.id,
      name || "New Request",
      method,
      u,
      h,
      b,
      "",
    );
    await api.SetRequestAuth(
      created.id,
      authType,
      auth.token,
      auth.username,
      auth.password,
      auth.apiKey,
      auth.apiKeyValue,
      auth.apiKeyIn,
    );
    setSelectedRequest(created);
    return created;
  }, [
    selectedRequest,
    selectedCollection,
    name,
    method,
    effectiveURL,
    mapHeaders,
    body,
    authType,
    auth,
    setSelectedRequest,
    applyEnv,
  ]);

  const handleSend = useCallback(async () => {
    if (!url.trim()) {
      toast.error("Please enter a URL");
      return;
    }
    setLoading(true);
    try {
      const req = await upsertRequest();
      const result = await api.ExecuteRequest(req.id);
      setResponse(result);
      setActiveTab("response");
      toast.success(`${result.code || result.status} in ${result.time}ms`);
      await refreshRequests();
    } catch (e) {
      toast.error(e.message || "Request failed");
    } finally {
      setLoading(false);
    }
  }, [url, upsertRequest, refreshRequests]);

  const handleSave = useCallback(async () => {
    try {
      await upsertRequest();
      await refreshRequests();
      toast.success("Request saved");
    } catch (e) {
      toast.error(e.message);
    }
  }, [upsertRequest, refreshRequests]);

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSend, handleSave]);

  return (
    <div className="flex flex-col h-full min-w-0 overflow-hidden">
      {/* Request bar */}
      <div className="flex flex-wrap items-center gap-3 p-4">
        <MethodSelector value={method} onChange={setMethod} />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("requestName")}
          className="flex-1 min-w-[100px] max-w-[200px] h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
        />
        <URLBar
          url={url}
          onChange={setURL}
          onSend={handleSend}
          onSave={handleSave}
          loading={loading}
        />
      </div>

      <Separator />

      {/* Tabs area */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col min-h-0"
      >
        <TabsList className="mx-4 mt-3 w-fit">
          <TabsTrigger value="headers" className="text-xs">
            {t("headers")}
          </TabsTrigger>
          <TabsTrigger value="auth" className="text-xs">
            {t("auth")}
          </TabsTrigger>
          <TabsTrigger value="params" className="text-xs">
            {t("urlParams")}
          </TabsTrigger>
          <TabsTrigger value="body" className="text-xs">
            {t("body")}
          </TabsTrigger>
          <TabsTrigger value="response" className="text-xs">
            {t("response")}
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <TabsContent value="headers">
            <HeadersEditor headers={headers} onChange={setHeaders} />
          </TabsContent>
          <TabsContent value="auth">
            <AuthEditor
              authType={authType}
              auth={auth}
              onTypeChange={setAuthType}
              onAuthChange={setAuth}
            />
          </TabsContent>
          <TabsContent value="params">
            <ParamsEditor params={params} onChange={setParams} />
          </TabsContent>
          <TabsContent value="body">
            <BodyEditor
              bodyMode={bodyMode}
              body={body}
              onModeChange={setBodyMode}
              onBodyChange={setBody}
            />
          </TabsContent>
          <TabsContent value="response" className="h-full">
            <ResponseViewer response={response} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export default RequestEditor;
