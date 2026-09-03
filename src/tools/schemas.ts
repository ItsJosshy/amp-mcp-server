import { z } from "zod";

export const instanceId = z.string().min(1).max(128).describe("Stable AMP InstanceID from amp_list_instances");
export const targetId = z.string().min(1).max(128).describe("Stable ADS target ID from amp_list_targets");
export const waitFields = {
  wait: z.boolean().default(false).describe("Poll until AMP reaches the requested stable state"),
  timeoutSeconds: z.number().int().min(1).max(600).default(60),
  pollIntervalMs: z.number().int().min(250).max(10_000).default(1_000)
};
export const dryRunField = { dryRun: z.boolean().default(false).describe("Validate and describe the action without executing it") };
export const apiAddress = {
  instanceId: instanceId.optional().describe("Omit to address the ADS/controller endpoint"),
  module: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/), method: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/)
};
