import { describe, expect, it } from "vitest";
import { normalizeSettingsSpec, validateSettingValue } from "../src/amp/amp2/settings.js";

describe("settings metadata", () => {
  const settings = normalizeSettingsSpec({ Minecraft: [{ Node: "MinecraftModule.Minecraft.Difficulty", DisplayName: "Difficulty", CurrentValue: "normal", DefaultValue: "easy", InputType: "select", EnumValues: ["easy", "normal", "hard"], RequiresRestart: true }, { Node: "MinecraftModule.Minecraft.MaxPlayers", InputType: "integer", MinValue: 1, MaxValue: 100 }] });
  it("normalizes metadata", () => expect(settings[0]).toMatchObject({ key: "MinecraftModule.Minecraft.Difficulty", category: "Minecraft", restartRequired: true }));
  it("checks advertised choices", () => { expect(validateSettingValue(settings[0]!, "hard")).toBe("hard"); expect(() => validateSettingValue(settings[0]!, "impossible")).toThrow(); });
  it("checks numeric bounds", () => { expect(validateSettingValue(settings[1]!, 20)).toBe("20"); expect(() => validateSettingValue(settings[1]!, 0)).toThrow(); });
  it("redacts sensitive setting values including raw metadata", () => { const [secret] = normalizeSettingsSpec([{ Node: "Core.Login.Password", Name: "Password", CurrentValue: "hunter2", DefaultValue: "secret" }]); expect(secret?.currentValue).toBe("[REDACTED]"); expect(secret?.raw.CurrentValue).toBe("[REDACTED]"); });
});
