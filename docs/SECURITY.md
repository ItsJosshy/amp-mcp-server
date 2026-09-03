# Security model

## Trust boundaries

The AMP credential normally grants broad administrative power. Create a dedicated AMP user with only the permissions required by enabled tools. Stdio trusts the launching OS process. HTTP additionally needs network TLS at a reverse proxy and a long random `MCP_HTTP_BEARER_TOKEN` (or a local-only bind).

ADS-managed instance sessions use short-lived grants returned by `ADSModule/ManageInstance`. These grants remain inside the HTTP client and are never returned through MCP tools, resources, logs or audit records.

TLS verification is on by default. `AMP_VERIFY_TLS=false` changes only this client's dedicated connection pool and emits a warning; it never changes Node's process-wide TLS behavior.

## Risk gates

| Level | Examples | Required flags |
|---|---|---|
| `READ_ONLY` | discovery, status, API/settings metadata, reads | none |
| `LOW_RISK_WRITE` | console command, setting, backup creation | `AMP_ALLOW_WRITES=true` |
| `INSTANCE_DISRUPTIVE` | stop, restart, application update | writes + `AMP_ALLOW_DISRUPTIVE=true` |
| `DESTRUCTIVE` | kill, restore/delete backup, delete instance/user/role/file | writes + `AMP_ALLOW_DESTRUCTIVE=true` |
| `HOST_PRIVILEGED` | AMP upgrades, network rebind, ampinstmgr mutations | writes + `AMP_ALLOW_HOST_PRIVILEGED=true` |

Dry runs validate and describe an action without needing the mutation gate. Generic calls are separately controlled by `AMP_ENABLE_GENERIC_API`; generic mutations also require `AMP_GENERIC_API_ALLOW_WRITES` and the inferred risk gate. Unknown generic method names default to a write classification.

## Files and host execution

Normal file tools reject absolute paths, Windows drive roots, backslashes, `.`/`..`, NULs and home expansion. AMP's FileManager API then enforces the instance root. Reads/writes are size-limited. Text is strict UTF-8; binary uses base64. Expected MD5 guards prevent concurrent overwrite. File content is redacted from audit logs.

There is no arbitrary host execution tool. `ampinstmgr` uses `spawn(path, args, {shell:false})`, fixed command builders, argument validation, a minimal environment, output limits and timeouts. On Windows, only the system variables needed to launch a native executable are added to that minimal environment. It is disabled by default and only operates on the local host.

CLI authorization comes from the MCP server's OS identity, not from `AMP_USERNAME`. On Linux, run CLI-enabled deployments as the AMP-owning service account rather than broadening instance-store permissions. On Windows, use a dedicated service account authorized for AMP and avoid running an interactive MCP client as an unrestricted administrator. Prefer the authenticated HTTP provider whenever host-local access is unnecessary.

## Audit records

Every mutating tool records timestamp, tool, risk, redacted parameters, outcome and duration. Generic calls add target/module/method. Passwords, tokens, sessions, credentials, authorization headers and file bodies are recursively redacted. Audit output is JSON; a configured file is append-only and created with mode `0600`.

## Operator responsibilities

- Protect `.env`, MCP client configuration and audit files with OS permissions.
- Put remote HTTP behind HTTPS and network access controls.
- Rotate the dedicated AMP password/token and MCP HTTP token.
- Review dry runs before enabling destructive operations.
- AMP can bind sessions to origin IP; configure reverse-proxy awareness and sticky routing correctly.
