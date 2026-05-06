import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseMemoryText } from "./parse.js";
import type { MemoryEntry, MemoryIndex, MemoryIndexEntry, MemoryType } from "./types.js";
import { validateMemoryEntry } from "./validate.js";

export const STORE_DIR = ".pi-skillforge";
export const INDEX_FILE = "index.json";
export const REGISTRY_FILE = "registry.yaml";
export const PROMOTION_LOG_FILE = "promotion-log.md";

export interface SkillforgePaths {
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
	path: string;
	valid: boolean;
	errors: string[];
	entry?: MemoryEntry;
}

export function getSkillforgePaths(cwd: string): SkillforgePaths {
	const root = path.join(cwd, STORE_DIR);
	const memory = path.join(root, "memory");
	return {
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

export async function storeExists(cwd: string): Promise<boolean> {
	try {
		return (await stat(getSkillforgePaths(cwd).root)).isDirectory();
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return false;
		throw error;
	}
}

export async function ensureStore(cwd: string): Promise<SkillforgePaths> {
	const paths = getSkillforgePaths(cwd);
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

export async function validateStoredMemories(cwd: string): Promise<ValidationReportItem[]> {
	const paths = getSkillforgePaths(cwd);
	const files = await listMemoryFiles(paths.memory);
	const reports = await Promise.all(files.map((file) => validateMemoryFile(cwd, file)));
	return reports.sort((a, b) => a.path.localeCompare(b.path));
}

export async function rebuildIndex(cwd: string): Promise<MemoryIndex> {
	const paths = await ensureStore(cwd);
	const reports = await validateStoredMemories(cwd);
	const validEntries = reports.flatMap((report) =>
		report.entry ? [toIndexEntry(cwd, report.path, report.entry)] : [],
	);
	const index: MemoryIndex = {
		version: 1,
		updated_at: new Date().toISOString(),
		entries: validEntries.sort((a, b) => a.id.localeCompare(b.id)),
	};
	await writeFile(paths.index, `${JSON.stringify(index, null, "\t")}\n`, "utf8");
	return index;
}

export async function readIndex(cwd: string): Promise<MemoryIndex | undefined> {
	try {
		const text = await readFile(getSkillforgePaths(cwd).index, "utf8");
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
	absolutePath: string,
): Promise<ValidationReportItem> {
	const relativePath = path.relative(cwd, absolutePath);
	try {
		const text = await readFile(absolutePath, "utf8");
		const parsed = parseMemoryText(text, absolutePath);
		const result = validateMemoryEntry(parsed);
		return {
			path: relativePath,
			valid: result.valid,
			errors: result.errors,
			entry: result.entry,
		};
	} catch (error) {
		return {
			path: relativePath,
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

function toIndexEntry(cwd: string, memoryPath: string, entry: MemoryEntry): MemoryIndexEntry {
	return {
		id: entry.id,
		type: entry.type,
		title: entry.title,
		path: path.relative(cwd, memoryPath),
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
