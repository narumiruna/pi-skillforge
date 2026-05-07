import type { MemoryEntry, ValidationResult } from "../shared/types.js";
import { CONFIDENCE_LEVELS, MEMORY_TYPES } from "../shared/types.js";

const MEMORY_TYPE_VALUES: readonly string[] = MEMORY_TYPES;
const CONFIDENCE_VALUES: readonly string[] = CONFIDENCE_LEVELS;

const REQUIRED_STRING_FIELDS = [
	"id",
	"type",
	"title",
	"confidence",
	"created_at",
	"updated_at",
] as const;
const REQUIRED_STRING_ARRAY_FIELDS = [
	"trigger",
	"symptom",
	"root_cause",
	"fix",
	"verification",
] as const;
const OPTIONAL_STRING_ARRAY_FIELDS = ["skills", "compatible_skills", "excluded_skills"] as const;
const OPTIONAL_SCOPE_ARRAY_FIELDS = ["languages", "tools", "files", "projects"] as const;

export function validateMemoryEntry(value: unknown): ValidationResult {
	const errors: string[] = [];

	if (!isRecord(value)) {
		return { valid: false, errors: ["entry must be an object"] };
	}

	for (const field of REQUIRED_STRING_FIELDS) {
		if (!isNonEmptyString(value[field])) errors.push(`${field} must be a non-empty string`);
	}

	if (isNonEmptyString(value.id) && !/^[a-z0-9][a-z0-9-]*$/.test(value.id)) {
		errors.push("id must be kebab-case using lowercase letters, numbers, and hyphens");
	}

	if (isNonEmptyString(value.type) && !MEMORY_TYPE_VALUES.includes(value.type)) {
		errors.push(`type must be one of: ${MEMORY_TYPES.join(", ")}`);
	}

	if (isNonEmptyString(value.confidence) && !CONFIDENCE_VALUES.includes(value.confidence)) {
		errors.push(`confidence must be one of: ${CONFIDENCE_LEVELS.join(", ")}`);
	}

	if (typeof value.hits !== "number" || !Number.isInteger(value.hits) || value.hits < 1) {
		errors.push("hits must be an integer greater than or equal to 1");
	}

	if (!isIsoDate(value.created_at)) errors.push("created_at must be an ISO date (YYYY-MM-DD)");
	if (!isIsoDate(value.updated_at)) errors.push("updated_at must be an ISO date (YYYY-MM-DD)");

	if (!isRecord(value.scope)) {
		errors.push("scope must be an object");
	} else {
		const scope = value.scope;
		const hasScope = OPTIONAL_SCOPE_ARRAY_FIELDS.some((field) => isStringArray(scope[field]));
		if (!hasScope) {
			errors.push("scope must include at least one of: languages, tools, files, projects");
		}
		for (const field of OPTIONAL_SCOPE_ARRAY_FIELDS) {
			if (scope[field] !== undefined && !isStringArray(scope[field])) {
				errors.push(`scope.${field} must be an array of strings`);
			}
		}
	}

	for (const field of REQUIRED_STRING_ARRAY_FIELDS) {
		if (!isNonEmptyStringArray(value[field])) {
			errors.push(`${field} must be a non-empty array of strings`);
		}
	}

	for (const field of OPTIONAL_STRING_ARRAY_FIELDS) {
		if (value[field] !== undefined && !isStringArray(value[field])) {
			errors.push(`${field} must be an array of strings`);
		}
	}

	if (errors.length > 0) return { valid: false, errors };
	return { valid: true, errors: [], entry: normalizeMemoryEntry(value) };
}

function normalizeMemoryEntry(value: Record<string, unknown>): MemoryEntry {
	const scope = isRecord(value.scope) ? value.scope : {};
	return {
		id: value.id as MemoryEntry["id"],
		type: value.type as MemoryEntry["type"],
		title: value.title as MemoryEntry["title"],
		scope: {
			languages: optionalStringArray(scope.languages),
			tools: optionalStringArray(scope.tools),
			files: optionalStringArray(scope.files),
			projects: optionalStringArray(scope.projects),
		},
		skills: optionalStringArray(value.skills),
		compatible_skills: optionalStringArray(value.compatible_skills),
		excluded_skills: optionalStringArray(value.excluded_skills),
		confidence: value.confidence as MemoryEntry["confidence"],
		hits: value.hits as MemoryEntry["hits"],
		created_at: value.created_at as MemoryEntry["created_at"],
		updated_at: value.updated_at as MemoryEntry["updated_at"],
		trigger: value.trigger as MemoryEntry["trigger"],
		symptom: value.symptom as MemoryEntry["symptom"],
		root_cause: value.root_cause as MemoryEntry["root_cause"],
		fix: value.fix as MemoryEntry["fix"],
		verification: value.verification as MemoryEntry["verification"],
	};
}

function optionalStringArray(value: unknown): string[] | undefined {
	return isStringArray(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNonEmptyStringArray(value: unknown): value is string[] {
	return isStringArray(value) && value.length > 0 && value.every((item) => item.trim().length > 0);
}

function isIsoDate(value: unknown): boolean {
	return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
