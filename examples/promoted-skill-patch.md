# Skill patch proposal

Generated proposal example:

```json
{
	"version": 1,
	"id": "pi-extensions__pi-extension-imports-use-js-suffix",
	"status": "pending",
	"partition": "project",
	"project_id": "pi-skillforge-a1b2c3d4",
	"target_skill": "pi-extensions",
	"target_path": "/home/user/.agents/skills/pi-extensions/SKILL.md",
	"source_memory_id": "pi-extension-imports-use-js-suffix",
	"source_memory_path": "~/.pi/agent/skillforge/memory/projects/pi-skillforge-a1b2c3d4/gotchas/pi-extension-imports-use-js-suffix.md",
	"memory_title": "Use .js suffixes for NodeNext Pi package imports",
	"memory_type": "gotcha",
	"proposed_guidance": "- With NodeNext ESM, write relative imports with runtime .js suffixes, even when the source file is .ts.",
	"rationale": "gotcha memory 'Use .js suffixes for NodeNext Pi package imports' is confirmed, has 3 hit(s), and targets the pi-extensions skill.",
	"verification": [
		"TypeScript typecheck and Pi package loading passed after using .js suffixes."
	],
	"created_at": "2026-05-06",
	"updated_at": "2026-05-06"
}
```

Review and apply with:

```text
/skillforge pi-extensions
```
