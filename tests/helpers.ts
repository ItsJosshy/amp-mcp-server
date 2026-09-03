import pino from "pino";
import type { Config } from "../src/config/config.js";

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    ampUrl: new URL("https://amp.example.test/"), username: "mcp", password: "password", loginToken: "", verifyTls: true,
    authMode: "bearer", requestTimeoutMs: 1_000, retryCount: 0, metadataCacheTtlMs: 60_000, maxFileBytes: 1024,
    allowWrites: false, allowDisruptive: false, allowDestructive: false, allowHostPrivileged: false,
    enableGenericApi: true, genericApiAllowWrites: false, enableCli: false, ampinstmgrPath: "/usr/bin/ampinstmgr", cliTimeoutMs: 1_000,
    logLevel: "silent", transport: "stdio", httpHost: "127.0.0.1", httpPort: 3000, httpAllowedHosts: [], httpAllowedOrigins: [], httpAllowInsecureRemote: false,
    ...overrides
  };
}
export const testLogger = pino({ level: "silent" });
