import { describe, it, expect } from "vitest";
import { isJSON, beautifyJSON, highlightJSON, highlightJSONLine } from "../json.js";

describe("isJSON", () => {
  it("returns false for null/undefined", () => {
    expect(isJSON(null)).toBe(false);
    expect(isJSON(undefined)).toBe(false);
    expect(isJSON("")).toBe(false);
  });

  it("returns false for non-string input", () => {
    expect(isJSON(42)).toBe(false);
    expect(isJSON({})).toBe(false);
  });

  it("detects JSON from Content-Type header", () => {
    const headers = { "content-type": "application/json; charset=utf-8" };
    expect(isJSON('{"key":"val"}', headers)).toBe(true);
  });

  it("detects JSON from case-insensitive Content-Type header", () => {
    const headers = { "Content-Type": "application/json" };
    expect(isJSON('{"a":1}', headers)).toBe(true);
  });

  it("falls back to parse when no header", () => {
    expect(isJSON('{"valid":true}')).toBe(true);
    expect(isJSON("[1,2,3]")).toBe(true);
  });

  it("returns false for invalid JSON without header", () => {
    expect(isJSON("not json")).toBe(false);
    expect(isJSON("<html>")).toBe(false);
  });

  it("returns false for whitespace-only string", () => {
    expect(isJSON("   ")).toBe(false);
  });
});

describe("beautifyJSON", () => {
  it("returns empty string for falsy input", () => {
    expect(beautifyJSON("")).toBe("");
    expect(beautifyJSON(null)).toBe("");
    expect(beautifyJSON(undefined)).toBe("");
  });

  it("pretty-prints valid JSON", () => {
    const result = beautifyJSON('{"a":1,"b":2}');
    expect(result).toBe(JSON.stringify({ a: 1, b: 2 }, null, 2));
  });

  it("returns original string for invalid JSON", () => {
    expect(beautifyJSON("not json")).toBe("not json");
  });

  it("handles arrays", () => {
    const result = beautifyJSON("[1,2,3]");
    expect(result).toBe(JSON.stringify([1, 2, 3], null, 2));
  });

  it("handles nested objects", () => {
    const input = '{"user":{"id":1,"name":"Alice"}}';
    const result = beautifyJSON(input);
    const parsed = JSON.parse(result);
    expect(parsed.user.name).toBe("Alice");
  });
});

describe("highlightJSON", () => {
  it("returns empty string for falsy input", () => {
    expect(highlightJSON("")).toBe("");
    expect(highlightJSON(null)).toBe("");
  });

  it("wraps string values in spans", () => {
    const result = highlightJSON('{"name":"Alice"}');
    expect(result).toContain("<span");
    expect(result).toContain("Alice");
  });

  it("highlights booleans", () => {
    const result = highlightJSON('{"active":true}');
    expect(result).toContain("true");
    expect(result).toContain("<span");
  });

  it("highlights null", () => {
    const result = highlightJSON('{"val":null}');
    expect(result).toContain("null");
  });

  it("highlights numbers", () => {
    const result = highlightJSON('{"count":42}');
    expect(result).toContain("42");
  });

  it("escapes HTML entities in values", () => {
    const result = highlightJSON('{"html":"<div>test</div>"}');
    expect(result).not.toContain("<div>");
    expect(result).toContain("&lt;div&gt;");
  });

  it("returns escaped raw body for invalid JSON", () => {
    const result = highlightJSON("<not json>");
    expect(result).toContain("&lt;not json&gt;");
    expect(result).not.toContain("<not json>");
  });

  it("handles empty objects and arrays", () => {
    expect(highlightJSON("{}")).toBe("{}");
    expect(highlightJSON("[]")).toBe("[]");
  });

  it("uses light mode classes when isLight=true", () => {
    const dark = highlightJSON('{"key":"val"}', false);
    const light = highlightJSON('{"key":"val"}', true);
    expect(dark).not.toBe(light);
    expect(light).toContain("text-sky-600");
    expect(dark).toContain("text-sky-400");
  });
});

describe("highlightJSONLine", () => {
  it("colors keys, strings, and numbers", () => {
    const html = highlightJSONLine('  "name": "Ada", "n": 42, "ok": true');
    expect(html).toContain("text-sky-400");
    expect(html).toContain("text-emerald-400");
    expect(html).toContain("text-amber-400");
    expect(html).toContain("text-purple-400");
  });
});
