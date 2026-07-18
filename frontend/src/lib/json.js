/**
 * JSON detection and beautification utilities for response bodies.
 */

/**
 * Detects whether a response body is likely JSON.
 * Checks Content-Type header first, then falls back to parse attempt.
 */
export function isJSON(body, headers) {
  if (!body || typeof body !== "string") return false;
  const trimmed = body.trim();
  if (!trimmed) return false;

  // Check Content-Type header
  if (headers) {
    const contentType = Object.keys(headers).find(
      (k) => k.toLowerCase() === "content-type",
    );
    if (contentType && headers[contentType]?.includes("application/json")) {
      return true;
    }
  }

  // Heuristic first char — avoid full parse on huge non-JSON blobs
  const first = trimmed[0];
  if (first !== "{" && first !== "[") return false;

  // Full parse is expensive on megabyte bodies; treat as JSON if it looks like it
  // when Content-Type was missing.
  if (trimmed.length > 512 * 1024) return true;

  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pretty-prints a JSON string with 2-space indentation.
 * Returns the original string if it's not valid JSON.
 */
export function beautifyJSON(body) {
  if (!body) return "";
  try {
    const parsed = JSON.parse(body);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return body;
  }
}

/**
 * Syntax-highlights a JSON string with HTML spans.
 * Parses the JSON and recursively builds HTML with color-coded spans
 * for keys, strings, numbers, booleans, and null.
 */
export function highlightJSON(body, isLight = false) {
  if (!body) return "";

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    return body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  const key = isLight ? "text-sky-600" : "text-sky-400";
  const str = isLight ? "text-emerald-600" : "text-emerald-400";
  const num = isLight ? "text-amber-600" : "text-amber-400";
  const bool = isLight ? "text-purple-600" : "text-purple-400";
  const nil = isLight ? "text-orange-600" : "text-orange-400";

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function format(v, indent) {
    if (v === null) return `<span class="${nil}">null</span>`;
    if (typeof v === "boolean") return `<span class="${bool}">${v}</span>`;
    if (typeof v === "number") return `<span class="${num}">${v}</span>`;
    if (typeof v === "string") return `<span class="${str}">"${esc(v)}"</span>`;

    if (Array.isArray(v)) {
      if (v.length === 0) return "[]";
      const pad = "  ".repeat(indent + 1);
      const items = v.map((item) => pad + format(item, indent + 1));
      return "[\n" + items.join(",\n") + "\n" + "  ".repeat(indent) + "]";
    }

    if (typeof v === "object") {
      const keys = Object.keys(v);
      if (keys.length === 0) return "{}";
      const pad = "  ".repeat(indent + 1);
      const pairs = keys.map(
        (k) =>
          pad +
          `<span class="${key}">"${esc(k)}"</span>: ` +
          format(v[k], indent + 1),
      );
      return "{\n" + pairs.join(",\n") + "\n" + "  ".repeat(indent) + "}";
    }

    return esc(String(v));
  }

  return format(data, 0);
}

/**
 * Lightweight per-line JSON coloring for virtualized viewers.
 * Operates on one line only — safe for large bodies.
 */
export function highlightJSONLine(line, isLight = false) {
  if (!line) return "";

  const key = isLight ? "text-sky-600" : "text-sky-400";
  const str = isLight ? "text-emerald-600" : "text-emerald-400";
  const num = isLight ? "text-amber-600" : "text-amber-400";
  const bool = isLight ? "text-purple-600" : "text-purple-400";
  const nil = isLight ? "text-orange-600" : "text-orange-400";

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  const re =
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

  let out = "";
  let last = 0;
  let m;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) out += esc(line.slice(last, m.index));
    if (m[1] !== undefined) {
      // string, optionally a key if followed by :
      if (m[2] !== undefined) {
        out += `<span class="${key}">${esc(m[1])}</span>${esc(m[2])}`;
      } else {
        out += `<span class="${str}">${esc(m[1])}</span>`;
      }
    } else if (m[3] !== undefined) {
      const cls = m[3] === "null" ? nil : bool;
      out += `<span class="${cls}">${m[3]}</span>`;
    } else {
      out += `<span class="${num}">${esc(m[0])}</span>`;
    }
    last = m.index + m[0].length;
  }
  if (last < line.length) out += esc(line.slice(last));
  return out;
}
