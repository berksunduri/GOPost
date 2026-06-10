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

  // Fallback: try to parse
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
