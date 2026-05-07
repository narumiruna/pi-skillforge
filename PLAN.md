# pi-skillforge Plan

## Purpose

`pi-skillforge` is a Pi extension for improving agent skills through verified global memory.

It captures recurring gotchas, fixes, decisions, and workflow learnings from real coding-agent sessions, stores them as structured project-aware memory under Pi's global agent directory, retrieves only relevant entries for active skills, and promotes stable repeated learnings into reviewed skill patch proposals.

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

### 4. Automatic promotion, approved application

The extension may automatically generate skill patch proposals from stable memory, but direct `SKILL.md` modification must require explicit user approval.

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

The repository follows Pi package conventions. Extension entry files live under `extensions/`; reusable implementation modules live under `src/`, grouped by product seam.

```txt
pi-skillforge/
├── README.md
├── PLAN.md
├── package.json
├── extensions/
│   └── skillforge.ts
├── src/
│   ├── memory/
│   │   ├── capture.ts
│   │   ├── parse.ts
│   │   ├── retrieve.ts
│   │   ├── serialize.ts
│   │   └── validate.ts
│   ├── promotion/
│   │   └── promotion.ts
│   ├── store/
│   │   └── storage.ts
│   └── shared/
│       └── types.ts
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

## Current v1 Behavior

Normal operation is automatic after the package is loaded:

1. `before_agent_start` retrieves relevant memories from the current project partition and global partition.
2. Retrieved memory is injected as hidden concise context.
3. The agent may call `skillforge_capture_memory` automatically when a verified reusable gotcha, decision, or pattern has concrete evidence.
4. Memory save and retrieval both trigger promotion checks.
5. Eligible memories create pending skill patch proposal files automatically.
6. The only user-facing command is `/skillforge <skill-name>`, which reviews pending proposals and applies them only after confirmation.

There are intentionally no user commands for init, capture, retrieve, validate, reindex, or promote.

## Runtime Files

The extension stores all memory and promotion artifacts under Pi's global agent directory:

```txt
${PI_CODING_AGENT_DIR:-~/.pi/agent}/skillforge/
├── memory/
│   ├── global/
│   │   ├── gotchas/
│   │   ├── decisions/
│   │   └── patterns/
│   └── projects/
│       └── <project-id>/
│           ├── gotchas/
│           ├── decisions/
│           └── patterns/
├── promotions/
│   ├── global/
│   └── projects/
│       └── <project-id>/
├── registry.yaml
├── index.json
└── promotion-log.md
```

There is no repo-local `.pi-skillforge/` store. Project-specific memories are isolated by `<project-id>` inside the global store. Retrieval reads the current project partition and the global partition by default, with conservative filtering to avoid memory leaking into unrelated tasks.

`<project-id>` is derived from the git remote URL when available, otherwise the git root path, otherwise the current working directory path. The visible form is `<folder-name>-<8-char-hash>`.

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
2. Read the current project partition and global partition under `${PI_CODING_AGENT_DIR:-~/.pi/agent}/skillforge/`. ✅
3. Match memory entries by `skills` and `compatible_skills`. ✅
4. Exclude entries matching `excluded_skills`. ✅
5. Further filter by file path, language, tool, and user prompt terms. ✅
6. Inject only the smallest relevant summary into the agent context. ✅

Current implementation notes:

* `draft` and `deprecated` memories are ignored.
* Skill-scoped memories require a `skills` or `compatible_skills` match when active skills are available.
* A skill match alone is not enough; prompt/scope terms must also match to avoid broad injection.
* Retrieval is automatic before each agent turn.
* The only user-facing command is `/skillforge <skill-name>`, which reviews and optionally applies pending skill patches.

A retrieved memory should explain what to do now, not replay the full historical debugging story.

## Capture Model

Memory capture is agent-mediated and automatic, but conservative. The `skillforge_capture_memory` tool may be used when the agent has verified a reusable gotcha, decision, or pattern with concrete evidence.

Implemented capture support:

* validating required schema fields ✅
* rejecting unreplaced template placeholders before saving ✅
* storing entries under the global project/global partitions ✅
* updating `index.json` ✅
* automatic agent-tool capture via `skillforge_capture_memory` for verified reusable memory ✅

The extension should not blindly mine every conversation into memory. It should capture only confirmed learnings with prevention value, narrow scope, and explicit verification evidence.

## Promotion Model

Promotion turns repeated, confirmed memory into proposed skill changes.

Promotion candidates should require:

* multiple hits or strong manual confirmation
* stable scope
* clear prevention value
* no conflict with excluded skills
* a short patch that keeps `SKILL.md` lean

Promotion output is a patch proposal. Proposal generation is automatic; applying a proposal to `SKILL.md` requires explicit user approval via `/skillforge <skill-name>`.

MVP promotion eligibility:

* `confidence: confirmed`
* `hits >= 3`
* at least one target `skills` entry

Promotion is checked after memory save and after retrieval of relevant memories. Proposal files are JSON records under `promotions/` and include target skill, target path when known, source memory evidence, proposed guidance, rationale, verification, and status.

The future target is evidence-based hit accounting: memory should gain promotion evidence only when it was retrieved and the task was successfully verified or the user confirmed it helped.

## Implementation Milestones

### 0. Package scaffold

* Pi package manifest using `extensions/` ✅
* `/skillforge <skill-name>` command to review and approve generated skill patches ✅
* Biome, TypeScript, pre-commit, and justfile release workflow ✅

### 1. Storage and validation

* Define `memory.schema.json` ✅
* Implement global-only project-aware storage helpers ✅
* Add validation and tests (validation implemented; automated tests still pending)

### 2. Capture workflow

* Add automatic agent tool capture for gotchas, decisions, and patterns ✅
* Require trigger, symptom, root cause, fix, verification, scope, and confidence ✅
* Persist verified entries ✅

### 3. Retrieval workflow

* Read active skill metadata from Pi context where available ✅
* Filter by skill/scope/exclusions ✅
* Inject concise memory summaries before agent start ✅
* Trigger promotion checks for retrieved memories ✅

### 4. Promotion workflow

* Detect repeated stable entries ✅
* Generate skill patch proposals ✅
* Append decisions to `promotion-log.md` ✅
* Apply proposals only after `/skillforge <skill-name>` approval ✅

### 5. Hardening

* Conflict detection for proposal application
* stale-entry review
* registry migration/versioning
* automated tests for storage, retrieval, capture, and promotion
* evidence-based hit accounting after verified task success
* better patch placement inside existing `SKILL.md` sections instead of appending a generated section
