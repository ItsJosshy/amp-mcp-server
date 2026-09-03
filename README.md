# AMP MCP Server

A strict TypeScript Model Context Protocol server for administering CubeCoders AMP 2 through structured APIs. It combines curated tools for common work with a live-spec-validated API escape hatch, module-neutral settings discovery, ADS target/instance proxying, risk gates, dry runs, audit logs, and an optional fixed-command `ampinstmgr` fallback.

Browser automation is not used.

## Status and scope

The vertical slice—health, instances, status, lifecycle, console, settings, backups and dynamic API discovery—is implemented, tested with mocks, and extended across files, provisioning, users/roles, scheduler triggers, players, updates, resources and CLI operations. The transport is designed against current AMP 2 bearer sessions and reviewed through AMP 2.8.0.4. A live integration suite is included but cannot be certified here without an AMP installation. Read [compatibility and known gaps](docs/AMP_COMPATIBILITY.md) before production rollout.

## Architecture

MCP tools and resources depend on an `AmpProvider` interface. `Amp2Provider` owns AMP 2 semantics, a fixed-origin HTTP client, ADS proxy sessions, metadata caches and normalization. Security policy and audit wrapping sit above it. The host-local CLI adapter is separate and never exposes a shell. See [architecture](docs/ARCHITECTURE.md) and [security](docs/SECURITY.md).

## Requirements

- Node.js 20 or newer (the Docker image uses Node 24)
- Linux or Windows for the supported native host configurations
- An AMP 2 ADS/controller endpoint
- A dedicated AMP account with the least permissions needed
- Optional: local `ampinstmgr` when the server runs on the AMP host

## Platform support

The MCP transports and AMP HTTP provider are supported on Linux and Windows. They may connect to an AMP controller on the same machine or a remote host. The optional `ampinstmgr` adapter is host-local and has additional identity requirements.

| Platform | Default `ampinstmgr` path | Required process identity |
|---|---|---|
| Linux | `/usr/bin/ampinstmgr` | The AMP service account that owns the instance store (commonly `amp`) |
| Windows | `C:\Program Files\CubeCoders Limited\AMP\ampinstmgr.exe` | A Windows account authorized to access and manage the AMP installation |

Paths containing spaces are passed directly to Node's process API; no shell quoting is needed. Set `AMPINSTMGR_PATH` when AMP is installed elsewhere. Do not enable CLI support for a remote AMP controller: CLI operations always affect the MCP server's own host.

## Install and verify

Linux:

```bash
npm install
cp .env.example .env
# edit .env
npm run check
npm start
```

Windows PowerShell:

```powershell
npm install
Copy-Item .env.example .env
# edit .env
npm run check
npm start
```

Development commands:

```bash
npm run dev
npm run build
npm test
npm run lint
npm run typecheck
```

## AMP account setup

Create a dedicated non-human account in AMP. Grant read permissions for ADS targets/instances, status, settings, console and the plugins you intend to use. Add mutation permissions only when the corresponding MCP risk flags are enabled. FileManager, LocalFileBackup, Scheduler and user-management permissions are separate in AMP; inspect them with `amp_get_permissions`.

AMP may require a pre-created service/remembered-login token for unattended accounts using MFA. Supply the complete value displayed by AMP (including its `username:` prefix, when present) as `AMP_LOGIN_TOKEN`, not as a tool input. The client safely normalizes the prefix before login. AMP can bind tokens to the source IP, so create the token from the same host/network path that the MCP server will use. Do not put credentials in source control.

## Configuration

