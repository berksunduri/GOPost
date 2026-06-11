/**
 * Lightweight JSONPath resolver. Supports:
 *   $.key.subkey       — nested object access
 *   $.items[0]         — array index
 *   $.items[0].name    — array element property
 *   $.data.items[*].id — wildcard (returns array of values)
 */

/**
 * Resolve a JSONPath expression against an object.
 * Returns the resolved value, or undefined if not found.
 */
export function resolveJSONPath(obj, path) {
  if (!obj || !path) return undefined;

  // Strip leading $.
  let expr = path.trim();
  if (expr.startsWith("$.")) expr = expr.slice(2);
  else if (expr === "$") return obj;

  const parts = parsePath(expr);
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;

    if (part.type === "key") {
      current = current[part.value];
    } else if (part.type === "index") {
      if (part.value === "*") {
        // Wildcard — only supported as the last segment for simplicity
        if (!Array.isArray(current)) return undefined;
        const remaining = parts.slice(parts.indexOf(part) + 1);
        if (remaining.length === 0) return current;
        // Collect values through remaining path
        return current.map((item) => {
          let v = item;
          for (const r of remaining) {
            if (v === null || v === undefined) return undefined;
            if (r.type === "key") v = v[r.value];
            else if (r.type === "index") v = Array.isArray(v) ? v[r.value] : undefined;
          }
          return v;
        });
      }
      const idx = parseInt(part.value, 10);
      if (!Array.isArray(current) || isNaN(idx)) return undefined;
      current = current[idx];
    }
  }

  return current;
}

function parsePath(expr) {
  const parts = [];
  let i = 0;

  while (i < expr.length) {
    // Dot separator
    if (expr[i] === ".") {
      i++;
      continue;
    }

    // Bracket access [n] or [*]
    if (expr[i] === "[") {
      const end = expr.indexOf("]", i);
      if (end === -1) break;
      const val = expr.slice(i + 1, end).trim();
      parts.push({ type: "index", value: val });
      i = end + 1;
      continue;
    }

    // Key name
    let end = i;
    while (end < expr.length && expr[end] !== "." && expr[end] !== "[") {
      end++;
    }
    const key = expr.slice(i, end);
    if (key) parts.push({ type: "key", value: key });
    i = end;
  }

  return parts;
}
