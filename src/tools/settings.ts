import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateSettingValue } from "../amp/amp2/settings.js";
import { RiskLevel } from "../security/policy.js";
import { dryRun, registerTool, type ToolContext } from "./context.js";
import { dryRunField, instanceId } from "./schemas.js";

export function registerSettingsTools(server: McpServer, ctx: ToolContext): void {
  registerTool(server, ctx, "amp_get_settings", { title: "Get dynamic instance settings", description: "Return module-specific setting metadata from Core/GetSettingsSpec. Values and fields vary across games.", risk: RiskLevel.READ_ONLY, schema: { instanceId, refresh: z.boolean().default(false) } }, ({ instanceId, refresh }) => ctx.provider.getSettings(instanceId, refresh));
  registerTool(server, ctx, "amp_list_setting_categories", { title: "List setting categories", description: "List distinct categories discovered from an instance's live settings specification.", risk: RiskLevel.READ_ONLY, schema: { instanceId } }, async ({ instanceId }) => [...new Set((await ctx.provider.getSettings(instanceId)).map((s) => s.category ?? "Uncategorized"))].sort());
  registerTool(server, ctx, "amp_search_settings", { title: "Search dynamic settings", description: "Search keys, names and descriptions in an instance's live module-specific settings.", risk: RiskLevel.READ_ONLY, schema: { instanceId, query: z.string().min(1).max(200), category: z.string().optional(), limit: z.number().int().min(1).max(500).default(100) } }, async ({ instanceId, query, category, limit }) => { const q = query.toLowerCase(); return (await ctx.provider.getSettings(instanceId)).filter((s) => (!category || s.category === category) && `${s.key} ${s.displayName ?? ""} ${s.description ?? ""}`.toLowerCase().includes(q)).slice(0, limit); });
  const one = (name: string) => registerTool(server, ctx, name, { title: "Describe/get one AMP setting", description: "Return live metadata and current value for an exact AMP setting node.", risk: RiskLevel.READ_ONLY, schema: { instanceId, key: z.string().min(1).max(256) } }, ({ instanceId, key }) => ctx.provider.getSetting(instanceId, key));
  one("amp_get_setting"); one("amp_describe_setting");
  registerTool(server, ctx, "amp_set_setting", { title: "Set validated AMP setting", description: "Validate a value against live setting metadata, then invoke Core/SetConfig. Returns whether AMP says restart is required.", risk: RiskLevel.LOW_RISK_WRITE, schema: { instanceId, key: z.string().min(1).max(256), value: z.union([z.string(), z.number(), z.boolean()]), ...dryRunField } }, async (args) => {
    const setting = await ctx.provider.getSetting(args.instanceId, args.key); validateSettingValue(setting, args.value);
    return dryRun(args, { target: args.instanceId, setting, newValue: args.value, apiAction: "Core/SetConfig" }, () => ctx.provider.setSetting(args.instanceId, args.key, args.value));
  });
}
