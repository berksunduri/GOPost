import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import { useCollections } from "@/context/CollectionsContext";
import { useEnvironments } from "@/context/EnvironmentsContext";
import { useRequests } from "@/context/RequestsContext";
import { useTabs } from "@/context/TabsContext";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Separator,
} from "@/components/ui";
import { URLBar } from "./request/URLBar";
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
import { ScriptEditor } from "./request/ScriptEditor";
import { ExtractEditor } from "./request/ExtractEditor";
import { t } from "@/i18n";
import { api } from "@/api";
import { parseCurl } from "@/lib/parseCurl";
import { resolveJSONPath } from "@/lib/jsonpath";
import { toast } from "sonner";
import { Send, Server } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { CodeGenMenu } from "@/components/CodeGenMenu";
import { useMockServer } from "@/context/MockServerContext";

function RequestEditor() {
  const { selectedCollection } = useCollections();
  const { selectedEnvironment } = useEnvironments();
  const { refreshRequests, setSelectedRequest } = useRequests();
  const {
    openTabs,
    activeTabId,
    updateTabData,
    openTab,
    pushResponse,
    markDirty,
    markSaved,
  } = useTabs();
  const {
    status: mockStatus,
    setMock,
    removeMock,
    mockConfigs,
  } = useMockServer();

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

  // Script state
  const [preRequestScript, setPreRequestScript] = useState("");
  const [testScript, setTestScript] = useState("");

  // Response extraction rules
  const [extracts, setExtracts] = useState([]);

  const isGraphQL = method === "GRAPHQL";
  const isWS = method === "WS";
  const isSSE = method === "SSE";
  const isConnectionMode = isWS || isSSE;

  // Send-sequence ref
  const sendSeqRef = useRef(0);

  // Mock config
  const [showMockConfig, setShowMockConfig] = useState(false);
  const [mockStatusCode, setMockStatusCode] = useState(200);
  const [mockBody, setMockBody] = useState("{}");
  const [mockLatency, setMockLatency] = useState(0);

  // Derive mock state from global config
  const currentMock = request?.id ? mockConfigs[request.id] : null;
  const isMocked = currentMock?.enabled || false;

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

    // Script fields
    setPreRequestScript(request.pre_request_script || "");
    setTestScript(request.test_script || "");

    // Mock state
    if (currentMock) {
      setShowMockConfig(true);
      setMockStatusCode(currentMock.status_code || 200);
      setMockBody(currentMock.body || "{}");
      setMockLatency(currentMock.latency_ms || 0);
    } else {
      setShowMockConfig(false);
    }
  }, [activeTabId]);

  // Only set initial tab when activeTabId actually changes (save doesn't reset it)
  const prevActiveTabId = useRef(activeTabId);
  useEffect(() => {
    if (prevActiveTabId.current === activeTabId) return;
    prevActiveTabId.current = activeTabId;
    if (request?.method === "GRAPHQL") setActiveTabName("gql-query");
    else if (request?.method === "WS" || request?.method === "SSE")
      setActiveTabName("connection");
    else setActiveTabName("headers");
  }, [activeTabId]);

  // Mark tab as dirty when user edits (no auto-save)
  useEffect(() => {
    if (!request?.id || request.id.startsWith("new-")) return;
    markDirty(request.id);
  }, [
    name,
    method,
    url,
    body,
    JSON.stringify(headers),
    preRequestScript,
    testScript,
  ]);

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
    // Build headers from key/value pairs without env substitution.
    // Substitution happens server-side in ExecuteRequest.
    const h = {};
    headers.forEach((row) => {
      if (row.key.trim()) h[row.key.trim()] = row.value.trim();
    });
    const u = url;
    const b = body;
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
      // Save scripts
      await api.SetRequestScripts(updated.id, preRequestScript, testScript);
      updateTabData(request.id, { request: updated });
      markSaved(request.id);
      return updated;
    }
    if (!selectedCollection?.id) {
      throw new Error(t("saveRequiresCollection"));
    }

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
    // Save scripts for new request
    await api.SetRequestScripts(created.id, preRequestScript, testScript);
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
      });
      markSaved(request.id);
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
    refreshRequests,
    isGraphQL,
    isConnectionMode,
    gqlQuery,
    gqlVariables,
    gqlOperationName,
    gqlSchemaURL,
    preRequestScript,
    testScript,
  ]);

  const handleSend = useCallback(async () => {
    // WS/SSE use Connect/Disconnect buttons in their editors
    if (isConnectionMode) return;
    if (!url.trim()) {
      toast.error("Please enter a URL");
      return;
    }
    sendSeqRef.current += 1;
    const seq = sendSeqRef.current;
    setLoading(true);
    try {
      const unsaved = !request?.id || String(request.id).startsWith("new-");
      let result;
      if (unsaved) {
        const h = {};
        headers.forEach((row) => {
          if (row.key.trim()) h[row.key.trim()] = row.value.trim();
        });
        const payload = {
          name: name || "Untitled",
          method,
          url,
          headers: h,
          body,
          auth: {
            type: authType,
            token: auth.token,
            username: auth.username,
            password: auth.password,
            api_key: auth.apiKey,
            api_key_value: auth.apiKeyValue,
            api_key_in: auth.apiKeyIn,
          },
          preRequestScript,
          testScript,
          envVars,
        };
        if (isGraphQL) {
          payload.graphql = {
            query: gqlQuery,
            variables: gqlVariables,
            operation_name: gqlOperationName,
            schema_url: gqlSchemaURL,
          };
          result = await api.ExecuteGraphQLRequestRaw(payload);
        } else {
          result = await api.ExecuteRequestRaw(payload);
        }
      } else {
        const req = await upsertRequest();
        if (seq !== sendSeqRef.current) return;
        result = isGraphQL
          ? await api.ExecuteGraphQLRequest(req.id)
          : await api.ExecuteRequest(req.id, envVars);
      }
      if (seq !== sendSeqRef.current) return;
      setResponse(result);

      // Auto-switch to appropriate tab based on script results
      if (result?.script_failed && result?.script_phase === "pre-request") {
        setActiveTabName("pre-request");
        toast.error(result.error || "Pre-request script failed");
      } else if (result?.test_result?.passed === false) {
        setActiveTabName("tests");
        toast.error("Test script failed — see Tests tab");
      } else if (isGraphQL) {
        setActiveTabName("gql-response");
      } else {
        setActiveTabName("response");
      }
      updateTabData(activeTabId, { response: result });
      pushResponse(activeTabId, result);
      const statusCode = result.code || result.status;
      const timeMs = result.time || "";
      toast.success(`${statusCode} ${timeMs ? `in ${timeMs}ms` : ""}`);
      if (!unsaved) {
        await refreshRequests();
      }

      // Run response extractions
      const active = extracts.filter((e) => e.name && e.path && e.env);
      if (active.length > 0 && result?.body) {
        try {
          const parsed = JSON.parse(result.body);
          for (const ext of active) {
            const value = resolveJSONPath(parsed, ext.path);
            if (value !== undefined) {
              try {
                const envs = await api.GetEnvironments();
                const env = envs?.find((e) => e.id === ext.env);
                if (env) {
                  const vars = {
                    ...(env.variables || {}),
                    [ext.name]: value,
                  };
                  await api.UpdateEnvironment(ext.env, env.name, vars);
                }
              } catch {
                // Environment might not exist — skip silently
              }
            }
          }
          if (active.length > 0) {
            toast.success(
              `Extracted ${active.length} variable${active.length > 1 ? "s" : ""}`,
            );
          }
        } catch {
          // Body wasn't JSON — skip extractions
        }
      }
    } catch (e) {
      if (seq !== sendSeqRef.current) return;
      toast.error(e.message || "Request failed");
    } finally {
      if (seq === sendSeqRef.current) setLoading(false);
    }
  }, [
    url,
    upsertRequest,
    refreshRequests,
    activeTabId,
    updateTabData,
    isGraphQL,
    isConnectionMode,
    extracts,
    envVars,
    request,
    name,
    method,
    headers,
    body,
    authType,
    auth,
    preRequestScript,
    testScript,
    gqlQuery,
    gqlVariables,
    gqlOperationName,
    gqlSchemaURL,
    pushResponse,
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

  // Mock toggle handler
  const handleMockToggle = useCallback(async () => {
    if (!request?.id) return;
    if (isMocked) {
      await removeMock(request.id);
      setShowMockConfig(false);
    } else {
      setShowMockConfig(true);
      // Pre-populate from existing mock or default
      if (currentMock) {
        setMockStatusCode(currentMock.status_code || 200);
        setMockBody(currentMock.body || "{}");
        setMockLatency(currentMock.latency_ms || 0);
      }
    }
  }, [request?.id, isMocked, currentMock, removeMock]);

  const handleMockSave = useCallback(async () => {
    if (!request?.id) return;
    const u = (() => {
      try {
        return new URL(url);
      } catch {
        return { pathname: "/" };
      }
    })();
    await setMock(request.id, method, u.pathname, {
      statusCode: mockStatusCode,
      body: mockBody,
      latencyMs: mockLatency,
      enabled: true,
    });
  }, [
    request?.id,
    method,
    url,
    mockStatusCode,
    mockBody,
    mockLatency,
    setMock,
  ]);

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
        <p className="text-sm text-center">
          Open a request from the Collections panel,{` `}
          or click <strong>+ New Tab</strong> above to start fresh
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-w-0 overflow-hidden">
      {/* Request bar */}
      <div className="flex flex-col gap-2 px-4 py-3 min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <MethodSelector value={method} onChange={setMethod} />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("requestName")}
            className="flex-1 min-w-[100px] max-w-[200px] h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
          />
        </div>
        <URLBar
          url={url}
          onChange={setURL}
          onSend={handleSend}
          loading={loading}
          onSave={handleSave}
          onPaste={handleURLPaste}
          envVars={envVars}
          placeholder={
            isGraphQL
              ? "https://api.example.com/graphql"
              : isWS
                ? "wss://echo.example.com/ws"
                : isSSE
                  ? "https://api.example.com/events"
                  : "https://api.example.com/endpoint — paste a curl command here"
          }
          extraButtons={
            <>
              {!isConnectionMode && (
                <>
                  <Button
                    variant={isMocked ? "default" : "ghost"}
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={handleMockToggle}
                    title={t("mockToggle")}
                  >
                    <Server className="h-3.5 w-3.5" />
                    Mock
                  </Button>
                  <CodeGenMenu
                    request={{
                      method,
                      url,
                      headers,
                      body,
                    }}
                  />
                </>
              )}
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
            </>
          }
        />
      </div>

      {/* Mock config panel */}
      {showMockConfig && request?.id && (
        <div className="mx-4 mt-2 p-3 border rounded-md bg-muted/30 space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Mock Response
            </span>
            {mockStatus.running && (
              <span className="text-[10px] text-green-400 font-mono">
                Server is live on :{mockStatus.port}
              </span>
            )}
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-[10px] text-muted-foreground w-16 shrink-0">
              {t("mockStatusCode")}
            </label>
            <Input
              type="number"
              value={mockStatusCode}
              onChange={(e) =>
                setMockStatusCode(parseInt(e.target.value) || 200)
              }
              className="h-7 w-20 text-xs font-mono"
              min={100}
              max={599}
            />
            <label className="text-[10px] text-muted-foreground ml-2 w-14 shrink-0">
              {t("mockLatency")}
            </label>
            <Input
              type="number"
              value={mockLatency}
              onChange={(e) => setMockLatency(parseInt(e.target.value) || 0)}
              className="h-7 w-16 text-xs font-mono"
              min={0}
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">
              {t("mockResponseBody")}
            </label>
            <textarea
              value={mockBody}
              onChange={(e) => setMockBody(e.target.value)}
              className="w-full h-24 text-xs font-mono bg-background border rounded p-2 resize-y"
              placeholder='{"message": "hello"}'
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={handleMockSave}>
              {isMocked ? "Update Mock" : "Enable Mock"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowMockConfig(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

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
                <TabsTrigger value="pre-request" className="text-xs">
                  Pre-request
                </TabsTrigger>
                <TabsTrigger value="tests" className="text-xs">
                  Tests
                </TabsTrigger>
                <TabsTrigger value="extract" className="text-xs">
                  Extract
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
                    envVars={envVars}
                  />
                </TabsContent>
                <TabsContent value="pre-request" className="h-full">
                  <ScriptEditor
                    script={preRequestScript}
                    onChange={setPreRequestScript}
                    label="Pre-request Script"
                  />
                </TabsContent>
                <TabsContent value="tests" className="h-full">
                  <ScriptEditor
                    script={testScript}
                    onChange={setTestScript}
                    label="Test Script"
                    testResult={response?.test_result}
                  />
                </TabsContent>
                <TabsContent value="extract" className="h-full">
                  <ExtractEditor extracts={extracts} onChange={setExtracts} />
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

export default React.memo(RequestEditor);
