import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseMemoryText } from "./parse.js";
import type { MemoryEntry, MemoryIndex, MemoryIndexEntry, MemoryType } from "./types.js";
import { validateMemoryEntry } from "./validate.js";

export const STORE_DIR = ".pi-skillforge";
export const GLOBAL_STORE_DIR = "skillforge";
export const INDEX_FILE = "index.json";
export const REGISTRY_FILE = "registry.yaml";
export const PROMOTION_LOG_FILE = "promotion-log.md";

export type StoreScope = "local" | "global";

export interface SkillforgePaths {
	scope: StoreScope;
	root: string;
	memory: string;
	gotchas: string;
	decisions: string;
	patterns: string;
	index: string;
	registry: string;
	promotionLog: string;
}

export interface ValidationReportItem {
	scope: StoreScope;
	path: string;
	absolutePath: string;
	valid: boolean;
	errors: string[];
	entry?: MemoryEntry;
}

export function getSkillforgePaths(cwd: string, scope: StoreScope = "local"): SkillforgePaths {
	const root = scope === "global" ? getGlobalSkillforgeRoot() : path.join(cwd, STORE_DIR);
	const memory = path.join(root, "memory");
	return {
		scope,
		root,
		memory,
		gotchas: path.join(memory, "gotchas"),
		decisions: path.join(memory, "decisions"),
		patterns: path.join(memory, "patterns"),
		index: path.join(root, INDEX_FILE),
		registry: path.join(root, REGISTRY_FILE),
		promotionLog: path.join(root, PROMOTION_LOG_FILE),
	};
}

export async function storeExists(cwd: string, scope: StoreScope = "local"): Promise<boolean> {
	try {
		return (await stat(getSkillforgePaths(cwd, scope).root)).isDirectory();
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return false;
		throw error;
	}
}

export async function ensureStore(
	cwd: string,
	scope: StoreScope = "local",
): Promise<SkillforgePaths> {
	const paths = getSkillforgePaths(cwd, scope);
	await Promise.all([
		mkdir(paths.gotchas, { recursive: true }),
		mkdir(paths.decisions, { recursive: true }),
		mkdir(paths.patterns, { recursive: true }),
	]);
	await writeIfMissing(paths.registry, defaultRegistry());
	await writeIfMissing(paths.promotionLog, "# pi-skillforge Promotion Log\n\n");
	await writeIfMissing(paths.index, `${JSON.stringify(emptyIndex(), null, "\t")}\n`);
	return paths;
}

export async function validateStoredMemories(
	cwd: string,
	scope: StoreScope = "local",
): Promise<ValidationReportItem[]> {
	const paths = getSkillforgePaths(cwd, scope);
	const files = await listMemoryFiles(paths.memory);
	const reports = await Promise.all(files.map((file) => validateMemoryFile(cwd, paths, file)));
	return reports.sort((a, b) => a.path.localeCompare(b.path));
}

export async function rebuildIndex(cwd: string, scope: StoreScope = "local"): Promise<MemoryIndex> {
	const paths = await ensureStore(cwd, scope);
	const reports = await validateStoredMemories(cwd, scope);
	const validEntries = reports.flatMap((report) =>
		report.entry ? [toIndexEntry(cwd, paths, report.absolutePath, report.entry)] : [],
	);
	const index: MemoryIndex = {
		version: 1,
		updated_at: new Date().toISOString(),
		entries: validEntries.sort((a, b) => a.id.localeCompare(b.id)),
	};
	await writeFile(paths.index, `${JSON.stringify(index, null, "\t")}\n`, "utf8");
	return index;
}

export async function readIndex(
	cwd: string,
	scope: StoreScope = "local",
): Promise<MemoryIndex | undefined> {
	try {
		const text = await readFile(getSkillforgePaths(cwd, scope).index, "utf8");
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

async function validateMemoryFile(
	cwd: string,
	paths: SkillforgePaths,
	absolutePath: string,
): Promise<ValidationReportItem> {
	const displayPath = formatMemoryPath(cwd, paths, absolutePath);
	try {
		const text = await readFile(absolutePath, "utf8");
		const parsed = parseMemoryText(text, absolutePath);
		const result = validateMemoryEntry(parsed);
		return {
			scope: paths.scope,
			path: displayPath,
			absolutePath,
			valid: result.valid,
			errors: result.errors,
			entry: result.entry,
		};
	} catch (error) {
		return {
			scope: paths.scope,
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

function toIndexEntry(
	cwd: string,
	paths: SkillforgePaths,
	memoryPath: string,
	entry: MemoryEntry,
): MemoryIndexEntry {
	return {
		id: entry.id,
		type: entry.type,
		title: entry.title,
		path: formatIndexPath(cwd, paths, memoryPath),
		scope: entry.scope,
		skills: entry.skills ?? [],
		compatible_skills: entry.compatible_skills ?? [],
		excluded_skills: entry.excluded_skills ?? [],
		confidence: entry.confidence,
		hits: entry.hits,
		updated_at: entry.updated_at,
	};
}

function formatMemoryPath(cwd: string, paths: SkillforgePaths, absolutePath: string): string {
	if (paths.scope === "local") return path.relative(cwd, absolutePath);
	const relativePath = path.relative(paths.root, absolutePath);
	if (process.env.PI_CODING_AGENT_DIR) return path.join(paths.root, relativePath);
	return path.join("~", ".pi", "agent", GLOBAL_STORE_DIR, relativePath);
}

function formatIndexPath(cwd: string, paths: SkillforgePaths, absolutePath: string): string {
	if (paths.scope === "local") return path.relative(cwd, absolutePath);
	return path.relative(paths.root, absolutePath);
}

export function getGlobalAgentDir(): string {
	return process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent");
}

export function getGlobalSkillforgeRoot(): string {
	return path.join(getGlobalAgentDir(), GLOBAL_STORE_DIR);
}

function isMemoryFile(filename: string): boolean {
	return [".md", ".yaml", ".yml", ".json"].includes(path.extname(filename));
}

async function writeIfMissing(file: string, content: string): Promise<void> {
	try {
		await stat(file);
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			await writeFile(file, content, "utf8");
			return;
		}
		throw error;
	}
}

function emptyIndex(): MemoryIndex {
	return { version: 1, updated_at: new Date().toISOString(), entries: [] };
}

function defaultRegistry(): string {
	return `# pi-skillforge skill registry\n# Map project memory to skill names used by Pi.\nversion: 1\nskills: []\n`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}
