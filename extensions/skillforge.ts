import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import {
	createMemoryDraft,
	createMemoryEntry,
	parseReviewedMemory,
	saveMemoryEntry,
} from "../lib/capture.js";
import type { RetrievedMemory, RetrieveScope } from "../lib/retrieve.js";
import { formatRetrievedMemories, retrieveMemories } from "../lib/retrieve.js";
import { formatMemoryMarkdown } from "../lib/serialize.js";
import type { StoreScope } from "../lib/storage.js";
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
	store_scope?: StoreScope;
}

export default function skillforgeExtension(pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event, ctx) => {
		try {
			const memories = await retrieveMemories(ctx.cwd, {
				prompt: event.prompt,
				activeSkills: event.systemPromptOptions.skills?.map((skill) => skill.name) ?? [],
				limit: 5,
			});
			const content = formatRetrievedMemories(memories);
			if (!content) return undefined;

			return {
				message: {
					customType: "pi-skillforge-memory",
					content,
					display: false,
					details: { memories: memories.map(toMemoryDetails) },
				},
			};
		} catch {
			return undefined;
		}
	});

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
			store_scope: Type.Optional(
				Type.Union([Type.Literal("local"), Type.Literal("global")], {
					description: "Where to store the memory. Defaults to local project storage.",
				}),
			),
		}),
		async execute(_toolCallId, params: CaptureToolParams, _signal, _onUpdate, ctx) {
			try {
				const entry = createMemoryEntry(params);
				const result = await saveMemoryEntry(ctx.cwd, entry, {
					overwrite: params.overwrite,
					scope: params.store_scope ?? "local",
				});
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
					await ensureStore(ctx.cwd, command.scope);
					const index = await rebuildIndex(ctx.cwd, command.scope);
					ctx.ui.notify(
						`pi-skillforge ${command.scope} store initialized (${index.entries.length} memories indexed).`,
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

					const result = await saveMemoryEntry(ctx.cwd, entry, { scope: command.scope });
					ctx.ui.notify(
						`Saved ${command.scope} ${result.entry.type} memory ${result.entry.id} to ${result.path}.`,
						"info",
					);
					return;
				}

				if (command.action === "retrieve") {
					const memories = await retrieveMemories(ctx.cwd, {
						prompt: command.prompt,
						limit: 10,
						scope: command.scope,
					});
					ctx.ui.notify(formatRetrieveReport(command.prompt, memories), "info");
					return;
				}

				if (command.action === "validate") {
					await ensureStore(ctx.cwd, command.scope);
					const reports = await validateStoredMemories(ctx.cwd, command.scope);
					const invalid = reports.filter((report) => !report.valid);
					await rebuildIndex(ctx.cwd, command.scope);

					if (invalid.length === 0) {
						ctx.ui.notify(
							`pi-skillforge validated ${reports.length} ${command.scope} memory file(s).`,
							"info",
						);
						return;
					}

					ctx.ui.notify(
						`pi-skillforge found ${invalid.length} invalid memory file(s):\n${formatInvalidReports(invalid)}`,
						"error",
					);
					return;
				}

				if (command.action === "reindex") {
					const index = await rebuildIndex(ctx.cwd, command.scope);
					ctx.ui.notify(
						`pi-skillforge indexed ${index.entries.length} valid ${command.scope} memory file(s).`,
						"info",
					);
					return;
				}

				const localExists = await storeExists(ctx.cwd, "local");
				const globalExists = await storeExists(ctx.cwd, "global");
				const localIndex = await readIndex(ctx.cwd, "local");
				const globalIndex = await readIndex(ctx.cwd, "global");
				const localCount = localIndex?.entries.length ?? 0;
				const globalCount = globalIndex?.entries.length ?? 0;
				ctx.ui.notify(
					localExists || globalExists
						? `pi-skillforge is ready (local=${localCount}, global=${globalCount}). Try /skillforge capture gotcha --global.`
						: "pi-skillforge is loaded. Run /skillforge init or /skillforge init --global to create memory storage.",
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
	| { action: "init"; scope: StoreScope }
	| { action: "validate"; scope: StoreScope }
	| { action: "reindex"; scope: StoreScope }
	| { action: "retrieve"; prompt: string; scope: RetrieveScope }
	| { action: "capture"; type: MemoryType; scope: StoreScope };

function parseCommand(args: string | undefined): SkillforgeCommand {
	const trimmed = (args ?? "").trim();
	const tokens = trimmed.split(/\s+/).filter(Boolean);
	const action = tokens[0];
	if (action === "init" || action === "validate" || action === "reindex") {
		return { action, scope: parseStoreScope(tokens, "local") };
	}
	if (action === "capture") {
		return { action, type: parseMemoryType(tokens[1]), scope: parseStoreScope(tokens, "local") };
	}
	if (action === "retrieve" || action === "search") {
		const prompt = tokens
			.slice(1)
			.filter((token) => !isScopeFlag(token))
			.join(" ")
			.trim();
		if (!prompt)
			throw new Error("Usage: /skillforge retrieve <prompt terms> [--local|--global|--all]");
		return { action: "retrieve", prompt, scope: parseRetrieveScope(tokens, "all") };
	}
	return { action: "status" };
}

function parseStoreScope(tokens: string[], defaultScope: StoreScope): StoreScope {
	if (tokens.includes("--global")) return "global";
	if (tokens.includes("--local")) return "local";
	if (tokens.includes("--all")) throw new Error("--all is only supported for retrieve/search");
	return defaultScope;
}

function parseRetrieveScope(tokens: string[], defaultScope: RetrieveScope): RetrieveScope {
	if (tokens.includes("--global")) return "global";
	if (tokens.includes("--local")) return "local";
	if (tokens.includes("--all")) return "all";
	return defaultScope;
}

function isScopeFlag(token: string): boolean {
	return token === "--local" || token === "--global" || token === "--all";
}

function parseMemoryType(value: string | undefined): MemoryType {
	if (value === "gotcha" || value === "decision" || value === "pattern") return value;
	throw new Error("Usage: /skillforge capture <gotcha|decision|pattern>");
}

function toMemoryDetails(memory: {
	entry: { id: string; type: string; title: string };
	scope: StoreScope;
	path: string;
	score: number;
	reasons: string[];
}): Record<string, unknown> {
	return {
		id: memory.entry.id,
		type: memory.entry.type,
		title: memory.entry.title,
		scope: memory.scope,
		path: memory.path,
		score: memory.score,
		reasons: memory.reasons,
	};
}

function formatInvalidReports(reports: Array<{ path: string; errors: string[] }>): string {
	return reports
		.slice(0, 5)
		.map((report) => `- ${report.path}: ${report.errors.join("; ")}`)
		.join("\n");
}

function formatRetrieveReport(prompt: string, memories: RetrievedMemory[]): string {
	if (memories.length === 0) {
		return `No pi-skillforge memories matched: ${prompt}`;
	}

	const lines = [`pi-skillforge retrieval preview for: ${prompt}`];
	for (const memory of memories) {
		lines.push(
			`- ${memory.entry.id} [${memory.scope}:${memory.entry.type}] score=${memory.score} reasons=${memory.reasons.join(",") || "none"}`,
		);
		lines.push(`  title: ${memory.entry.title}`);
		lines.push(`  path: ${memory.path}`);
		lines.push(`  fix: ${memory.entry.fix[0] ?? "(none)"}`);
	}
	return lines.join("\n");
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
