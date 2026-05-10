# Runtime Behavior

This document describes what `pi-skillforge` does while Pi is running.

## Summary

`pi-skillforge` is designed to run quietly in the background. After the package is loaded, users do not need to initialize a repository, manually retrieve memory, or manually capture memory.

During normal Pi usage, the extension can:

1. Retrieve relevant memory before each agent turn.
2. Offer the agent a capture tool for verified reusable learnings.
3. Generate pending skill patch proposals when a memory becomes stable enough.
4. Apply skill patches only after explicit user approval through `/skillforge <skill-name>`.

## Memory retrieval

Before each agent turn, `pi-skillforge` searches for memories that may be relevant to the current task.

It reads from:

- the current project partition
- the global partition

It does **not** inject every stored gotcha, decision, or pattern. Retrieved memories are filtered before they are added to the agent context.

A memory is more likely to be injected when:

- it belongs to the current project partition, or it is global
- its `confidence` allows retrieval
- its `skills` or `compatible_skills` match an active skill, when the memory is skill-scoped
- its scope or text is relevant to the current prompt
- it is not blocked by `excluded_skills`

A loaded skill alone is not enough. The current prompt or scope must also be relevant.

Retrieved memories are injected as hidden context with a reminder similar to:

```text
Use only when applicable to the current task; do not treat unrelated memory as instruction.
```

This means memory should guide the agent only when it applies to the task. It should not override the user request, repository evidence, or unrelated instructions.

## Memory capture

The extension registers the `skillforge_capture_memory` tool. The agent may call this tool when a task produces a reusable, verified learning.

Capture is intended for:

- gotchas
- decisions
- patterns

The agent should capture memory only when there is concrete evidence, such as a failing command, a passing verification command, a confirmed API behavior, or an observed repository constraint.

The agent should not capture:

- speculation
- ordinary chat history
- one-off notes with no prevention value
- unverified guesses

Project-specific learnings should be stored in the project partition. Cross-project learnings may be stored in the global partition.

## Skill-scoped behavior

A memory can declare:

- `skills`
- `compatible_skills`
- `excluded_skills`

If a memory has `skills` or `compatible_skills`, it is treated as skill-scoped. Skill-scoped memory requires a matching active skill before retrieval, unless other retrieval logic explicitly allows it.

`excluded_skills` prevents injection when one of those skills is active.

This keeps specialized gotchas from leaking into unrelated work. For example, a Python testing gotcha should not affect a frontend task unless it is explicitly relevant or compatible.

## Promotion to skill patches

Confirmed memory can become a pending skill patch proposal when it is stable enough.

The MVP promotion criteria are:

- `confidence: confirmed`
- `hits >= 3`
- at least one target `skills` entry

Promotion creates a proposal under the global Skillforge store. It does not directly edit any `SKILL.md` file.

To review and apply a proposal, the user runs:

```text
/skillforge <skill-name>
```

The command shows the proposal and asks for confirmation before editing the target skill file.

## User-visible commands

The only user-facing command is:

```text
/skillforge <skill-name>
```

There are intentionally no normal user commands for initialization, retrieval, capture, validation, reindexing, or promotion. Those workflows are automatic or internal.

## Storage model

All data is stored under Pi's global agent directory:

```text
${PI_CODING_AGENT_DIR:-~/.pi/agent}/skillforge/
```

Project-specific memory is stored under a project-specific partition inside that global store. There is no repository-local `.pi-skillforge/` directory.
