---
name: lint-fix
kind: skill
description: Lint and auto-fix code style. Use before committing to keep CI green.
version: 1
generated: 2026-10-19
razor_format: 1.0
evidence: .prettierrc.json
---

# lint-fix

## Steps
1. Run `npm run lint` (add the fix flag if the linter supports it).
2. Only fix issues in files you changed; do not reformat unrelated code.
