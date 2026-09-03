import { describe, expect, it } from "vitest";
import { AmpInstMgrAdapter } from "../src/amp/amp2/cli.js";
import { testConfig } from "./helpers.js";

describe("ampinstmgr argument generation", () => {
  const cli = new AmpInstMgrAdapter(testConfig());
  it("uses fixed arguments", () => expect(cli.buildArgs("restart", { instanceName: "Minecraft01" })).toEqual(["--RestartInstance", "Minecraft01"]));
  it("builds provision settings without a shell", () => expect(cli.buildArgs("reconfigure", { instanceName: "Game01", provisionSettings: { "Core.Webserver.Port": "8081" } })).toEqual(["--ReconfigureInstance", "Game01", "+Core.Webserver.Port", "8081"]));
  it("rejects injection-shaped names", () => expect(() => cli.buildArgs("start", { instanceName: "x; rm -rf /" })).toThrow());
  it("validates rebind ports", () => expect(() => cli.buildArgs("rebind", { instanceName: "Game", ipBinding: "0.0.0.0", port: 70000 })).toThrow());
});
