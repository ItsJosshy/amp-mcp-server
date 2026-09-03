# Tool reference

Every result is an object with `success` and either `data` or structured `error`. Every tool description published through MCP includes its risk and required server flags. Stable `instanceId` values come from `amp_list_instances`; display names are not identifiers.

## Discovery and status (`READ_ONLY`)

| Tool | Purpose |
|---|---|
| `amp_health` | Authenticated health, latency, provider and TLS mode |
| `amp_server_info` | Controller module/version metadata |
| `amp_list_targets` | ADS targets/nodes |
| `amp_list_instances` | Instances across targets |
| `amp_get_instance` | One normalized instance record |
| `amp_get_instance_status` | Live state, uptime and metrics |
| `amp_get_metrics` | Alias emphasizing the consolidated status/metrics payload |
| `amp_search_instances` | Search normalized instance metadata |
| `amp_get_capabilities` | Infer features and enumerate methods from live API spec |

Individual CPU, memory, disk, network, players and uptime tools are intentionally consolidated because AMP modules return a dynamic `Core/GetStatus.Metrics` map.

## Lifecycle

| Tool | Risk | Notes |
|---|---|---|
| `amp_start_instance` | low-risk write | Optional wait/poll |
| `amp_stop_instance` | disruptive | Graceful AMP stop; optional wait |
| `amp_restart_instance` | disruptive | ADS-managed restart |
| `amp_kill_instance` | destructive | Forced application termination |
| `amp_sleep_instance` | disruptive | Module-dependent sleep |
| `amp_update_application` | disruptive | Hosted game/application update |
| `amp_update_instance` | disruptive | Compatibility alias for hosted application update |
| `amp_start_all` / `amp_stop_all` | low/disruptive | Scoped to one target ID |

## Console and players

`amp_get_console`, `amp_get_recent_console`, and `amp_send_console` expose AMP console snapshots and writes. `amp_list_players` and `amp_get_player` use the common player map. `amp_kick_player`, `amp_ban_player`, `amp_whitelist_player`, and `amp_unwhitelist_player` select only methods advertised by the instance module and otherwise return unsupported capability.

## Dynamic settings

| Tool | Purpose |
|---|---|
| `amp_get_settings` | Full normalized live specification |
| `amp_list_setting_categories` | Distinct categories |
| `amp_search_settings` | Search node/name/description |
| `amp_get_setting` / `amp_describe_setting` | Exact metadata plus current value |
| `amp_set_setting` | Validate and call `Core/SetConfig` |

Normalized output can include node, display name, description, current/default value, value type, choices, min/max, restart requirement and read-only state. `raw` retains fields that AMP adds or the normalizer does not understand.

## API discovery and escape hatch

| Tool | Purpose |
|---|---|
| `amp_list_api_modules` | Modules from live `Core/GetAPISpec` |
| `amp_search_api` | Search methods/descriptions/parameters |
| `amp_describe_api_method` | Exact live signature |
| `amp_call_api` | Call only an advertised method with exact advertised parameter names |
| `amp_invalidate_cache` | Clear local metadata caches |

`amp_call_api` never accepts a URL. Generic reads need `AMP_ENABLE_GENERIC_API`; writes additionally need `AMP_GENERIC_API_ALLOW_WRITES` and the ordinary risk gate. Start with `dryRun:true` for mutations.

## Files

`amp_list_files`, `amp_stat_file`, `amp_read_file`, `amp_download_file`, `amp_write_file`, `amp_create_file`, `amp_upload_file`, `amp_create_directory`, `amp_delete_file`, `amp_delete_directory`, `amp_rename_file`, `amp_move_file`, `amp_copy_file`, `amp_extract_archive`, and `amp_create_archive` use `FileManagerPlugin`. Paths are instance-relative. Text is UTF-8, binary is base64, transfers are bounded, and writes accept `expectedMd5`.

Delete/trash and archive extraction are destructive. AMP controls whether trash recovery is available.

## Backups

`amp_list_backups`, `amp_create_backup`, `amp_restore_backup`, `amp_delete_backup`, `amp_pin_backup`, and `amp_unpin_backup` use `LocalFileBackupPlugin`. Restore/delete are destructive. Creation returns AMP's task/action result; use console/tasks or dynamic APIs for version-specific progress.

## Instance deployment and updates

| Tool | Purpose / distinction |
|---|---|
| `amp_get_instance_creation_options` | Apps/specs, targets, datastores, fitness, ports and live signature |
| `amp_get_provisioning_options` | Dynamic module provisioning fields |
| `amp_create_instance` | Module-neutral `CreateInstanceFromSpec` with dry run |
| `amp_delete_instance` | Delete resolved stable ID |
| `amp_reconfigure_instance` | Apply provisioning settings (host privileged) |
| `amp_rebind_instance` | Network/IP/ports (host privileged) |
| `amp_upgrade_instance` | Upgrade AMP runtime inside one instance, not its game |
| `amp_update_all_instances` | Upgrade AMP runtimes on a target |
| `amp_check_updates` | Read update metadata |
| `amp_update_amp` | Upgrade ADS/controller AMP software |

## Users, roles and permissions

`amp_list_users`, `amp_get_user`, `amp_create_user`, `amp_update_user`, `amp_delete_user`, and `amp_reset_user_password` never return secrets. Password inputs are audited as redacted.

`amp_list_roles`, `amp_get_role`, `amp_create_role`, `amp_update_role`, `amp_delete_role`, `amp_get_permissions`, and `amp_set_permissions` manage AMP role authorization. Deleting identities and changing permissions are destructive.

## Scheduler

`amp_list_schedules`, `amp_get_schedule`, `amp_create_schedule`, `amp_update_schedule`, `amp_delete_schedule`, `amp_enable_schedule`, and `amp_disable_schedule` manage interval triggers. Use `Core/GetUserActionsSpec` and `Core/AddTask` through the generic discovery path for module-specific scheduled tasks.

## ampinstmgr

Read operations: `amp_cli_info`, `amp_cli_list_instances`, `amp_cli_instance_info`, `amp_cli_last_log`, and `amp_cli_show_ports`.

Host-privileged operations: `amp_cli_start`, `amp_cli_stop`, `amp_cli_restart`, `amp_cli_upgrade`, `amp_cli_reconfigure`, `amp_cli_rebind`, and `amp_cli_delete_instance`.

All require `AMP_ENABLE_CLI=true`; mutations also require the host-privileged policy. The server must run on the AMP host as an OS account authorized to manage AMP. On Linux this is normally the account that owns the AMP instance store (commonly `amp`). On Windows use an account authorized for the AMP installation and its instance-manager registry/store. The executable defaults to `/usr/bin/ampinstmgr` on Linux and `C:\Program Files\CubeCoders Limited\AMP\ampinstmgr.exe` on Windows; override `AMPINSTMGR_PATH` for non-default installations.
