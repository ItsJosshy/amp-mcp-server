import type { AmpCapabilities, AmpInstance, AmpTarget, ApiMethodSpec, ApiSpec, CallOptions, LifecycleOptions, SettingDescriptor } from "./types.js";

export interface AmpProvider {
  readonly versionFamily: "AMP2" | "AMP3";
  health(): Promise<Record<string, unknown>>;
  serverInfo(): Promise<Record<string, unknown>>;
  listTargets(): Promise<AmpTarget[]>;
  listInstances(): Promise<AmpInstance[]>;
  getInstance(instanceId: string): Promise<AmpInstance>;
  getInstanceStatus(instanceId: string): Promise<unknown>;
  lifecycle(instanceId: string, action: "start" | "stop" | "restart" | "kill" | "sleep" | "update", options?: LifecycleOptions): Promise<unknown>;
  lifecycleAll(targetId: string, action: "start" | "stop"): Promise<unknown>;
  getConsole(instanceId: string): Promise<unknown>;
  sendConsole(instanceId: string, message: string): Promise<unknown>;
  getApiSpec(instanceId?: string, refresh?: boolean): Promise<ApiSpec>;
  listApiModules(instanceId?: string): Promise<string[]>;
  describeApiMethod(module: string, method: string, instanceId?: string): Promise<ApiMethodSpec>;
  callApi(module: string, method: string, parameters: Record<string, unknown>, options?: CallOptions): Promise<unknown>;
  getSettings(instanceId: string, refresh?: boolean): Promise<SettingDescriptor[]>;
  getSetting(instanceId: string, key: string): Promise<SettingDescriptor>;
  setSetting(instanceId: string, key: string, value: unknown): Promise<unknown>;
  getCapabilities(instanceId: string, refresh?: boolean): Promise<AmpCapabilities>;
  invalidateCache(instanceId?: string): void;
}
