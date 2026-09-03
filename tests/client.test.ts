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
  it("rejects arbitrary endpoint syntax", async () => { const client = new Amp2HttpClient(testConfig(), testLogger, vi.fn()); await expect(client.call("../evil", "Get")).rejects.toMatchObject({ code: "AMP_INVALID_PARAMETERS" }); });
});
