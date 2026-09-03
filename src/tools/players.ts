import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AmpError } from "../errors/amp-error.js";
import { RiskLevel } from "../security/policy.js";
import { dryRun, registerTool, type ToolContext } from "./context.js";
import { dryRunField, instanceId } from "./schemas.js";

export function registerPlayerTools(server: McpServer, ctx: ToolContext): void {
  registerTool(server, ctx, "amp_list_players", { title: "List connected players", description: "Return the module's in-application user/player map from Core/GetUserList.", risk: RiskLevel.READ_ONLY, schema: { instanceId } }, ({ instanceId }) => ctx.provider.callApi("Core", "GetUserList", {}, { instanceId, idempotent: true }));
  registerTool(server, ctx, "amp_get_player", { title: "Find connected player", description: "Find entries whose ID or name contains the supplied text.", risk: RiskLevel.READ_ONLY, schema: { instanceId, query: z.string().min(1).max(128) } }, async ({ instanceId, query }) => { const players = await ctx.provider.callApi("Core", "GetUserList", {}, { instanceId, idempotent: true }); const q = query.toLowerCase(); return Object.entries(players && typeof players === "object" ? players as Record<string, unknown> : {}).filter(([id, player]) => `${id} ${JSON.stringify(player)}`.toLowerCase().includes(q)); });
  const operation = (name: string, methods: string[], risk: RiskLevel) => registerTool(server, ctx, name, { title: name.replaceAll("_", " "), description: "Use an advertised module-specific player API method. Returns unsupported capability rather than guessing a game console command.", risk, schema: { instanceId, playerId: z.string().min(1).max(256), ...dryRunField } }, async (args) => {
    const spec = await ctx.provider.getApiSpec(args.instanceId); let selected: { module: string; method: string; parameter: string } | undefined;
    for (const method of methods) for (const [module, moduleMethods] of Object.entries(spec)) { const found = moduleMethods[method]; const first = found?.Parameters?.[0]?.Name; if (found && first) { selected = { module, method, parameter: first }; break; } }
    if (!selected) throw new AmpError("AMP_UNSUPPORTED_CAPABILITY", `${name} is not advertised by this instance module`, { instanceId: args.instanceId });
    return dryRun(args, { target: args.instanceId, playerId: args.playerId, apiAction: `${selected.module}/${selected.method}` }, () => ctx.provider.callApi(selected!.module, selected!.method, { [selected!.parameter]: args.playerId }, { instanceId: args.instanceId }));
  });
  operation("amp_kick_player", ["KickUserByID", "KickPlayer"], RiskLevel.LOW_RISK_WRITE);
  operation("amp_ban_player", ["BanUserByID", "BanPlayer"], RiskLevel.DESTRUCTIVE);
  operation("amp_whitelist_player", ["AddToWhitelist"], RiskLevel.LOW_RISK_WRITE);
  operation("amp_unwhitelist_player", ["RemoveWhitelistEntry"], RiskLevel.LOW_RISK_WRITE);
}
