import { timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { ToolContext } from "../tools/context.js";
import { buildServer } from "./server.js";

export async function startHttp(context: ToolContext): Promise<void> {
  const { config } = context; const remoteBind = config.httpHost === "0.0.0.0" || config.httpHost === "::";
  if (remoteBind && !config.httpBearerToken && !config.httpAllowInsecureRemote) throw new Error("Refusing unauthenticated all-interface MCP HTTP binding; set MCP_HTTP_BEARER_TOKEN or explicitly MCP_HTTP_ALLOW_INSECURE_REMOTE=true");
  const app = createMcpExpressApp(config.httpAllowedHosts.length ? { host: config.httpHost, allowedHosts: config.httpAllowedHosts } : { host: config.httpHost });
  app.get("/health", (_req: Request, res: Response) => { res.status(200).json({ status: "ok" }); });
  app.post("/mcp", (req: Request, res: Response, next) => {
    const origin = req.header("origin");
    if (origin && config.httpAllowedOrigins.length && !config.httpAllowedOrigins.includes(origin)) { res.status(403).json({ jsonrpc: "2.0", error: { code: -32000, message: "Forbidden origin" }, id: null }); return; }
    if (!config.httpBearerToken) { next(); return; }
    const received = req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? ""; const a = Buffer.from(received); const b = Buffer.from(config.httpBearerToken);
    if (a.length !== b.length || !timingSafeEqual(a, b)) { res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null }); return; } next();
  }, async (req: Request, res: Response) => {
    const server = buildServer(context); const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined } as any);
    res.on("close", () => { void transport.close(); void server.close(); });
    try { await server.connect(transport as unknown as Transport); await transport.handleRequest(req, res, req.body); }
    catch (error) { context.logger.error({ error }, "MCP HTTP request failed"); if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null }); }
  });
  app.all("/mcp", (_req: Request, res: Response) => { res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Stateless endpoint accepts POST only" }, id: null }); });
  const listener = app.listen(config.httpPort, config.httpHost, () => context.logger.info({ host: config.httpHost, port: config.httpPort }, "MCP HTTP transport listening"));
  const shutdown = () => listener.close(() => process.exit(0)); process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown);
}
