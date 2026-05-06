import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parseMemoryText } from "./parse.js";
import type { MemoryEntry, MemoryIndex, MemoryIndexEntry, MemoryType } from "./types.js";
import { validateMemoryEntry } from "./validate.js";

const execFileAsync = promisify(execFile);

export const GLOBAL_STORE_DIR = "skillforge";
export const INDEX_FILE = "index.json";
export const REGISTRY_FILE = "registry.yaml";
export const PROMOTION_LOG_FILE = "promotion-log.md";

export type MemoryPartition = "project" | "global";
export type RetrievePartition = MemoryPartition | "all";

export interface SkillforgePaths {
	partition: MemoryPartition;
	projectId?: string;
	root: string;
	memory: string;
	gotchas: string;
	decisions: string;
	patterns: string;
	promotions: string;
	index: string;
	registry: string;
	promotionLog: string;
}

export interface ValidationReportItem {
	partition: MemoryPartition;
	projectId?: string;
	path: string;
	absolutePath: string;
	valid: boolean;
	errors: string[];
	entry?: MemoryEntry;
}

export async function getSkillforgePaths(
	cwd: string,
	partition: MemoryPartition = "project",
): Promise<SkillforgePaths> {
	const root = getGlobalSkillforgeRoot();
	const projectId = partition === "project" ? await getProjectId(cwd) : undefined;
	const partitionPath = getPartitionPath(partition, projectId);
	const memory = path.join(root, "memory", partitionPath);
	return {
		partition,
		projectId,
		root,
		memory,
		gotchas: path.join(memory, "gotchas"),
		decisions: path.join(memory, "decisions"),
		patterns: path.join(memory, "patterns"),
		promotions: path.join(root, "promotions", partitionPath),
		index: path.join(root, INDEX_FILE),
		registry: path.join(root, REGISTRY_FILE),
		promotionLog: path.join(root, PROMOTION_LOG_FILE),
	};
}

export async function ensureStore(
	cwd: string,
	partition: MemoryPartition = "project",
): Promise<SkillforgePaths> {
	const paths = await getSkillforgePaths(cwd, partition);
	await Promise.all([
		mkdir(paths.gotchas, { recursive: true }),
		mkdir(paths.decisions, { recursive: true }),
		mkdir(paths.patterns, { recursive: true }),
		mkdir(paths.promotions, { recursive: true }),
	]);
	await writeIfMissing(paths.registry, defaultRegistry());
	await writeIfMissing(paths.promotionLog, "# pi-skillforge Promotion Log\n\n");
	await writeIfMissing(paths.index, `${JSON.stringify(emptyIndex(), null, "\t")}\n`);
	return paths;
}

export async function validateStoredMemories(
	cwd: string,
	partition: MemoryPartition = "project",
): Promise<ValidationReportItem[]> {
	const paths = await getSkillforgePaths(cwd, partition);
	const files = await listMemoryFiles(paths.memory);
	const reports = await Promise.all(files.map((file) => validateMemoryFile(paths, file)));
	return reports.sort((a, b) => a.path.localeCompare(b.path));
}

export async function validateRetrievalMemories(
	cwd: string,
	partition: RetrievePartition = "all",
): Promise<ValidationReportItem[]> {
	const partitions: MemoryPartition[] = partition === "all" ? ["project", "global"] : [partition];
	const reports = await Promise.all(
		partitions.map((memoryPartition) => validateStoredMemories(cwd, memoryPartition)),
	);
	return reports.flat().sort((a, b) => a.path.localeCompare(b.path));
}

export async function rebuildIndex(cwd: string): Promise<MemoryIndex> {
	await Promise.all([ensureStore(cwd, "project"), ensureStore(cwd, "global")]);
	const reports = await validateRetrievalMemories(cwd, "all");
	const validEntries = reports.flatMap((report) =>
		report.entry ? [toIndexEntry(report.absolutePath, report.entry)] : [],
	);
	const index: MemoryIndex = {
		version: 1,
		updated_at: new Date().toISOString(),
		entries: validEntries.sort((a, b) => a.id.localeCompare(b.id)),
	};
	await writeFile(
		path.join(getGlobalSkillforgeRoot(), INDEX_FILE),
		`${JSON.stringify(index, null, "\t")}\n`,
		"utf8",
	);
	return index;
}

export async function readIndex(): Promise<MemoryIndex | undefined> {
	try {
		const text = await readFile(path.join(getGlobalSkillforgeRoot(), INDEX_FILE), "utf8");
		const parsed = JSON.parse(text) as MemoryIndex;
		if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return undefined;
		return parsed;
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return undefined;
		throw error;
	}
}

