# Architecture

## Boundaries

```text
MCP stdio / stateless HTTP
            |
     tools + resources
            |
 validation, risk policy, audit
            |
       AmpProvider
            |
     Amp2Provider (future Amp3Provider)
       |             |
 fixed-origin HTTP   ampinstmgr adapter
 ADS proxy sessions  host-local, fixed commands
```

`AmpProvider` is the version boundary. MCP registrations depend on this interface and normalized models, never on `fetch`. `Amp2Provider` translates common operations into AMP 2 calls and retains raw AMP fields where the product is module-dependent. A future AMP 3 implementation can replace the provider without changing tool schemas.

## AMP 2 request flow

The thin client posts only to the configured origin and fixed `API/{module}/{method}` or `API/ADSModule/Servers/{instanceId}/API/{module}/{method}` paths. Module, method and instance segments are syntactically constrained. It creates one controller session lazily, then one proxied session per managed instance. Concurrent callers share in-flight login promises. A 401 or session-shaped AMP error evicts the relevant session, logs in again, and retries the original call once.

Only reads marked idempotent receive bounded transport retries. Mutations are never blindly retried because their outcome can be unknown after a network failure.

## Discovery and caching

`Core/GetAPISpec` is cached per endpoint. Curated wrappers use known semantic operations, while `amp_call_api` validates the exact method and parameter names against that live spec. `Core/GetSettingsSpec` is normalized conservatively while preserving `raw`. API specs, settings specs and derived capabilities have a configurable TTL; status, console, metrics and players do not.

## Transports

Stdio is primary. Logs go to stderr so stdout remains MCP-only. Optional HTTP is stateless Streamable HTTP. It refuses an unauthenticated all-interface bind unless explicitly overridden. AMP credentials are server-side and are not accepted as tool parameters.

## Extension points

- Add an `Amp3Provider` implementing `AmpProvider`.
- Add a remote `ampinstmgr` backend behind the adapter; do not tunnel arbitrary shell commands.
- Add module-specific helpers only when their semantics are verified. Generic discovery already exposes new module APIs.
- Add native AMP WebSocket-to-MCP subscription bridging when AMP's public event protocol can be implemented reliably.
