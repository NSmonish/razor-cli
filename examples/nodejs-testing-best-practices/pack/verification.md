---
name: verification
kind: doc
description: has tests, lint, or a build to verify work
version: 1
generated: 2026-10-12
razor_format: 1.0
---

# Verification

How to check that work is correct before calling a task done.

## Checks
- Lint: `eslint .`
- Tests: `jest`

## One-shot
- Run `scripts/check.sh` to do lint + test in one go.

## Where tests live
`recipes/nestjs/test`, `recipes/mocha`, `recipes/friendly-structure-for-reporting`, `recipes/doc-driven-contract-test/test`, `example-application/test`, `example-application/test/setup`, `anti-patterns`
