import { readFileSync } from "node:fs";
import { z } from "zod";

const bool = (fallback: boolean) => z.stringbool().default(fallback);

const schema = z.object({
  AMP_URL: z.url().refine((v) => v.startsWith("http://") || v.startsWith("https://"), "must be HTTP(S)"),
  AMP_USERNAME: z.string().min(1),
  AMP_PASSWORD: z.string().default(""),
  AMP_LOGIN_TOKEN: z.string().default(""),
  AMP_VERIFY_TLS: bool(true),
  AMP_AUTH_MODE: z.enum(["bearer", "legacy-session-body"]).default("bearer"),
  AMP_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).default(15_000),
  AMP_RETRY_COUNT: z.coerce.number().int().min(0).max(5).default(2),
  AMP_METADATA_CACHE_TTL_MS: z.coerce.number().int().min(1_000).default(300_000),
  AMP_MAX_FILE_BYTES: z.coerce.number().int().min(1024).default(1_048_576),
  AMP_ALLOW_WRITES: bool(false),
  AMP_ALLOW_DISRUPTIVE: bool(false),
  AMP_ALLOW_DESTRUCTIVE: bool(false),
  AMP_ALLOW_HOST_PRIVILEGED: bool(false),
  AMP_ENABLE_GENERIC_API: bool(true),
  AMP_GENERIC_API_ALLOW_WRITES: bool(false),
  AMP_ENABLE_CLI: bool(false),
  AMPINSTMGR_PATH: z.string().min(1).optional(),
  AMP_CLI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600_000).default(60_000),
  AMP_LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  AMP_AUDIT_LOG: z.string().optional(),
  MCP_TRANSPORT: z.enum(["stdio", "http"]).default("stdio"),
  MCP_HTTP_HOST: z.string().default("127.0.0.1"),
  MCP_HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MCP_HTTP_BEARER_TOKEN: z.string().optional(),
  MCP_HTTP_ALLOWED_HOSTS: z.string().default(""),
  MCP_HTTP_ALLOWED_ORIGINS: z.string().default(""),
  MCP_HTTP_ALLOW_INSECURE_REMOTE: bool(false)
}).refine((v) => v.AMP_PASSWORD.length > 0 || v.AMP_LOGIN_TOKEN.length > 0, {
  message: "AMP_PASSWORD or AMP_LOGIN_TOKEN is required"
});

export type Config = {
  ampUrl: URL; username: string; password: string; loginToken: string;
  verifyTls: boolean; authMode: "bearer" | "legacy-session-body";
  requestTimeoutMs: number; retryCount: number; metadataCacheTtlMs: number; maxFileBytes: number;
  allowWrites: boolean; allowDisruptive: boolean; allowDestructive: boolean; allowHostPrivileged: boolean;
  enableGenericApi: boolean; genericApiAllowWrites: boolean; enableCli: boolean; ampinstmgrPath: string; cliTimeoutMs: number;
  logLevel: string; auditLog?: string; transport: "stdio" | "http"; httpHost: string; httpPort: number;
  httpBearerToken?: string; httpAllowedHosts: string[]; httpAllowedOrigins: string[]; httpAllowInsecureRemote: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  let merged = { ...env };
  if (env.AMP_CONFIG_FILE) {
    const parsed = JSON.parse(readFileSync(env.AMP_CONFIG_FILE, "utf8")) as Record<string, unknown>;
    merged = { ...Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)])), ...env };
  }
  const v = schema.parse(merged);
  const result: Config = {
    ampUrl: new URL(v.AMP_URL.endsWith("/") ? v.AMP_URL : `${v.AMP_URL}/`), username: v.AMP_USERNAME,
    password: v.AMP_PASSWORD, loginToken: v.AMP_LOGIN_TOKEN, verifyTls: v.AMP_VERIFY_TLS, authMode: v.AMP_AUTH_MODE,
    requestTimeoutMs: v.AMP_REQUEST_TIMEOUT_MS, retryCount: v.AMP_RETRY_COUNT, metadataCacheTtlMs: v.AMP_METADATA_CACHE_TTL_MS,
    maxFileBytes: v.AMP_MAX_FILE_BYTES, allowWrites: v.AMP_ALLOW_WRITES, allowDisruptive: v.AMP_ALLOW_DISRUPTIVE,
    allowDestructive: v.AMP_ALLOW_DESTRUCTIVE, allowHostPrivileged: v.AMP_ALLOW_HOST_PRIVILEGED,
    enableGenericApi: v.AMP_ENABLE_GENERIC_API, genericApiAllowWrites: v.AMP_GENERIC_API_ALLOW_WRITES,
    enableCli: v.AMP_ENABLE_CLI, ampinstmgrPath: v.AMPINSTMGR_PATH ?? defaultAmpInstMgrPath(), cliTimeoutMs: v.AMP_CLI_TIMEOUT_MS,
    logLevel: v.AMP_LOG_LEVEL, transport: v.MCP_TRANSPORT, httpHost: v.MCP_HTTP_HOST, httpPort: v.MCP_HTTP_PORT,
    httpAllowedHosts: csv(v.MCP_HTTP_ALLOWED_HOSTS), httpAllowedOrigins: csv(v.MCP_HTTP_ALLOWED_ORIGINS), httpAllowInsecureRemote: v.MCP_HTTP_ALLOW_INSECURE_REMOTE
  };
  if (v.AMP_AUDIT_LOG !== undefined) result.auditLog = v.AMP_AUDIT_LOG;
  if (v.MCP_HTTP_BEARER_TOKEN !== undefined) result.httpBearerToken = v.MCP_HTTP_BEARER_TOKEN;
  return result;
}

function csv(value: string): string[] { return value.split(",").map((item) => item.trim()).filter(Boolean); }

export function defaultAmpInstMgrPath(platform: NodeJS.Platform = process.platform): string {
  if (platform === "win32") return String.raw`C:\Program Files\CubeCoders Limited\AMP\ampinstmgr.exe`;
  if (platform === "linux") return "/usr/bin/ampinstmgr";
  return "ampinstmgr";
}
