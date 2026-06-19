import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import React from "react";
import { TabsProvider, useTabs } from "../TabsContext.jsx";

// ── Test consumer component ──────────────────────────────────────────────────

let capturedCtx = null;

function Fixture() {
  capturedCtx = useTabs();
  return null;
}

function setup() {
  capturedCtx = null;
  render(
    <TabsProvider>
      <Fixture />
    </TabsProvider>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const req1 = { id: "r1", name: "Get Users", method: "GET" };
const req2 = { id: "r2", name: "Create User", method: "POST" };

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

// ── openTab ──────────────────────────────────────────────────────────────────

describe("openTab", () => {
  it("adds a new tab and sets it active", () => {
    setup();
    act(() => capturedCtx.openTab(req1));

    expect(capturedCtx.openTabs).toHaveLength(1);
    expect(capturedCtx.openTabs[0].id).toBe("r1");
    expect(capturedCtx.activeTabId).toBe("r1");
  });

  it("does not duplicate an already-open tab", () => {
    setup();
    act(() => capturedCtx.openTab(req1));
    act(() => capturedCtx.openTab(req1));

    expect(capturedCtx.openTabs).toHaveLength(1);
  });

  it("switches activeTabId when re-opening existing tab", () => {
    setup();
    act(() => capturedCtx.openTab(req1));
    act(() => capturedCtx.openTab(req2));
    act(() => capturedCtx.openTab(req1));

    expect(capturedCtx.activeTabId).toBe("r1");
    expect(capturedCtx.openTabs).toHaveLength(2);
  });

  it("ignores requests without id", () => {
    setup();
    act(() => capturedCtx.openTab({ name: "no id" }));
    expect(capturedCtx.openTabs).toHaveLength(0);
  });

  it("sets isDirty=false and response=null on new tab", () => {
    setup();
    act(() => capturedCtx.openTab(req1));
    expect(capturedCtx.openTabs[0].isDirty).toBe(false);
    expect(capturedCtx.openTabs[0].response).toBeNull();
  });
});

// ── closeTab ─────────────────────────────────────────────────────────────────

describe("closeTab", () => {
  it("removes the tab", () => {
    setup();
    act(() => capturedCtx.openTab(req1));
    act(() => capturedCtx.closeTab("r1"));
    expect(capturedCtx.openTabs).toHaveLength(0);
  });

  it("clears activeTabId when active tab is closed", () => {
    setup();
    act(() => capturedCtx.openTab(req1));
    act(() => capturedCtx.closeTab("r1"));
    expect(capturedCtx.activeTabId).toBeNull();
  });

  it("preserves activeTabId when a non-active tab is closed", () => {
    setup();
    act(() => capturedCtx.openTab(req1));
    act(() => capturedCtx.openTab(req2)); // activeTabId = r2
    act(() => capturedCtx.closeTab("r1")); // close non-active r1
    expect(capturedCtx.activeTabId).toBe("r2"); // r2 should remain active
  });
});

// ── closeTabByRequestId ───────────────────────────────────────────────────────

describe("closeTabByRequestId", () => {
  it("removes tab matching the request id", () => {
    setup();
    act(() => capturedCtx.openTab(req1));
    act(() => capturedCtx.openTab(req2));
    act(() => capturedCtx.closeTabByRequestId("r1"));
    expect(capturedCtx.openTabs).toHaveLength(1);
    expect(capturedCtx.openTabs[0].id).toBe("r2");
  });
});

// ── updateTabData ─────────────────────────────────────────────────────────────

describe("updateTabData", () => {
  it("merges updates into the target tab", () => {
    setup();
    act(() => capturedCtx.openTab(req1));
    act(() => capturedCtx.updateTabData("r1", { response: { status: 200 }, isDirty: true }));

    const tab = capturedCtx.openTabs.find((t) => t.id === "r1");
    expect(tab.response).toEqual({ status: 200 });
    expect(tab.isDirty).toBe(true);
  });

  it("does not affect other tabs", () => {
    setup();
    act(() => capturedCtx.openTab(req1));
    act(() => capturedCtx.openTab(req2));
    act(() => capturedCtx.updateTabData("r1", { isDirty: true }));

    const tab2 = capturedCtx.openTabs.find((t) => t.id === "r2");
    expect(tab2.isDirty).toBe(false);
  });
});

// ── pushResponse ──────────────────────────────────────────────────────────────

describe("pushResponse", () => {
  it("prepends response to tab history", () => {
    setup();
    act(() => capturedCtx.openTab(req1));
    act(() => capturedCtx.pushResponse("r1", { status: 200, body: "ok" }));
    act(() => capturedCtx.pushResponse("r1", { status: 201, body: "created" }));

    const tab = capturedCtx.openTabs[0];
    expect(tab.responseHistory).toHaveLength(2);
    expect(tab.responseHistory[0].status).toBe(201);
  });

  it("caps history at 5 entries", () => {
    setup();
    act(() => capturedCtx.openTab(req1));
    for (let i = 0; i < 7; i++) {
      act(() => capturedCtx.pushResponse("r1", { status: 200 + i }));
    }
    expect(capturedCtx.openTabs[0].responseHistory).toHaveLength(5);
  });

  it("ignores null response", () => {
    setup();
    act(() => capturedCtx.openTab(req1));
    act(() => capturedCtx.pushResponse("r1", null));
    expect(capturedCtx.openTabs[0].responseHistory).toBeUndefined();
  });

  it("attaches _ts timestamp to each entry", () => {
    setup();
    act(() => capturedCtx.openTab(req1));
    act(() => capturedCtx.pushResponse("r1", { status: 200 }));
    expect(capturedCtx.openTabs[0].responseHistory[0]._ts).toBeDefined();
  });
});

// ── markDirty / markSaved ────────────────────────────────────────────────────

describe("markDirty", () => {
  it("sets isDirty=true on target tab", () => {
    setup();
    act(() => capturedCtx.openTab(req1));
    act(() => capturedCtx.markDirty("r1"));
    expect(capturedCtx.openTabs[0].isDirty).toBe(true);
  });
});

describe("markSaved", () => {
  it("sets isDirty=false and sets lastSavedAt", () => {
    setup();
    act(() => capturedCtx.openTab(req1));
    act(() => capturedCtx.markDirty("r1"));
    act(() => capturedCtx.markSaved("r1"));

    const tab = capturedCtx.openTabs[0];
    expect(tab.isDirty).toBe(false);
    expect(tab.lastSavedAt).toBeDefined();
  });

  it("clears lastSavedAt after 1500ms", () => {
    setup();
    act(() => capturedCtx.openTab(req1));
    act(() => capturedCtx.markSaved("r1"));
    expect(capturedCtx.openTabs[0].lastSavedAt).toBeDefined();

    act(() => vi.advanceTimersByTime(1600));
    expect(capturedCtx.openTabs[0].lastSavedAt).toBeNull();
  });
});

// ── restoreTabIds ─────────────────────────────────────────────────────────────

describe("restoreTabIds", () => {
  it("returns null when localStorage is empty", () => {
    setup();
    expect(capturedCtx.restoreTabIds()).toBeNull();
  });

  it("returns stored tab ids and activeId", () => {
    setup();
    // Set AFTER setup() so the useEffect doesn't overwrite it before our call
    localStorage.setItem(
      "gopost.tabs",
      JSON.stringify({ ids: ["r1", "r2"], activeId: "r2" })
    );
    const result = capturedCtx.restoreTabIds();
    expect(result).toEqual({ ids: ["r1", "r2"], activeId: "r2" });
  });

  it("returns null for empty ids array", () => {
    setup();
    localStorage.setItem("gopost.tabs", JSON.stringify({ ids: [], activeId: null }));
    expect(capturedCtx.restoreTabIds()).toBeNull();
  });

  it("returns null and clears storage for corrupt data", () => {
    setup();
    localStorage.setItem("gopost.tabs", "{{not valid json");
    expect(capturedCtx.restoreTabIds()).toBeNull();
    // corrupt data should be cleared
    expect(localStorage.getItem("gopost.tabs")).toBeNull();
  });
});

// ── useTabs outside provider ──────────────────────────────────────────────────

describe("useTabs", () => {
  it("throws when used outside TabsProvider", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Fixture />)).toThrow("useTabs must be used within TabsProvider");
    err.mockRestore();
  });
});
