import type { Config } from "../config/config.js";
import { AmpError } from "../errors/amp-error.js";

export enum RiskLevel { READ_ONLY = "READ_ONLY", LOW_RISK_WRITE = "LOW_RISK_WRITE", INSTANCE_DISRUPTIVE = "INSTANCE_DISRUPTIVE", DESTRUCTIVE = "DESTRUCTIVE", HOST_PRIVILEGED = "HOST_PRIVILEGED" }

export class SecurityPolicy {
  constructor(private readonly config: Config) {}
  assertAllowed(risk: RiskLevel): void {
    if (risk === RiskLevel.READ_ONLY) return;
    const allowed = this.config.allowWrites &&
      (risk === RiskLevel.LOW_RISK_WRITE ||
       (risk === RiskLevel.INSTANCE_DISRUPTIVE && this.config.allowDisruptive) ||
       (risk === RiskLevel.DESTRUCTIVE && this.config.allowDestructive) ||
       (risk === RiskLevel.HOST_PRIVILEGED && this.config.allowHostPrivileged));
    if (!allowed) throw new AmpError("AMP_SAFETY_POLICY_DENIED", `${risk} operation is disabled by server policy`, { details: { risk } });
  }
  get flags() { return { writes: this.config.allowWrites, disruptive: this.config.allowDisruptive, destructive: this.config.allowDestructive, hostPrivileged: this.config.allowHostPrivileged, genericWrites: this.config.genericApiAllowWrites }; }
}

const readPrefixes = /^(Get|List|Search|Describe|Check|Current|Calculate|Read|Show|Query)/i;
const destructive = /^(Delete|Remove|Trash|Empty|Restore|Reset|Kill|Detach|Revoke)/i;
const disruptive = /^(Stop|Restart|Sleep|Suspend|Update|Upgrade|Rebind|Reactivate)/i;
export function classifyApiMethod(method: string): RiskLevel {
  if (/^(UpgradeAMP|UpgradeInstance|UpgradeAllInstances|UpdateAMPInstance|RestartAMP|AttachADS|AttachADSWithPairingCode|DetachTarget|RegisterTarget|RegisterTargetWithCode|SetInstanceNetworkInfo|ApplyInstanceConfiguration|ModifyCustomFirewallRule|AddDatastore|DeleteDatastore|MoveInstanceDatastore|RepairDatastore)$/i.test(method)) return RiskLevel.HOST_PRIVILEGED;
  if (/^(CreateInstance|CreateInstanceFromSpec|CreateLocalInstance|DeployTemplate|ApplyTemplate|ExtractArchive|WriteFileChunk|SetAMPRolePermission|SetAMPUserRoleMembership)$/i.test(method)) return RiskLevel.DESTRUCTIVE;
  if (readPrefixes.test(method)) return RiskLevel.READ_ONLY;
  if (destructive.test(method)) return RiskLevel.DESTRUCTIVE;
  if (disruptive.test(method)) return RiskLevel.INSTANCE_DISRUPTIVE;
  return RiskLevel.LOW_RISK_WRITE;
}
