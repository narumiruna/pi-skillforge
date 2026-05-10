import { unlink } from "node:fs/promises";
import type { MemoryType } from "../shared/types.js";
import type { MemoryPartition, ValidationReportItem } from "../store/storage.js";
import {
	rebuildIndex,
	validateRetrievalMemories,
	validateStoredMemories,
} from "../store/storage.js";

export type MemoryTypeFilter = MemoryType | "all";
export type MemoryPartitionFilter = MemoryPartition | "all";

export type SkillforgeCommand =
	| { kind: "help" }
	| { kind: "list"; partition: MemoryPartitionFilter; type: MemoryTypeFilter }
	| { kind: "delete"; id: string; partition?: MemoryPartition }
	| { kind: "review"; skillName: string; legacy: boolean }
	| { kind: "invalid"; message: string };

export interface DeleteMemoryResult {
	report: ValidationReportItem & { entry: NonNullable<ValidationReportItem["entry"]> };
	indexEntryCount: number;
}

export function parseSkillforgeCommand(args: string): SkillforgeCommand {
	const input = args.trim();
	if (!input || isHelp(input)) return { kind: "help" };
	if (isChineseGlobalGotchasList(input))
		return { kind: "list", partition: "global", type: "gotcha" };

	const tokens = input.split(/\s+/).filter(Boolean);
	const [command, ...rest] = tokens;
	const normalizedCommand = command.toLowerCase();

	if (normalizedCommand === "list" || normalizedCommand === "ls") {
		return parseListCommand(rest);
	}

	if (normalizedCommand === "delete" || normalizedCommand === "del" || normalizedCommand === "rm") {
		return parseDeleteCommand(rest);
	}

	if (normalizedCommand === "review") {
		return parseReviewCommand(rest, false);
	}

	if (tokens.length === 1) return parseReviewCommand(tokens, true);

	return {
		kind: "invalid",
		message: `Unknown /skillforge command: ${input}`,
	};
}

export async function listMemoryReports(
	cwd: string,
	partition: MemoryPartitionFilter,
): Promise<ValidationReportItem[]> {
	return partition === "all"
		? validateRetrievalMemories(cwd, "all")
		: validateStoredMemories(cwd, partition);
}

export function formatMemoryList(
	reports: ValidationReportItem[],
	options: { partition: MemoryPartitionFilter; type: MemoryTypeFilter },
): string {
	const validReports = reports.filter(
		(
			report,
		): report is ValidationReportItem & { entry: NonNullable<ValidationReportItem["entry"]> } =>
			Boolean(report.entry) && (options.type === "all" || report.entry?.type === options.type),
	);
	const invalidCount = reports.filter((report) => !report.valid).length;
	const scope = `${options.partition} ${options.type === "all" ? "memories" : pluralizeMemoryType(options.type)}`;

	if (validReports.length === 0) {
		const invalidSuffix = invalidCount > 0 ? ` (${invalidCount} invalid file(s) skipped)` : "";
		return `No ${scope} found.${invalidSuffix}`;
	}

	const lines = [`Skillforge ${scope}:`];
	for (const report of validReports) {
		const { entry } = report;
		lines.push(
			`- [${report.partition}:${entry.type}] ${entry.title} (${entry.id}) confidence=${entry.confidence} hits=${entry.hits} updated=${entry.updated_at} path=${report.path}`,
		);
	}
	if (invalidCount > 0) lines.push(`Skipped ${invalidCount} invalid memory file(s).`);
	return lines.join("\n");
}

export async function findMemoryById(
	cwd: string,
	id: string,
	partition?: MemoryPartition,
): Promise<Array<ValidationReportItem & { entry: NonNullable<ValidationReportItem["entry"]> }>> {
	const reports = partition
		? await validateStoredMemories(cwd, partition)
		: await validateRetrievalMemories(cwd, "all");
	return reports.filter(
		(
			report,
		): report is ValidationReportItem & { entry: NonNullable<ValidationReportItem["entry"]> } =>
			Boolean(report.entry) && report.entry?.id === id,
	);
}

