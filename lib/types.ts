export const MEMORY_TYPES = ["gotcha", "decision", "pattern"] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export const CONFIDENCE_LEVELS = ["draft", "observed", "confirmed", "deprecated"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export interface MemoryScope {
	languages?: string[];
	tools?: string[];
	files?: string[];
	projects?: string[];
}

export interface MemoryEntry {
	id: string;
	type: MemoryType;
	title: string;
	scope: MemoryScope;
	skills?: string[];
	compatible_skills?: string[];
	excluded_skills?: string[];
	confidence: ConfidenceLevel;
	hits: number;
	created_at: string;
	updated_at: string;
	trigger: string[];
	symptom: string[];
	root_cause: string[];
	fix: string[];
	verification: string[];
}

export interface MemoryIndexEntry {
	id: string;
	type: MemoryType;
	title: string;
	path: string;
	scope: MemoryScope;
	skills: string[];
	compatible_skills: string[];
	excluded_skills: string[];
	confidence: ConfidenceLevel;
	hits: number;
	updated_at: string;
}

export interface MemoryIndex {
	version: 1;
	updated_at: string;
	entries: MemoryIndexEntry[];
}

export interface ValidationResult {
	valid: boolean;
	errors: string[];
	entry?: MemoryEntry;
}
