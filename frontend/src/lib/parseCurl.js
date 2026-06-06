/**
 * Parse a curl command string into request components.
 * Handles: -X/--request, -H/--header, -d/--data/--data-raw, -u/--user,
 *          --url, -b/--cookie, -o, --compressed, -k/--insecure,
 *          --json, --form/-F, --oauth2-bearer, --cert, --key, etc.
 * Falls back to GET + URL for minimal input.
 */
export function parseCurl(input) {
  const trimmed = input.trim();

  // Strip leading "curl " if present
  const cmd = trimmed.replace(/^curl\s+/, "");

  const result = {
    method: "GET",
    url: "",
    headers: {},
    body: "",
    auth: { type: "none" },
  };

  // Tokenize respecting quotes
  const tokens = tokenize(cmd);
  let i = 0;
  let positionalUrl = null;

  while (i < tokens.length) {
    const token = tokens[i];
    const next = tokens[i + 1];

    // Method flag
    if (token === "-X" || token === "--request") {
      if (next && !next.startsWith("-")) {
        result.method = next.toUpperCase();
        i += 2;
        continue;
      }
    }

    // URL flag
    if (token === "--url") {
      if (next && !next.startsWith("-")) {
        result.url = next;
        i += 2;
        continue;
      }
    }

    // Header flag
    if (token === "-H" || token === "--header") {
      if (next) {
        const colonIdx = next.indexOf(":");
        if (colonIdx > 0) {
          const key = next.substring(0, colonIdx).trim();
          const value = next.substring(colonIdx + 1).trim();
          result.headers[key] = value;
        }
        i += 2;
        continue;
      }
    }

    // Data flag
    if (
      token === "-d" ||
      token === "--data" ||
      token === "--data-raw" ||
      token === "--data-binary"
    ) {
      if (next) {
        result.body = next;
        // Auto-set method to POST if not explicitly set
        if (result.method === "GET") result.method = "POST";
        i += 2;
        continue;
      }
    }

    // User/auth flag
    if (token === "-u" || token === "--user") {
      if (next) {
        const colonIdx = next.indexOf(":");
        if (colonIdx > 0) {
          result.auth = {
            type: "basic",
            username: next.substring(0, colonIdx),
            password: next.substring(colonIdx + 1),
          };
        } else {
          result.auth = { type: "basic", username: next, password: "" };
        }
        i += 2;
        continue;
      }
    }

    // Bearer token
    if (
      token === "-H" &&
      next &&
      next.toLowerCase().startsWith("authorization: bearer ")
    ) {
      const tokenValue = next.substring("authorization: bearer ".length).trim();
      result.auth = { type: "bearer", token: tokenValue };
      i += 2;
      continue;
    }


    // --json flag: sets body + Content-Type + method
    if (token === "--json") {
      if (next) {
        result.body = next;
        result.headers["Content-Type"] = "application/json";
        if (result.method === "GET") result.method = "POST";
        i += 2;
        continue;
      }
    }

    // --form / -F flag: multipart form data
    if (token === "-F" || token === "--form") {
      if (next) {
        if (result.body) result.body += "&";
        result.body += next;
        if (result.method === "GET") result.method = "POST";
        i += 2;
        continue;
      }
    }

    // --oauth2-bearer flag
    if (token === "--oauth2-bearer") {
      if (next) {
        result.auth = { type: "bearer", token: next };
        i += 2;
        continue;
      }
    }

    // --cert / -E flag: client certificate
    if (token === "--cert" || token === "-E") {
      if (next && !next.startsWith("-")) {
        result.headers["X-Client-Cert"] = next;
        i += 2;
        continue;
      }
    }

    // --key flag: client key
    if (token === "--key") {
      if (next && !next.startsWith("-")) {
        result.headers["X-Client-Key"] = next;
        i += 2;
        continue;
      }
    }

    // Skip known flags that don't need values
    if (
      [
        "-k",
        "--insecure",
        "--compressed",
        "-s",
        "--silent",
        "-S",
        "--show-error",
        "-L",
        "--location",
        "-v",
        "--verbose",
      ].includes(token)
    ) {
      i += 1;
      continue;
    }

    // Skip flags with values we don't care about
    if (
      [
        "-b",
        "--cookie",
        "-o",
        "--output",
        "-w",
        "--write-out",
        "--connect-timeout",
        "--max-time",
        "-m",
      ].includes(token)
    ) {
      if (next && !next.startsWith("-")) i += 2;
      else i += 1;
      continue;
    }

    // Positional URL (any non-flag token that looks like a URL)
    if (!token.startsWith("-") && isURL(token)) {
      positionalUrl = token;
      i += 1;
      continue;
    }

    // Unknown token, skip
    i += 1;
  }

  // Use positional URL if no --url flag was found
  if (!result.url && positionalUrl) {
    result.url = positionalUrl;
  }

  // If method was changed from GET but it's really a data-bearing POST, keep it
  // Check if body looks like JSON and add Content-Type if missing
  if (
    result.body &&
    !result.headers["Content-Type"] &&
    !result.headers["content-type"]
  ) {
    if (looksLikeJSON(result.body)) {
      result.headers["Content-Type"] = "application/json";
    }
  }

  return result;
}

function tokenize(str) {
  const tokens = [];
  let i = 0;
  while (i < str.length) {
    // Skip whitespace
    while (i < str.length && /\s/.test(str[i])) i++;
    if (i >= str.length) break;

    // Single-quoted string
    if (str[i] === "'") {
      let end = i + 1;
      while (end < str.length && str[end] !== "'") end++;
      tokens.push(str.substring(i + 1, end));
      i = end + 1;
      continue;
    }

    // Double-quoted or $-quoted string
    if (str[i] === '"') {
      let end = i + 1;
      while (end < str.length && str[end] !== '"') {
        if (str[end] === "\\") end++; // skip escaped char
        end++;
      }
      tokens.push(str.substring(i + 1, end));
      i = end + 1;
      continue;
    }

    // Unquoted token
    let end = i;
    while (end < str.length && !/\s/.test(str[end])) end++;
    tokens.push(str.substring(i, end));
    i = end;
  }
  return tokens;
}

function isURL(str) {
  return (
    /^https?:\/\//i.test(str) ||
    /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/\S*)?$/.test(str)
  );
}

function looksLikeJSON(str) {
  const s = str.trim();
  return (
    (s.startsWith("{") && s.endsWith("}")) ||
    (s.startsWith("[") && s.endsWith("]"))
  );
}
