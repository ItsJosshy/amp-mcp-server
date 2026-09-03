import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerResources } from "../resources/register.js";
import { registerAdminTools } from "../tools/admin.js";
import { registerApiTools } from "../tools/api.js";
import { registerBackupTools } from "../tools/backups.js";
import { registerCliTools } from "../tools/cli.js";
import { registerConsoleTools } from "../tools/console.js";
import type { ToolContext } from "../tools/context.js";
import { registerDiscoveryTools } from "../tools/discovery.js";
import { registerFileTools } from "../tools/files.js";
import { registerInstanceManagementTools } from "../tools/instances.js";
import { registerLifecycleTools } from "../tools/lifecycle.js";
import { registerPlayerTools } from "../tools/players.js";
import { registerSchedulerTools } from "../tools/scheduler.js";
import { registerSettingsTools } from "../tools/settings.js";

export const SERVER_INFO = { name: "amp-mcp-server", version: "0.1.0" };
export function buildServer(context: ToolContext): McpServer {
  const server = new McpServer(SERVER_INFO, { capabilities: { logging: {}, resources: { listChanged: false } } });
  registerDiscoveryTools(server, context); registerLifecycleTools(server, context); registerConsoleTools(server, context);
  registerSettingsTools(server, context); registerApiTools(server, context); registerFileTools(server, context);
  registerBackupTools(server, context); registerPlayerTools(server, context); registerInstanceManagementTools(server, context);
  registerAdminTools(server, context); registerSchedulerTools(server, context); registerCliTools(server, context);
  registerResources(server, context.provider); return server;
}
