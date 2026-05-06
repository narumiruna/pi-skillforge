# pi-skillforge Plan

## Purpose

`pi-skillforge` is a Pi extension for improving agent skills through verified project memory.

It captures recurring gotchas, fixes, decisions, and workflow learnings from real coding-agent sessions, stores them as structured memory, retrieves only relevant entries for active skills, and promotes stable repeated learnings into skill improvements.

The goal is not to make skills larger. The goal is to make skills more accurate, less stale, and better grounded in actual project experience.

## Problem

Coding agents repeatedly hit the same project-specific issues:

* hidden framework version differences
* local tooling conventions
* fragile test or lint behavior
* undocumented project assumptions
* repeated debugging paths
* stale or incomplete skills

Current skill files often become either:

* too generic to prevent mistakes, or
* too bloated with one-off notes and stale gotchas

This creates two failure modes:

1. Useful lessons are lost after each session.
2. Skills become polluted by low-confidence, outdated, or overly broad instructions.

`pi-skillforge` solves this by separating memory capture from skill modification.

## Design Principles

### 1. Memory before skill changes

A gotcha must first be stored as memory. It should not immediately modify a skill.

Skill changes happen only after repeated evidence shows that the memory is stable, useful, and skill-specific.

### 2. Skill-scoped retrieval

Memory must be retrieved based on active or compatible skills, not dumped into every task.

A Python testing gotcha should not affect a React UI task unless it is explicitly compatible.

### 3. Verified entries only

Memory should record confirmed facts, not speculation.

Each memory entry should include:

* trigger
* symptom
* root cause
* fix or prevention
* verification evidence
* scope
* confidence

### 4. Promotion instead of automatic rewriting

The extension may propose skill patches, but direct skill modification should require explicit approval.

### 5. Keep skills lean

Skills should remain concise operational recipes.

Large historical notes, debugging stories, or one-off failures belong in memory, not in `SKILL.md`.

## Non-goals

`pi-skillforge` is not intended to be:

* a general vector database product
* a chat history archive
* an automatic AGENTS.md rewriter
* a replacement for project documentation
* a place to store every observation from every task
* a system that blindly trusts agent-generated learnings

## Pi Package Structure

The repository follows Pi package conventions. Extension entry files live under `extensions/`; reusable implementation modules live under `lib/`.

```txt
pi-skillforge/
├── README.md
├── PLAN.md
├── package.json
├── extensions/
│   └── skillforge.ts
├── lib/
│   ├── capture.ts
│   ├── parse.ts
│   ├── retrieve.ts
│   ├── serialize.ts
│   ├── storage.ts
│   ├── types.ts
│   └── validate.ts
├── schemas/
│   ├── memory.schema.json
│   └── skill-registry.schema.json
├── templates/
│   ├── gotcha.md
│   ├── decision.md
│   └── skill-patch.md
├── examples/
│   ├── memory-entry.md
│   ├── skill-registry.yaml
│   └── promoted-skill-patch.md
└── tests/                  # planned
    ├── capture.test.ts
    ├── retrieve.test.ts
    ├── promote.test.ts
    └── validate.test.ts
```

Package manifest:

```json
{
	"pi": {
		"extensions": ["./extensions"]
	}
}
```

## Runtime Project Files

Inside a user project, the extension stores memory under:

```txt
.pi-skillforge/
├── memory/
│   ├── gotchas/
│   ├── decisions/
│   └── patterns/
├── registry.yaml
├── index.json
└── promotion-log.md
```

These files are project-local by default. Global memory uses Pi's agent directory:

```txt
${PI_CODING_AGENT_DIR:-~/.pi/agent}/skillforge/
├── memory/
│   ├── gotchas/
│   ├── decisions/
│   └── patterns/
├── registry.yaml
├── index.json
└── promotion-log.md
```

Retrieval reads project-local and global memory by default, with conservative filtering to avoid global memories leaking into unrelated tasks.

## Memory Types

### Gotcha

A non-obvious project-specific pitfall that caused an error or wasted effort.

```yaml
type: gotcha
```

### Decision

A confirmed project decision that affects future implementation.

```yaml
type: decision
```

### Pattern

