# AMP compatibility and researched limitations

## Evidence base

Research was performed on 2026-09-03 against:

- [CubeCoders' official Node client](https://github.com/CubeCoders/ampapi-node), which dynamically generates methods but remains a minimal `SESSIONID`-body client.
- [AMP's issue/documentation repository](https://github.com/CubeCoders/AMP) and the locally generated `/API` convention.
- The community [versioned API specification snapshot](https://github.com/p0t4t0sandwich/ampapi-spec) and generated clients for signatures and module inheritance.
- CubeCoders' [AMP 2.6.2 release notes](https://discourse.cubecoders.com/t/amp-phobos-2-6-2-release-notes/28134), which announce bearer authorization and deprecate CLI instance creation.
- CubeCoders' [AMP 2.7.2 release notes](https://discourse.cubecoders.com/t/amp-deimos-2-7-2-release-notes/39817), which describe native instance WebSockets replacing UI `GetUpdates` polling when available.
- CubeCoders' [AMP 2.8 Proteus release notes](https://discourse.cubecoders.com/t/amp-proteus-2-8-0-release-notes/40953), including backup/scheduler behavior.
- The CubeCoders community [ampinstmgr reference](https://discourse.cubecoders.com/t/amp-instance-manager-command-line-reference/2249).
- [eddinsw/amp-mcp-server](https://github.com/eddinsw/amp-mcp-server) for comparison with an existing curated MCP implementation.

## Supported range

The provider targets AMP 2 and defaults to current bearer sessions. It is architecture- and source-reviewed through AMP 2.8.0.4, but this repository has no real AMP credentials, so the included integration suite was not run against that release here. `AMP_AUTH_MODE=legacy-session-body` supports older AMP 2 explicitly. AMP 3 is not claimed as compatible.

The authenticated local `Core/GetAPISpec` and `Core/GetSettingsSpec` are authoritative at runtime. This avoids assuming a community 2.6.2 snapshot still exactly describes a 2.8 module.

Linux and Windows are supported MCP hosts. The HTTP provider has the same behavior on both. For optional local CLI calls, the defaults are `/usr/bin/ampinstmgr` on Linux and `C:\Program Files\CubeCoders Limited\AMP\ampinstmgr.exe` on Windows. CubeCoders documents the same CLI operations on both platforms, with a small number of explicitly Linux-only flags that this server does not use. The version probe uses the documented cross-platform `-version` flag.

## Authentication model

`Core/Login(username,password,token,rememberMe)` returns a session ID. Since AMP 2.6.2, subsequent calls should send it as `Authorization: Bearer SESSION_ID`; body `SESSIONID` is deprecated. `token` can be a remembered/service-login token or second factor depending on the account flow. This server supports password or pre-provisioned login token, re-login after expiry, and distinct ADS-proxied instance sessions. Interactive WebAuthn/OIDC browser flows are not suitable for unattended startup.

## Gaps and deliberate omissions

- AMP's full source and live `/API` are installation-only. Signatures are validated live; absent methods return explicit errors.
- Native console/state WebSockets exist in AMP 2.7.2+, but their stable public protocol is not documented sufficiently for a production subscription bridge. `amp_get_console` uses the supported on-demand `Core/GetUpdates`; it does not aggressively poll.
- Player APIs differ by module. Curated operations resolve advertised methods. No generic unban or direct-message method appears in the researched common spec, so no console syntax is invented.
- The file API uses chunk/base64 transfer. MCP responses are bounded by `AMP_MAX_FILE_BYTES`; use AMP SFTP/dedicated transfer facilities for large files.
- Backup metadata/progress shapes vary. Tools preserve AMP's payload. AMP 2.8 changed running-backup safety; honor module quiesce/shutdown support.
- Scheduler is triggers plus tasks. `amp_create_schedule` creates an interval trigger. Discover `Core/GetUserActionsSpec`, then call validated `Core/AddTask` for module-specific actions.
- No verified one-call clone-live-instance API appears in the common spec. Application specs/deployment templates are exposed instead.
- `ampinstmgr createInstance` is omitted because CubeCoders deprecated it in favor of the ADS API. Unusual recovery operations remain manual until their semantics are verified.
- Host firewall, OS users/packages, external containers, licences and arbitrary shell are outside normal tools.

## UI/API differences

AMP's UI composes multi-step workflows—instance creation, scheduler tasks, network reconfiguration and WebSocket updates—from APIs plus UI metadata. This server exposes stable components and dry runs, but does not reproduce undocumented UI orchestration. Long-tail functions remain reachable only when advertised by the live spec and allowed by policy.
