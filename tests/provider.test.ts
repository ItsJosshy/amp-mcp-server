import { describe, expect, it } from "vitest";
import { Amp2Provider } from "../src/amp/amp2/provider.js";
import { testConfig, testLogger } from "./helpers.js";

describe("dynamic API validation", () => {
  const calls: unknown[] = [];
  const client = { call: async (module: string, method: string, parameters: object) => { calls.push({ module, method, parameters }); if (method === "GetAPISpec") return { Core: { GetStatus: { Parameters: [] }, SetConfig: { Parameters: [{ Name: "node", Optional: false }, { Name: "value", Optional: false }] } } }; return { ok: true }; }, close: async () => undefined } as any;
  const provider = new Amp2Provider(client, testConfig(), testLogger);
  it("accepts parameters from the live spec", async () => expect(await provider.callApi("Core", "SetConfig", { node: "x", value: "y" })).toEqual({ ok: true }));
  it("rejects unknown methods", async () => await expect(provider.callApi("Core", "NoSuchMethod", {})).rejects.toMatchObject({ code: "AMP_INVALID_API_METHOD" }));
  it("rejects missing or extra parameters", async () => { await expect(provider.callApi("Core", "SetConfig", { node: "x" })).rejects.toMatchObject({ code: "AMP_INVALID_PARAMETERS" }); await expect(provider.callApi("Core", "GetStatus", { surprise: true })).rejects.toMatchObject({ code: "AMP_INVALID_PARAMETERS" }); });
});
