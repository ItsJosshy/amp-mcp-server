import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import type { Config } from "../../config/config.js";
import { AmpError } from "../../errors/amp-error.js";

export interface CliResult { command: string; arguments: string[]; exitCode: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; durationMs: number }
export type CliOperation = "version" | "list" | "info" | "ports" | "lastLog" | "start" | "stop" | "restart" | "upgrade" | "reconfigure" | "rebind" | "delete";

const safeName = /^[A-Za-z0-9][A-Za-z0-9_. -]{0,63}$/;
const safeBinding = /^(?:[A-Za-z0-9:.-]+|0\.0\.0\.0|\*)$/;
const provisionKey = /^\+[A-Za-z][A-Za-z0-9_.-]{0,127}$/;

export class AmpInstMgrAdapter {
  constructor(private readonly config: Config) {}
  async available(): Promise<boolean> { try { await access(this.config.ampinstmgrPath); return true; } catch { return false; } }

  buildArgs(operation: CliOperation, input: { instanceName?: string; ipBinding?: string; port?: number; provisionSettings?: Record<string, string>; skipVerification?: boolean } = {}): string[] {
    const requireName = (): string => {
      if (!input.instanceName || !safeName.test(input.instanceName)) throw new AmpError("AMP_INVALID_PARAMETERS", "A valid AMP CLI instance name is required");
      return input.instanceName;
    };
    switch (operation) {
      case "version": return ["-version"];
      case "list": return ["--ShowInstancesList"];
      case "info": return ["--ShowInstanceInfo", requireName()];
      case "ports": return input.instanceName ? ["--ShowInstancePorts", requireName()] : ["--ShowAllInstancePorts"];
      case "lastLog": return ["--LastLog", requireName()];
      case "start": return ["--StartInstance", requireName()];
      case "stop": return ["--StopInstance", requireName()];
      case "restart": return ["--RestartInstance", requireName()];
      case "upgrade": return ["--UpgradeInstance", requireName()];
      case "delete": return ["--DeleteInstance", requireName(), ...(input.skipVerification ? ["true"] : [])];
      case "rebind": {
        if (!input.ipBinding || !safeBinding.test(input.ipBinding) || !Number.isInteger(input.port) || input.port! < 1 || input.port! > 65535) throw new AmpError("AMP_INVALID_PARAMETERS", "Rebind requires a valid IP binding and port");
        return ["--RebindInstance", requireName(), input.ipBinding, String(input.port)];
      }
      case "reconfigure": return ["--ReconfigureInstance", requireName(), ...settingsArgs(input.provisionSettings ?? {})];
    }
  }

  async execute(operation: CliOperation, input?: Parameters<AmpInstMgrAdapter["buildArgs"]>[1]): Promise<CliResult> {
    if (!this.config.enableCli) throw new AmpError("AMP_SAFETY_POLICY_DENIED", "ampinstmgr support is disabled; set AMP_ENABLE_CLI=true explicitly");
    const args = this.buildArgs(operation, input); const started = Date.now();
    return new Promise((resolve, reject) => {
      const child = spawn(this.config.ampinstmgrPath, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], env: cliEnvironment() });
      let stdout = "", stderr = "", timedOut = false;
      child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => { stdout += chunk; }); child.stderr.on("data", (chunk: string) => { stderr += chunk; });
      const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, this.config.cliTimeoutMs);
      child.on("error", (error) => { clearTimeout(timer); reject(new AmpError("AMP_CLI_FAILURE", `Could not execute ampinstmgr: ${error.message}`, {}, { cause: error })); });
      child.on("close", (exitCode, signal) => {
        clearTimeout(timer);
        if (timedOut) { reject(new AmpError("AMP_TIMEOUT", "ampinstmgr timed out and was terminated", { retryable: false })); return; }
        const secrets = sensitiveValues(args); const result = { command: this.config.ampinstmgrPath, arguments: redactArgs(args), exitCode, signal, stdout: redactText(truncate(stdout), secrets), stderr: redactText(truncate(stderr), secrets), durationMs: Date.now() - started };
        if (exitCode !== 0) { reject(new AmpError("AMP_CLI_FAILURE", `ampinstmgr exited with code ${exitCode ?? "unknown"}`, { details: result })); return; }
        resolve(result);
      });
    });
  }
}

function settingsArgs(settings: Record<string, string>): string[] {
  return Object.entries(settings).flatMap(([key, value]) => {
    const normalized = key.startsWith("+") ? key : `+${key}`;
    if (!provisionKey.test(normalized) || value.includes("\0") || value.length > 4096) throw new AmpError("AMP_INVALID_PARAMETERS", `Invalid ampinstmgr provision setting: ${key}`);
    return [normalized, value];
  });
}
function redactArgs(args: string[]): string[] { return args.map((arg, index) => index > 0 && /password|secret|token/i.test(args[index - 1] ?? "") ? "[REDACTED]" : arg); }
function truncate(value: string): string { return value.length > 1_000_000 ? `${value.slice(0, 1_000_000)}\n[TRUNCATED]` : value; }
function sensitiveValues(args: string[]): string[] { return args.filter((_arg, index) => index > 0 && /password|secret|token/i.test(args[index - 1] ?? "")); }
function redactText(text: string, secrets: string[]): string { return secrets.reduce((value, secret) => secret ? value.split(secret).join("[REDACTED]") : value, text); }

export function cliEnvironment(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  const copy = (key: string): void => { if (env[key]) result[key] = env[key]; };
  if (platform === "win32") {
    for (const key of ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATHEXT"]) copy(key);
    result.PATH = env.PATH ?? `${env.SystemRoot ?? String.raw`C:\Windows`}\\System32`;
  } else {
    result.PATH = env.PATH ?? "/usr/local/bin:/usr/bin:/bin";
  }
  return result;
}
