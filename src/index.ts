#!/usr/bin/env node
import "dotenv/config";
import { AmpInstMgrAdapter } from "./amp/amp2/cli.js";
import { Amp2HttpClient } from "./amp/amp2/client.js";
import { Amp2Provider } from "./amp/amp2/provider.js";
import { loadConfig } from "./config/config.js";
import { createLogger } from "./logging/logger.js";
import { SecurityPolicy } from "./security/policy.js";
import { startHttp } from "./server/http.js";
import { startStdio } from "./server/stdio.js";

async function main(): Promise<void> {
  const config = loadConfig(); const { logger, audit } = createLogger(config);
  if (!config.verifyTls) logger.warn("AMP TLS certificate verification is explicitly disabled for this connection only");
  const client = new Amp2HttpClient(config, logger); const provider = new Amp2Provider(client, config, logger);
  const context = { provider, cli: new AmpInstMgrAdapter(config), config, policy: new SecurityPolicy(config), logger, audit };
  process.once("exit", () => { void provider.close(); });
  if (config.transport === "http") await startHttp(context); else await startStdio(context);
}

main().catch((error: unknown) => { process.stderr.write(`${JSON.stringify({ level: "fatal", message: error instanceof Error ? error.message : String(error) })}\n`); process.exitCode = 1; });
