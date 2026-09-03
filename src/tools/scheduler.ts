import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RiskLevel } from "../security/policy.js";
import { dryRun, registerTool, type ToolContext } from "./context.js";
import { dryRunField, instanceId } from "./schemas.js";

const triggerId = z.string().min(1).max(128);
const numberList = z.array(z.number().int()).max(100);
const interval = { months: numberList, days: numberList, hours: numberList, minutes: numberList, daysOfMonth: numberList, description: z.string().min(1).max(500) };
const call = (ctx: ToolContext, instanceId: string, method: string, parameters: Record<string, unknown> = {}, idempotent = false) => ctx.provider.callApi("Core", method, parameters, { instanceId, idempotent });

export function registerSchedulerTools(server: McpServer, ctx: ToolContext): void {
  registerTool(server, ctx, "amp_list_schedules", { title: "List AMP schedules", description: "Return triggers and scheduled tasks from Core/GetScheduleData for one instance.", risk: RiskLevel.READ_ONLY, schema: { instanceId } }, ({ instanceId }) => call(ctx, instanceId, "GetScheduleData", {}, true));
  registerTool(server, ctx, "amp_get_schedule", { title: "Get AMP schedule", description: "Find one trigger in AMP's schedule data by stable trigger ID.", risk: RiskLevel.READ_ONLY, schema: { instanceId, triggerId } }, async ({ instanceId, triggerId }) => findDeep(await call(ctx, instanceId, "GetScheduleData", {}, true), triggerId));
  registerTool(server, ctx, "amp_create_schedule", { title: "Create AMP interval schedule", description: "Create an interval trigger. Add tasks with amp_call_api Core/AddTask after selecting a MethodID from Core/GetUserActionsSpec.", risk: RiskLevel.LOW_RISK_WRITE, schema: { instanceId, ...interval, ...dryRunField } }, (args) => dryRun(args, { target: args.instanceId, interval: pickInterval(args), apiAction: "Core/AddIntervalTrigger" }, () => call(ctx, args.instanceId, "AddIntervalTrigger", apiInterval(args))));
  registerTool(server, ctx, "amp_update_schedule", { title: "Update AMP interval schedule", description: "Edit an existing interval trigger. Scheduled task editing remains available through the validated generic API.", risk: RiskLevel.LOW_RISK_WRITE, schema: { instanceId, triggerId, ...interval, ...dryRunField } }, (args) => dryRun(args, { target: args.instanceId, triggerId: args.triggerId, interval: pickInterval(args), apiAction: "Core/EditIntervalTrigger" }, () => call(ctx, args.instanceId, "EditIntervalTrigger", { Id: args.triggerId, ...apiInterval(args) })));
  registerTool(server, ctx, "amp_delete_schedule", { title: "Delete AMP schedule", description: "Delete a trigger and its associated tasks.", risk: RiskLevel.DESTRUCTIVE, schema: { instanceId, triggerId, ...dryRunField } }, (args) => dryRun(args, { target: args.instanceId, triggerId: args.triggerId, apiAction: "Core/DeleteTrigger" }, () => call(ctx, args.instanceId, "DeleteTrigger", { TriggerID: args.triggerId })));
  const toggle = (name: string, enabled: boolean) => registerTool(server, ctx, name, { title: `${enabled ? "Enable" : "Disable"} AMP schedule`, description: "Change an AMP scheduler trigger's enabled state.", risk: RiskLevel.LOW_RISK_WRITE, schema: { instanceId, triggerId, ...dryRunField } }, (args) => dryRun(args, { target: args.instanceId, triggerId: args.triggerId, enabled, apiAction: "Core/SetTriggerEnabled" }, () => call(ctx, args.instanceId, "SetTriggerEnabled", { Id: args.triggerId, Enabled: enabled })));
  toggle("amp_enable_schedule", true); toggle("amp_disable_schedule", false);
}

function apiInterval(v: any) { return { months: v.months, days: v.days, hours: v.hours, minutes: v.minutes, daysOfMonth: v.daysOfMonth, description: v.description }; }
function pickInterval(v: any) { return apiInterval(v); }
function findDeep(value: unknown, id: string): unknown {
  if (Array.isArray(value)) { for (const item of value) { const found = findDeep(item, id); if (found !== undefined) return found; } }
  else if (value && typeof value === "object") { const o = value as Record<string, unknown>; if ([o.Id, o.ID, o.TriggerID, o.TriggerId].some((v) => v === id)) return o; for (const child of Object.values(o)) { const found = findDeep(child, id); if (found !== undefined) return found; } }
  return undefined;
}
