import type { Config } from "../../config/config.js";
import { AmpError } from "../../errors/amp-error.js";
import type { Logger } from "../../logging/logger.js";
import { TtlCache } from "../cache.js";
import type { AmpProvider } from "../provider.js";
import type { AmpCapabilities, AmpInstance, AmpTarget, ApiMethodSpec, ApiSpec, CallOptions, LifecycleOptions, SettingDescriptor } from "../types.js";
import { asRecord, pickString } from "../types.js";
import { Amp2HttpClient } from "./client.js";
import { isSensitiveSetting, normalizeSettingsSpec, validateSettingValue } from "./settings.js";

export class Amp2Provider implements AmpProvider {
  readonly versionFamily = "AMP2" as const;
  private readonly specs: TtlCache<ApiSpec>;
  private readonly settings: TtlCache<SettingDescriptor[]>;
  private readonly capabilities: TtlCache<AmpCapabilities>;
  constructor(readonly client: Amp2HttpClient, private readonly config: Config, private readonly logger: Logger) {
    this.specs = new TtlCache(config.metadataCacheTtlMs); this.settings = new TtlCache(config.metadataCacheTtlMs); this.capabilities = new TtlCache(config.metadataCacheTtlMs);
  }
  async close(): Promise<void> { await this.client.close(); }

  async health(): Promise<Record<string, unknown>> {
    const started = Date.now();
    try { const info = await this.serverInfo(); return { healthy: true, latencyMs: Date.now() - started, provider: this.versionFamily, tlsVerified: this.config.verifyTls, info }; }
    catch (error) { const e = error instanceof AmpError ? error : new AmpError("AMP_CONNECTION_FAILED", String(error)); return { healthy: false, latencyMs: Date.now() - started, provider: this.versionFamily, error: e.toJSON() }; }
  }
  async serverInfo(): Promise<Record<string, unknown>> { return asRecord(await this.client.call("Core", "GetModuleInfo", {}, undefined, true)); }

  async listTargets(): Promise<AmpTarget[]> {
    const groups = await this.client.call("ADSModule", "GetInstances", { ForceIncludeSelf: true }, undefined, true);
    return array(groups).map((v) => {
      const o = asRecord(v); const id = pickString(o, "InstanceId", "TargetID", "TargetId", "Id") ?? "unknown";
      const target: AmpTarget = { id, name: pickString(o, "FriendlyName", "Name") ?? id, raw: o };
      const url = pickString(o, "URL", "Url"); if (url) target.url = url;
      if (typeof o.Online === "boolean") target.online = o.Online;
      if (Array.isArray(o.Tags)) target.tags = o.Tags.filter((x): x is string => typeof x === "string");
      return target;
    });
  }

  async listInstances(): Promise<AmpInstance[]> {
    const groups = await this.client.call("ADSModule", "GetInstances", { ForceIncludeSelf: true }, undefined, true);
    return array(groups).flatMap((group) => {
      const g = asRecord(group); const targetId = pickString(g, "InstanceId", "TargetID", "TargetId", "Id") ?? "unknown"; const targetName = pickString(g, "FriendlyName", "Name") ?? targetId;
      return array(g.AvailableInstances ?? g.Instances).map((value) => mapInstance(asRecord(value), targetId, targetName));
    });
  }
  async getInstance(instanceId: string): Promise<AmpInstance> {
    const fromList = (await this.listInstances()).find((item) => item.id.toLowerCase() === instanceId.toLowerCase());
    if (!fromList) throw new AmpError("AMP_INVALID_PARAMETERS", `AMP instance not found: ${instanceId}`, { instanceId });
    return fromList;
  }
  async getInstanceStatus(instanceId: string): Promise<unknown> { await this.getInstance(instanceId); return this.client.call("Core", "GetStatus", {}, instanceId, true); }

  async lifecycle(instanceId: string, action: "start" | "stop" | "restart" | "kill" | "sleep" | "update", options: LifecycleOptions = {}): Promise<unknown> {
    const inst = await this.getInstance(instanceId);
    const controllerActions = { start: "StartInstance", stop: "StopInstance", restart: "RestartInstance" } as const;
    const instanceActions = { kill: "Kill", sleep: "Sleep", update: "UpdateApplication" } as const;
    const result = action in controllerActions
      ? await this.client.call("ADSModule", controllerActions[action as keyof typeof controllerActions], { InstanceName: inst.id })
      : await this.client.call("Core", instanceActions[action as keyof typeof instanceActions], {}, inst.id);
    if (!options.wait) return { action, instanceId, accepted: result };
    return { action, instanceId, accepted: result, finalStatus: await this.waitForState(instanceId, action, options) };
  }
  async lifecycleAll(targetId: string, action: "start" | "stop"): Promise<unknown> {
    return this.client.call("ADSModule", action === "start" ? "StartAllInstances" : "StopAllInstances", { TargetADSInstance: targetId });
  }

  async getConsole(instanceId: string): Promise<unknown> { await this.getInstance(instanceId); return this.client.call("Core", "GetUpdates", {}, instanceId, true); }
  async sendConsole(instanceId: string, message: string): Promise<unknown> { await this.getInstance(instanceId); return this.client.call("Core", "SendConsoleMessage", { message }, instanceId); }

