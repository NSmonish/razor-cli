---
name: code-push
kind: skill
description: Verify then push changes to the remote. Use when the user asks to commit/push/open a PR.
version: 1
generated: 2026-10-12
razor_format: 1.0
evidence: .git/config has a remote; .github/workflows/
---

# code-push

## Steps
1. Verify first: `eslint .` , `jest`.
2. Stage only the files you intended to change.
3. Commit with a clear message, then push to the remote branch.
4. CI is configured — make sure it stays green after the push.