| Variable | Default | Meaning |
|---|---:|---|
| `AMP_URL` | required | ADS/controller HTTP(S) base URL |
| `AMP_USERNAME` | required | Dedicated AMP user |
| `AMP_PASSWORD` | — | Password; required unless login token is set |
| `AMP_LOGIN_TOKEN` | — | Service/remembered token alternative |
| `AMP_AUTH_MODE` | `bearer` | `bearer` or explicit `legacy-session-body` |
| `AMP_VERIFY_TLS` | `true` | Verify certificates; false is connection-local opt-in |
| `AMP_REQUEST_TIMEOUT_MS` | `15000` | HTTP request timeout |
| `AMP_RETRY_COUNT` | `2` | Transport retries for idempotent reads only |
| `AMP_METADATA_CACHE_TTL_MS` | `300000` | API/settings/capability metadata TTL |
| `AMP_MAX_FILE_BYTES` | `1048576` | Maximum MCP file payload |
| `AMP_ALLOW_WRITES` | `false` | Enable low-risk mutations |
| `AMP_ALLOW_DISRUPTIVE` | `false` | Enable disruptive operations when writes are enabled |
| `AMP_ALLOW_DESTRUCTIVE` | `false` | Enable destructive operations when writes are enabled |
| `AMP_ALLOW_HOST_PRIVILEGED` | `false` | Enable host-impacting operations when writes are enabled |
| `AMP_ENABLE_GENERIC_API` | `true` | Register/use live API discovery path |
| `AMP_GENERIC_API_ALLOW_WRITES` | `false` | Additional gate for generic mutations |
| `AMP_ENABLE_CLI` | `false` | Allow fixed local ampinstmgr commands |
| `AMPINSTMGR_PATH` | platform default | Exact executable path; Linux and Windows defaults are listed above |
| `AMP_CLI_TIMEOUT_MS` | `60000` | CLI timeout |
| `AMP_LOG_LEVEL` | `info` | Pino JSON log level |
| `AMP_AUDIT_LOG` | stderr | Optional JSONL audit file |
| `MCP_TRANSPORT` | `stdio` | `stdio` or `http` |
| `MCP_HTTP_HOST` / `PORT` | `127.0.0.1` / `3000` | HTTP binding |
| `MCP_HTTP_BEARER_TOKEN` | — | Static protection for remote HTTP |
| `MCP_HTTP_ALLOWED_HOSTS` | — | Comma-separated Host allowlist |
| `MCP_HTTP_ALLOWED_ORIGINS` | — | Comma-separated browser Origin allowlist |

`AMP_CONFIG_FILE` can point to a JSON object using these environment-style keys. Environment variables override file values.

## MCP client configuration

Copy [examples/mcp-client.json](examples/mcp-client.json) and replace the absolute path and secrets. This layout works for clients that use the standard `mcpServers` stdio configuration, including Claude Desktop and Cursor. For clients with a CLI, configure the same executable and environment.

Use normal JSON escaping for Windows paths, for example `C:\\src\\amp-mcp-server\\dist\\index.js`. The MCP client process identity also becomes the `ampinstmgr` identity when CLI support is enabled.

### Install in Codex

Codex CLI, the Codex IDE extension and the ChatGPT desktop app share MCP configuration on the same Codex host. The recommended local setup is a stdio server registered with the Codex CLI. Build the server and keep its AMP credentials only in this repository's ignored `.env` file.

From the repository root on Linux:

```bash
npm ci
npm run build
test -f .env
chmod 600 .env

codex mcp add amp \
  --env DOTENV_CONFIG_PATH="$PWD/.env" \
  -- node "$PWD/dist/index.js"
```

From the repository root in Windows PowerShell:

```powershell
npm ci
npm run build
if (-not (Test-Path .env)) { throw "Create and configure .env first" }
$repo = (Get-Location).Path

codex mcp add amp `
  --env "DOTENV_CONFIG_PATH=$repo\.env" `
  -- node "$repo\dist\index.js"
```

`DOTENV_CONFIG_PATH` contains only the path to the secret file; it does not copy AMP credentials into Codex's `config.toml`. Run `codex mcp list` to confirm that `amp` is registered. Then start a new Codex session, restart the IDE extension, or restart the desktop app. In the Codex terminal UI, use `/mcp` to confirm that the server is connected.

Codex stores global MCP settings in `~/.codex/config.toml`. Trusted projects may instead use `.codex/config.toml`. For manual configuration, use absolute paths:

```toml
[mcp_servers.amp]
command = "node"
args = ["/absolute/path/to/amp-mcp-server/dist/index.js"]
cwd = "/absolute/path/to/amp-mcp-server"
enabled = true
required = false
startup_timeout_sec = 15
tool_timeout_sec = 120
default_tools_approval_mode = "writes"
```

With `cwd` set to the repository root, `dotenv` loads `.env` automatically. On Windows, TOML basic strings require escaped backslashes, such as `cwd = "C:\\src\\amp-mcp-server"`; forward-slash paths are also acceptable to Node. `default_tools_approval_mode = "writes"` lets annotated read-only tools run automatically while asking before tools that Codex considers mutating. The MCP server's own `AMP_ALLOW_*` gates still apply and remain the final authority.

Once connected, ask Codex explicitly when AMP is relevant, for example:

- `Use the amp MCP to list instances and summarize their current status.`
- `Use the amp MCP to inspect the capabilities and settings for <instance>.`
- `Dry-run an AMP restart for <instance>; do not execute it.`

Codex can then select the appropriate `amp_*` tools when needed. Read operations work with the default policy. Actual mutations require both Codex approval and the corresponding server-side flags in `.env`. Keep `AMP_ENABLE_CLI=false` unless Codex itself is running under the AMP-authorized operating-system account.

