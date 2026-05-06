import { statSync } from "node:fs";
import { appendFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { RetrievedMemory } from "./retrieve.js";
import {
	ensureStore,
	formatDisplayPath,
	getGlobalAgentDir,
	getGlobalSkillforgeRoot,
	type MemoryPartition,
} from "./storage.js";
import type { MemoryEntry } from "./types.js";

const PROMOTION_HIT_THRESHOLD = 3;
const PROMOTION_VERSION = 1;

type ProposalStatus = "pending" | "applied";

export interface SkillPatchProposal {
	version: 1;
	id: string;
	status: ProposalStatus;
	partition: MemoryPartition;
	project_id?: string;
	target_skill: string;
	target_path?: string;
	source_memory_id: string;
	source_memory_path: string;
	memory_title: string;
	memory_type: string;
	proposed_guidance: string;
	rationale: string;
	verification: string[];
	created_at: string;
	updated_at: string;
	applied_at?: string;
	proposal_path?: string;
}

export interface PromotionCandidate {
	entry: MemoryEntry;
	partition: MemoryPartition;
	projectId?: string;
	memoryPath: string;
}

export interface PromotionOptions {
	skillPaths?: Map<string, string>;
}

export async function promoteMemoryIfEligible(
	cwd: string,
	candidate: PromotionCandidate,
	options: PromotionOptions = {},
): Promise<SkillPatchProposal[]> {
	if (!isPromotionEligible(candidate.entry)) return [];

	const proposals: SkillPatchProposal[] = [];
	for (const skill of candidate.entry.skills ?? []) {
		const targetSkill = skill.trim();
		if (!targetSkill) continue;
		const paths = await ensureStore(cwd, candidate.partition);
		const proposal = createProposal(
			{ ...candidate, projectId: candidate.projectId ?? paths.projectId },
			targetSkill,
			options.skillPaths,
		);
		const proposalPath = path.join(paths.promotions, `${proposal.id}.json`);
		if (await fileExists(proposalPath)) continue;

		await mkdir(path.dirname(proposalPath), { recursive: true });
		await writeFile(proposalPath, `${JSON.stringify(proposal, null, "\t")}\n`, "utf8");
		await appendPromotionLog(
			`created ${proposal.id} for ${targetSkill} from ${candidate.entry.id}`,
		);
		proposals.push({ ...proposal, proposal_path: proposalPath });
	}
	return proposals;
}

export async function promoteRetrievedMemories(
	cwd: string,
	memories: RetrievedMemory[],
	options: PromotionOptions = {},
): Promise<SkillPatchProposal[]> {
	const nested = await Promise.all(
		memories.map((memory) =>
			promoteMemoryIfEligible(
				cwd,
				{
					entry: memory.entry,
					partition: memory.partition,
					projectId: memory.projectId,
					memoryPath: memory.path,
				},
				options,
			),
		),
	);
	return nested.flat();
}

export async function listPendingProposals(skillName: string): Promise<SkillPatchProposal[]> {
	const files = await listProposalFiles(path.join(getGlobalSkillforgeRoot(), "promotions"));
	const proposals = await Promise.all(files.map(readProposalFile));
	return proposals
		.filter(
			(proposal): proposal is SkillPatchProposal =>
				proposal !== undefined &&
				proposal.status === "pending" &&
				normalizeSkillName(proposal.target_skill) === normalizeSkillName(skillName),
		)
		.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function applyProposal(proposal: SkillPatchProposal): Promise<SkillPatchProposal> {
	const targetPath = proposal.target_path ?? findSkillPath(proposal.target_skill);
	if (!targetPath) {
		throw new Error(`Cannot apply ${proposal.id}: no target_path for ${proposal.target_skill}`);
	}
	if (!(await fileExists(targetPath))) {
		throw new Error(`Cannot apply ${proposal.id}: target skill file not found at ${targetPath}`);
	}

	const current = await readFile(targetPath, "utf8");
	const guidance = proposal.proposed_guidance.trim();
	let next = current;
	if (!current.includes(guidance)) {
		const prefix = current.endsWith("\n") ? "" : "\n";
		const header = current.includes("## pi-skillforge learnings")
			? ""
			: "\n## pi-skillforge learnings\n";
		next = `${current}${prefix}${header}\n${guidance}\n`;
		await writeFile(targetPath, next, "utf8");
	}

	const updated: SkillPatchProposal = {
		...proposal,
		status: "applied",
		target_path: targetPath,
		updated_at: today(),
		applied_at: today(),
	};
	if (proposal.proposal_path) {
		await writeFile(
			proposal.proposal_path,
			`${JSON.stringify(stripRuntimePath(updated), null, "\t")}\n`,
			"utf8",
		);
	}
	await appendPromotionLog(`applied ${proposal.id} to ${targetPath}`);
	return updated;
}

export function formatProposalForReview(proposal: SkillPatchProposal): string {
	return [
		`Skill patch proposal: ${proposal.id}`,
		`Target skill: ${proposal.target_skill}`,
		`Target path: ${proposal.target_path ? formatDisplayPath(proposal.target_path) : "(not found)"}`,
		`Source memory: ${proposal.source_memory_id} (${proposal.memory_type})`,
		`Source path: ${proposal.source_memory_path}`,
		"",
		"Proposed change:",
		proposal.proposed_guidance,
		"",
		"Rationale:",
		proposal.rationale,
		"",
		"Verification evidence:",
		...proposal.verification.map((item) => `- ${item}`),
	].join("\n");
}

export function createSkillPathMap(
	skills: Array<{ name: string; filePath?: string }> | undefined,
): Map<string, string> {
	const map = new Map<string, string>();
	for (const skill of skills ?? []) {
		if (skill.filePath) map.set(normalizeSkillName(skill.name), skill.filePath);
	}
	return map;
}

function createProposal(
	candidate: PromotionCandidate,
	targetSkill: string,
	skillPaths?: Map<string, string>,
): SkillPatchProposal {
	const date = today();
	const guidance = `- ${firstSentence(candidate.entry.fix[0] ?? candidate.entry.title)}`;
	return {
		version: PROMOTION_VERSION,
		id: `${sanitizeId(targetSkill)}__${candidate.entry.id}`,
		status: "pending",
		partition: candidate.partition,
		project_id: candidate.projectId,
		target_skill: targetSkill,
		target_path: skillPaths?.get(normalizeSkillName(targetSkill)) ?? findSkillPath(targetSkill),
		source_memory_id: candidate.entry.id,
		source_memory_path: candidate.memoryPath,
		memory_title: candidate.entry.title,
		memory_type: candidate.entry.type,
		proposed_guidance: guidance,
		rationale: `${candidate.entry.type} memory '${candidate.entry.title}' is confirmed, has ${candidate.entry.hits} hit(s), and targets the ${targetSkill} skill.`,
		verification: candidate.entry.verification,
		created_at: date,
		updated_at: date,
	};
}

function isPromotionEligible(entry: MemoryEntry): boolean {
	return (
		entry.confidence === "confirmed" &&
		entry.hits >= PROMOTION_HIT_THRESHOLD &&
		(entry.skills?.length ?? 0) > 0
	);
}

async function listProposalFiles(directory: string): Promise<string[]> {
	try {
		const entries = await readdir(directory, { withFileTypes: true });
		const nested = await Promise.all(
			entries.map(async (entry) => {
				const fullPath = path.join(directory, entry.name);
				if (entry.isDirectory()) return listProposalFiles(fullPath);
				if (entry.isFile() && entry.name.endsWith(".json")) return [fullPath];
				return [];
			}),
		);
		return nested.flat();
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return [];
		throw error;
	}
}

async function readProposalFile(file: string): Promise<SkillPatchProposal | undefined> {
	try {
		const proposal = JSON.parse(await readFile(file, "utf8")) as SkillPatchProposal;
		if (proposal.version !== PROMOTION_VERSION || !proposal.id) return undefined;
		return { ...proposal, proposal_path: file };
	} catch {
		return undefined;
	}
}

async function appendPromotionLog(message: string): Promise<void> {
	const logPath = path.join(getGlobalSkillforgeRoot(), "promotion-log.md");
	await mkdir(path.dirname(logPath), { recursive: true });
	await appendFile(logPath, `- ${new Date().toISOString()} ${message}\n`, "utf8");
}

async function fileExists(file: string): Promise<boolean> {
	try {
		return (await stat(file)).isFile();
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return false;
		throw error;
	}
}

function findSkillPath(skillName: string): string | undefined {
	const candidates = [
		path.join(os.homedir(), ".agents", "skills", skillName, "SKILL.md"),
		path.join(getGlobalAgentDir(), "skills", skillName, "SKILL.md"),
	];
	return candidates.find((candidate) => {
		try {
			return statSyncIsFile(candidate);
		} catch {
			return false;
		}
	});
}

function statSyncIsFile(file: string): boolean {
	try {
		return statSync(file).isFile();
	} catch {
		return false;
	}
}

function stripRuntimePath(proposal: SkillPatchProposal): SkillPatchProposal {
	const { proposal_path: _proposalPath, ...rest } = proposal;
	return rest;
}

function sanitizeId(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function normalizeSkillName(value: string): string {
	return value.trim().toLowerCase();
}

function firstSentence(text: string): string {
	const normalized = text.trim().replace(/\s+/g, " ");
	return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}
