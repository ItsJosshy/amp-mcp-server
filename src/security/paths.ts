import { AmpError } from "../errors/amp-error.js";

/** AMP paths are always instance-relative and use forward slashes. */
export function validateInstancePath(input: string, allowRoot = true): string {
  if (input.includes("\0") || input.includes("\\")) throw invalid(input);
  if (input.startsWith("/") && input !== "/") throw invalid(input);
  const value = input === "/" ? "" : input.replace(/\/{2,}/g, "/");
  if (!allowRoot && value === "") throw invalid(input);
  const parts = value.split("/");
  if (parts.some((part) => part === ".." || part === ".")) throw invalid(input);
  if (/^[a-zA-Z]:/.test(value) || value.startsWith("~")) throw invalid(input);
  return value;
}

function invalid(path: string): AmpError {
  return new AmpError("AMP_INVALID_PARAMETERS", "File path must be relative to the AMP-authorized instance root and may not contain traversal", { details: { path } });
}
