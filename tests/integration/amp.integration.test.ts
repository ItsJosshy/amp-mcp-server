import { describe, expect, it } from "vitest";
import pino from "pino";
import { Amp2HttpClient } from "../../src/amp/amp2/client.js";
import { Amp2Provider } from "../../src/amp/amp2/provider.js";
import { loadConfig } from "../../src/config/config.js";

const enabled = Boolean(process.env.AMP_TEST_URL && process.env.AMP_TEST_USERNAME && (process.env.AMP_TEST_PASSWORD || process.env.AMP_TEST_LOGIN_TOKEN));
describe.skipIf(!enabled)("live AMP read-only integration", () => {
  const provider = () => {
    const config = loadConfig({ ...process.env, AMP_URL: process.env.AMP_TEST_URL, AMP_USERNAME: process.env.AMP_TEST_USERNAME, AMP_PASSWORD: process.env.AMP_TEST_PASSWORD ?? "", AMP_LOGIN_TOKEN: process.env.AMP_TEST_LOGIN_TOKEN ?? "" });
    return new Amp2Provider(new Amp2HttpClient(config, pino({ level: "silent" })), config, pino({ level: "silent" }));
  };
  it("authenticates and lists instances without mutation", async () => { const amp = provider(); expect((await amp.health()).healthy).toBe(true); expect(Array.isArray(await amp.listInstances())).toBe(true); });
  it.runIf(Boolean(process.env.AMP_TEST_INSTANCE_ID))("reads one status", async () => expect(await provider().getInstanceStatus(process.env.AMP_TEST_INSTANCE_ID!)).toBeTruthy());
});
