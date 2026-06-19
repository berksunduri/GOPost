import { describe, it, expect, beforeEach } from "vitest";
import { getAppService } from "../../bridge.js";

function validService() {
  return {
    ImportData: () => {},
    ExportData: () => {},
    GetCollections: () => {},
  };
}

beforeEach(() => {
  delete window.go;
  delete window.App;
  delete window.app;
  delete window.wails;
  delete window.__wails;
});

describe("getAppService", () => {
  it("returns null when window.go is not defined", () => {
    expect(getAppService()).toBeNull();
  });

  it("returns null when service lacks ImportData/ExportData", () => {
    window.go = {
      main: { App: { GetCollections: () => {} } },
    };
    expect(getAppService()).toBeNull();
  });

  it("finds service at window.go.main.App", () => {
    const svc = validService();
    window.go = { main: { App: svc } };
    expect(getAppService()).toBe(svc);
  });

  it("finds service at window.go.app.App", () => {
    const svc = validService();
    window.go = { app: { App: svc } };
    expect(getAppService()).toBe(svc);
  });

  it("finds service at window.App", () => {
    const svc = validService();
    window.App = svc;
    expect(getAppService()).toBe(svc);
  });

  it("finds service nested inside window.go namespace", () => {
    const svc = validService();
    window.go = {
      someNamespace: {
        AnotherClass: svc,
      },
    };
    expect(getAppService()).toBe(svc);
  });

  it("returns null when service is null", () => {
    window.go = { main: { App: null } };
    expect(getAppService()).toBeNull();
  });

  it("returns null when service is a primitive", () => {
    window.go = { main: { App: 42 } };
    expect(getAppService()).toBeNull();
  });

  it("does not return services from non-object window.go values", () => {
    window.go = "not an object";
    expect(getAppService()).toBeNull();
  });
});
