export function parseMemoryText(text: string, filename = "memory"): unknown {
	const trimmed = text.trimStart();
	if (filename.endsWith(".json") || trimmed.startsWith("{")) {
		return JSON.parse(text);
	}

	const yaml = extractFrontmatter(text) ?? text;
	return parseSimpleYaml(yaml);
}

function extractFrontmatter(text: string): string | undefined {
	const normalized = text.replace(/^\uFEFF/, "");
	const lines = normalized.split(/\r?\n/);
	if (lines[0]?.trim() !== "---") return undefined;

	const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
	if (end === -1) return undefined;
	return lines.slice(1, end).join("\n");
}

function parseSimpleYaml(yaml: string): unknown {
	const lines = yaml
		.split(/\r?\n/)
		.map(stripComment)
		.filter((line) => line.trim().length > 0)
		.map((line) => ({ indent: countIndent(line), text: line.trim() }));

	let index = 0;

	function parseObject(indent: number): Record<string, unknown> {
		const object: Record<string, unknown> = {};

		while (index < lines.length) {
			const line = lines[index];
			if (!line || line.indent < indent) break;
			if (line.indent > indent) {
				throw new Error(`Unexpected indentation near: ${line.text}`);
			}
			if (line.text.startsWith("- ")) break;

			const separator = line.text.indexOf(":");
			if (separator === -1) throw new Error(`Expected key/value pair near: ${line.text}`);

			const key = line.text.slice(0, separator).trim();
			const rawValue = line.text.slice(separator + 1).trim();
			index += 1;

			if (rawValue.length > 0) {
				object[key] = parseScalar(rawValue);
				continue;
			}

			const next = lines[index];
			if (!next || next.indent <= indent) {
				object[key] = null;
			} else if (next.text.startsWith("- ")) {
				object[key] = parseArray(next.indent);
			} else {
				object[key] = parseObject(next.indent);
			}
		}

		return object;
	}

	function parseArray(indent: number): unknown[] {
		const items: unknown[] = [];

		while (index < lines.length) {
			const line = lines[index];
			if (!line || line.indent < indent) break;
			if (line.indent > indent) {
				throw new Error(`Unexpected indentation near: ${line.text}`);
			}
			if (!line.text.startsWith("- ")) break;

			const rawValue = line.text.slice(2).trim();
			index += 1;

			if (rawValue.length > 0) {
				items.push(parseScalar(rawValue));
				continue;
			}

			const next = lines[index];
			if (!next || next.indent <= indent) {
				items.push(null);
			} else if (next.text.startsWith("- ")) {
				items.push(parseArray(next.indent));
			} else {
				items.push(parseObject(next.indent));
			}
		}

		return items;
	}

	return parseObject(0);
}

function stripComment(line: string): string {
	let quote: "'" | '"' | undefined;
	for (let index = 0; index < line.length; index += 1) {
		const char = line[index];
		if ((char === '"' || char === "'") && line[index - 1] !== "\\") {
			quote = quote === char ? undefined : (quote ?? char);
		}
		if (char === "#" && !quote && (index === 0 || /\s/.test(line[index - 1] ?? ""))) {
			return line.slice(0, index).trimEnd();
		}
	}
	return line;
}

function countIndent(line: string): number {
	const match = line.match(/^ */);
	return match?.[0].length ?? 0;
}

function parseScalar(value: string): unknown {
	if (value === "null" || value === "~") return null;
	if (value === "true") return true;
	if (value === "false") return false;
	if (value.startsWith("[") && value.endsWith("]")) return parseInlineArray(value);
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}
	if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
	if (/^-?\d+\.\d+$/.test(value)) return Number.parseFloat(value);
	return value;
}

function parseInlineArray(value: string): unknown[] {
	const inner = value.slice(1, -1).trim();
	if (inner.length === 0) return [];
	return inner.split(",").map((item) => parseScalar(item.trim()));
}
