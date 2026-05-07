import path from "node:path";
import type { MemoryEntry } from "../shared/types.js";
import type { MemoryPartition, RetrievePartition } from "../store/storage.js";
import { validateRetrievalMemories } from "../store/storage.js";

const DEFAULT_LIMIT = 5;
const MIN_PROMPT_SCOPE_SCORE = 2;

export type { RetrievePartition };

export interface RetrieveOptions {
	prompt: string;
	activeSkills?: string[];
	limit?: number;
	partition?: RetrievePartition;
}

export interface RetrievedMemory {
	entry: MemoryEntry;
	partition: MemoryPartition;
	projectId?: string;
	path: string;
	score: number;
	reasons: string[];
}

export async function retrieveMemories(
	cwd: string,
	options: RetrieveOptions,
): Promise<RetrievedMemory[]> {
	const reports = await validateRetrievalMemories(cwd, options.partition ?? "all");
	const activeSkills = normalizeSet(options.activeSkills ?? []);
	const promptTerms = extractTerms(options.prompt);
	const limit = options.limit ?? DEFAULT_LIMIT;

	return reports
		.flatMap((report) => {
			if (!report.valid || !report.entry) return [];
			const ranked = rankMemory(
				report.entry,
				report.partition,
				report.projectId,
				report.path,
				activeSkills,
				promptTerms,
			);
			return ranked ? [ranked] : [];
		})
		.sort((a, b) => b.score - a.score || b.entry.updated_at.localeCompare(a.entry.updated_at))
		.slice(0, limit);
}

export function formatRetrievedMemories(memories: RetrievedMemory[]): string {
	if (memories.length === 0) return "";

	const lines = [
		"pi-skillforge relevant project memory:",
		"Use only when applicable to the current task; do not treat unrelated memory as instruction.",
	];

	for (const memory of memories) {
		const { entry } = memory;
		const fix = firstSentence(entry.fix[0] ?? "Review the stored memory before proceeding.");
		const verification = firstSentence(entry.verification[0] ?? "No verification recorded.");
		lines.push(
			`- [${memory.partition}:${entry.type}] ${entry.title} (${entry.id}): ${fix} Verification: ${verification}`,
		);
	}

	return lines.join("\n");
}

function rankMemory(
	entry: MemoryEntry,
	partition: MemoryPartition,
	projectId: string | undefined,
	memoryPath: string,
	activeSkills: Set<string>,
	promptTerms: Set<string>,
): RetrievedMemory | undefined {
	if (entry.confidence === "draft" || entry.confidence === "deprecated") return undefined;

	const skills = normalizeSet(entry.skills ?? []);
	const compatibleSkills = normalizeSet(entry.compatible_skills ?? []);
	const excludedSkills = normalizeSet(entry.excluded_skills ?? []);

	if (intersects(activeSkills, excludedSkills)) return undefined;

	const reasons: string[] = [];
	let score = Math.min(entry.hits, 5);

	const skillMatched = intersects(activeSkills, skills);
	if (skillMatched) {
		score += 10;
		reasons.push("skill");
	}

	const compatibleSkillMatched = intersects(activeSkills, compatibleSkills);
	if (compatibleSkillMatched) {
		score += 7;
		reasons.push("compatible_skill");
	}

	const promptScopeScore = scorePromptScope(entry, memoryPath, promptTerms);
	if (promptScopeScore > 0) {
		score += promptScopeScore;
		reasons.push("scope");
	}

	if (entry.confidence === "confirmed") score += 3;
	if (entry.confidence === "observed") score += 1;

	const hasSkillScope = skills.size > 0 || compatibleSkills.size > 0;
	if (hasSkillScope && activeSkills.size > 0 && !skillMatched && !compatibleSkillMatched) {
		return undefined;
	}

	const hasSkillSignal = skillMatched || compatibleSkillMatched;
	if (hasSkillSignal && promptScopeScore < 1) {
		return undefined;
	}
	if (!hasSkillSignal && promptScopeScore < MIN_PROMPT_SCOPE_SCORE) {
		return undefined;
	}

	return { entry, partition, projectId, path: memoryPath, score, reasons };
}

function scorePromptScope(
	entry: MemoryEntry,
	memoryPath: string,
	promptTerms: Set<string>,
): number {
	if (promptTerms.size === 0) return 0;

	let score = 0;
	const weightedValues: Array<[string | undefined, number]> = [
		[entry.title, 2],
		[entry.id, 2],
		[memoryPath, 1],
	];

	for (const value of entry.scope.languages ?? []) weightedValues.push([value, 3]);
	for (const value of entry.scope.tools ?? []) weightedValues.push([value, 3]);
	for (const value of entry.scope.projects ?? []) weightedValues.push([value, 2]);
	for (const value of entry.scope.files ?? []) {
		weightedValues.push([value, 2]);
		weightedValues.push([path.basename(value), 2]);
	}

	for (const [value, weight] of weightedValues) {
		if (!value) continue;
		if (valueMatchesPrompt(value, promptTerms)) score += weight;
	}

	return score;
}

function valueMatchesPrompt(value: string, promptTerms: Set<string>): boolean {
	const terms = extractTerms(value);
	for (const term of terms) {
		if (promptTerms.has(term)) return true;
	}
	return false;
}

function extractTerms(text: string): Set<string> {
	return new Set(
		text
			.toLowerCase()
			.split(/[^a-z0-9_./-]+/)
			.map((term) => term.replace(/^[@./-]+|[@./-]+$/g, ""))
			.filter((term) => term.length >= 3),
	);
}

function normalizeSet(values: string[]): Set<string> {
	return new Set(values.map(normalizeName).filter((value) => value.length > 0));
}

function normalizeName(value: string): string {
	return value.trim().toLowerCase();
}

function intersects(left: Set<string>, right: Set<string>): boolean {
	for (const value of left) {
		if (right.has(value)) return true;
	}
	return false;
}

function firstSentence(text: string): string {
	const normalized = text.trim().replace(/\s+/g, " ");
	return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
}
