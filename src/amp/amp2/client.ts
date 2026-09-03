import { Agent, fetch, type Dispatcher, type RequestInit } from "undici";
import type { Config } from "../../config/config.js";
import { AmpError, normalizeError } from "../../errors/amp-error.js";
import type { Logger } from "../../logging/logger.js";
import type { ApiSpec } from "../types.js";

type Fetcher = (url: string, init: RequestInit & { dispatcher?: Dispatcher }) => Promise<ResponseLike>;
interface ResponseLike { ok: boolean; status: number; statusText: string; text(): Promise<string> }
interface Session { id: string; mode: "bearer" | "legacy-session-body" }

const safeSegment = /^[A-Za-z][A-Za-z0-9_]*$/;
const safeInstanceId = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

export class Amp2HttpClient {
  private controllerSession: Session | undefined;
  private controllerLogin: Promise<Session> | undefined;
  private readonly instanceSessions = new Map<string, Session>();
  private readonly instanceLogins = new Map<string, Promise<Session>>();
  private readonly dispatcher?: Dispatcher;

  constructor(private readonly config: Config, private readonly logger: Logger, private readonly fetcher: Fetcher = fetch as unknown as Fetcher) {
    if (!config.verifyTls) this.dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
  }

  async close(): Promise<void> { if (this.dispatcher && "close" in this.dispatcher) await (this.dispatcher as Agent).close(); }

  async call(module: string, method: string, parameters: Record<string, unknown> = {}, instanceId?: string, idempotent = false): Promise<unknown> {
    this.validateAddress(module, method, instanceId);
    const invoke = async (): Promise<unknown> => {
      const session = await this.getSession(instanceId);
      const endpoint = instanceId
        ? `API/ADSModule/Servers/${encodeURIComponent(instanceId)}/API/${module}/${method}`
        : `API/${module}/${method}`;
      return this.request(endpoint, parameters, session, idempotent, { ampModule: module, ampMethod: method, ...(instanceId ? { instanceId } : {}) });
    };
    try { return await invoke(); }
    catch (error) {
      const normalized = normalizeError(error, { ampModule: module, ampMethod: method, ...(instanceId ? { instanceId } : {}) });
      if (normalized.code !== "AMP_SESSION_EXPIRED") throw normalized;
      this.clearSession(instanceId);
      return invoke();
    }
  }

  async publicApiSpec(): Promise<ApiSpec> {
    const result = await this.request("API/Core/GetAPISpec", {}, undefined, true, { ampModule: "Core", ampMethod: "GetAPISpec" });
    return result as ApiSpec;
  }

  clearSession(instanceId?: string): void {
    if (instanceId) { this.instanceSessions.delete(instanceId); this.instanceLogins.delete(instanceId); }
    else { this.controllerSession = undefined; this.controllerLogin = undefined; this.instanceSessions.clear(); this.instanceLogins.clear(); }
  }

  private validateAddress(module: string, method: string, instanceId?: string): void {
    if (!safeSegment.test(module) || !safeSegment.test(method) || (instanceId !== undefined && !safeInstanceId.test(instanceId))) {
      throw new AmpError("AMP_INVALID_PARAMETERS", "Invalid AMP module, method, or instance ID");
    }
  }

  private async getSession(instanceId?: string): Promise<Session> {
    if (!instanceId) return this.getControllerSession();
    const cached = this.instanceSessions.get(instanceId); if (cached) return cached;
    const pending = this.instanceLogins.get(instanceId); if (pending) return pending;
    const login = this.loginInstance(instanceId).finally(() => this.instanceLogins.delete(instanceId));
    this.instanceLogins.set(instanceId, login); return login;
  }

  private async getControllerSession(): Promise<Session> {
    if (this.controllerSession) return this.controllerSession;
    if (this.controllerLogin) return this.controllerLogin;
    this.controllerLogin = this.loginController().finally(() => { this.controllerLogin = undefined; });
    return this.controllerLogin;
  }

  private async loginController(): Promise<Session> {
    const result = await this.request("API/Core/Login", this.loginPayload(), undefined, false, { ampModule: "Core", ampMethod: "Login" });
    const session = this.parseLogin(result);
    this.controllerSession = session;
    this.logger.debug({ authMode: session.mode }, "Authenticated to AMP controller");
    return session;
  }

  private async loginInstance(instanceId: string): Promise<Session> {
    const controller = await this.getControllerSession();
    const grantResult = await this.request("API/ADSModule/ManageInstance", { InstanceId: instanceId }, controller, false, { ampModule: "ADSModule", ampMethod: "ManageInstance", instanceId });
    const grant = grantResult !== null && typeof grantResult === "object" ? grantResult as Record<string, unknown> : {};
    const granted = grant.Status ?? grant.status;
    const token = grant.Result ?? grant.result;
    if (granted !== true || typeof token !== "string" || token.length < 8) {
      const reason = [grant.Reason, grant.reason].find((value) => value !== undefined && value !== null && String(value).trim().length > 0);
      throw new AmpError("AMP_AUTHENTICATION_FAILED", reason === undefined ? "AMP did not grant access to the managed instance" : String(reason), { instanceId, retryable: false });
    }
    const endpoint = `API/ADSModule/Servers/${encodeURIComponent(instanceId)}/API/Core/Login`;
    const result = await this.request(endpoint, { username: this.config.username, password: "", token, rememberMe: false }, undefined, false, { ampModule: "Core", ampMethod: "Login", instanceId });
    const session = this.parseLogin(result);
    this.instanceSessions.set(instanceId, session);
    return session;
  }