export async function deleteMemoryById(
	cwd: string,
	options: { id: string; partition?: MemoryPartition },
): Promise<DeleteMemoryResult> {
	const matches = await findMemoryById(cwd, options.id, options.partition);
	if (matches.length === 0) {
		throw new Error(
			`No memory found for id ${options.id}${options.partition ? ` in ${options.partition}` : ""}.`,
		);
	}
	if (matches.length > 1) {
		const partitions = [...new Set(matches.map((match) => match.partition))].join(", ");
		throw new Error(
			`Memory id ${options.id} is ambiguous across ${partitions}. Use /skillforge delete global ${options.id} or /skillforge delete project ${options.id}.`,
		);
	}

	const [report] = matches;
	await unlink(report.absolutePath);
	const index = await rebuildIndex(cwd);
	return { report, indexEntryCount: index.entries.length };
}

export function formatDeleteConfirmation(
	report: ValidationReportItem & { entry: NonNullable<ValidationReportItem["entry"]> },
): string {
	return [
		`Delete ${report.partition} ${report.entry.type} memory?`,
		`Title: ${report.entry.title}`,
		`ID: ${report.entry.id}`,
		`Path: ${report.path}`,
	].join("\n");
}

export function formatSkillforgeHelp(): string {
	return [
		"Usage:",
		"  /skillforge help",
		"  /skillforge list [all|global|project] [all|gotchas|decisions|patterns]",
		"  /skillforge 列出所有 global 的 GOTCHA",
		"  /skillforge delete <memory-id>",
		"  /skillforge delete global <memory-id>",
		"  /skillforge delete project <memory-id>",
		"  /skillforge review <skill-name>",
		"  /skillforge <skill-name>  # legacy review shorthand",
	].join("\n");
}

function parseListCommand(tokens: string[]): SkillforgeCommand {
	let partition: MemoryPartitionFilter = "all";
	let type: MemoryTypeFilter = "all";

	for (const token of tokens) {
		const normalized = token.toLowerCase();
		const parsedPartition = parsePartition(normalized);
		const parsedType = parseMemoryType(normalized);
		if (parsedPartition) {
			partition = parsedPartition;
			continue;
		}
		if (parsedType) {
			type = parsedType;
			continue;
		}
		return { kind: "invalid", message: `Unknown list filter: ${token}` };
	}

	return { kind: "list", partition, type };
}

function parseDeleteCommand(tokens: string[]): SkillforgeCommand {
	if (tokens.length === 0) {
		return { kind: "invalid", message: "Usage: /skillforge delete [global|project] <memory-id>" };
	}

	const firstPartition = parseConcretePartition(tokens[0]?.toLowerCase());
	if (firstPartition) {
		if (tokens.length !== 2) {
			return { kind: "invalid", message: "Usage: /skillforge delete [global|project] <memory-id>" };
		}
		return { kind: "delete", partition: firstPartition, id: tokens[1] };
	}

	if (tokens.length !== 1) {
		return { kind: "invalid", message: "Usage: /skillforge delete [global|project] <memory-id>" };
	}
	return { kind: "delete", id: tokens[0] };
}

function parseReviewCommand(tokens: string[], legacy: boolean): SkillforgeCommand {
	if (tokens.length !== 1 || /\s/.test(tokens[0])) {
		return { kind: "invalid", message: "Usage: /skillforge review <skill-name>" };
	}
	return { kind: "review", skillName: tokens[0], legacy };
}

function isHelp(input: string): boolean {
	return ["help", "--help", "-h", "?"].includes(input.toLowerCase());
}

function isChineseGlobalGotchasList(input: string): boolean {
	const normalized = input.toLowerCase();
	return (
		/列出|顯示|显示/.test(normalized) &&
		normalized.includes("global") &&
		/gotcha|gotchas/.test(normalized)
	);
}

function parsePartition(value: string): MemoryPartitionFilter | undefined {
	if (value === "all") return "all";
	return parseConcretePartition(value);
}

function parseConcretePartition(value: string | undefined): MemoryPartition | undefined {
	if (value === "global") return "global";
	if (value === "project") return "project";
	return undefined;
}

function parseMemoryType(value: string): MemoryTypeFilter | undefined {
	switch (value) {
		case "all":
		case "memories":
		case "memory":
			return "all";
		case "gotcha":
		case "gotchas":
			return "gotcha";
		case "decision":
		case "decisions":
			return "decision";
		case "pattern":
		case "patterns":
			return "pattern";
		default:
			return undefined;
	}
}

function pluralizeMemoryType(type: MemoryType): string {
	switch (type) {
		case "gotcha":
			return "gotchas";
		case "decision":
			return "decisions";
		case "pattern":
			return "patterns";
	}
}
