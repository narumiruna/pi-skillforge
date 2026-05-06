import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import {
	createMemoryDraft,
	createMemoryEntry,
	parseReviewedMemory,
	saveMemoryEntry,
} from "../lib/capture.js";
import { formatMemoryMarkdown } from "../lib/serialize.js";
import {
	ensureStore,
	readIndex,
	rebuildIndex,
	storeExists,
	validateStoredMemories,
} from "../lib/storage.js";
import type { ConfidenceLevel, MemoryScope, MemoryType } from "../lib/types.js";

const memoryTypeSchema = Type.Union([
	Type.Literal("gotcha"),
	Type.Literal("decision"),
	Type.Literal("pattern"),
]);
const confidenceSchema = Type.Union([
	Type.Literal("draft"),
	Type.Literal("observed"),
	Type.Literal("confirmed"),
	Type.Literal("deprecated"),
]);
const stringListSchema = Type.Array(Type.String());
const scopeSchema = Type.Object({
	languages: Type.Optional(stringListSchema),
	tools: Type.Optional(stringListSchema),
	files: Type.Optional(stringListSchema),
	projects: Type.Optional(stringListSchema),
});

interface CaptureToolParams {
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
	overwrite?: boolean;
}

export default function skillforgeExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "skillforge_capture_memory",
		label: "Capture Skillforge Memory",
		description:
			"Store a reviewed pi-skillforge project memory entry. Use only when the user explicitly asks to remember/capture a verified gotcha, decision, or pattern.",
		promptSnippet: "Store an explicitly requested, reviewed pi-skillforge memory entry",
		promptGuidelines: [
			"Use skillforge_capture_memory only after the user explicitly asks to remember or capture a verified project gotcha, decision, or pattern.",
			"Do not use skillforge_capture_memory for speculation; include trigger, symptom, root cause, fix, verification, scope, and confidence.",
		],
		parameters: Type.Object({
			id: Type.Optional(
				Type.String({
					description: "Optional kebab-case id. Generated from type and title if omitted.",
				}),
			),
			type: memoryTypeSchema,
			title: Type.String({ description: "Concise human-readable title." }),
			scope: scopeSchema,
			skills: Type.Optional(stringListSchema),
			compatible_skills: Type.Optional(stringListSchema),
			excluded_skills: Type.Optional(stringListSchema),
			confidence: Type.Optional(confidenceSchema),
			hits: Type.Optional(Type.Integer({ minimum: 1 })),
			trigger: stringListSchema,
			symptom: stringListSchema,
			root_cause: stringListSchema,
			fix: stringListSchema,
			verification: stringListSchema,
			overwrite: Type.Optional(Type.Boolean()),
		}),
		async execute(_toolCallId, params: CaptureToolParams, _signal, _onUpdate, ctx) {
			try {
				const entry = createMemoryEntry(params);
				const result = await saveMemoryEntry(ctx.cwd, entry, { overwrite: params.overwrite });
				return {
					content: [
						{
							type: "text" as const,
							text: `Saved ${result.entry.type} memory ${result.entry.id} to ${result.path}. Indexed ${result.index.entries.length} total memory file(s).`,
						},
					],
					details: result,
				};
			} catch (error) {
				return {
					content: [{ type: "text" as const, text: formatError(error) }],
					details: {},
					isError: true,
				};
			}
		},
	});

	pi.registerCommand("skillforge", {
		description: "Manage pi-skillforge project memory",
		handler: async (args, ctx) => {
			const command = parseCommand(args);

			try {
				if (command.action === "init") {
					await ensureStore(ctx.cwd);
					const index = await rebuildIndex(ctx.cwd);
					ctx.ui.notify(
						`pi-skillforge initialized (${index.entries.length} memories indexed).`,
						"info",
					);
					return;
				}

				if (command.action === "capture") {
					const draft = formatMemoryMarkdown(createMemoryDraft(command.type));
					const edited = await ctx.ui.editor(`Capture ${command.type} memory`, draft);
					if (!edited) {
						ctx.ui.notify("pi-skillforge capture cancelled.", "warning");
						return;
					}

					const entry = parseReviewedMemory(edited);
					const ok = await ctx.ui.confirm(
						"Save pi-skillforge memory?",
						`Save ${entry.type} memory '${entry.id}'?`,
					);
					if (!ok) {
						ctx.ui.notify("pi-skillforge capture cancelled.", "warning");
						return;
					}

					const result = await saveMemoryEntry(ctx.cwd, entry);
					ctx.ui.notify(
						`Saved ${result.entry.type} memory ${result.entry.id} to ${result.path}.`,
						"info",
					);
					return;
				}

				if (command.action === "validate") {
					await ensureStore(ctx.cwd);
					const reports = await validateStoredMemories(ctx.cwd);
					const invalid = reports.filter((report) => !report.valid);
					await rebuildIndex(ctx.cwd);

					if (invalid.length === 0) {
						ctx.ui.notify(`pi-skillforge validated ${reports.length} memory file(s).`, "info");
						return;
					}

					ctx.ui.notify(
						`pi-skillforge found ${invalid.length} invalid memory file(s):\n${formatInvalidReports(invalid)}`,
						"error",
					);
					return;
				}

				if (command.action === "reindex") {
					const index = await rebuildIndex(ctx.cwd);
					ctx.ui.notify(
						`pi-skillforge indexed ${index.entries.length} valid memory file(s).`,
						"info",
					);
					return;
				}

				const exists = await storeExists(ctx.cwd);
				const index = await readIndex(ctx.cwd);
				const count = index?.entries.length ?? 0;
				ctx.ui.notify(
					exists
						? `pi-skillforge is ready (${count} memories indexed). Try /skillforge capture gotcha.`
						: "pi-skillforge is loaded. Run /skillforge init to create project memory storage.",
					"info",
				);
			} catch (error) {
				ctx.ui.notify(formatError(error), "error");
			}
		},
	});
}

type SkillforgeCommand =
	| { action: "status" }
	| { action: "init" }
	| { action: "validate" }
	| { action: "reindex" }
	| { action: "capture"; type: MemoryType };

function parseCommand(args: string | undefined): SkillforgeCommand {
	const [action, type] = (args ?? "").trim().split(/\s+/);
	if (action === "init" || action === "validate" || action === "reindex") return { action };
	if (action === "capture") return { action, type: parseMemoryType(type) };
	return { action: "status" };
}

function parseMemoryType(value: string | undefined): MemoryType {
	if (value === "gotcha" || value === "decision" || value === "pattern") return value;
	throw new Error("Usage: /skillforge capture <gotcha|decision|pattern>");
}

function formatInvalidReports(reports: Array<{ path: string; errors: string[] }>): string {
	return reports
		.slice(0, 5)
		.map((report) => `- ${report.path}: ${report.errors.join("; ")}`)
		.join("\n");
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
