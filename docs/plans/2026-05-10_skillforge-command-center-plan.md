## Goal

Expand `/skillforge` into a Skillforge memory / promotion command center, and add safe memory deletion.

Success conditions:

- It can list global gotchas.
- It can delete a memory by memory id.
- It requires explicit confirmation before deletion.
- It rebuilds or preserves a consistent index after deletion.
- It does not break the existing `/skillforge <skill-name>` review workflow.

## Context

Today, `/skillforge` in `extensions/skillforge.ts` only accepts a single `<skill-name>` and then runs the pending skill patch review/apply flow:

- `listPendingProposals(skillName)`
- `formatProposalForReview(proposal)`
- `applyProposal(proposal)`

Memory read capabilities already exist in:

- `src/store/storage.ts`
  - `validateStoredMemories(cwd, "global")`
  - `validateRetrievalMemories(cwd, "all")`
  - `rebuildIndex(cwd)`
- `src/memory/retrieve.ts`
  - Retrieval is relevance-based, so it is not appropriate for "list all" commands. Listing all memories should use storage validation/reporting directly.

## Architecture

Add a command router layer:

```text
/skillforge <args>
        ↓
parseSkillforgeCommand(args)
        ↓
handler dispatch
  ├─ help
  ├─ list memories
  ├─ delete memory
  ├─ review/apply skill patch
  └─ legacy skill patch review
```

Prefer moving command parsing, memory formatting, and delete lookup out of `extensions/skillforge.ts` into `src/memory`, `src/store`, or `src/shared` so the extension file does not keep growing.

## Non-Goals

- Do not support arbitrary natural-language commands in the first version; support only limited aliases and common Chinese phrases.
- Do not allow deletion by arbitrary filesystem path; delete must go through memory id lookup.
- Do not change the core automatic capture / retrieval / promotion behavior.

## Plan

- [ ] Define the `/skillforge` command grammar to support `/skillforge help`, `/skillforge list global gotchas`, `/skillforge 列出所有 global 的 GOTCHA`, `/skillforge delete <memory-id>`, `/skillforge delete global <memory-id>`, `/skillforge delete project <memory-id>`, `/skillforge review <skill-name>`, and legacy `/skillforge <skill-name>`; verify that every syntax shown in the README usage table maps to a parser branch.

- [ ] Add a command parser, such as `parseSkillforgeCommand(args)`, that converts English and limited Chinese phrases into a typed command object; verify with parser smoke cases or manual calls covering help/list/delete/review/legacy/invalid branches.

- [ ] Add a memory listing formatter, such as `formatMemoryList(reports, options)`, that prints each memory's `partition/type/title/id/path/confidence/hits/updated_at`; verify with existing global memory files that invalid memories are either excluded from the normal list or clearly marked.

- [ ] Add a memory lookup helper, such as `findMemoryById(cwd, id, partition?)`, that finds memories through `validateRetrievalMemories(cwd, "all")` or a specified partition; verify that an existing memory id resolves to a unique `absolutePath`, and missing ids return a clear error.

- [ ] Add a delete helper, such as `deleteMemory(cwd, { id, partition })`, that only deletes a validated/located memory file and never accepts a raw path; call `rebuildIndex(cwd)` after deletion; verify that after deleting a test memory, the file no longer exists and `index.json` no longer contains the id.

- [ ] Add confirmation to the `/skillforge delete ...` handler, showing `partition/type/title/id/path` before deletion; verify that rejecting confirmation leaves the file unchanged, and accepting confirmation deletes it.

- [ ] Handle ambiguous ids: if the same id exists in both project and global partitions, require `/skillforge delete global <id>` or `/skillforge delete project <id>`; verify that the ambiguous case deletes nothing and shows guidance.

- [ ] Add the command router to `extensions/skillforge.ts`, routing `/skillforge list global gotchas` and Chinese `/skillforge 列出所有 global 的 GOTCHA` to `validateStoredMemories(ctx.cwd, "global")` and filtering `type === "gotcha"`; verify with `npm run typecheck`.

- [ ] Convert the existing skill patch review workflow to the explicit subcommand `/skillforge review <skill-name>`, while keeping legacy `/skillforge <skill-name>` behavior; verify that both paths call `listPendingProposals(skillName)`.

- [ ] Update the `README.md` Usage section to describe `/skillforge` as a Skillforge command center, with examples for `help`, `list global gotchas`, `delete <memory-id>`, and `review <skill>`, including delete safety notes; verify that README examples match the implemented parser.

- [ ] Run quality checks; verify with a successful `npm run check`.

## Risks

- Delete is destructive, so it must use id lookup, confirmation, and index rebuild to reduce accidental deletion risk.
- Overly flexible natural-language support could create unpredictable parsing. First version should support only limited aliases: English subcommands and common Chinese phrases.
- Legacy `/skillforge <skill-name>` behavior must not break, or the existing skill patch review workflow will fail.
- If an id is not unique, fail closed and do not guess which memory to delete.

## Rollback / Recovery

- If delete behavior is questionable during implementation, remove only the `/skillforge delete` dispatch and keep list/review/help.
- If a deleted memory must be restored, recreate the same-id memory from git, filesystem backup, or terminal output, then run `rebuildIndex(cwd)` or let the next save flow update the index.

## Completion Checklist

- [ ] `/skillforge list global gotchas` lists global gotcha memories, verified by manual testing or formatter output.
- [ ] `/skillforge 列出所有 global 的 GOTCHA` lists the same result, verified by manual testing.
- [ ] `/skillforge delete <memory-id>` shows confirmation before deletion and does not delete when confirmation is rejected.
- [ ] After confirmed deletion, the memory file is gone and `index.json` no longer contains the id.
- [ ] Ambiguous ids do not delete any memory and prompt the user to specify a partition.
- [ ] `/skillforge review <skill-name>` and `/skillforge <skill-name>` still review pending skill patches.
- [ ] `README.md` documents the new command usage.
- [ ] `npm run check` passes.
