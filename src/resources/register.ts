import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AmpProvider } from "../amp/provider.js";

export function registerResources(server: McpServer, provider: AmpProvider): void {
  staticJson(server, "amp-targets", "amp://targets", "ADS targets", () => provider.listTargets());
  staticJson(server, "amp-instances", "amp://instances", "AMP instances", () => provider.listInstances());
  staticJson(server, "amp-api-spec", "amp://api/spec", "Controller live API specification", () => provider.getApiSpec());
  const completion = async (value: string) => (await provider.listInstances()).map((i) => i.id).filter((id) => id.toLowerCase().includes(value.toLowerCase())).slice(0, 100);
  server.registerResource("amp-instance-status", new ResourceTemplate("amp://instances/{instanceId}/status", { list: undefined, complete: { instanceId: completion } }), { title: "AMP instance status", description: "Live status and consolidated metrics for one instance", mimeType: "application/json" }, async (uri, variables) => jsonResource(uri.toString(), await provider.getInstanceStatus(String(variables.instanceId))));
  server.registerResource("amp-instance-settings", new ResourceTemplate("amp://instances/{instanceId}/settings", { list: undefined, complete: { instanceId: completion } }), { title: "AMP instance settings", description: "Cached dynamic setting specification for one module", mimeType: "application/json" }, async (uri, variables) => jsonResource(uri.toString(), await provider.getSettings(String(variables.instanceId))));
  server.registerResource("amp-instance-api-spec", new ResourceTemplate("amp://instances/{instanceId}/api/spec", { list: undefined, complete: { instanceId: completion } }), { title: "AMP instance API specification", description: "Live API modules and methods for one AMP instance", mimeType: "application/json" }, async (uri, variables) => jsonResource(uri.toString(), await provider.getApiSpec(String(variables.instanceId))));
}

function staticJson(server: McpServer, name: string, uri: string, title: string, loader: () => Promise<unknown>): void {
  server.registerResource(name, uri, { title, mimeType: "application/json" }, async () => jsonResource(uri, await loader()));
}
function jsonResource(uri: string, value: unknown) { return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(value, null, 2) }] }; }
