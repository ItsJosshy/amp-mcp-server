import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "pino";
import type { z } from "zod";
import type { AmpInstMgrAdapter } from "../amp/amp2/cli.js";
import type { AmpProvider } from "../amp/provider.js";
import type { Config } from "../config/config.js";
import { AmpError, normalizeError } from "../errors/amp-error.js";
import { redact } from "../logging/logger.js";
import { RiskLevel, type SecurityPolicy } from "../security/policy.js";

export interface ToolContext { provider: AmpProvider; cli: AmpInstMgrAdapter; config: Config; policy: SecurityPolicy; logger: Logger; audit: Logger }
type Shape = Record<string, z.ZodType>;

export function registerTool<T extends Shape>(server: McpServer, context: ToolContext, name: string, options: {
  title: string; description: string; risk: RiskLevel; schema: T;
}, handler: (args: z.infer<z.ZodObject<T>>) => Promise<unknown> | unknown): void {
  const description = `${options.description}\nRisk: ${options.risk}. Required server policy: ${requiredPolicy(options.risk)}.`;
  server.registerTool(name, {
    title: options.title, description, inputSchema: options.schema,
    annotations: { readOnlyHint: options.risk === RiskLevel.READ_ONLY, destructiveHint: options.risk === RiskLevel.DESTRUCTIVE || options.risk === RiskLevel.HOST_PRIVILEGED, idempotentHint: options.risk === RiskLevel.READ_ONLY }
  }, (async (args: any) => {
    const started = Date.now(); const dryRun = args?.dryRun === true;
    try {
      if (!dryRun) context.policy.assertAllowed(options.risk);
      const result = await handler(args);
      if (options.risk !== RiskLevel.READ_ONLY) context.audit.info({ timestamp: new Date().toISOString(), tool: name, risk: options.risk, parameters: redact(args), outcome: "success", durationMs: Date.now() - started }, "AMP mutation audit");
      return response({ success: true, data: result });
    } catch (error) {
      const normalized = normalizeError(error);
      if (options.risk !== RiskLevel.READ_ONLY) context.audit.error({ timestamp: new Date().toISOString(), tool: name, risk: options.risk, parameters: redact(args), outcome: "error", durationMs: Date.now() - started, error: normalized.toJSON() }, "AMP mutation audit");
      context.logger.error({ tool: name, error: normalized.toJSON() }, "Tool failed");
      return { ...response({ success: false, error: normalized.toJSON() }), isError: true };
    }
  }) as any);
}

export function response(payload: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }], structuredContent: payload };
}

export function dryRun(args: { dryRun?: boolean }, description: Record<string, unknown>, execute: () => Promise<unknown>): Promise<unknown> {
  if (args.dryRun) return Promise.resolve({ dryRun: true, validation: "passed", ...description });
  return execute();
}

export function assertGenericEnabled(context: ToolContext): void {
  if (!context.config.enableGenericApi) throw new AmpError("AMP_SAFETY_POLICY_DENIED", "Generic AMP API access is disabled by AMP_ENABLE_GENERIC_API");
}

function requiredPolicy(risk: RiskLevel): string {
  if (risk === RiskLevel.READ_ONLY) return "none";
  if (risk === RiskLevel.LOW_RISK_WRITE) return "AMP_ALLOW_WRITES=true";
  if (risk === RiskLevel.INSTANCE_DISRUPTIVE) return "AMP_ALLOW_WRITES=true and AMP_ALLOW_DISRUPTIVE=true";
  if (risk === RiskLevel.DESTRUCTIVE) return "AMP_ALLOW_WRITES=true and AMP_ALLOW_DESTRUCTIVE=true";
  return "AMP_ALLOW_WRITES=true and AMP_ALLOW_HOST_PRIVILEGED=true";
}
