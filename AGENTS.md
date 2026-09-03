# Agent context

## Project contract

This repository is a strict TypeScript MCP server for CubeCoders AMP 2. Linux and Windows are first-class supported hosts. Node.js 20 or newer is required. Keep AMP 3 behavior behind a separate provider rather than silently changing AMP 2 semantics.

Normal tools use the AMP HTTP API and must behave identically on Linux and Windows. The optional `ampinstmgr` adapter is host-local. Its platform defaults are `/usr/bin/ampinstmgr` on Linux and `C:\Program Files\CubeCoders Limited\AMP\ampinstmgr.exe` on Windows; `AMPINSTMGR_PATH` overrides either. Do not introduce POSIX-only shell commands, path parsing or permission assumptions into runtime code.

## Security invariants

- Never accept AMP credentials, session IDs or arbitrary URLs as tool inputs. Credentials remain server configuration.
- Never expose an arbitrary shell or caller-controlled executable. CLI operations must use a fixed executable, fixed operation mapping, validated arguments and `shell: false`.
- Preserve the layered write, disruptive, destructive and host-privileged gates. Mutations are audited and are not automatically retried.
- Treat Linux service users and Windows service accounts as separate deployment concerns. CLI authorization is inherited from the MCP server process; it is not the configured AMP API user.
- Keep stdout reserved for MCP when using stdio. Logs and diagnostics go to stderr.
- Preserve path traversal defenses for AMP's virtual FileManager paths. Do not reinterpret those paths as host-native Windows or Linux paths.

## Cross-platform implementation rules

- Prefer Node APIs over shell commands in application code and tests.
- Use `node:path` deliberately: host executable/config paths may be native, while AMP FileManager paths remain slash-delimited virtual paths.
- Test platform selection through injectable or explicit platform values; do not mutate `process.platform`.
- Windows paths in JSON string values must escape backslashes; show paths in Markdown code spans. Direct `spawn` arguments do not need shell quoting, including paths with spaces.
- Keep child environments minimal. Preserve required Windows runtime variables without forwarding unrelated secrets.
- Docker is a Linux deployment target and does not establish Windows CLI compatibility.

## Verification

Run `npm run check` after changes. It performs lint, typecheck, unit tests and a production build. Add focused Linux and Windows cases for platform-dependent behavior.

Credentialed, read-only integration tests use `AMP_TEST_URL`, `AMP_TEST_USERNAME`, either `AMP_TEST_PASSWORD` or `AMP_TEST_LOGIN_TOKEN`, and optional `AMP_TEST_INSTANCE_ID`. Do not add destructive live tests. When testing local `ampinstmgr`, verify the process is running under the OS identity that owns or is authorized for the AMP instance store.

Read `README.md`, `docs/ARCHITECTURE.md`, `docs/AMP_COMPATIBILITY.md`, `docs/SECURITY.md` and `docs/TOOLS.md` before changing provider semantics, tool risk, authentication, paths or CLI behavior.
