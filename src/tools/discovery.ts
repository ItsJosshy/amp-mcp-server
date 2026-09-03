import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RiskLevel } from "../security/policy.js";
import { registerTool, type ToolContext } from "./context.js";
import { instanceId } from "./schemas.js";

export function registerDiscoveryTools(server: McpServer, ctx: ToolContext): void {
  registerTool(server, ctx, "amp_health", { title: "Check AMP health", description: "Authenticate and check controller connectivity, latency, provider, and TLS mode.", risk: RiskLevel.READ_ONLY, schema: {} }, () => ctx.provider.health());
  registerTool(server, ctx, "amp_server_info", { title: "Get AMP server information", description: "Return module and AMP version metadata advertised by the controller.", risk: RiskLevel.READ_ONLY, schema: {} }, () => ctx.provider.serverInfo());
  registerTool(server, ctx, "amp_list_targets", { title: "List ADS targets", description: "List controller and connected ADS targets/nodes.", risk: RiskLevel.READ_ONLY, schema: {} }, () => ctx.provider.listTargets());
  registerTool(server, ctx, "amp_list_instances", { title: "List AMP instances", description: "List all AMP instances across targets using stable IDs.", risk: RiskLevel.READ_ONLY, schema: {} }, () => ctx.provider.listInstances());
  registerTool(server, ctx, "amp_get_instance", { title: "Get AMP instance", description: "Get normalized metadata for one stable AMP instance ID.", risk: RiskLevel.READ_ONLY, schema: { instanceId } }, ({ instanceId }) => ctx.provider.getInstance(instanceId));
  registerTool(server, ctx, "amp_get_instance_status", { title: "Get instance status and metrics", description: "Get live state, uptime, application metrics, CPU, memory, network and player data AMP exposes.", risk: RiskLevel.READ_ONLY, schema: { instanceId } }, ({ instanceId }) => ctx.provider.getInstanceStatus(instanceId));
  registerTool(server, ctx, "amp_get_metrics", { title: "Get instance metrics", description: "Get the live consolidated status/metrics payload. Metric keys vary by AMP module.", risk: RiskLevel.READ_ONLY, schema: { instanceId } }, ({ instanceId }) => ctx.provider.getInstanceStatus(instanceId));
  registerTool(server, ctx, "amp_search_instances", { title: "Search AMP instances", description: "Search names, descriptions, modules, targets and IDs locally after one discovery call.", risk: RiskLevel.READ_ONLY, schema: { query: z.string().min(1).max(200), module: z.string().optional(), running: z.boolean().optional(), limit: z.number().int().min(1).max(200).default(50) } }, async ({ query, module, running, limit }) => {
    const q = query.toLowerCase(); return (await ctx.provider.listInstances()).filter((i) => (!module || i.module.toLowerCase() === module.toLowerCase()) && (running === undefined || i.running === running) && JSON.stringify(i).toLowerCase().includes(q)).slice(0, limit);
  });
  registerTool(server, ctx, "amp_get_capabilities", { title: "Discover instance capabilities", description: "Infer supported operations from the instance's live API specification; do not assume all games support the same features.", risk: RiskLevel.READ_ONLY, schema: { instanceId, refresh: z.boolean().default(false) } }, ({ instanceId, refresh }) => ctx.provider.getCapabilities(instanceId, refresh));
}
