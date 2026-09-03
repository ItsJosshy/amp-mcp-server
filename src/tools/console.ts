import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RiskLevel } from "../security/policy.js";
import { registerTool, type ToolContext } from "./context.js";
import { instanceId } from "./schemas.js";

export function registerConsoleTools(server: McpServer, ctx: ToolContext): void {
  const get = (name: string) => registerTool(server, ctx, name, { title: "Get recent AMP console events", description: "Return console/status deltas since the current AMP session last called Core/GetUpdates. AMP 2.7.2+ uses native WebSockets in its UI, but MCP request/response clients receive an on-demand snapshot.", risk: RiskLevel.READ_ONLY, schema: { instanceId, maxEntries: z.number().int().min(1).max(5000).default(200) } }, async ({ instanceId, maxEntries }) => trimConsole(await ctx.provider.getConsole(instanceId), maxEntries));
  get("amp_get_console"); get("amp_get_recent_console");
  registerTool(server, ctx, "amp_send_console", { title: "Send instance console command", description: "Send a game/application console line exactly as supplied. Commands can have game-specific side effects.", risk: RiskLevel.LOW_RISK_WRITE, schema: { instanceId, message: z.string().min(1).max(8192) } }, ({ instanceId, message }) => ctx.provider.sendConsole(instanceId, message));
}

function trimConsole(value: unknown, max: number): unknown {
  if (!value || typeof value !== "object") return value; const obj = value as Record<string, unknown>;
  for (const key of ["ConsoleEntries", "consoleEntries", "ConsoleOutput", "consoleOutput"]) if (Array.isArray(obj[key])) return { ...obj, [key]: (obj[key] as unknown[]).slice(-max) };
  return value;
}
