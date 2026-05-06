# Skill patch proposal

Generated proposals are stored as JSON files under:

```txt
${PI_CODING_AGENT_DIR:-~/.pi/agent}/skillforge/promotions/
```

A proposal records the target skill, target `SKILL.md` path when known, source memory evidence, proposed guidance, and status.

Example shape:

```json
{
	"version": 1,
	"id": "python-typer__typer-mutable-option-default-001",
	"status": "pending",
	"partition": "project",
	"project_id": "example-project-a1b2c3d4",
	"target_skill": "python-typer",
	"target_path": "/home/user/.agents/skills/python-typer/SKILL.md",
	"source_memory_id": "typer-mutable-option-default-001",
	"source_memory_path": "~/.pi/agent/skillforge/memory/projects/example-project-a1b2c3d4/gotchas/typer-mutable-option-default-001.md",
	"memory_title": "Avoid mutable Typer option defaults",
	"memory_type": "gotcha",
	"proposed_guidance": "- Avoid mutable defaults such as [] or {} in Typer options. Use None and initialize inside the command body.",
	"rationale": "gotcha memory 'Avoid mutable Typer option defaults' is confirmed, has 3 hit(s), and targets the python-typer skill.",
	"verification": ["pytest passed after replacing [] defaults with None."],
	"created_at": "2026-05-06",
	"updated_at": "2026-05-06"
}
```

Users review and apply pending proposals with:

```text
/skillforge <skill-name>
```
