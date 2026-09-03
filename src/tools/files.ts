import { createHash } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AmpError } from "../errors/amp-error.js";
import { RiskLevel } from "../security/policy.js";
import { validateInstancePath } from "../security/paths.js";
import { dryRun, registerTool, type ToolContext } from "./context.js";
import { dryRunField, instanceId } from "./schemas.js";

const path = z.string().max(1024).transform((value) => validateInstancePath(value));
const filePath = z.string().min(1).max(1024).transform((value) => validateInstancePath(value, false));

export function registerFileTools(server: McpServer, ctx: ToolContext): void {
  const call = (instanceId: string, method: string, parameters: Record<string, unknown>, idempotent = false) => ctx.provider.callApi("FileManagerPlugin", method, parameters, { instanceId, idempotent });
  registerTool(server, ctx, "amp_list_files", { title: "List instance files", description: "List an AMP-authorized instance directory. Paths are always relative to the instance root.", risk: RiskLevel.READ_ONLY, schema: { instanceId, path: path.default("") } }, ({ instanceId, path }) => call(instanceId, "GetDirectoryListing", { Dir: path }, true));
  registerTool(server, ctx, "amp_stat_file", { title: "Stat instance file", description: "Find one file/directory entry using the AMP directory listing API.", risk: RiskLevel.READ_ONLY, schema: { instanceId, path: filePath } }, async ({ instanceId, path }) => {
    const slash = path.lastIndexOf("/"); const dir = slash < 0 ? "" : path.slice(0, slash); const name = slash < 0 ? path : path.slice(slash + 1); const listing = await call(instanceId, "GetDirectoryListing", { Dir: dir }, true);
    const entry = Array.isArray(listing) ? listing.find((v) => v && typeof v === "object" && ["Filename", "Name", "FileName"].some((k) => String((v as Record<string, unknown>)[k] ?? "") === name)) : undefined;
    if (!entry) throw new AmpError("AMP_INVALID_PARAMETERS", `File not found in AMP listing: ${path}`, { instanceId }); return entry;
  });
  registerTool(server, ctx, "amp_read_file", { title: "Read instance text file", description: "Read up to AMP_MAX_FILE_BYTES via AMP's chunk API and decode strict UTF-8. Binary files should use amp_download_file.", risk: RiskLevel.READ_ONLY, schema: { instanceId, path: filePath, maxBytes: z.number().int().min(1).optional() } }, async ({ instanceId, path, maxBytes }) => {
    const limit = Math.min(maxBytes ?? ctx.config.maxFileBytes, ctx.config.maxFileBytes); const raw = await call(instanceId, "ReadFileChunk", { Filename: path, Offset: 0, ChunkSize: limit + 1 }, true); const encoded = actionResult(raw); const buffer = decodeChunk(encoded);
    if (buffer.byteLength > limit) throw new AmpError("AMP_INVALID_PARAMETERS", `File exceeds configured ${limit} byte read limit`, { instanceId });
    let content: string; try { content = new TextDecoder("utf-8", { fatal: true }).decode(buffer); } catch { throw new AmpError("AMP_INVALID_PARAMETERS", "File is not valid UTF-8; use amp_download_file for binary content", { instanceId }); }
    return { path, bytes: buffer.byteLength, sha256: createHash("sha256").update(buffer).digest("hex"), content };
  });
  registerTool(server, ctx, "amp_download_file", { title: "Download small instance file", description: "Return a bounded file as base64 through AMP. Intended for small binary files; large transfer should use AMP's dedicated transfer facilities.", risk: RiskLevel.READ_ONLY, schema: { instanceId, path: filePath, maxBytes: z.number().int().min(1).optional() } }, async ({ instanceId, path, maxBytes }) => {
    const limit = Math.min(maxBytes ?? ctx.config.maxFileBytes, ctx.config.maxFileBytes); const raw = await call(instanceId, "ReadFileChunk", { Filename: path, Offset: 0, ChunkSize: limit + 1 }, true); const buffer = decodeChunk(actionResult(raw));
    if (buffer.byteLength > limit) throw new AmpError("AMP_INVALID_PARAMETERS", `File exceeds configured ${limit} byte limit`, { instanceId }); return { path, bytes: buffer.byteLength, sha256: createHash("sha256").update(buffer).digest("hex"), base64Data: buffer.toString("base64") };
  });
  const write = (name: string, binary: boolean) => registerTool(server, ctx, name, { title: binary ? "Upload small instance file" : "Write instance text file", description: "Write a bounded file with AMP's chunk API. An optional expected MD5 prevents overwriting a concurrently changed file.", risk: RiskLevel.LOW_RISK_WRITE, schema: { instanceId, path: filePath, ...(binary ? { base64Data: z.string().max(Math.ceil(ctx.config.maxFileBytes * 4 / 3) + 8) } : { content: z.string().max(ctx.config.maxFileBytes) }), expectedMd5: z.string().regex(/^[a-fA-F0-9]{32}$/).optional(), ...dryRunField } }, async (args: any) => {
    const data = binary ? decodeInputBase64(args.base64Data) : Buffer.from(args.content, "utf8"); if (data.byteLength > ctx.config.maxFileBytes) throw new AmpError("AMP_INVALID_PARAMETERS", "File exceeds AMP_MAX_FILE_BYTES");
    if (args.expectedMd5) { const found = String(actionResult(await call(args.instanceId, "CalculateFileMD5Sum", { FilePath: args.path }, true))).toLowerCase(); if (found !== args.expectedMd5.toLowerCase()) throw new AmpError("AMP_CONFLICT", "Expected file hash does not match; refusing overwrite", { instanceId: args.instanceId, details: { expected: args.expectedMd5, actual: found } }); }
    return dryRun(args, { target: args.instanceId, path: args.path, bytes: data.byteLength, sha256: createHash("sha256").update(data).digest("hex"), apiAction: "FileManagerPlugin/WriteFileChunk" }, () => call(args.instanceId, "WriteFileChunk", { Filename: args.path, Data: data.toString("base64"), Offset: 0, FinalChunk: true }));
  });
  write("amp_write_file", false); write("amp_upload_file", true);
  registerTool(server, ctx, "amp_create_file", { title: "Create instance text file", description: "Create a new UTF-8 file and refuse to overwrite an existing directory entry.", risk: RiskLevel.LOW_RISK_WRITE, schema: { instanceId, path: filePath, content: z.string().max(ctx.config.maxFileBytes).default(""), ...dryRunField } }, async (args) => {
    const slash = args.path.lastIndexOf("/"); const dir = slash < 0 ? "" : args.path.slice(0, slash); const name = slash < 0 ? args.path : args.path.slice(slash + 1); const listing = await call(args.instanceId, "GetDirectoryListing", { Dir: dir }, true);
    if (Array.isArray(listing) && listing.some((v) => entryName(v) === name)) throw new AmpError("AMP_CONFLICT", `Refusing to overwrite existing path: ${args.path}`, { instanceId: args.instanceId });
    const data = Buffer.from(args.content, "utf8"); return dryRun(args, { target: args.instanceId, path: args.path, bytes: data.byteLength, apiAction: "FileManagerPlugin/WriteFileChunk" }, () => call(args.instanceId, "WriteFileChunk", { Filename: args.path, Data: data.toString("base64"), Offset: 0, FinalChunk: true }));
  });
  registerTool(server, ctx, "amp_create_directory", { title: "Create instance directory", description: "Create a directory under the AMP-authorized instance root.", risk: RiskLevel.LOW_RISK_WRITE, schema: { instanceId, path: filePath, ...dryRunField } }, (args) => dryRun(args, { target: args.instanceId, path: args.path, apiAction: "FileManagerPlugin/CreateDirectory" }, () => call(args.instanceId, "CreateDirectory", { NewPath: args.path })));
  const remove = (name: string, directory: boolean) => registerTool(server, ctx, name, { title: `Delete instance ${directory ? "directory" : "file"}`, description: "Move an instance path to AMP's trash. Recovery depends on AMP trash retention.", risk: RiskLevel.DESTRUCTIVE, schema: { instanceId, path: filePath, ...dryRunField } }, (args) => dryRun(args, { target: args.instanceId, path: args.path, apiAction: `FileManagerPlugin/${directory ? "TrashDirectory" : "TrashFile"}` }, () => call(args.instanceId, directory ? "TrashDirectory" : "TrashFile", { [directory ? "DirectoryName" : "Filename"]: args.path })));
  remove("amp_delete_file", false); remove("amp_delete_directory", true);
  const rename = (name: string, directory: boolean) => registerTool(server, ctx, name, { title: `${name.includes("move") ? "Move" : "Rename"} instance path`, description: "Rename or move a path within the same AMP-authorized instance root.", risk: RiskLevel.LOW_RISK_WRITE, schema: { instanceId, sourcePath: filePath, destinationPath: filePath, ...dryRunField } }, (args) => dryRun(args, { target: args.instanceId, sourcePath: args.sourcePath, destinationPath: args.destinationPath, apiAction: `FileManagerPlugin/${directory ? "RenameDirectory" : "RenameFile"}` }, () => call(args.instanceId, directory ? "RenameDirectory" : "RenameFile", directory ? { oldDirectory: args.sourcePath, NewDirectoryName: args.destinationPath } : { Filename: args.sourcePath, NewFilename: args.destinationPath })));
  rename("amp_rename_file", false); rename("amp_move_file", false);
  registerTool(server, ctx, "amp_copy_file", { title: "Copy instance file", description: "Copy a file into a directory within the same AMP instance root.", risk: RiskLevel.LOW_RISK_WRITE, schema: { instanceId, sourcePath: filePath, targetDirectory: path, ...dryRunField } }, (args) => dryRun(args, { target: args.instanceId, sourcePath: args.sourcePath, targetDirectory: args.targetDirectory, apiAction: "FileManagerPlugin/CopyFile" }, () => call(args.instanceId, "CopyFile", { Origin: args.sourcePath, TargetDirectory: args.targetDirectory })));
  registerTool(server, ctx, "amp_extract_archive", { title: "Extract instance archive", description: "Extract an archive under the instance root. Existing files may be overwritten by AMP.", risk: RiskLevel.DESTRUCTIVE, schema: { instanceId, archivePath: filePath, destinationPath: path.default(""), ...dryRunField } }, (args) => dryRun(args, { target: args.instanceId, archivePath: args.archivePath, destinationPath: args.destinationPath, apiAction: "FileManagerPlugin/ExtractArchive" }, () => call(args.instanceId, "ExtractArchive", { ArchivePath: args.archivePath, DestinationPath: args.destinationPath })));
  registerTool(server, ctx, "amp_create_archive", { title: "Create instance archive", description: "Ask AMP to archive a path under the instance root.", risk: RiskLevel.LOW_RISK_WRITE, schema: { instanceId, path: filePath, ...dryRunField } }, (args) => dryRun(args, { target: args.instanceId, path: args.path, apiAction: "FileManagerPlugin/CreateArchive" }, () => call(args.instanceId, "CreateArchive", { PathToArchive: args.path })));
}

function actionResult(value: unknown): unknown { if (value && typeof value === "object") { const o = value as Record<string, unknown>; return o.Result ?? o.result ?? o.Data ?? o.data ?? value; } return value; }
function decodeChunk(value: unknown): Buffer {
  if (typeof value !== "string") throw new AmpError("AMP_RESPONSE_INVALID", "AMP file API did not return a data string");
  const normalized = value.replace(/\s/g, "");
  if (normalized.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(normalized)) throw new AmpError("AMP_RESPONSE_INVALID", "AMP returned invalid base64 file data");
  return Buffer.from(normalized, "base64");
}
function entryName(value: unknown): string | undefined { if (!value || typeof value !== "object") return undefined; const o = value as Record<string, unknown>; for (const key of ["Filename", "Name", "FileName"]) if (typeof o[key] === "string") return o[key]; return undefined; }
function decodeInputBase64(value: string): Buffer { try { return decodeChunk(value); } catch (error) { throw new AmpError("AMP_INVALID_PARAMETERS", "base64Data is not valid canonical base64", {}, { cause: error }); } }
