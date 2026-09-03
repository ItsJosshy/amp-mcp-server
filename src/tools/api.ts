import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AmpError, normalizeError } from "../errors/amp-error.js";
import { redact } from "../logging/logger.js";
import { classifyApiMethod, RiskLevel } from "../security/policy.js";
import { assertGenericEnabled, registerTool, response, type ToolContext } from "./context.js";
import { apiAddress, instanceId } from "./schemas.js";

export function registerApiTools(server: McpServer, ctx: ToolContext): void {
  registerTool(server, ctx, "amp_list_api_modules", { title: "List live AMP API modules", description: "List API modules advertised by Core/GetAPISpec for the controller or an instance.", risk: RiskLevel.READ_ONLY, schema: { instanceId: instanceId.optional() } }, ({ instanceId }) => { assertGenericEnabled(ctx); return ctx.provider.listApiModules(instanceId); });
  registerTool(server, ctx, "amp_describe_api_method", { title: "Describe live AMP API method", description: "Return parameters, types, optionality, description and return type from the endpoint's live Core/GetAPISpec.", risk: RiskLevel.READ_ONLY, schema: apiAddress }, ({ module, method, instanceId }) => { assertGenericEnabled(ctx); return ctx.provider.describeApiMethod(module, method, instanceId); });
  registerTool(server, ctx, "amp_search_api", { title: "Search live AMP API", description: "Search module names, method names, descriptions and parameter names in the live API spec.", risk: RiskLevel.READ_ONLY, schema: { instanceId: instanceId.optional(), query: z.string().min(1).max(200), limit: z.number().int().min(1).max(200).default(50) } }, async ({ instanceId, query, limit }) => {
    assertGenericEnabled(ctx); const spec = await ctx.provider.getApiSpec(instanceId); const q = query.toLowerCase(); const matches = [];
    for (const [module, methods] of Object.entries(spec)) for (const [method, description] of Object.entries(methods)) if (`${module} ${method} ${description.Description ?? ""} ${(description.Parameters ?? []).map((p) => p.Name).join(" ")}`.toLowerCase().includes(q)) matches.push({ module, method, ...description });
    return matches.slice(0, limit);
  });
  registerTool(server, ctx, "amp_invalidate_cache", { title: "Invalidate AMP metadata cache", description: "Drop cached API specs, settings metadata and capabilities. No AMP state is changed.", risk: RiskLevel.READ_ONLY, schema: { instanceId: instanceId.optional() } }, ({ instanceId }) => { ctx.provider.invalidateCache(instanceId); return { invalidated: instanceId ?? "all" }; });

  server.registerTool("amp_call_api", {
    title: "Call validated live AMP API method",
    description: "Controlled long-tail escape hatch. Calls only a module/method advertised by the endpoint's live Core/GetAPISpec; it cannot request arbitrary URLs. Read calls require AMP_ENABLE_GENERIC_API. Writes also require AMP_GENERIC_API_ALLOW_WRITES and the matching risk policy.",
    inputSchema: { ...apiAddress, parameters: z.record(z.string(), z.unknown()).default({}), dryRun: z.boolean().default(false) },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false }
  }, async (args) => {
    const started = Date.now();
    try {
      assertGenericEnabled(ctx); assertNotSensitiveAuthMethod(args.module, args.method); const spec = await ctx.provider.describeApiMethod(args.module, args.method, args.instanceId); validateDryRunParameters(spec.Parameters ?? [], args.parameters, args.module, args.method); const risk = classifyApiMethod(args.method);
      if (risk !== RiskLevel.READ_ONLY && !ctx.config.genericApiAllowWrites) throw new AmpError("AMP_SAFETY_POLICY_DENIED", "Generic API writes are disabled by AMP_GENERIC_API_ALLOW_WRITES", { details: { risk } });
      if (!args.dryRun) ctx.policy.assertAllowed(risk);
      if (args.dryRun) return response({ success: true, data: { dryRun: true, validation: "passed", target: args.instanceId ?? "controller", module: args.module, method: args.method, parameters: redact(args.parameters), risk, advertisedMethod: spec } });
      const result = await ctx.provider.callApi(args.module, args.method, args.parameters, { ...(args.instanceId ? { instanceId: args.instanceId } : {}), idempotent: risk === RiskLevel.READ_ONLY });
      if (risk !== RiskLevel.READ_ONLY) ctx.audit.info({ timestamp: new Date().toISOString(), tool: "amp_call_api", target: args.instanceId ?? "controller", ampModule: args.module, ampMethod: args.method, risk, parameters: redact(args.parameters), outcome: "success", durationMs: Date.now() - started }, "AMP mutation audit");
      return response({ success: true, data: sanitizeGenericResult(result, args.module, args.method, args.parameters) });
    } catch (error) {
      const normalized = normalizeError(error); ctx.audit.error({ timestamp: new Date().toISOString(), tool: "amp_call_api", parameters: redact(args), outcome: "error", durationMs: Date.now() - started, error: normalized.toJSON() }, "AMP API audit");
      return { ...response({ success: false, error: normalized.toJSON() }), isError: true };
    }
  });
}

const blockedAuthMethods = new Set(["Login", "GetRemoteLoginToken", "OIDCLogin", "GetOIDCLoginURL", "GetWebauthnChallenge", "ManageInstance", "GetTargetPairingCode", "HandoutInstanceConfigs"]);
function assertNotSensitiveAuthMethod(module: string, method: string): void {
  if (blockedAuthMethods.has(method)) throw new AmpError("AMP_SAFETY_POLICY_DENIED", `${module}/${method} is blocked from the generic tool because its response can contain authentication material`);
}

const sensitiveName = /password|secret|token|api.?key|private.?key|credential|licen[cs]e.?key/i;
const secretResponseKey = /password|session|token|secret|credential|authorization|pairing.?code/i;
function sanitizeGenericResult(value: unknown, module: string, method: string, parameters: Record<string, unknown>): unknown {
  if (module.toLowerCase() === "core" && /^GetConfigs?$/i.test(method)) {
    const nodes = parameters.node ?? parameters.nodes;
    if ((typeof nodes === "string" && sensitiveName.test(nodes)) || (Array.isArray(nodes) && nodes.some((node) => typeof node === "string" && sensitiveName.test(node)))) return "[REDACTED]";
  }
  return sanitizeObject(value);
}
function sanitizeObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeObject);
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value); const sensitiveSetting = entries.some(([key, item]) => /^(node|key|setting)$/i.test(key) && typeof item === "string" && sensitiveName.test(item));
  return Object.fromEntries(entries.map(([key, item]) => [key, secretResponseKey.test(key) || (sensitiveSetting && /^(value|currentValue|defaultValue|result)$/i.test(key)) ? "[REDACTED]" : sanitizeObject(item)]));
}

function validateDryRunParameters(parameters: Array<{ Name: string; Optional?: boolean }>, supplied: Record<string, unknown>, module: string, method: string): void {
  const accepted = new Set(parameters.map((p) => p.Name)); const unknown = Object.keys(supplied).filter((key) => !accepted.has(key)); const missing = parameters.filter((p) => !p.Optional && !(p.Name in supplied)).map((p) => p.Name);
  if (unknown.length || missing.length) throw new AmpError("AMP_INVALID_PARAMETERS", `Parameters for ${module}/${method} do not match the live API specification`, { ampModule: module, ampMethod: method, details: { unknown, missing, accepted: [...accepted] } });
}