  async getApiSpec(instanceId?: string, refresh = false): Promise<ApiSpec> {
    const key = instanceId ?? "controller";
    return this.specs.get(key, async () => await this.client.call("Core", "GetAPISpec", {}, instanceId, true) as ApiSpec, refresh);
  }
  async listApiModules(instanceId?: string): Promise<string[]> { return Object.keys(await this.getApiSpec(instanceId)).sort(); }
  async describeApiMethod(module: string, method: string, instanceId?: string): Promise<ApiMethodSpec> {
    const found = (await this.getApiSpec(instanceId))[module]?.[method];
    if (!found) throw new AmpError("AMP_INVALID_API_METHOD", `Method ${module}/${method} is not advertised by this AMP endpoint`, { ampModule: module, ampMethod: method, ...(instanceId ? { instanceId } : {}) });
    return found;
  }
  async callApi(module: string, method: string, parameters: Record<string, unknown>, options: CallOptions = {}): Promise<unknown> {
    if (!options.skipValidation) validateParameters(await this.describeApiMethod(module, method, options.instanceId), parameters, module, method);
    return this.client.call(module, method, parameters, options.instanceId, options.idempotent ?? method.startsWith("Get"));
  }

  async getSettings(instanceId: string, refresh = false): Promise<SettingDescriptor[]> {
    await this.getInstance(instanceId);
    return this.settings.get(instanceId, async () => normalizeSettingsSpec(await this.client.call("Core", "GetSettingsSpec", {}, instanceId, true)), refresh);
  }
  async getSetting(instanceId: string, key: string): Promise<SettingDescriptor> {
    const meta = (await this.getSettings(instanceId)).find((item) => item.key === key);
    if (!meta) throw new AmpError("AMP_INVALID_SETTING", `Setting not advertised by AMP: ${key}`, { instanceId });
    if (isSensitiveSetting(meta)) return { ...meta, currentValue: "[REDACTED]" };
    const value = await this.client.call("Core", "GetConfig", { node: key }, instanceId, true);
    return { ...meta, currentValue: extractConfigValue(value) };
  }
  async setSetting(instanceId: string, key: string, value: unknown): Promise<unknown> {
    const setting = await this.getSetting(instanceId, key); const encoded = validateSettingValue(setting, value);
    const result = await this.client.call("Core", "SetConfig", { node: key, value: encoded }, instanceId);
    this.settings.delete(instanceId); return { setting: key, value, restartRequired: setting.restartRequired ?? false, result };
  }

  async getCapabilities(instanceId: string, refresh = false): Promise<AmpCapabilities> {
    return this.capabilities.get(instanceId, async () => {
      const instance = await this.getInstance(instanceId); const spec = await this.getApiSpec(instanceId, refresh);
      const has = (module: string, ...methods: string[]) => methods.some((method) => Boolean(spec[module]?.[method]));
      return { instanceId, module: instance.module, apiModules: Object.keys(spec).sort(), capabilities: {
        console: has("Core", "GetUpdates", "SendConsoleMessage"), players: has("Core", "GetUserList") || Boolean(spec.MinecraftModule),
        backups: Boolean(spec.LocalFileBackupPlugin), fileManager: Boolean(spec.FileManagerPlugin), scheduler: has("Core", "GetScheduleData"),
        settings: has("Core", "GetSettingsSpec"), metrics: has("Core", "GetStatus"), updates: has("Core", "UpdateApplication")
      }, methods: Object.fromEntries(Object.entries(spec).map(([m, methods]) => [m, Object.keys(methods).sort()])) };
    }, refresh);
  }
  invalidateCache(instanceId?: string): void { this.specs.delete(instanceId); this.settings.delete(instanceId); this.capabilities.delete(instanceId); }

  private async waitForState(instanceId: string, action: string, options: LifecycleOptions): Promise<unknown> {
    const timeout = (options.timeoutSeconds ?? 60) * 1000; const interval = options.pollIntervalMs ?? 1_000; const started = Date.now();
    while (Date.now() - started < timeout) {
      const status = await this.getInstanceStatus(instanceId); const state = String(asRecord(status).State ?? asRecord(status).state ?? "").toLowerCase();
      const complete = action === "start" ? /ready|running|20/.test(state) : action === "stop" || action === "kill" || action === "sleep" ? /stopped|offline|sleep|0/.test(state) : !/restart|update|starting|stopping/.test(state);
      if (complete) return status;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    throw new AmpError("AMP_TIMEOUT", `Timed out waiting for ${action} state transition`, { instanceId, retryable: true });
  }
}

function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function mapInstance(o: Record<string, unknown>, targetId: string, targetName: string): AmpInstance {
  const id = pickString(o, "InstanceID", "InstanceId", "Id") ?? "unknown"; const name = pickString(o, "InstanceName", "Name") ?? id;
  const result: AmpInstance = { id, name, friendlyName: pickString(o, "FriendlyName") ?? name, module: pickString(o, "Module") ?? "Unknown", targetId, targetName, raw: o };
  const description = pickString(o, "Description"); if (description) result.description = description;
  const moduleDisplayName = pickString(o, "ModuleDisplayName"); if (moduleDisplayName) result.moduleDisplayName = moduleDisplayName;
  if (typeof o.Running === "boolean") result.running = o.Running;
  if (typeof o.AppState === "number" || typeof o.AppState === "string") result.appState = o.AppState;
  if (typeof o.Suspended === "boolean") result.suspended = o.Suspended;
  return result;
}
function validateParameters(spec: ApiMethodSpec, params: Record<string, unknown>, module: string, method: string): void {
  const advertised = new Map((spec.Parameters ?? []).map((p) => [p.Name, p]));
  const unknown = Object.keys(params).filter((key) => !advertised.has(key));
  const missing = [...advertised.values()].filter((p) => !p.Optional && !(p.Name in params)).map((p) => p.Name);
  if (unknown.length || missing.length) throw new AmpError("AMP_INVALID_PARAMETERS", `Parameters for ${module}/${method} do not match the live API specification`, { ampModule: module, ampMethod: method, details: { unknown, missing, accepted: [...advertised.keys()] } });
}
function extractConfigValue(value: unknown): unknown { const obj = asRecord(value); return obj.CurrentValue ?? obj.Value ?? obj.value ?? value; }
