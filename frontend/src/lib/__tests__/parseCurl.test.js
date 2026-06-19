import { describe, it, expect } from "vitest";
import { parseCurl } from "../parseCurl.js";

describe("parseCurl", () => {
  it("parses minimal GET", () => {
    const result = parseCurl("curl https://api.example.com/users");
    expect(result.method).toBe("GET");
    expect(result.url).toBe("https://api.example.com/users");
  });

  it("parses -X method flag", () => {
    const result = parseCurl("curl -X POST https://example.com/items");
    expect(result.method).toBe("POST");
  });

  it("parses --request method flag", () => {
    const result = parseCurl("curl --request DELETE https://example.com/items/1");
    expect(result.method).toBe("DELETE");
    expect(result.url).toBe("https://example.com/items/1");
  });

  it("parses -H header flag", () => {
    const result = parseCurl('curl -H "Accept: application/json" https://example.com');
    expect(result.headers["Accept"]).toBe("application/json");
  });

  it("parses multiple headers", () => {
    const result = parseCurl(
      'curl -H "Accept: application/json" -H "X-Api-Key: abc123" https://example.com'
    );
    expect(result.headers["Accept"]).toBe("application/json");
    expect(result.headers["X-Api-Key"]).toBe("abc123");
  });

  it("parses -d body and auto-sets POST method", () => {
    const result = parseCurl("curl -d '{\"name\":\"Alice\"}' https://example.com/users");
    expect(result.method).toBe("POST");
    expect(result.body).toBe('{"name":"Alice"}');
  });

  it("parses --data-raw flag", () => {
    const result = parseCurl("curl --data-raw 'hello' https://example.com");
    expect(result.body).toBe("hello");
    expect(result.method).toBe("POST");
  });

  it("adds Content-Type: application/json when body looks like JSON", () => {
    const result = parseCurl('curl -d \'{"key":"value"}\' https://example.com');
    expect(result.headers["Content-Type"]).toBe("application/json");
  });

  it("does not override explicit Content-Type", () => {
    const result = parseCurl(
      'curl -H "Content-Type: text/plain" -d \'{"key":"value"}\' https://example.com'
    );
    expect(result.headers["Content-Type"]).toBe("text/plain");
  });

  it("parses -u basic auth", () => {
    const result = parseCurl("curl -u user:pass https://example.com");
    expect(result.auth.type).toBe("basic");
    expect(result.auth.username).toBe("user");
    expect(result.auth.password).toBe("pass");
  });

  it("parses --user without password", () => {
    const result = parseCurl("curl --user admin https://example.com");
    expect(result.auth.type).toBe("basic");
    expect(result.auth.username).toBe("admin");
  });

  it("parses --oauth2-bearer flag", () => {
    const result = parseCurl("curl --oauth2-bearer mytoken https://example.com");
    expect(result.auth.type).toBe("bearer");
    expect(result.auth.token).toBe("mytoken");
  });

  it("parses --json flag with Content-Type and POST", () => {
    const result = parseCurl('curl --json \'{"a":1}\' https://example.com');
    expect(result.body).toBe('{"a":1}');
    expect(result.headers["Content-Type"]).toBe("application/json");
    expect(result.method).toBe("POST");
  });

  it("ignores -k --insecure flag", () => {
    const result = parseCurl("curl -k https://example.com");
    expect(result.url).toBe("https://example.com");
    expect(result.method).toBe("GET");
  });

  it("ignores --compressed flag", () => {
    const result = parseCurl("curl --compressed https://example.com");
    expect(result.url).toBe("https://example.com");
  });

  it("ignores -L --location flag", () => {
    const result = parseCurl("curl -L https://example.com");
    expect(result.url).toBe("https://example.com");
  });

  it("skips -b cookie flag", () => {
    const result = parseCurl("curl -b session=abc https://example.com");
    expect(result.url).toBe("https://example.com");
  });

  it("parses --url flag", () => {
    const result = parseCurl("curl --url https://api.example.com/v1");
    expect(result.url).toBe("https://api.example.com/v1");
  });

  it("handles input without leading 'curl' prefix", () => {
    const result = parseCurl("https://api.example.com/health");
    expect(result.url).toBe("https://api.example.com/health");
  });

  it("parses -F form data", () => {
    const result = parseCurl("curl -F 'field=value' https://example.com/upload");
    expect(result.body).toBe("field=value");
    expect(result.method).toBe("POST");
  });

  it("concatenates multiple -F form fields", () => {
    const result = parseCurl("curl -F 'a=1' -F 'b=2' https://example.com");
    expect(result.body).toBe("a=1&b=2");
  });

  it("sets method to PATCH when -X is given with body", () => {
    const result = parseCurl("curl -X PATCH -d '{\"name\":\"Bob\"}' https://example.com/users/1");
    expect(result.method).toBe("PATCH");
  });
});