After changing TypeScript source, run `npm run build` and restart the Codex MCP connection so it launches the updated `dist/index.js`. Useful diagnostics are:

```bash
codex mcp list
codex mcp --help
```

See the official [Codex MCP documentation](https://developers.openai.com/codex/mcp/) for current configuration options and client-specific controls.

To inspect interactively:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

For optional HTTP:

```bash
MCP_TRANSPORT=http MCP_HTTP_HOST=127.0.0.1 npm start
# endpoint: http://127.0.0.1:3000/mcp
```

Use HTTPS at a reverse proxy for remote access. An all-interface bind without a bearer token is refused unless the unsafe override is explicitly set.

## Dynamic discovery workflow

1. Call `amp_list_instances` and select a stable ID.
2. Call `amp_get_capabilities`.
3. Search with `amp_search_api` or `amp_search_settings`.
4. Inspect exact signatures with `amp_describe_api_method` or `amp_describe_setting`.
5. Use a curated tool when available; otherwise dry-run `amp_call_api`.
6. Enable only the smallest needed write/risk gates.

The generic tool accepts `{instanceId?, module, method, parameters}`. It validates against that endpoint's cached live `Core/GetAPISpec` and constructs no caller-controlled URL. Use `amp_invalidate_cache` after an AMP/module upgrade.

## Resources

- `amp://targets`
- `amp://instances`
- `amp://api/spec`
- `amp://instances/{instanceId}/status`
- `amp://instances/{instanceId}/settings`
- `amp://instances/{instanceId}/api/spec`

Status resources include the module-dependent metrics map. Console is a tool because reading `GetUpdates` advances session-local deltas.

## Tools and safety

See the full [tool reference](docs/TOOLS.md). Tool schemas include MCP read-only/destructive annotations and descriptions state policy requirements. Mutating tools support `dryRun` where practical. Writes default off and every mutation is audited with recursive secret/file-body redaction.

`amp_update_application` updates the hosted game/application. `amp_upgrade_instance` upgrades AMP inside one managed instance. `amp_update_amp` upgrades the controller. These are deliberately separate.

## Testing against AMP

Unit tests use mock responses and cover authentication/session recovery, client behavior, API validation, settings validation, traversal prevention, security gates and CLI arguments. Optional integration tests perform reads only:

```bash
AMP_TEST_URL=https://amp.example.com \
AMP_TEST_USERNAME=mcp-test \
AMP_TEST_PASSWORD='...' \
AMP_TEST_INSTANCE_ID='optional-id' \
npm run test:integration
```

Use a read-only test account. Destructive integration actions are intentionally absent.

## Docker

```bash
docker build -t amp-mcp-server .
docker run --rm -i --env-file .env amp-mcp-server
```

The multi-stage image runs as UID 10001. Host-local `ampinstmgr` is normally inappropriate inside this container unless explicitly mounted and provisioned with the correct host permissions.

## Troubleshooting

- `AMP_AUTHENTICATION_FAILED`: verify URL, dedicated username, password/token and MFA/service-login setup.
- `AMP_SESSION_EXPIRED`: the client retries one re-login. Repeated failures often indicate reverse-proxy IP changes; enable AMP's reverse-proxy setting and sticky routing.
- `AMP_PERMISSION_DENIED`: grant the specific AMP permission or keep that feature disabled.
- `AMP_INVALID_API_METHOD`: refresh metadata; the method is not present on that controller/instance/module.
- self-signed TLS: install the CA in the host trust store. Use `AMP_VERIFY_TLS=false` only as an explicit temporary choice.
- target/instance unavailable: check ADS pairing/network and use `amp_health`, `amp_list_targets`, then `amp_list_instances`.
- no console entries: `Core/GetUpdates` is delta-oriented per session; call after events occur.
- CLI failure: ensure `AMP_ENABLE_CLI=true`, the executable exists at the platform default or `AMPINSTMGR_PATH`, and the process runs as the correct Linux service account or authorized Windows account. Remember CLI creation is deprecated upstream.

## Future AMP versions

Keep AMP 3 behavior behind a new `AmpProvider`. Reuse MCP tools only where semantics match; do not alias changed AMP 3 calls into AMP 2 names. Add contract tests, new normalization, and provider selection during startup. Live API/settings discovery should remain the long-tail compatibility layer, not a replacement for versioned semantic adapters.

## License

This implementation is provided under the MIT license. CubeCoders AMP is a separate proprietary product and no AMP binaries or source are redistributed.
