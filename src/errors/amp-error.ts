export type AmpErrorCode =
  | "AMP_AUTHENTICATION_FAILED" | "AMP_SESSION_EXPIRED" | "AMP_PERMISSION_DENIED"
  | "AMP_CONNECTION_FAILED" | "AMP_TARGET_OFFLINE" | "AMP_INSTANCE_OFFLINE"
  | "AMP_INVALID_SETTING" | "AMP_INVALID_API_METHOD" | "AMP_INVALID_PARAMETERS"
  | "AMP_TIMEOUT" | "AMP_CLI_FAILURE" | "AMP_UNSUPPORTED_CAPABILITY"
  | "AMP_SAFETY_POLICY_DENIED" | "AMP_CONFLICT" | "AMP_RESPONSE_INVALID" | "AMP_INTERNAL_ERROR";

export interface AmpErrorContext { ampModule?: string; ampMethod?: string; instanceId?: string; retryable?: boolean; status?: number; details?: unknown }

export class AmpError extends Error {
  readonly code: AmpErrorCode;
  readonly context: AmpErrorContext;
  constructor(code: AmpErrorCode, message: string, context: AmpErrorContext = {}, options?: ErrorOptions) {
    super(message, options); this.name = "AmpError"; this.code = code; this.context = context;
  }
  toJSON(): Record<string, unknown> {
    const out: Record<string, unknown> = { code: this.code, message: this.message, retryable: this.context.retryable ?? false };
    for (const key of ["ampModule", "ampMethod", "instanceId", "status", "details"] as const) {
      if (this.context[key] !== undefined) out[key] = this.context[key];
    }
    return out;
  }
}

export function normalizeError(error: unknown, context: AmpErrorContext = {}): AmpError {
  if (error instanceof AmpError) return error;
  if (error instanceof DOMException && error.name === "AbortError") return new AmpError("AMP_TIMEOUT", "AMP request timed out", { ...context, retryable: true }, { cause: error });
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("permission") || lower.includes("forbidden")) return new AmpError("AMP_PERMISSION_DENIED", message, context, { cause: error });
  if (lower.includes("session") || lower.includes("unauthorized") || lower.includes("not logged")) return new AmpError("AMP_SESSION_EXPIRED", message, context, { cause: error });
  return new AmpError("AMP_CONNECTION_FAILED", message, { ...context, retryable: true }, { cause: error });
}
