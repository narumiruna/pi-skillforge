import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { createMemoryEntry, saveMemoryEntry } from "../lib/capture.js";
import {
	applyProposal,
	createSkillPathMap,
	formatProposalForReview,
	listPendingProposals,
	promoteMemoryIfEligible,
	promoteRetrievedMemories,
} from "../lib/promotion.js";
import { formatRetrievedMemories, retrieveMemories } from "../lib/retrieve.js";
import type { MemoryPartition } from "../lib/storage.js";
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
	partition?: MemoryPartition;
}

export default function skillforgeExtension(pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event, ctx) => {
		try {
			const skillPaths = createSkillPathMap(event.systemPromptOptions.skills);
			const memories = await retrieveMemories(ctx.cwd, {
				prompt: event.prompt,
				activeSkills: event.systemPromptOptions.skills?.map((skill) => skill.name) ?? [],
				limit: 5,
				partition: "all",
			});
			await promoteRetrievedMemories(ctx.cwd, memories, { skillPaths });
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
			"Automatically store a verified pi-skillforge memory entry when a reusable gotcha, decision, or pattern has concrete evidence.",
		promptSnippet:
			"Store a verified pi-skillforge memory entry when the current task produced reusable evidence",
		promptGuidelines: [
			"Use skillforge_capture_memory automatically when the task reveals a verified, reusable gotcha, decision, or pattern that should influence future work.",
			"Do not capture speculation, unverified guesses, ordinary chat history, or one-off observations with no prevention value.",
			"Prefer partition='project' for project-specific learnings; use partition='global' only when the lesson is clearly reusable across projects.",
			"Include narrow scope, concrete trigger, symptom, root cause, fix, and verification evidence.",
			"Use confidence='confirmed' only when verification evidence exists; otherwise do not capture.",
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
			partition: Type.Optional(
				Type.Union([Type.Literal("project"), Type.Literal("global")], {
					description:
						"Logical memory partition. Defaults to project; use global only for cross-project learnings.",
				}),
			),
		}),
		async execute(_toolCallId, params: CaptureToolParams, _signal, _onUpdate, ctx) {
			try {
				const entry = createMemoryEntry(params);
				const partition = params.partition ?? "project";
				const result = await saveMemoryEntry(ctx.cwd, entry, {
					overwrite: params.overwrite,
					partition,
				});
				const proposals = await promoteMemoryIfEligible(ctx.cwd, {
					entry: result.entry,
					partition,
					memoryPath: result.path,
				});
				const proposalText = proposals.length
					? ` Created ${proposals.length} skill patch proposal(s).`
					: "";
				return {
					content: [
						{
							type: "text" as const,
							text: `Saved ${partition} ${result.entry.type} memory ${result.entry.id} to ${result.path}. Indexed ${result.index.entries.length} total memory file(s).${proposalText}`,
						},
					],
					details: { ...result, proposals },
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
		description: "Review and apply pending pi-skillforge patches for a skill",
		handler: async (args, ctx) => {
			const skillName = args.trim();
			if (!skillName || /\s/.test(skillName)) {
				ctx.ui.notify("Usage: /skillforge <skill-name>", "warning");
				return;
			}

			try {
				const proposals = await listPendingProposals(skillName);
				if (proposals.length === 0) {
					ctx.ui.notify(`No pending pi-skillforge patches for ${skillName}.`, "info");
					return;
				}

				for (const proposal of proposals) {
					const review = formatProposalForReview(proposal);
					ctx.ui.notify(review, "info");
					const ok = await ctx.ui.confirm(
						"Apply pi-skillforge patch?",
						`Apply ${proposal.id} to ${proposal.target_skill}?`,
					);
					if (!ok) continue;
					const applied = await applyProposal(proposal);
					ctx.ui.notify(`Applied ${applied.id} to ${applied.target_path}.`, "info");
				}
			} catch (error) {
				ctx.ui.notify(formatError(error), "error");
			}
		},
	});
}

function toMemoryDetails(memory: {
	entry: { id: string; type: string; title: string };
	partition: MemoryPartition;
	projectId?: string;
	path: string;
	score: number;
	reasons: string[];
}): Record<string, unknown> {
	return {
		id: memory.entry.id,
		type: memory.entry.type,
		title: memory.entry.title,
		partition: memory.partition,
		projectId: memory.projectId,
		path: memory.path,
		score: memory.score,
		reasons: memory.reasons,
	};
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
