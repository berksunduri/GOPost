import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import { useApp } from "@/context/AppContext";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Separator,
} from "@/components/ui";
import { MethodSelector } from "./request/MethodSelector";
import { HeadersEditor } from "./request/HeadersEditor";
import { AuthEditor } from "./request/AuthEditor";
import { ParamsEditor } from "./request/ParamsEditor";
import { BodyEditor } from "./request/BodyEditor";
import { GraphQLQueryEditor } from "./request/GraphQLQueryEditor";
import { GraphQLVariablesEditor } from "./request/GraphQLVariablesEditor";
import { GraphQLSchemaExplorer } from "./request/GraphQLSchemaExplorer";
import { GQLResponseViewer } from "./request/GQLResponseViewer";
import { ResponseViewer } from "./request/ResponseViewer";
import { WebSocketEditor } from "./request/WebSocketEditor";
import { SSEEditor } from "./request/SSEEditor";
import { t } from "@/i18n";
import { api } from "@/api";
import { parseCurl } from "@/lib/parseCurl";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button, Input } from "@/components/ui";

function RequestEditor() {
  const {
    selectedCollection,
    selectedEnvironment,
    openTabs,
    activeTabId,
    updateTabData,
    refreshRequests,
    setSelectedRequest,
    openTab,
  } = useApp();

  const activeTab = openTabs.find((t) => t.id === activeTabId);
  const request = activeTab?.request;

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
  const [activeTabName, setActiveTabName] = useState("headers");
  const [auth, setAuth] = useState({
    token: "",
    username: "",
    password: "",
    apiKey: "",
    apiKeyValue: "",
    apiKeyIn: "header",
  });

  // GraphQL-specific state
  const [gqlQuery, setGQLQuery] = useState("");
  const [gqlVariables, setGQLVariables] = useState("");
  const [gqlOperationName, setGQLOperationName] = useState("");
  const [gqlSchemaURL, setGQLSchemaURL] = useState("");
  const [gqlSchemaTree, setGQLSchemaTree] = useState(null);

  const isGraphQL = method === "GRAPHQL";
  const isWS = method === "WS";
  const isSSE = method === "SSE";
  const isConnectionMode = isWS || isSSE;

  // Sync state when the active tab changes
  useEffect(() => {
    if (!request) {
      // Reset for empty state
      setName("");
      setMethod("GET");
      setURL("");
      setBody("");
      setHeaders([{ key: "", value: "" }]);
      setResponse(null);
      setAuthType("none");
      setActiveTabName("headers");
      setGQLQuery("");
      setGQLVariables("");
      setGQLOperationName("");
      setGQLSchemaURL("");
      setGQLSchemaTree(null);
      return;
    }
    setName(request.name || "");
    setMethod(request.method || "GET");
    setURL(request.url || "");
    setBody(request.body || "");
    setAuthType(request.auth?.type || "none");
    setAuth({
      token: request.auth?.token || "",
      username: request.auth?.username || "",
      password: request.auth?.password || "",
      apiKey: request.auth?.api_key || "",
      apiKeyValue: request.auth?.api_key_value || "",
      apiKeyIn: request.auth?.api_key_in || "header",
    });
    const hydrated = Object.entries(request.headers || {}).map(([k, v]) => ({
      key: k,
      value: v,
    }));
    setHeaders(hydrated.length > 0 ? hydrated : [{ key: "", value: "" }]);
    // Use saved response if tab has one
    setResponse(activeTab?.response || null);

    // GraphQL fields
    const gql = request.graphql;
    setGQLQuery(gql?.query || "");
    setGQLVariables(gql?.variables || "");
    setGQLOperationName(gql?.operation_name || "");
    setGQLSchemaURL(gql?.schema_url || "");
    setGQLSchemaTree(null); // Will re-fetch if needed

    // Set active tab based on request type
    if (request.method === "GRAPHQL") {
      setActiveTabName("gql-query");
    } else if (request.method === "WS" || request.method === "SSE") {
      setActiveTabName("connection");
    } else {
      setActiveTabName("headers");
    }
  }, [activeTabId]);

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
    if (request?.id && !request.id.startsWith("new-")) {
      let updated;
      if (isGraphQL) {
        updated = await api.UpdateRequestWithGraphQL(
          request.id,
          name || request.name,
          "GRAPHQL",
          u,
          h,
          b,
          "",
          gqlQuery,
          gqlVariables,
          gqlOperationName,
          gqlSchemaURL,
        );
      } else if (isConnectionMode) {
        // WS/SSE: save URL and headers, body is unused
        updated = await api.UpdateRequest(
          request.id,
          name || request.name,
          method,
          u,
          h,
          "",
          "",
        );
      } else {
        updated = await api.UpdateRequest(
          request.id,
          name || request.name,
          method,
          u,
          h,
          b,
          "",
        );
      }
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
      updateTabData(request.id, { request: updated, isDirty: false });
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
    if (isGraphQL) {
      await api.SetRequestGraphQL(
        created.id,
        gqlQuery,
        gqlVariables,
        gqlOperationName,
        gqlSchemaURL,
      );
      created.graphql = {
        query: gqlQuery,
        variables: gqlVariables,
        operation_name: gqlOperationName,
        schema_url: gqlSchemaURL,
      };
      created.method = "GRAPHQL";
    }
    if (request?.id.startsWith("new-")) {
      updateTabData(request.id, {
        id: created.id,
        request: created,
        isDirty: false,
      });
      openTab(created);
    }
    setSelectedRequest(created);
    return created;
  }, [
    request,
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
    updateTabData,
    openTab,
    isGraphQL,
    isConnectionMode,
    gqlQuery,
    gqlVariables,
    gqlOperationName,
    gqlSchemaURL,
  ]);

  const handleSend = useCallback(async () => {
    // WS/SSE use Connect/Disconnect buttons in their editors
    if (isConnectionMode) return;
    if (!url.trim()) {
      toast.error("Please enter a URL");
      return;
    }
    setLoading(true);
    try {
      const req = await upsertRequest();
      const result = isGraphQL
        ? await api.ExecuteGraphQLRequest(req.id)
        : await api.ExecuteRequest(req.id);
      setResponse(result);
      if (isGraphQL) {
        setActiveTabName("gql-response");
      } else {
        setActiveTabName("response");
      }
      updateTabData(activeTabId, { response: result });
      const statusCode = result.code || result.status;
      const timeMs = result.time || "";
      toast.success(`${statusCode} ${timeMs ? `in ${timeMs}ms` : ""}`);
      await refreshRequests();
    } catch (e) {
      toast.error(e.message || "Request failed");
    } finally {
      setLoading(false);
    }
  }, [
    url,
    upsertRequest,
    refreshRequests,
    activeTabId,
    updateTabData,
    isGraphQL,
    isConnectionMode,
  ]);

  const handleSave = useCallback(async () => {
    try {
      await upsertRequest();
      await refreshRequests();
      toast.success("Request saved");
    } catch (e) {
      toast.error(e.message);
    }
  }, [upsertRequest, refreshRequests]);

  // Handle schema field insertion from explorer
  const handleInsertField = useCallback((fieldName) => {
    setGQLQuery((prev) => {
      // Insert at cursor position if we had a ref, or just append
      return prev ? `${prev}\n  ${fieldName}` : `  ${fieldName}`;
    });
  }, []);

  // Curl paste detection on URL input
  const handleURLPaste = useCallback((e) => {
    const text = e.clipboardData?.getData("text") || "";
    if (/^curl\s/i.test(text.trim())) {
      e.preventDefault();
      try {
        const parsed = parseCurl(text.trim());
        setMethod(parsed.method);
        setURL(parsed.url);
        setBody(parsed.body);
        setAuthType(parsed.auth.type);
        if (parsed.auth.token)
          setAuth((a) => ({ ...a, token: parsed.auth.token }));
        if (parsed.auth.username)
          setAuth((a) => ({ ...a, username: parsed.auth.username }));
        if (parsed.auth.password)
          setAuth((a) => ({ ...a, password: parsed.auth.password }));
        const hdrArr = Object.entries(parsed.headers).map(([k, v]) => ({
          key: k,
          value: v,
        }));
        if (hdrArr.length > 0) setHeaders(hdrArr);
        toast.success(`Parsed curl → ${parsed.method} ${parsed.url}`);
      } catch (err) {
        toast.error("Failed to parse curl command");
      }
    }
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "Enter") {
        e.preventDefault();
        if (!isConnectionMode) handleSend();
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSend, handleSave]);

  // --- GraphQL Schema Explorer panel ---
  const [showSchemaExplorer, setShowSchemaExplorer] = useState(false);

  // Connection persistence: store connID in tab data so it survives tab switches
  const handleWSConnectionChange = useCallback(
    (info) => {
      updateTabData(activeTabId, { wsConnID: info ? info.connID : null });
    },
    [activeTabId, updateTabData],
  );

  const handleSSEConnectionChange = useCallback(
    (info) => {
      updateTabData(activeTabId, { sseConnID: info ? info.connID : null });
    },
    [activeTabId, updateTabData],
  );

  // Disconnect WS/SSE when their tab is closed
  const prevOpenTabsRef = useRef(openTabs);
  useEffect(() => {
    const prev = prevOpenTabsRef.current;
    prevOpenTabsRef.current = openTabs;
    const currentIDs = new Set(openTabs.map((t) => t.id));
    // Disconnect any tabs that were removed
    prev.forEach((tab) => {
      if (!currentIDs.has(tab.id)) {
        if (tab.wsConnID) api.DisconnectWebSocket(tab.wsConnID).catch(() => {});
        if (tab.sseConnID) api.DisconnectSSE(tab.sseConnID).catch(() => {});
      }
    });
  }, [openTabs]);

  if (!activeTab) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 p-4">
        <Send className="h-10 w-10 opacity-20" />
        <p className="text-sm">
          Open a request or click <strong>+ New Tab</strong> to start
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-w-0 overflow-hidden">
      {/* Request bar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <MethodSelector value={method} onChange={setMethod} />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("requestName")}
          className="flex-1 min-w-[100px] max-w-[200px] h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
        />
        <div className="flex-1 flex items-center gap-2 min-w-[200px]">
          <Input
            type="url"
            value={url}
            onChange={(e) => setURL(e.target.value)}
            onPaste={handleURLPaste}
            placeholder={
              isGraphQL
                ? "https://api.example.com/graphql"
                : isWS
                  ? "wss://echo.example.com/ws"
                  : isSSE
                    ? "https://api.example.com/events"
                    : "https://api.example.com/endpoint — paste a curl command here"
            }
            className="flex-1 font-mono text-sm"
          />
          {isGraphQL && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setShowSchemaExplorer((v) => !v)}
            >
              {showSchemaExplorer ? "Hide Schema" : "Schema"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleSave}>
            {t("saveRequest")}
          </Button>
          {!isConnectionMode && (
            <Button onClick={handleSend} disabled={loading} size="sm">
              <Send className="h-4 w-4" />
              {loading ? t("sending") : t("send")}
            </Button>
          )}
        </div>
      </div>

      <Separator />

      {/* Main area: tabs + optional schema explorer */}
      <div className="flex-1 flex min-h-0">
        {/* Tabs area */}
        <Tabs
          value={activeTabName}
          onValueChange={setActiveTabName}
          className="flex-1 flex flex-col min-h-0 min-w-0"
        >
          <TabsList className="mx-4 mt-3 w-fit">
            {isConnectionMode ? (
              <>
                <TabsTrigger value="connection" className="text-xs">
                  Connection
                </TabsTrigger>
                <TabsTrigger value="headers" className="text-xs">
                  {t("headers")}
                </TabsTrigger>
              </>
            ) : isGraphQL ? (
              <>
                <TabsTrigger value="gql-query" className="text-xs">
                  Query
                </TabsTrigger>
                <TabsTrigger value="gql-variables" className="text-xs">
                  Variables
                </TabsTrigger>
                <TabsTrigger value="headers" className="text-xs">
                  {t("headers")}
                </TabsTrigger>
                <TabsTrigger value="auth" className="text-xs">
                  {t("auth")}
                </TabsTrigger>
                <TabsTrigger value="gql-response" className="text-xs">
                  {t("response")}
                </TabsTrigger>
              </>
            ) : (
              <>
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
              </>
            )}
          </TabsList>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {isConnectionMode ? (
              <>
                <TabsContent value="connection" className="h-full">
                  {isWS ? (
                    <WebSocketEditor
                      url={url}
                      headers={headers}
                      requestId={request?.id}
                      onURLChange={setURL}
                      savedConnID={activeTab?.wsConnID}
                      onConnectionChange={handleWSConnectionChange}
                    />
                  ) : (
                    <SSEEditor
                      url={url}
                      headers={headers}
                      requestId={request?.id}
                      onURLChange={setURL}
                      savedConnID={activeTab?.sseConnID}
                      onConnectionChange={handleSSEConnectionChange}
                    />
                  )}
                </TabsContent>
                <TabsContent value="headers">
                  <HeadersEditor headers={headers} onChange={setHeaders} />
                </TabsContent>
              </>
            ) : isGraphQL ? (
              <>
                <TabsContent value="gql-query" className="h-full">
                  <GraphQLQueryEditor
                    query={gqlQuery}
                    operationName={gqlOperationName}
                    onQueryChange={setGQLQuery}
                    onOperationNameChange={setGQLOperationName}
                  />
                </TabsContent>
                <TabsContent value="gql-variables" className="h-full">
                  <GraphQLVariablesEditor
                    variables={gqlVariables}
                    onChange={setGQLVariables}
                  />
                </TabsContent>
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
                <TabsContent value="gql-response" className="h-full">
                  <GQLResponseViewer response={response} />
                </TabsContent>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </Tabs>

        {/* Schema Explorer sidebar (GraphQL only) */}
        {isGraphQL && showSchemaExplorer && (
          <div className="w-[280px] shrink-0 border-l border-border bg-background">
            <GraphQLSchemaExplorer
              schemaURL={gqlSchemaURL || url}
              onSchemaURLChange={setGQLSchemaURL}
              onInsertField={handleInsertField}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default RequestEditor;
