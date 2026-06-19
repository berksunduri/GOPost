import { describe, it, expect } from "vitest";
import {
  generateCurl,
  generateFetch,
  generatePython,
  generateAxios,
  generateGo,
} from "../codegen.js";

const baseReq = {
  method: "GET",
  url: "https://api.example.com/users",
  headers: [],
  body: "",
};

// ─── generateCurl ────────────────────────────────────────────────────────────

describe("generateCurl", () => {
  it("generates minimal GET with correct flags", () => {
    const out = generateCurl(baseReq);
    expect(out).toMatch(/^curl -X GET/);
    expect(out).toContain('"https://api.example.com/users"');
  });

  it("flags are separated by \\ newline (multiline format)", () => {
    const req = { ...baseReq, headers: [{ key: "Accept", value: "application/json" }] };
    const out = generateCurl(req);
    expect(out).toContain(" \\\n");
  });

  it("includes -H flag with correct header format", () => {
    const req = { ...baseReq, headers: [{ key: "Accept", value: "application/json" }] };
    const out = generateCurl(req);
    expect(out).toContain('-H "Accept: application/json"');
  });

  it("includes -d flag and body for POST", () => {
    const req = { ...baseReq, method: "POST", body: '{"name":"Alice"}' };
    const out = generateCurl(req);
    expect(out).toMatch(/-d '.*{"name":"Alice"}.*'/s);
  });

  it("skips Content-Length and Host headers", () => {
    const req = {
      ...baseReq,
      headers: [
        { key: "Host", value: "example.com" },
        { key: "Content-Length", value: "42" },
        { key: "Authorization", value: "Bearer tok" },
      ],
    };
    const out = generateCurl(req);
    expect(out).not.toMatch(/-H "Host:/);
    expect(out).not.toMatch(/-H "Content-Length:/);
    expect(out).toContain("Authorization");
  });

  it("escapes double quotes in URL", () => {
    const req = { ...baseReq, url: 'https://example.com/?q="hello"' };
    const out = generateCurl(req);
    expect(out).toContain('\\"hello\\"');
  });

  it("URL is the last argument", () => {
    const out = generateCurl(baseReq);
    const lines = out.split("\n");
    const lastLine = lines[lines.length - 1].trim();
    expect(lastLine).toMatch(/^"https?:/);
  });

  it("adds Content-Type for body without explicit header", () => {
    const req = { ...baseReq, method: "POST", body: "data" };
    const out = generateCurl(req);
    expect(out).toContain("Content-Type");
  });

  it("skips empty header keys", () => {
    const req = { ...baseReq, headers: [{ key: "", value: "anything" }] };
    const out = generateCurl(req);
    expect(out).not.toContain("-H");
  });
});

// ─── generateFetch ───────────────────────────────────────────────────────────

describe("generateFetch", () => {
  it("produces valid JS fetch call structure", () => {
    const out = generateFetch(baseReq);
    expect(out).toMatch(/^fetch\(/);
    expect(out).toContain('"https://api.example.com/users"');
    expect(out).toContain('method: "GET"');
    expect(out).toMatch(/\}\);$/);
  });

  it("includes headers object with correct entries", () => {
    const req = { ...baseReq, headers: [{ key: "Authorization", value: "Bearer tok" }] };
    const out = generateFetch(req);
    expect(out).toMatch(/headers:\s*\{/);
    expect(out).toContain('"Authorization": "Bearer tok"');
  });

  it("includes body as template literal for POST", () => {
    const req = { ...baseReq, method: "POST", body: '{"name":"Alice"}' };
    const out = generateFetch(req);
    expect(out).toMatch(/body:\s*`/);
    expect(out).toContain('{"name":"Alice"}');
  });

  it("omits body key for GET with empty body", () => {
    const out = generateFetch(baseReq);
    expect(out).not.toMatch(/\bbody:/);
  });

  it("omits headers key when no custom headers", () => {
    const out = generateFetch(baseReq);
    expect(out).not.toMatch(/\bheaders:/);
  });

  it("produces parseable JS (no syntax errors indicated by structure)", () => {
    const out = generateFetch({
      method: "POST",
      url: "https://example.com",
      headers: [{ key: "Content-Type", value: "application/json" }],
      body: '{"x":1}',
    });
    expect(out).toMatch(/^fetch\(/);
    expect(out.split("{").length).toBe(out.split("}").length);
  });
});

// ─── generateAxios ───────────────────────────────────────────────────────────

describe("generateAxios", () => {
  it("generates axios.get for GET without config", () => {
    const out = generateAxios(baseReq);
    expect(out).toBe(`axios.get("https://api.example.com/users");`);
  });

  it("generates axios.post with data for POST", () => {
    const req = { ...baseReq, method: "POST", body: '{"x":1}' };
    const out = generateAxios(req);
    expect(out).toMatch(/^axios\.post\(/);
    expect(out).toContain("data:");
  });

  it("includes headers in config", () => {
    const req = { ...baseReq, headers: [{ key: "X-Key", value: "val" }] };
    const out = generateAxios(req);
    expect(out).toContain('headers:');
    expect(out).toContain('"X-Key": "val"');
  });

  it("uses lowercase method name", () => {
    const req = { ...baseReq, method: "DELETE" };
    const out = generateAxios(req);
    expect(out).toMatch(/^axios\.delete\(/);
  });
});

// ─── generateGo ──────────────────────────────────────────────────────────────

describe("generateGo", () => {
  it("starts with body declaration", () => {
    const out = generateGo(baseReq);
    expect(out.split("\n")[1]).toContain("body");
  });

  it("uses http.NoBody for GET with no body", () => {
    const out = generateGo(baseReq);
    expect(out).toContain("http.NoBody");
  });

  it("uses strings.NewReader for POST with body", () => {
    const req = { ...baseReq, method: "POST", body: '{"x":1}' };
    const out = generateGo(req);
    expect(out).toContain("strings.NewReader");
  });

  it("includes http.NewRequest call", () => {
    const out = generateGo(baseReq);
    expect(out).toContain("http.NewRequest(");
  });

  it("includes url in http.NewRequest", () => {
    const out = generateGo(baseReq);
    expect(out).toContain('"https://api.example.com/users"');
  });

  it("maps POST to http.MethodPost", () => {
    const out = generateGo({ ...baseReq, method: "POST" });
    expect(out).toContain("http.MethodPost");
  });

  it("includes Header.Set for custom headers", () => {
    const req = { ...baseReq, headers: [{ key: "Authorization", value: "Bearer tok" }] };
    const out = generateGo(req);
    expect(out).toContain('req.Header.Set("Authorization", "Bearer tok")');
  });

  it("includes defer resp.Body.Close()", () => {
    const out = generateGo(baseReq);
    expect(out).toContain("defer resp.Body.Close()");
  });

  it("includes io.ReadAll for reading response", () => {
    const out = generateGo(baseReq);
    expect(out).toContain("io.ReadAll(resp.Body)");
  });
});

// ─── generatePython ──────────────────────────────────────────────────────────

describe("generatePython", () => {
  it("starts with import statement", () => {
    const out = generatePython(baseReq);
    expect(out.split("\n")[0]).toBe("import requests");
  });

  it("uses correct lowercase method for simple GET", () => {
    const out = generatePython(baseReq);
    expect(out).toContain("requests.get(");
  });

  it("uses correct method for POST", () => {
    const req = { ...baseReq, method: "POST", body: '{"x":1}' };
    const out = generatePython(req);
    expect(out).toContain("requests.post(");
  });

  it("declares url variable when headers/body are present", () => {
    const req = { ...baseReq, headers: [{ key: "X-Key", value: "val" }] };
    const out = generatePython(req);
    expect(out).toContain(`url = "https://api.example.com/users"`);
    expect(out).toContain("requests.get(url");
  });

  it("includes headers dict with correct format", () => {
    const req = { ...baseReq, headers: [{ key: "X-Api-Key", value: "secret" }] };
    const out = generatePython(req);
    expect(out).toMatch(/headers\s*=\s*\{/);
    expect(out).toContain('"X-Api-Key": "secret"');
    expect(out).toContain("headers=headers");
  });

  it("includes data variable for body", () => {
    const req = { ...baseReq, method: "POST", body: '{"name":"Alice"}' };
    const out = generatePython(req);
    expect(out).toContain("data = '''");
    expect(out).toContain("data=data");
  });

  it("ends with print statements", () => {
    const out = generatePython(baseReq);
    const lines = out.split("\n").filter(Boolean);
    expect(lines[lines.length - 2]).toBe("print(response.status_code)");
    expect(lines[lines.length - 1]).toBe("print(response.text)");
  });

  it("escapes double quotes in header values", () => {
    const req = { ...baseReq, headers: [{ key: "X-Val", value: 'say "hello"' }] };
    const out = generatePython(req);
    expect(out).toContain('\\"hello\\"');
  });
});
