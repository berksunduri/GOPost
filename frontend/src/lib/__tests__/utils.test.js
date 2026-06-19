import { describe, it, expect } from "vitest";
import { cn } from "../utils.js";

describe("cn (className merger)", () => {
  it("merges simple class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "disabled", "active")).toBe("base active");
  });

  it("deduplicates tailwind conflicting classes", () => {
    const result = cn("p-4", "p-8");
    expect(result).toBe("p-8");
  });

  it("deduplicates tailwind text color", () => {
    const result = cn("text-red-500", "text-blue-500");
    expect(result).toBe("text-blue-500");
  });

  it("handles undefined and null gracefully", () => {
    expect(cn("foo", undefined, null, "bar")).toBe("foo bar");
  });

  it("handles object syntax", () => {
    const result = cn({ active: true, disabled: false });
    expect(result).toBe("active");
  });

  it("handles arrays", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar");
  });

  it("returns empty string with no inputs", () => {
    expect(cn()).toBe("");
  });

  it("handles empty string inputs", () => {
    expect(cn("", "foo", "")).toBe("foo");
  });
});
