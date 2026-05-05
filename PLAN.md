# PLAN.md

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

## Repository Structure

```txt
pi-skillforge/
├── README.md
├── PLAN.md
├── package.json
├── extensions/
│   └── skillforge.ts
├── lib/
│   ├── capture.ts
│   ├── retrieve.ts
│   ├── promote.ts
│   ├── validate.ts
│   ├── registry.ts
│   └── storage.ts
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
└── tests/
    ├── capture.test.ts
    ├── retrieve.test.ts
    ├── promote.test.ts
    └── validate.test.ts
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

These files are project-local by default.

## Memory Types

### Gotcha

A non-obvious project-specific pitfall that caused an error or wasted effort.

Example:

```yaml
type: gotcha
```

### Decision

A confirmed project decision that affects future implementation.

Example:

```yaml
type: decision
```

### Pattern

A reusable successful workflow or implementation pattern.

Example:

```yaml
type: pattern
```

## Memory Entry Schema

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
  - `ruff check --fix` keeps rewriting import groups.

root_cause:
  - Project c
```
