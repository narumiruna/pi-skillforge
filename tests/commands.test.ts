import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createMemoryEntry, saveMemoryEntry } from "../src/memory/capture.js";
import {
	deleteMemoryById,
	findMemoryById,
	formatDeleteConfirmation,
	formatMemoryList,
	listMemoryReports,
	parseSkillforgeCommand,
} from "../src/memory/commands.js";
import type { MemoryType } from "../src/shared/types.js";
import { readIndex } from "../src/store/storage.js";

async function createIsolatedWorkspace(): Promise<string> {
	const root = await mkdtemp(path.join(tmpdir(), "pi-skillforge-test-"));
	process.env.PI_CODING_AGENT_DIR = path.join(root, "agent");
	return root;
}

function memory(type: MemoryType, id: string, title = `${type} title`) {
	return createMemoryEntry({
		id,
		type,
		title,
		scope: { projects: ["pi-skillforge-test"] },
		confidence: "confirmed",
		hits: 1,
		trigger: ["Trigger"],
		symptom: ["Symptom"],
		root_cause: ["Root cause"],
		fix: ["Fix"],
		verification: ["Test verification"],
	});
}

async function exists(file: string): Promise<boolean> {
	try {
		await stat(file);
		return true;
	} catch {
		return false;
	}
}

test("parses supported skillforge command grammar", () => {
	assert.deepEqual(parseSkillforgeCommand("help"), { kind: "help" });
	assert.deepEqual(parseSkillforgeCommand("list global gotchas"), {
		kind: "list",
		partition: "global",
		type: "gotcha",
	});
	assert.deepEqual(parseSkillforgeCommand("列出所有 global 的 GOTCHA"), {
		kind: "list",
		partition: "global",
		type: "gotcha",
	});
	assert.deepEqual(parseSkillforgeCommand("delete global gotcha-example"), {
		kind: "delete",
		partition: "global",
		id: "gotcha-example",
	});
	assert.deepEqual(parseSkillforgeCommand("review python-typer"), {
		kind: "review",
		skillName: "python-typer",
		legacy: false,
	});
	assert.deepEqual(parseSkillforgeCommand("python-typer"), {
		kind: "review",
		skillName: "python-typer",
		legacy: true,
	});
});

test("lists global gotchas with English and Chinese command filters", async () => {
	const cwd = await createIsolatedWorkspace();
	await saveMemoryEntry(cwd, memory("gotcha", "gotcha-global-list", "Global list gotcha"), {
		partition: "global",
	});
	await saveMemoryEntry(cwd, memory("decision", "decision-not-listed", "Hidden decision"), {
		partition: "global",
	});

	for (const args of ["list global gotchas", "列出所有 global 的 GOTCHA"]) {
		const command = parseSkillforgeCommand(args);
		assert.equal(command.kind, "list");
		if (command.kind !== "list") throw new Error("expected list command");

		const reports = await listMemoryReports(cwd, command.partition);
		const output = formatMemoryList(reports, { partition: command.partition, type: command.type });
		assert.match(output, /Skillforge global gotchas:/);
		assert.match(output, /Global list gotcha \(gotcha-global-list\)/);
		assert.doesNotMatch(output, /Hidden decision/);
	}
});

test("previews delete target without deleting, then deletes by id and rebuilds the index", async () => {
	const cwd = await createIsolatedWorkspace();
	const saved = await saveMemoryEntry(cwd, memory("gotcha", "gotcha-delete-target"), {
		partition: "global",
	});
	const [target] = await findMemoryById(cwd, "gotcha-delete-target", "global");
	assert.ok(target);

	const confirmation = formatDeleteConfirmation(target);
	assert.match(confirmation, /Delete global gotcha memory\?/);
	assert.match(confirmation, /ID: gotcha-delete-target/);
	assert.equal(await exists(target.absolutePath), true, "preview must not delete the memory file");

	const result = await deleteMemoryById(cwd, { id: "gotcha-delete-target", partition: "global" });
	assert.equal(result.report.entry.id, "gotcha-delete-target");
	assert.equal(await exists(target.absolutePath), false);

	const index = await readIndex();
	assert.ok(index);
	assert.equal(
		index.entries.some((entry) => entry.id === saved.entry.id),
		false,
	);
});

test("refuses ambiguous delete ids until a partition is specified", async () => {
	const cwd = await createIsolatedWorkspace();
	await saveMemoryEntry(cwd, memory("gotcha", "gotcha-ambiguous-delete"), {
		partition: "global",
	});
	await saveMemoryEntry(cwd, memory("gotcha", "gotcha-ambiguous-delete"), {
		partition: "project",
	});

	await assert.rejects(
		deleteMemoryById(cwd, { id: "gotcha-ambiguous-delete" }),
		/ambiguous across/,
	);

	const matches = await findMemoryById(cwd, "gotcha-ambiguous-delete");
	assert.equal(matches.length, 2);
	assert.deepEqual(matches.map((match) => match.partition).sort(), ["global", "project"]);
});
