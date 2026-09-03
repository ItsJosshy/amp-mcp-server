import { createWriteStream } from "node:fs";
import pino, { type Logger } from "pino";
import type { Config } from "../config/config.js";

export const SECRET_KEYS = /password|session|token|secret|credential|authorization|pairing.?code|fileContent|^content$|^base64Data$|^data$/i;
const SECRET_SETTING = /password|secret|token|api.?key|private.?key|credential|licen[cs]e.?key/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const entries = Object.entries(value); const sensitiveNode = entries.some(([k, v]) => /^(key|node|setting)$/i.test(k) && typeof v === "string" && SECRET_SETTING.test(v));
    return Object.fromEntries(entries.map(([k, v]) => [k, SECRET_KEYS.test(k) || (sensitiveNode && /^(value|currentValue|defaultValue|result)$/i.test(k)) ? "[REDACTED]" : redact(v)]));
  }
  return value;
}

export function createLogger(config: Config): { logger: Logger; audit: Logger } {
  const opts = { level: config.logLevel, redact: { paths: ["password", "sessionId", "token", "*.password", "*.sessionId", "*.token"], censor: "[REDACTED]" } };
  const logger = pino(opts, pino.destination(2));
  const destination = config.auditLog ? createWriteStream(config.auditLog, { flags: "a", mode: 0o600 }) : pino.destination(2);
  return { logger, audit: pino({ ...opts, base: { stream: "audit" } }, destination) };
}

export type { Logger };
