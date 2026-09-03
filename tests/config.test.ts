import { describe, expect, it } from "vitest";
import { defaultAmpInstMgrPath, loadConfig } from "../src/config/config.js";

describe("configuration", () => {
  it("requires a secret and validates safety defaults", () => {
    const config = loadConfig({ AMP_URL: "https://amp.example", AMP_USERNAME: "agent", AMP_PASSWORD: "secret" });
    expect(config.verifyTls).toBe(true); expect(config.allowWrites).toBe(false); expect(config.allowDestructive).toBe(false); expect(config.transport).toBe("stdio");
  });
  it("rejects missing credentials", () => expect(() => loadConfig({ AMP_URL: "https://amp.example", AMP_USERNAME: "agent" })).toThrow());
  it("accepts a service login token without password", () => expect(loadConfig({ AMP_URL: "https://amp.example", AMP_USERNAME: "agent", AMP_LOGIN_TOKEN: "token" }).loginToken).toBe("token"));
  it("uses native ampinstmgr defaults", () => {
    expect(defaultAmpInstMgrPath("linux")).toBe("/usr/bin/ampinstmgr");
    expect(defaultAmpInstMgrPath("win32")).toBe(String.raw`C:\Program Files\CubeCoders Limited\AMP\ampinstmgr.exe`);
  });
  it("allows an explicit ampinstmgr path override", () => {
    expect(loadConfig({ AMP_URL: "https://amp.example", AMP_USERNAME: "agent", AMP_PASSWORD: "secret", AMPINSTMGR_PATH: "D:\\AMP\\ampinstmgr.exe" }).ampinstmgrPath).toBe("D:\\AMP\\ampinstmgr.exe");
  });
});
