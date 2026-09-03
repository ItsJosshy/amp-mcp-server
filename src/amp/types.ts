export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface ApiParameterSpec {
  Name: string; TypeName?: string; Optional?: boolean; Description?: string; ParamEnumValues?: JsonValue;
}
export interface ApiMethodSpec {
  Description?: string | null; Returns?: string | null; Parameters?: ApiParameterSpec[];
  ReturnTypeName?: string; IsComplexType?: boolean;
}
export type ApiSpec = Record<string, Record<string, ApiMethodSpec>>;

export interface AmpTarget {
  id: string; name: string; url?: string; online?: boolean; tags?: string[]; raw: Record<string, unknown>;
}
export interface AmpInstance {
  id: string; name: string; friendlyName: string; description?: string; module: string;
  moduleDisplayName?: string; targetId: string; targetName: string; running?: boolean;
  appState?: number | string; suspended?: boolean; raw: Record<string, unknown>;
}
export interface SettingDescriptor {
  key: string; category?: string; displayName?: string; description?: string; currentValue?: unknown;
  defaultValue?: unknown; dataType?: string; choices?: unknown; min?: number; max?: number;
  restartRequired?: boolean; readOnly?: boolean; raw: Record<string, unknown>;
}
export interface AmpCapabilities {
  instanceId: string; module?: string; apiModules: string[];
  capabilities: Record<string, boolean>; methods: Record<string, string[]>;
}
export interface CallOptions { instanceId?: string; idempotent?: boolean; skipValidation?: boolean }

export interface LifecycleOptions { wait?: boolean; timeoutSeconds?: number; pollIntervalMs?: number }

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function pickString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) if (typeof obj[key] === "string") return obj[key] as string;
  return undefined;
}
