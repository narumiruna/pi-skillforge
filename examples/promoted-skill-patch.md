# Skill patch proposal

## Target skill

`pi-extensions`

## Memory evidence

- `pi-extension-imports-use-js-suffix` — Repeated TypeScript module-resolution failures were avoided by using `.js` suffixes for relative imports in NodeNext Pi packages.

## Proposed patch

```diff
--- a/SKILL.md
+++ b/SKILL.md
@@
 When adding TypeScript modules to a Pi package:
+- With NodeNext ESM, write relative imports with runtime `.js` suffixes, even when the source file is `.ts`.
```

## Rationale

The guidance is short, operational, and prevents a repeat package-load failure.

## Approval

- [ ] User approved applying this patch
- [ ] Patch applied
- [ ] Promotion logged in `.pi-skillforge/promotion-log.md`
