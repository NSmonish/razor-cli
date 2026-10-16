# Razor A/B eval — pilot

- Model: `claude-opus-5-5` · effort: `medium` · Claude Code 2.1.296 (Claude Code) · razor-cli bf9a7da
- Tasks: 3 · reps per arm: 1 · started 2026-10-13T04:38:15.733Z
- Failed attempts (not scored, see errors.jsonl): naive 0, razor 0
- ⚠ 1 rep per arm: each cell is a single run. Differences are anecdotes, not evidence — agent runs vary noticeably run to run.

## Overview

| Task | naive pass | razor pass | razor/naive tokens | razor/naive peak ctx | razor/naive time | pack used |
|---|---|---|---|---|---|---|
| t1-premium-discount | 1/1 | 1/1 | 1.02× | 1.00× | 1.33× | 1/1 |
| t2-delete-order | 1/1 | 1/1 | 1.02× | 1.01× | 1.09× | 1/1 |
| t3-user-service-timeout | 1/1 | 1/1 | 1.76× | 1.11× | 1.62× | 1/1 |

Median razor/naive ratio over the 3 task(s) where both arms passed: tokens 1.02×, peak context 1.01×, time 1.33× (below 1× means Razor used less).

## t1-premium-discount

| Metric | naive | razor | razor/naive |
|---|---|---|---|
| **Pass (all ACs)** | PASS | PASS | |
| Acceptance criteria | AC1✓ AC2✓ AC3✓ | AC1✓ AC2✓ AC3✓ | |
| Total tokens | 340,372 | 348,767 | 1.02× |
|   output tokens | 4,181 | 5,402 | 1.29× |
| Peak context (tokens) | 36,776 | 36,912 | 1.00× |
| Initial context (tokens) | 21,655 | 22,381 | 1.03× |
| Time (min) | 1.00 | 1.33 | 1.33× |
| Cost (USD) | $0.372 | $0.398 | 1.07× |
| Turns | 11 | 11 | 1.00× |
| Tool calls | 10 | 10 | 1.00× |
| Tool calls before 1st edit | 4 | 4 | 1.00× |
| Tokens before 1st edit | 131,625 | 132,170 | 1.00× |
| Re-correction loops (confirmed) | 0 | 2 |  |
|   + unclear runs (exit status masked) | 0 | 0 |  |
| Regressions | 0 | 0 |  |
| Pack used | n/a | used (read: verification.md, scripts/check.sh, .claude/skills/run-tests/SKILL.md; skills: none; check.sh runs: 2) | |
| Test/lint runs in order (✓ pass, ✗ fail, ? unclear) | ✓ | ✓✗✗✓ | |
| Traces | [rep0](baseline/traces/t1-premium-discount_rep0.json) | [rep0](v1/traces/t1-premium-discount_rep0.json) | |

## t2-delete-order

| Metric | naive | razor | razor/naive |
|---|---|---|---|
| **Pass (all ACs)** | PASS | PASS | |
| Acceptance criteria | AC1✓ AC2✓ | AC1✓ AC2✓ | |
| Total tokens | 236,931 | 241,615 | 1.02× |
|   output tokens | 3,684 | 3,351 | 0.91× |
| Peak context (tokens) | 34,892 | 35,102 | 1.01× |
| Initial context (tokens) | 21,607 | 22,329 | 1.03× |
| Time (min) | 0.82 | 0.89 | 1.09× |
| Cost (USD) | $0.326 | $0.322 | 0.99× |
| Turns | 10 | 11 | 1.10× |
| Tool calls | 9 | 10 | 1.11× |
| Tool calls before 1st edit | 3 | 2 | 0.67× |
| Tokens before 1st edit | 101,837 | 74,693 | 0.73× |
| Re-correction loops (confirmed) | 0 | 0 |  |
|   + unclear runs (exit status masked) | 0 | 0 |  |
| Regressions | 0 | 0 |  |
| Pack used | n/a | used (read: architecture.md, verification.md, steering.md, scripts/check.sh; skills: none; check.sh runs: 0) | |
| Test/lint runs in order (✓ pass, ✗ fail, ? unclear) | ✓ | ✓✓ | |
| Traces | [rep0](baseline/traces/t2-delete-order_rep0.json) | [rep0](v1/traces/t2-delete-order_rep0.json) | |

## t3-user-service-timeout

| Metric | naive | razor | razor/naive |
|---|---|---|---|
| **Pass (all ACs)** | PASS | PASS | |
| Acceptance criteria | AC1✓ AC2✓ AC3✓ AC4✓ | AC1✓ AC2✓ AC3✓ AC4✓ | |
| Total tokens | 249,675 | 438,855 | 1.76× |
|   output tokens | 4,356 | 5,520 | 1.27× |
| Peak context (tokens) | 35,701 | 39,738 | 1.11× |
| Initial context (tokens) | 21,682 | 22,412 | 1.03× |
| Time (min) | 1.09 | 1.77 | 1.62× |
| Cost (USD) | $0.348 | $0.441 | 1.27× |
| Turns | 8 | 13 | 1.63× |
| Tool calls | 7 | 12 | 1.71× |
| Tool calls before 1st edit | 3 | 3 | 1.00× |
| Tokens before 1st edit | 106,596 | 107,990 | 1.01× |
| Re-correction loops (confirmed) | 0 | 1 |  |
|   + unclear runs (exit status masked) | 0 | 2 |  |
| Regressions | 0 | 0 |  |
| Pack used | n/a | used (read: verification.md, steering.md, scripts/check.sh, .claude/skills/run-tests/SKILL.md; skills: none; check.sh runs: 2) | |
| Test/lint runs in order (✓ pass, ✗ fail, ? unclear) | ✓✓ | ✗✓??✓ | |
| Traces | [rep0](baseline/traces/t3-user-service-timeout_rep0.json) | [rep0](v1/traces/t3-user-service-timeout_rep0.json) | |

