---
name: run-tests
kind: skill
description: Run the test suite (Jest). Use when verifying changes or before pushing.
version: 1
generated: 2026-10-12
razor_format: 1.0
evidence: package.json dep: jest
---

# run-tests

## Steps
1. Run `jest`.
2. Fix failures before continuing. Do not disable or skip tests to make them pass.
