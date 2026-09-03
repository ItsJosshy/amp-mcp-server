import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RiskLevel } from "../security/policy.js";
import { dryRun, registerTool, type ToolContext } from "./context.js";
import { dryRunField, instanceId, targetId, waitFields } from "./schemas.js";

export function registerLifecycleTools(server: McpServer, ctx: ToolContext): void {
  const action = (name: string, verb: "start" | "stop" | "restart" | "kill" | "sleep" | "update", risk: RiskLevel) => registerTool(server, ctx, name, {
    title: `${verb[0]!.toUpperCase()}${verb.slice(1)} AMP instance`, description: `${verb} one AMP application instance.`, risk,
    schema: { instanceId, ...waitFields, ...dryRunField }
  }, async (args) => { const instance = await ctx.provider.getInstance(args.instanceId); return dryRun(args, { target: instance, operation: verb, apiAction: verb === "start" || verb === "stop" || verb === "restart" ? `ADSModule/${verb[0]!.toUpperCase()}${verb.slice(1)}Instance` : `Core/${verb}` }, () => ctx.provider.lifecycle(args.instanceId, verb, args)); });
  action("amp_start_instance", "start", RiskLevel.LOW_RISK_WRITE);
  action("amp_stop_instance", "stop", RiskLevel.INSTANCE_DISRUPTIVE);
  action("amp_restart_instance", "restart", RiskLevel.INSTANCE_DISRUPTIVE);
  action("amp_kill_instance", "kill", RiskLevel.DESTRUCTIVE);
  action("amp_sleep_instance", "sleep", RiskLevel.INSTANCE_DISRUPTIVE);
  action("amp_update_application", "update", RiskLevel.INSTANCE_DISRUPTIVE);
  action("amp_update_instance", "update", RiskLevel.INSTANCE_DISRUPTIVE);
  const all = (name: string, verb: "start" | "stop", risk: RiskLevel) => registerTool(server, ctx, name, { title: `${verb} all target instances`, description: `${verb} all AMP instances belonging to one ADS target.`, risk, schema: { targetId, ...dryRunField } }, (args) => dryRun(args, { targetId: args.targetId, operation: `${verb}-all`, apiAction: `ADSModule/${verb === "start" ? "Start" : "Stop"}AllInstances` }, () => ctx.provider.lifecycleAll(args.targetId, verb)));
  all("amp_start_all", "start", RiskLevel.LOW_RISK_WRITE); all("amp_stop_all", "stop", RiskLevel.INSTANCE_DISRUPTIVE);
}
