import { describe, it, expect } from "vitest";
import { resolveJSONPath } from "../jsonpath.js";

const data = {
  user: {
    id: 1,
    name: "Alice",
    roles: ["admin", "editor"],
  },
  items: [
    { id: 10, label: "Alpha" },
    { id: 11, label: "Beta" },
  ],
  count: 2,
  active: true,
  meta: null,
};

describe("resolveJSONPath", () => {
  it("returns undefined for null obj", () => {
    expect(resolveJSONPath(null, "$.user")).toBeUndefined();
  });

  it("returns undefined for empty path", () => {
    expect(resolveJSONPath(data, "")).toBeUndefined();
  });

  it("returns root object for $ path", () => {
    expect(resolveJSONPath(data, "$")).toBe(data);
  });

  it("resolves top-level key", () => {
    expect(resolveJSONPath(data, "$.count")).toBe(2);
  });

  it("resolves nested key", () => {
    expect(resolveJSONPath(data, "$.user.name")).toBe("Alice");
  });

  it("resolves array index", () => {
    expect(resolveJSONPath(data, "$.items[0].label")).toBe("Alpha");
    expect(resolveJSONPath(data, "$.items[1].label")).toBe("Beta");
  });

  it("resolves nested array value", () => {
    expect(resolveJSONPath(data, "$.user.roles[0]")).toBe("admin");
    expect(resolveJSONPath(data, "$.user.roles[1]")).toBe("editor");
  });

  it("resolves boolean value", () => {
    expect(resolveJSONPath(data, "$.active")).toBe(true);
  });

  it("resolves null value", () => {
    expect(resolveJSONPath(data, "$.meta")).toBeNull();
  });

  it("returns undefined for missing key", () => {
    expect(resolveJSONPath(data, "$.nonexistent")).toBeUndefined();
  });

  it("returns undefined for out-of-bounds index", () => {
    expect(resolveJSONPath(data, "$.items[99]")).toBeUndefined();
  });

  it("returns undefined when traversing into null", () => {
    expect(resolveJSONPath(data, "$.meta.key")).toBeUndefined();
  });

  it("resolves wildcard to array of values", () => {
    const ids = resolveJSONPath(data, "$.items[*].id");
    expect(ids).toEqual([10, 11]);
  });

  it("resolves wildcard on array itself", () => {
    const all = resolveJSONPath(data, "$.items[*]");
    expect(all).toEqual(data.items);
  });

  it("returns undefined for wildcard on non-array", () => {
    expect(resolveJSONPath(data, "$.user[*]")).toBeUndefined();
  });

  it("handles numeric top-level path", () => {
    const arr = [{ name: "x" }, { name: "y" }];
    expect(resolveJSONPath(arr, "$[0].name")).toBeUndefined();
  });

  it("handles deeply nested path", () => {
    const deep = { a: { b: { c: { d: 42 } } } };
    expect(resolveJSONPath(deep, "$.a.b.c.d")).toBe(42);
  });
});