  private loginPayload(): Record<string, unknown> {
    const token = normalizeLoginToken(this.config.username, this.config.loginToken);
    return { username: this.config.username, password: token ? "" : this.config.password, token, rememberMe: false };
  }

  private parseLogin(value: unknown): Session {
    const obj = value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
    const success = obj.success ?? obj.Success;
    const id = obj.sessionID ?? obj.sessionId ?? obj.SessionID;
    if (success !== true || typeof id !== "string" || id.length < 8) {
      const reason = [obj.resultReason, obj.reason, obj.Message].find((value) => value !== undefined && value !== null && String(value).trim().length > 0);
      throw new AmpError("AMP_AUTHENTICATION_FAILED", reason === undefined ? "AMP rejected the login" : String(reason), { retryable: false });
    }
    const mode = this.config.authMode === "legacy-session-body" ? "legacy-session-body" : "bearer";
    return { id, mode };
  }

  private async request(endpoint: string, parameters: Record<string, unknown>, session: Session | undefined, idempotent: boolean, context: { ampModule: string; ampMethod: string; instanceId?: string }): Promise<unknown> {
    const attempts = idempotent ? this.config.retryCount + 1 : 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
      try {
        const body = session?.mode === "legacy-session-body" ? { ...parameters, SESSIONID: session.id } : parameters;
        const headers: Record<string, string> = { "content-type": "application/json", accept: "application/vnd.cubecoders-ampapi, application/json", "user-agent": "amp-mcp-server/0.1" };
        if (session?.mode === "bearer") headers.authorization = `Bearer ${session.id}`;
        const init: RequestInit & { dispatcher?: Dispatcher } = { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal };
        if (this.dispatcher) init.dispatcher = this.dispatcher;
        const response = await this.fetcher(new URL(endpoint, this.config.ampUrl).toString(), init);
        const text = await response.text();
        const parsed = parseBody(text, response.status, context);
        if (!response.ok) throw httpError(response.status, response.statusText, parsed, context);
        return unwrapResponse(parsed, context);
      } catch (error) {
        lastError = normalizeError(error, { ...context, retryable: idempotent });
        if (lastError instanceof AmpError && (lastError.code === "AMP_SESSION_EXPIRED" || lastError.code === "AMP_PERMISSION_DENIED" || lastError.code === "AMP_RESPONSE_INVALID")) throw lastError;
        if (attempt + 1 >= attempts) throw lastError;
        await new Promise((resolve) => setTimeout(resolve, Math.min(250 * 2 ** attempt, 2_000)));
      } finally { clearTimeout(timer); }
    }
    throw lastError;
  }
}

function parseBody(text: string, status: number, context: object): unknown {
  if (text.trim() === "") return null;
  try { return JSON.parse(text); }
  catch (error) { throw new AmpError("AMP_RESPONSE_INVALID", `AMP returned non-JSON content (HTTP ${status})`, { ...context, status }, { cause: error }); }
}

function unwrapResponse(value: unknown, context: { ampModule: string; ampMethod: string; instanceId?: string }): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if ("Title" in obj || "Message" in obj || "StackTrace" in obj) {
      const message = String(obj.Message ?? obj.Title ?? "AMP API error");
      const lower = message.toLowerCase();
      const code = lower.includes("session") || lower.includes("logged in") ? "AMP_SESSION_EXPIRED" : lower.includes("permission") || lower.includes("access denied") ? "AMP_PERMISSION_DENIED" : "AMP_INVALID_PARAMETERS";
      throw new AmpError(code, message, { ...context, retryable: code === "AMP_SESSION_EXPIRED", details: { title: obj.Title } });
    }
    if (Object.keys(obj).length === 1 && "result" in obj) return obj.result;
  }
  return value;
}

function httpError(status: number, statusText: string, body: unknown, context: object): AmpError {
  const message = body && typeof body === "object" && "Message" in body ? String((body as Record<string, unknown>).Message) : `AMP HTTP ${status}: ${statusText}`;
  if (status === 401) return new AmpError("AMP_SESSION_EXPIRED", message, { ...context, status, retryable: true });
  if (status === 403) return new AmpError("AMP_PERMISSION_DENIED", message, { ...context, status });
  if (status === 408 || status === 429 || status >= 500) return new AmpError("AMP_CONNECTION_FAILED", message, { ...context, status, retryable: true });
  return new AmpError("AMP_INVALID_PARAMETERS", message, { ...context, status });
}

function normalizeLoginToken(username: string, token: string): string {
  const separator = token.indexOf(":");
  if (separator <= 0 || token.slice(0, separator).toLowerCase() !== username.toLowerCase()) return token;
  return token.slice(separator + 1);
}
