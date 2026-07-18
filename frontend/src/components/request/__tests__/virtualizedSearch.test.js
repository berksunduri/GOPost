import { describe, it, expect } from "vitest";
import { softenHTML, wrapLongLines } from "../VirtualizedCode";

describe("softenHTML", () => {
  it("breaks minified tags onto separate lines", () => {
    const raw =
      "<html><body><div>Suspense</div><div>Outlet</div></body></html>";
    const out = softenHTML(raw);
    expect(out.split("\n").length).toBeGreaterThan(3);
    expect(out).toContain("Suspense");
    expect(out).toContain("Outlet");
  });

  it("leaves non-HTML alone", () => {
    expect(softenHTML('{"a":1}')).toBe('{"a":1}');
  });
});

describe("wrapLongLines", () => {
  it("chunks oversized lines", () => {
    const line = "x".repeat(300);
    const parts = wrapLongLines(line, 100);
    expect(parts).toHaveLength(3);
    expect(parts.join("")).toBe(line);
  });
});
