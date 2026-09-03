import { describe, expect, it, vi } from "vitest";
import { Amp2HttpClient } from "../src/amp/amp2/client.js";
import { testConfig, testLogger } from "./helpers.js";

const response = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, statusText: status === 200 ? "OK" : "Unauthorized", text: async () => JSON.stringify(body) });

describe("AMP HTTP client", () => {
  it("logs in once and sends the current bearer session", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(200, { success: true, sessionID: "session-12345678" })).mockResolvedValueOnce(response(200, { State: 20 }));
    const client = new Amp2HttpClient(testConfig(), testLogger, fetcher);
    expect(await client.call("Core", "GetStatus", {}, undefined, true)).toEqual({ State: 20 });
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).not.toHaveProperty("SESSIONID");
    expect(fetcher.mock.calls[1]![1].headers.authorization).toBe("Bearer session-12345678");
  });
  it("re-authenticates once after a 401", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(200, { success: true, sessionID: "session-old-1234" }))
      .mockResolvedValueOnce(response(401, { Message: "Session expired" }))
      .mockResolvedValueOnce(response(200, { success: true, sessionID: "session-new-1234" }))
      .mockResolvedValueOnce(response(200, { State: 20 }));
    const client = new Amp2HttpClient(testConfig(), testLogger, fetcher);
    expect(await client.call("Core", "GetStatus")).toEqual({ State: 20 }); expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("supports explicit legacy session-body mode", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(200, { success: true, sessionID: "session-12345678" })).mockResolvedValueOnce(response(200, {}));
    const client = new Amp2HttpClient(testConfig({ authMode: "legacy-session-body" }), testLogger, fetcher); await client.call("Core", "GetStatus");
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toHaveProperty("SESSIONID", "session-12345678"); expect(fetcher.mock.calls[1]![1].headers.authorization).toBeUndefined();
  });
  it("accepts AMP's displayed username-prefixed service token", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(200, { success: true, sessionID: "session-12345678" })).mockResolvedValueOnce(response(200, {}));
    const client = new Amp2HttpClient(testConfig({ username: "mcp", password: "", loginToken: "mcp:service-token" }), testLogger, fetcher);
    await client.call("Core", "GetStatus");
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({ username: "mcp", password: "", token: "service-token" });
  });
  it("uses an ADS management grant to authenticate to a managed instance", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(200, { success: true, sessionID: "controller-session" }))
      .mockResolvedValueOnce(response(200, { Status: true, Result: "instance-login-grant" }))
      .mockResolvedValueOnce(response(200, { success: true, sessionID: "instance-session-1" }))
      .mockResolvedValueOnce(response(200, { State: 20 }));
    const client = new Amp2HttpClient(testConfig(), testLogger, fetcher);
    expect(await client.call("Core", "GetStatus", {}, "instance-1", true)).toEqual({ State: 20 });
    expect(fetcher.mock.calls[1]![0]).toBe("https://amp.example.test/API/ADSModule/ManageInstance");
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({ InstanceId: "instance-1" });
    expect(fetcher.mock.calls[1]![1].headers.authorization).toBe("Bearer controller-session");
    expect(fetcher.mock.calls[2]![0]).toBe("https://amp.example.test/API/ADSModule/Servers/instance-1/API/Core/Login");
    expect(JSON.parse(fetcher.mock.calls[2]![1].body)).toMatchObject({ username: "mcp", password: "", token: "instance-login-grant" });
    expect(fetcher.mock.calls[2]![1].headers.authorization).toBeUndefined();
    expect(fetcher.mock.calls[3]![1].headers.authorization).toBe("Bearer instance-session-1");
  });
  it("provides a useful error when AMP rejects login without a reason", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(200, { result: 0, resultReason: "", success: false, sessionID: null }));
    const client = new Amp2HttpClient(testConfig(), testLogger, fetcher);
    await expect(client.call("Core", "GetStatus")).rejects.toMatchObject({ code: "AMP_AUTHENTICATION_FAILED", message: "AMP rejected the login" });
  });
  it("rejects arbitrary endpoint syntax", async () => { const client = new Amp2HttpClient(testConfig(), testLogger, vi.fn()); await expect(client.call("../evil", "Get")).rejects.toMatchObject({ code: "AMP_INVALID_PARAMETERS" }); });
});
