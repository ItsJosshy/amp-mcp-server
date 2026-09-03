import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AmpInstMgrAdapter } from "../src/amp/amp2/cli.js";
import type { AmpProvider } from "../src/amp/provider.js";
import { SecurityPolicy } from "../src/security/policy.js";
import { buildServer } from "../src/server/server.js";
import { testConfig, testLogger } from "./helpers.js";

describe("MCP protocol surface", () => {
  let client: Client; let server: ReturnType<typeof buildServer>;
  beforeEach(async () => {
    const config = testConfig();
    const provider = {
      health: async () => ({ healthy: true }), listTargets: async () => [], listInstances: async () => [], getApiSpec: async () => ({}), describeApiMethod: async () => ({ Parameters: [] }),
    } as unknown as AmpProvider;
    server = buildServer({ provider, cli: new AmpInstMgrAdapter(config), config, policy: new SecurityPolicy(config), logger: testLogger, audit: testLogger });
    client = new Client({ name: "test-client", version: "1" }); const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport as unknown as Transport), client.connect(clientTransport as unknown as Transport)]);
  });
  afterEach(async () => { await client.close(); await server.close(); });
  it("publishes the comprehensive curated surface", async () => { const tools = await client.listTools(); expect(tools.tools.length).toBeGreaterThanOrEqual(100); expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(["amp_health", "amp_call_api", "amp_create_backup", "amp_update_amp"])); });
  it("publishes fixed resources and templates without contacting AMP", async () => { expect((await client.listResources()).resources.map((r) => r.uri)).toEqual(["amp://targets", "amp://instances", "amp://api/spec"]); expect((await client.listResourceTemplates()).resourceTemplates).toHaveLength(3); });
  it("returns structured tool results", async () => { const result = await client.callTool({ name: "amp_health", arguments: {} }); expect(result.structuredContent).toEqual({ success: true, data: { healthy: true } }); });
  it("blocks authentication-material methods from the generic escape hatch", async () => { const result = await client.callTool({ name: "amp_call_api", arguments: { module: "Core", method: "Login", parameters: {} } }); expect(result.isError).toBe(true); expect(result.structuredContent).toMatchObject({ success: false, error: { code: "AMP_SAFETY_POLICY_DENIED" } }); });
});
