import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ToolContext } from "../tools/context.js";
import { buildServer } from "./server.js";

export async function startStdio(context: ToolContext): Promise<void> {
  const server = buildServer(context); const transport = new StdioServerTransport(); await server.connect(transport);
  context.logger.info("MCP stdio transport connected");
  const shutdown = () => { void server.close().finally(() => process.exit(0)); };
  process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown);
}
