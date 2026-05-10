import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
	ConfidenceLevel,
	MemoryEntry,
	MemoryIndex,
	MemoryScope,
	MemoryType,
} from "../shared/types.js";
import type { MemoryPartition } from "../store/storage.js";
import {
	ensureStore,
	formatDisplayPath,
	memoryDirectoryForType,
	rebuildIndex,
} from "../store/storage.js";
import { parseMemoryText } from "./parse.js";
import { formatMemoryMarkdown } from "./serialize.js";
import { validateMemoryEntry } from "./validate.js";

const PLACEHOLDER_PATTERN = /replace with|replace-with/i;

export interface CaptureInput {
	id?: string;
	type: MemoryType;
	title: string;
	scope: MemoryScope;
	skills?: string[];
	compatible_skills?: string[];
	excluded_skills?: string[];
	confidence?: ConfidenceLevel;
	hits?: number;
	trigger: string[];
	symptom: string[];
	root_cause: string[];
	fix: string[];
	verification: string[];
}

export interface SaveMemoryResult {
	entry: MemoryEntry;
	path: string;
	index: MemoryIndex;
}

export function createMemoryEntry(input: CaptureInput): MemoryEntry {
	const date = today();
	return {
		id: input.id?.trim() || generateMemoryId(input.type, input.title),
		type: input.type,
		title: input.title.trim(),
		scope: compactScope(input.scope),
		skills: compactList(input.skills),
		compatible_skills: compactList(input.compatible_skills),
		excluded_skills: compactList(input.excluded_skills),
		confidence: input.confidence ?? "confirmed",
		hits: input.hits ?? 1,
		created_at: date,
		updated_at: date,
		trigger: compactRequiredList(input.trigger),
		symptom: compactRequiredList(input.symptom),
		root_cause: compactRequiredList(input.root_cause),
		fix: compactRequiredList(input.fix),
		verification: compactRequiredList(input.verification),
	};
}

export function createMemoryDraft(type: MemoryType): MemoryEntry {
	const date = today();
	return {
		id: `${type}-replace-with-kebab-case-id`,
		type,
		title: "Replace with a concise title",
		scope: {
			languages: ["replace-with-language-or-remove"],
			tools: ["replace-with-tool-or-remove"],
			files: ["replace-with-file-glob-or-remove"],
		},
		skills: ["replace-with-skill-or-remove"],
		compatible_skills: [],
		excluded_skills: [],
		confidence: "confirmed",
		hits: 1,
		created_at: date,
		updated_at: date,
		trigger: ["Replace with the situation that should recall this memory."],
		symptom: ["Replace with the observed failure, ambiguity, or reusable opportunity."],
		root_cause: ["Replace with the verified cause or rationale."],
		fix: ["Replace with the future prevention, rule, or successful pattern."],
		verification: ["Replace with the command, test, source, or confirmation that verified it."],
	};
}

export function parseReviewedMemory(text: string, filename = "memory.md"): MemoryEntry {
	const parsed = parseMemoryText(text, filename);
	const result = validateMemoryEntry(parsed);
	if (!result.valid || !result.entry) {
		throw new Error(result.errors.join("; "));
	}
	assertReviewedMemory(result.entry);
	return result.entry;
}

export async function saveMemoryEntry(
	cwd: string,
	entry: MemoryEntry,
	options: { overwrite?: boolean; partition?: MemoryPartition } = {},
): Promise<SaveMemoryResult> {
	assertReviewedMemory(entry);
	const validation = validateMemoryEntry(entry);
	if (!validation.valid || !validation.entry) {
		throw new Error(validation.errors.join("; "));
	}

	const paths = await ensureStore(cwd, options.partition ?? "project");
	const memoryDir = memoryDirectoryForType(paths, validation.entry.type);
	await mkdir(memoryDir, { recursive: true });
	const memoryPath = path.join(memoryDir, `${validation.entry.id}.md`);
	await writeFile(memoryPath, formatMemoryMarkdown(validation.entry), {
		encoding: "utf8",
		flag: options.overwrite ? "w" : "wx",
	});
	const index = await rebuildIndex(cwd);
	return { entry: validation.entry, path: formatDisplayPath(memoryPath), index };
}

export function assertReviewedMemory(entry: MemoryEntry): void {
	const serialized = JSON.stringify(entry);
	if (PLACEHOLDER_PATTERN.test(serialized)) {
		throw new Error(
			"memory still contains template placeholders; review and replace them before saving",
		);
	}
}

export function generateMemoryId(type: MemoryType, title: string): string {
	const slug = title
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 64)
		.replace(/-+$/g, "");
	return `${type}-${slug || "memory"}-${today().replaceAll("-", "")}`;
}

function compactScope(scope: MemoryScope): MemoryScope {
	return {
		languages: compactList(scope.languages),
		tools: compactList(scope.tools),
		files: compactList(scope.files),
		projects: compactList(scope.projects),
	};
}

function compactList(values: string[] | undefined): string[] | undefined {
	const compacted = values?.map((value) => value.trim()).filter((value) => value.length > 0);
	return compacted && compacted.length > 0 ? compacted : undefined;
}

function compactRequiredList(values: string[]): string[] {
	return values.map((value) => value.trim()).filter((value) => value.length > 0);
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}
