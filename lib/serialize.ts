import type { MemoryEntry } from "./types.js";

export function formatMemoryMarkdown(entry: MemoryEntry): string {
	return `---\n${formatMemoryYaml(entry)}---\n\n`;
}

export function formatMemoryYaml(entry: MemoryEntry): string {
	const lines: string[] = [];
	pushScalar(lines, "id", entry.id);
	pushScalar(lines, "type", entry.type);
	pushScalar(lines, "title", entry.title);
	lines.push("scope:");
	pushOptionalList(lines, "languages", entry.scope.languages, 1);
	pushOptionalList(lines, "tools", entry.scope.tools, 1);
	pushOptionalList(lines, "files", entry.scope.files, 1);
	pushOptionalList(lines, "projects", entry.scope.projects, 1);
	pushOptionalList(lines, "skills", entry.skills);
	pushOptionalList(lines, "compatible_skills", entry.compatible_skills);
	pushOptionalList(lines, "excluded_skills", entry.excluded_skills);
	pushScalar(lines, "confidence", entry.confidence);
	pushScalar(lines, "hits", entry.hits);
	pushScalar(lines, "created_at", entry.created_at);
	pushScalar(lines, "updated_at", entry.updated_at);
	pushList(lines, "trigger", entry.trigger);
	pushList(lines, "symptom", entry.symptom);
	pushList(lines, "root_cause", entry.root_cause);
	pushList(lines, "fix", entry.fix);
	pushList(lines, "verification", entry.verification);
	return `${lines.join("\n")}\n`;
}

function pushScalar(lines: string[], key: string, value: string | number): void {
	lines.push(`${key}: ${typeof value === "number" ? value : quoteYamlString(value)}`);
}

function pushOptionalList(
	lines: string[],
	key: string,
	values: string[] | undefined,
	indent = 0,
): void {
	if (!values || values.length === 0) return;
	pushList(lines, key, values, indent);
}

function pushList(lines: string[], key: string, values: string[], indent = 0): void {
	const prefix = " ".repeat(indent * 2);
	lines.push(`${prefix}${key}:`);
	for (const value of values) {
		lines.push(`${prefix}  - ${quoteYamlString(value)}`);
	}
}

function quoteYamlString(value: string): string {
	return JSON.stringify(value);
}
