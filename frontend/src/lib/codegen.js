/**
 * Multi-language code generation from request state.
 *
 * Each generator takes a request object with:
 *   - method: string (GET, POST, PUT, PATCH, DELETE, etc.)
 *   - url: string (full URL)
 *   - headers: Array<{key: string, value: string}>
 *   - body: string (raw body content)
 *
 * And returns a formatted code snippet as a string.
 */

/** Escape a string for safe use inside double-quoted strings */
function esc(str) {
  return String(str).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Escape a single-quoted string */
function escSingle(str) {
  return String(str).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Escape a backtick template literal */
function escBacktick(str) {
  return String(str).replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
}

/** Filter out headers that shouldn't be explicitly set */
function shouldIncludeHeader(key) {
  const lower = key.toLowerCase();
  // Skip headers that are automatically set
  if (lower === "host" || lower === "content-length") return false;
  return true;
}

/** Get the content-type header value if present */
function getContentType(headers) {
  for (const h of headers) {
    if (h.key.toLowerCase() === "content-type") return h.value;
  }
  return null;
}

// ─── cURL ───────────────────────────────────────────────────────────────────

export function generateCurl({ method, url, headers, body }) {
  const lines = [`curl -X ${method.toUpperCase()}`];
  const ct = getContentType(headers);

  for (const { key, value } of headers) {
    if (!key.trim() || !shouldIncludeHeader(key)) continue;
    lines.push(`  -H "${esc(key)}: ${esc(value)}"`);
  }

  if (body && body.trim()) {
    const contentType = ct || "application/json";
    if (!headers.some((h) => h.key.toLowerCase() === "content-type")) {
      lines.push(`  -H "Content-Type: ${esc(contentType)}"`);
    }
    lines.push(`  -d '${escSingle(body.trim())}'`);
  }

  lines.push(`  "${esc(url)}"`);
  return lines.join(" \\\n");
}

// ─── JavaScript fetch ────────────────────────────────────────────────────────

export function generateFetch({ method, url, headers, body }) {
  const lines = [];
  const hasCustomHeaders = headers.some(
    ({ key }) => key.trim() && shouldIncludeHeader(key)
  );

  lines.push(
    `fetch("${esc(url)}", {`
  );
  lines.push(`  method: "${method.toUpperCase()}",`);

  if (hasCustomHeaders) {
    lines.push(`  headers: {`);
    for (const { key, value } of headers) {
      if (!key.trim() || !shouldIncludeHeader(key)) continue;
      lines.push(`    "${esc(key)}": "${esc(value)}",`);
    }
    lines.push(`  },`);
  }

  if (body && body.trim()) {
    lines.push(`  body: \`${escBacktick(body.trim())}\`,`);
  }

  lines.push(`});`);
  return lines.join("\n");
}

// ─── JavaScript axios ────────────────────────────────────────────────────────

export function generateAxios({ method, url, headers, body }) {
  const m = method.toLowerCase();
  const configProps = [];
  const hasCustomHeaders = headers.some(
    ({ key }) => key.trim() && shouldIncludeHeader(key)
  );

  if (hasCustomHeaders) {
    const hdrLines = [];
    hdrLines.push(`  headers: {`);
    for (const { key, value } of headers) {
      if (!key.trim() || !shouldIncludeHeader(key)) continue;
      hdrLines.push(`    "${esc(key)}": "${esc(value)}",`);
    }
    hdrLines.push(`  },`);
    configProps.push(hdrLines.join("\n"));
  }

  if (body && body.trim()) {
    configProps.push(`  data: \`${escBacktick(body.trim())}\`,`);
  }

  if (configProps.length > 0) {
    return [
      `axios.${m}("${esc(url)}", {`,
      configProps.join("\n"),
      `});`,
    ].join("\n");
  }

  return `axios.${m}("${esc(url)}");`;
}

// ─── Go net/http ─────────────────────────────────────────────────────────────

const goMethodMap = {
  POST: "http.MethodPost",
  PUT: "http.MethodPut",
  PATCH: "http.MethodPatch",
  DELETE: "http.MethodDelete",
  HEAD: "http.MethodHead",
  OPTIONS: "http.MethodOptions",
};

function goMethod(method) {
  return goMethodMap[method.toUpperCase()] || `"${method.toUpperCase()}"`;
}

export function generateGo({ method, url, headers, body }) {
  const lines = [];
  lines.push(`// Create request`);
  lines.push(
    body && body.trim()
      ? `body := strings.NewReader(\`${escBacktick(body.trim())}\`)`
      : `body := http.NoBody`
  );
  lines.push(
    `req, err := http.NewRequest(${goMethod(method)}, "${esc(url)}", body)`
  );
  lines.push(`if err != nil {`);
  lines.push(`    panic(err)`);
  lines.push(`}`);

  for (const { key, value } of headers) {
    if (!key.trim() || !shouldIncludeHeader(key)) continue;
    lines.push(`req.Header.Set("${esc(key)}", "${esc(value)}")`);
  }

  lines.push(``);
  lines.push(`// Send request`);
  lines.push(`client := &http.Client{}`);
  lines.push(`resp, err := client.Do(req)`);
  lines.push(`if err != nil {`);
  lines.push(`    panic(err)`);
  lines.push(`}`);
  lines.push(`defer resp.Body.Close()`);
  lines.push(``);
  lines.push(`// Read response`);
  lines.push(`data, err := io.ReadAll(resp.Body)`);
  lines.push(`if err != nil {`);
  lines.push(`    panic(err)`);
  lines.push(`}`);
  lines.push(`fmt.Println(string(data))`);

  return lines.join("\n");
}

// ─── Python requests ─────────────────────────────────────────────────────────

export function generatePython({ method, url, headers, body }) {
  const lines = [];
  lines.push(`import requests`);
  lines.push(``);

  let configLines = [];
  let configIndent = "";

  const hasCustomHeaders = headers.some(
    ({ key }) => key.trim() && shouldIncludeHeader(key)
  );

  if (hasCustomHeaders || (body && body.trim())) {
    configLines.push(`url = "${esc(url)}"`);
  }

  if (hasCustomHeaders) {
    configLines.push(`headers = {`);
    for (const { key, value } of headers) {
      if (!key.trim() || !shouldIncludeHeader(key)) continue;
      configLines.push(`    "${esc(key)}": "${esc(value)}",`);
    }
    configLines.push(`}`);
  }

  if (body && body.trim()) {
    configLines.push(`data = '''${body.trim()}'''`);
  }

  if (configLines.length > 0) {
    lines.push(...configLines);
    lines.push(``);
  }

  const args = [];
  if (hasCustomHeaders) args.push(`headers=headers`);
  if (body && body.trim()) args.push(`data=data`);

  if (args.length > 0 || configLines.length > 0) {
    const urlRef = configLines.length > 0 ? "url" : `"${esc(url)}"`;
    lines.push(`response = requests.${method.toLowerCase()}(${urlRef}${args.length ? ", " + args.join(", ") : ""})`);
  } else {
    lines.push(`response = requests.${method.toLowerCase()}("${esc(url)}")`);
  }

  lines.push(``);
  lines.push(`print(response.status_code)`);
  lines.push(`print(response.text)`);

  return lines.join("\n");
}

// ─── HTTPie ──────────────────────────────────────────────────────────────────

export function generateHTTPie({ method, url, headers, body }) {
  const m = method.toUpperCase();
  const showMethod = m !== "GET" && m !== "POST";
  const parts = ["http"];

  if (showMethod) {
    parts.push(m);
  }

  for (const { key, value } of headers) {
    if (!key.trim() || !shouldIncludeHeader(key)) continue;
    parts.push(`"${esc(key)}:${esc(value)}"`);
  }

  if (body && body.trim()) {
    // HTTPie infers JSON if the body looks like it
    parts.push(`--raw='${escSingle(body.trim())}'`);
  }

  parts.push(`"${esc(url)}"`);
  return parts.join(" ");
}

// ─── Registry ────────────────────────────────────────────────────────────────

/** Map of language key → { label, generator } */
export const LANGUAGES = [
  { key: "curl", label: "cURL", generate: generateCurl },
  { key: "fetch", label: "JavaScript — fetch", generate: generateFetch },
  { key: "axios", label: "JavaScript — axios", generate: generateAxios },
  { key: "go", label: "Go — net/http", generate: generateGo },
  { key: "python", label: "Python — requests", generate: generatePython },
  { key: "httpie", label: "HTTPie", generate: generateHTTPie },
];

/**
 * Generate code for a specific language.
 * Returns the code string or null if language not found.
 */
export function generateCode(langKey, request) {
  const lang = LANGUAGES.find((l) => l.key === langKey);
  if (!lang) return null;
  try {
    return lang.generate(request);
  } catch {
    return null;
  }
}
