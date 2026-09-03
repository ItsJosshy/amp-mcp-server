import { describe, expect, it } from "vitest";
import { classifyApiMethod, RiskLevel, SecurityPolicy } from "../src/security/policy.js";
import { testConfig } from "./helpers.js";

describe("security policy", () => {
  it("classifies API calls conservatively", () => { expect(classifyApiMethod("GetStatus")).toBe(RiskLevel.READ_ONLY); expect(classifyApiMethod("Restart")).toBe(RiskLevel.INSTANCE_DISRUPTIVE); expect(classifyApiMethod("DeleteUser")).toBe(RiskLevel.DESTRUCTIVE); expect(classifyApiMethod("CreateInstanceFromSpec")).toBe(RiskLevel.DESTRUCTIVE); expect(classifyApiMethod("UpgradeAMP")).toBe(RiskLevel.HOST_PRIVILEGED); expect(classifyApiMethod("DownloadFileFromURL")).toBe(RiskLevel.LOW_RISK_WRITE); expect(classifyApiMethod("DoSomethingNew")).toBe(RiskLevel.LOW_RISK_WRITE); });
  it("requires layered opt-ins", () => { const policy = new SecurityPolicy(testConfig({ allowWrites: true })); expect(() => policy.assertAllowed(RiskLevel.LOW_RISK_WRITE)).not.toThrow(); expect(() => policy.assertAllowed(RiskLevel.DESTRUCTIVE)).toThrow(); });
  it("allows destructive only with both switches", () => expect(() => new SecurityPolicy(testConfig({ allowWrites: true, allowDestructive: true })).assertAllowed(RiskLevel.DESTRUCTIVE)).not.toThrow());
});