A reusable successful workflow or implementation pattern.

```yaml
type: pattern
```

## Memory Entry Schema

Memory entries should be human-reviewable YAML or Markdown-with-frontmatter files, validated against `schemas/memory.schema.json`.

```yaml
id: python-ruff-import-order-001
type: gotcha
title: Ruff import sorting conflicts with local convention
scope:
  languages:
    - python
  tools:
    - ruff
  files:
    - pyproject.toml
    - "**/*.py"
skills:
  - python-quality
compatible_skills:
  - python-testing
excluded_skills:
  - frontend-react
confidence: confirmed
hits: 1
created_at: 2026-05-06
updated_at: 2026-05-06

trigger:
  - Editing Python imports.

symptom:
  - `ruff check --fix` keeps rewriting import groups unexpectedly.

root_cause:
  - The project has a local import-grouping convention that differs from the default Ruff formatter behavior.

fix:
  - Check `pyproject.toml` before changing import organization.
  - Prefer the project's configured import sections over generic examples.

verification:
  - `npm run check` or the project-specific quality command passed after preserving the local convention.
```

## Retrieval Model

Retrieval should be conservative:

1. Detect active skills from Pi's loaded skill context when available. ✅
2. Read project-local `.pi-skillforge/` and global `${PI_CODING_AGENT_DIR:-~/.pi/agent}/skillforge/` memories. ✅
3. Match memory entries by `skills` and `compatible_skills`. ✅
4. Exclude entries matching `excluded_skills`. ✅
5. Further filter by file path, language, tool, and user prompt terms. ✅
6. Inject only the smallest relevant summary into the agent context. ✅

Current implementation notes:

* `draft` and `deprecated` memories are ignored.
* Skill-scoped memories require a `skills` or `compatible_skills` match when active skills are available.
* A skill match alone is not enough; prompt/scope terms must also match to avoid broad injection.
* `/skillforge retrieve <prompt>` and `/skillforge search <prompt>` preview matching memory ids, scopes, scores, reasons, paths, and fix lines.
* Retrieval defaults to `--all`; use `--local` or `--global` to debug one store.

A retrieved memory should explain what to do now, not replay the full historical debugging story.

## Capture Model

Memory capture should be explicit and reviewable. Implemented commands/tools support:

* drafting gotchas, decisions, and patterns with `/skillforge capture <type>` ✅
* validating required schema fields ✅
* rejecting unreplaced template placeholders before saving ✅
* storing the entry under `.pi-skillforge/memory/` ✅
* updating `index.json` ✅
* explicit agent-tool capture via `skillforge_capture_memory` when the user asks to remember verified memory ✅

The extension should not silently mine every conversation into memory.

## Promotion Model

Promotion turns repeated, confirmed memory into proposed skill changes.

Promotion candidates should require:

* multiple hits or strong manual confirmation
* stable scope
* clear prevention value
* no conflict with excluded skills
* a short patch that keeps `SKILL.md` lean

Promotion output should be a patch proposal, not an automatic rewrite. Direct skill modification requires explicit user approval.

## Implementation Milestones

### 0. Package scaffold

* Pi package manifest using `extensions/` ✅
* `/skillforge` command to verify loading ✅
* Biome, TypeScript, pre-commit, and justfile release workflow ✅

### 1. Storage and validation

* Define `memory.schema.json` ✅
* Implement project-local `.pi-skillforge/` storage helpers ✅
* Add validation and tests (validation implemented; automated tests still pending)

### 2. Capture workflow

* Add command/tool to draft gotchas, decisions, and patterns ✅
* Require trigger, symptom, root cause, fix, verification, scope, and confidence ✅
* Persist reviewed entries ✅

### 3. Retrieval workflow

* Read active skill metadata from Pi context where available ✅
* Filter by skill/scope/exclusions ✅
* Inject concise memory summaries before agent start ✅
* Add retrieval preview/debug command ✅

### 4. Promotion workflow

* Detect repeated stable entries
* Generate `templates/skill-patch.md` proposals
* Append decisions to `promotion-log.md`

### 5. Hardening

* Conflict detection
* stale-entry review
* registry migration/versioning
* package docs and examples