export function memoryDirectoryForType(paths: SkillforgePaths, type: MemoryType): string {
	switch (type) {
		case "gotcha":
			return paths.gotchas;
		case "decision":
			return paths.decisions;
		case "pattern":
			return paths.patterns;
	}
}

export function formatDisplayPath(absolutePath: string): string {
	const home = os.homedir();
	if (absolutePath === home) return "~";
	if (absolutePath.startsWith(`${home}${path.sep}`)) {
		return path.join("~", absolutePath.slice(home.length + 1));
	}
	return absolutePath;
}

export function getGlobalAgentDir(): string {
	return process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent");
}

export function getGlobalSkillforgeRoot(): string {
	return path.join(getGlobalAgentDir(), GLOBAL_STORE_DIR);
}

export async function getProjectId(cwd: string): Promise<string> {
	const gitRemote = await gitOutput(cwd, ["config", "--get", "remote.origin.url"]);
	const gitRoot = await gitOutput(cwd, ["rev-parse", "--show-toplevel"]);
	const identity = gitRemote || gitRoot || path.resolve(cwd);
	const nameSource = gitRoot || path.resolve(cwd);
	const basename = sanitizePathSegment(path.basename(nameSource));
	const digest = createHash("sha256").update(identity).digest("hex").slice(0, 8);
	return `${basename || "project"}-${digest}`;
}

export function getPartitionPath(partition: MemoryPartition, projectId?: string): string {
	return partition === "global" ? "global" : path.join("projects", projectId ?? "unknown-project");
}

async function validateMemoryFile(
	paths: SkillforgePaths,
	absolutePath: string,
): Promise<ValidationReportItem> {
	const displayPath = formatDisplayPath(absolutePath);
	try {
		const text = await readFile(absolutePath, "utf8");
		const parsed = parseMemoryText(text, absolutePath);
		const result = validateMemoryEntry(parsed);
		return {
			partition: paths.partition,
			projectId: paths.projectId,
			path: displayPath,
			absolutePath,
			valid: result.valid,
			errors: result.errors,
			entry: result.entry,
		};
	} catch (error) {
		return {
			partition: paths.partition,
			projectId: paths.projectId,
			path: displayPath,
			absolutePath,
			valid: false,
			errors: [error instanceof Error ? error.message : String(error)],
		};
	}
}

async function listMemoryFiles(directory: string): Promise<string[]> {
	try {
		const entries = await readdir(directory, { withFileTypes: true });
		const nested = await Promise.all(
			entries.map(async (entry) => {
				const fullPath = path.join(directory, entry.name);
				if (entry.isDirectory()) return listMemoryFiles(fullPath);
				if (entry.isFile() && isMemoryFile(entry.name)) return [fullPath];
				return [];
			}),
		);
		return nested.flat();
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return [];
		throw error;
	}
}

function toIndexEntry(memoryPath: string, entry: MemoryEntry): MemoryIndexEntry {
	return {
		id: entry.id,
		type: entry.type,
		title: entry.title,
		path: formatDisplayPath(memoryPath),
		scope: entry.scope,
		skills: entry.skills ?? [],
		compatible_skills: entry.compatible_skills ?? [],
		excluded_skills: entry.excluded_skills ?? [],
		confidence: entry.confidence,
		hits: entry.hits,
		updated_at: entry.updated_at,
	};
}

function isMemoryFile(filename: string): boolean {
	return [".md", ".yaml", ".yml", ".json"].includes(path.extname(filename));
}

async function writeIfMissing(file: string, content: string): Promise<void> {
	try {
		await stat(file);
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			await mkdir(path.dirname(file), { recursive: true });
			await writeFile(file, content, "utf8");
			return;
		}
		throw error;
	}
}

async function gitOutput(cwd: string, args: string[]): Promise<string | undefined> {
	try {
		const { stdout } = await execFileAsync("git", args, { cwd });
		const trimmed = stdout.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	} catch {
		return undefined;
	}
}

function sanitizePathSegment(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 64);
}

function emptyIndex(): MemoryIndex {
	return { version: 1, updated_at: new Date().toISOString(), entries: [] };
}

function defaultRegistry(): string {
	return `# pi-skillforge skill registry\n# All pi-skillforge memory is stored under the global Pi agent directory.\nversion: 1\nskills: []\n`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}
