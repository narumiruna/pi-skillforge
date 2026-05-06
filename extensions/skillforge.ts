import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	ensureStore,
	readIndex,
	rebuildIndex,
	storeExists,
	validateStoredMemories,
} from "../lib/storage.js";

export default function skillforgeExtension(pi: ExtensionAPI) {
	pi.registerCommand("skillforge", {
		description: "Manage pi-skillforge project memory",
		handler: async (args, ctx) => {
			const action = parseAction(args);

			if (action === "init") {
				await ensureStore(ctx.cwd);
				const index = await rebuildIndex(ctx.cwd);
				ctx.ui.notify(
					`pi-skillforge initialized (${index.entries.length} memories indexed).`,
					"info",
				);
				return;
			}

			if (action === "validate") {
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

			if (action === "reindex") {
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
					? `pi-skillforge is ready (${count} memories indexed). Try /skillforge validate.`
					: "pi-skillforge is loaded. Run /skillforge init to create project memory storage.",
				"info",
			);
		},
	});
}

type SkillforgeAction = "status" | "init" | "validate" | "reindex";

function parseAction(args: string | undefined): SkillforgeAction {
	const [action] = (args ?? "").trim().split(/\s+/, 1);
	if (action === "init" || action === "validate" || action === "reindex") return action;
	return "status";
}

function formatInvalidReports(reports: Array<{ path: string; errors: string[] }>): string {
	return reports
		.slice(0, 5)
		.map((report) => `- ${report.path}: ${report.errors.join("; ")}`)
		.join("\n");
}
