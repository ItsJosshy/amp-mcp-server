import { AmpError } from "../../errors/amp-error.js";
import type { SettingDescriptor } from "../types.js";
import { asRecord, pickString } from "../types.js";

export function normalizeSettingsSpec(spec: unknown): SettingDescriptor[] {
  const result: SettingDescriptor[] = [];
  const visit = (value: unknown, category?: string, inheritedKey?: string): void => {
    if (Array.isArray(value)) { for (const item of value) visit(item, category, inheritedKey); return; }
    const obj = asRecord(value);
    if (Object.keys(obj).length === 0) return;
    const key = pickString(obj, "Node", "node", "SettingNode", "Key", "key") ?? inheritedKey;
    if (key && looksLikeSetting(obj)) {
      const sensitive = isSensitiveSettingKey(key, obj); const desc: SettingDescriptor = { key, raw: sensitive ? redactSettingRaw(obj) : obj };
      const cat = pickString(obj, "Category", "category", "CategoryName") ?? category;
      if (cat !== undefined) desc.category = cat;
      const name = pickString(obj, "Name", "DisplayName", "name"); if (name !== undefined) desc.displayName = name;
      const description = pickString(obj, "Description", "description"); if (description !== undefined) desc.description = description;
      const dataType = pickString(obj, "ValType", "Type", "TypeName", "InputType"); if (dataType !== undefined) desc.dataType = dataType;
      assign(desc, "currentValue", sensitive ? "[REDACTED]" : first(obj, "CurrentValue", "Value", "value"));
      assign(desc, "defaultValue", sensitive ? "[REDACTED]" : first(obj, "DefaultValue", "Default", "default"));
      assign(desc, "choices", first(obj, "EnumValues", "Values", "SelectionValues", "AllowedValues"));
      assignNumber(desc, "min", first(obj, "MinValue", "Minimum", "Min"));
      assignNumber(desc, "max", first(obj, "MaxValue", "Maximum", "Max"));
      assignBoolean(desc, "restartRequired", first(obj, "RequiresRestart", "RestartRequired", "RequiresApplicationRestart"));
      assignBoolean(desc, "readOnly", first(obj, "ReadOnly", "IsReadOnly"));
      result.push(desc); return;
    }
    for (const [childKey, child] of Object.entries(obj)) visit(child, category ?? childKey, childKey.includes(".") ? childKey : undefined);
  };
  visit(spec);
  return dedupe(result);
}

function looksLikeSetting(obj: Record<string, unknown>): boolean {
  return ["Node", "node", "SettingNode", "CurrentValue", "Value", "DisplayName", "InputType", "EnumValues"].some((key) => key in obj);
}
function first(obj: Record<string, unknown>, ...keys: string[]): unknown { for (const k of keys) if (k in obj) return obj[k]; return undefined; }
function assign(obj: SettingDescriptor, key: "currentValue" | "defaultValue" | "choices", value: unknown): void { if (value !== undefined) obj[key] = value; }
function assignNumber(obj: SettingDescriptor, key: "min" | "max", value: unknown): void { const n = Number(value); if (value !== undefined && Number.isFinite(n)) obj[key] = n; }
function assignBoolean(obj: SettingDescriptor, key: "restartRequired" | "readOnly", value: unknown): void { if (typeof value === "boolean") obj[key] = value; }
function dedupe(items: SettingDescriptor[]): SettingDescriptor[] { return [...new Map(items.map((i) => [i.key, i])).values()]; }

export function validateSettingValue(setting: SettingDescriptor, value: unknown): string {
  if (setting.readOnly) throw new AmpError("AMP_INVALID_SETTING", `Setting ${setting.key} is read-only`);
  const type = setting.dataType?.toLowerCase() ?? "";
  if (type.includes("bool") && typeof value !== "boolean" && value !== "true" && value !== "false") throw invalid(setting, "boolean");
  if ((type.includes("int") || type.includes("number") || type.includes("float") || type.includes("double")) && !Number.isFinite(Number(value))) throw invalid(setting, "number");
  const numeric = Number(value);
  if (setting.min !== undefined && numeric < setting.min) throw new AmpError("AMP_INVALID_SETTING", `${setting.key} must be at least ${setting.min}`);
  if (setting.max !== undefined && numeric > setting.max) throw new AmpError("AMP_INVALID_SETTING", `${setting.key} must be at most ${setting.max}`);
  if (Array.isArray(setting.choices) && !setting.choices.some((choice) => choice === value || String(choice) === String(value))) throw new AmpError("AMP_INVALID_SETTING", `${setting.key} must be one of the advertised choices`, { details: { choices: setting.choices } });
  return typeof value === "string" ? value : JSON.stringify(value);
}
function invalid(setting: SettingDescriptor, expected: string): AmpError { return new AmpError("AMP_INVALID_SETTING", `${setting.key} expects a ${expected}`); }
export function isSensitiveSetting(setting: SettingDescriptor): boolean { return isSensitiveSettingKey(setting.key, setting.raw); }
function isSensitiveSettingKey(key: string, obj: Record<string, unknown>): boolean { return /password|secret|token|api.?key|private.?key|credential|licen[cs]e.?key/i.test(`${key} ${String(obj.Name ?? "")} ${String(obj.DisplayName ?? "")}`); }
function redactSettingRaw(obj: Record<string, unknown>): Record<string, unknown> { return Object.fromEntries(Object.entries(obj).map(([key, value]) => /^(CurrentValue|Value|DefaultValue|Default)$/i.test(key) ? [key, "[REDACTED]"] : [key, value])); }
