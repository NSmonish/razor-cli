# Razor A/B eval — sonnet

- Model: `claude-sonnet-5-5` · effort: `medium` · Claude Code 2.1.296 (Claude Code) · razor-cli bf9a7da
- Tasks: 3 · reps per arm: 1 · started 2026-10-13T05:43:21.274Z
- Failed attempts (not scored, see errors.jsonl): naive 0, razor 0
- ⚠ 1 rep per arm: each cell is a single run. Differences are anecdotes, not evidence — agent runs vary noticeably run to run.

## Overview

| Task | naive pass | razor pass | razor/naive tokens | razor/naive peak ctx | razor/naive time | pack used |
|---|---|---|---|---|---|---|
| t1-premium-discount | 1/1 | 1/1 | 2.39× | 1.15× | 2.86× | 1/1 |
| t2-delete-order | 1/1 | 1/1 | 0.99× | 0.97× | 0.95× | 0/1 |
| t3-user-service-timeout | 1/1 | 1/1 | 1.03× | 1.05× | 1.38× | 0/1 |

Median razor/naive ratio over the 3 task(s) where both arms passed: tokens 1.03×, peak context 1.05×, time 1.38× (below 1× means Razor used less).

## t1-premium-discount

| Metric | naive | razor | razor/naive |
|---|---|---|---|
| **Pass (all ACs)** | PASS | PASS | |
| Acceptance criteria | AC1✓ AC2✓ AC3✓ | AC1✓ AC2✓ AC3✓ | |
| Total tokens | 95,746 | 229,182 | 2.39× |
|   output tokens | 1,354 | 2,108 | 1.56× |
| Peak context (tokens) | 25,460 | 29,392 | 1.15× |
| Initial context (tokens) | 21,610 | 22,337 | 1.03× |
| Time (min) | 0.21 | 0.60 | 2.86× |
| Cost (USD) | $0.089 | $0.125 | 1.41× |
| Turns | 4 | 9 | 2.25× |
| Tool calls | 3 | 8 | 2.67× |
| Tool calls before 1st edit | 2 | 6 | 3.00× |
| Tokens before 1st edit | 68,972 | 169,598 | 2.46× |
| Re-correction loops (confirmed) | 0 | 0 |  |
|   + unclear runs (exit status masked) | 0 | 0 |  |
| Regressions | 0 | 0 |  |
| Pack used | n/a | used (read: scripts/check.sh; skills: none; check.sh runs: 0) | |
| Test/lint runs in order (✓ pass, ✗ fail, ? unclear) | none | ✓ | |
| Traces | [rep0](baseline/traces/t1-premium-discount_rep0.json) | [rep0](v1/traces/t1-premium-discount_rep0.json) | |

## t2-delete-order

| Metric | naive | razor | razor/naive |
|---|---|---|---|
| **Pass (all ACs)** | PASS | PASS | |
| Acceptance criteria | AC1✓ AC2✓ | AC1✓ AC2✓ | |
| Total tokens | 130,385 | 129,173 | 0.99× |
|   output tokens | 1,395 | 1,407 | 1.01× |
| Peak context (tokens) | 28,744 | 28,025 | 0.97× |
| Initial context (tokens) | 21,563 | 22,286 | 1.03× |
| Time (min) | 0.20 | 0.19 | 0.95× |
| Cost (USD) | $0.105 | $0.103 | 0.97× |
| Turns | 6 | 6 | 1.00× |
| Tool calls | 5 | 5 | 1.00× |
| Tool calls before 1st edit | 2 | 2 | 1.00× |
| Tokens before 1st edit | 72,094 | 72,337 | 1.00× |
| Re-correction loops (confirmed) | 0 | 0 |  |
|   + unclear runs (exit status masked) | 0 | 0 |  |
| Regressions | 0 | 0 |  |
| Pack used | n/a | **unused** (read: none; skills: none; check.sh runs: 0) | |
| Test/lint runs in order (✓ pass, ✗ fail, ? unclear) | none | none | |
| Traces | [rep0](baseline/traces/t2-delete-order_rep0.json) | [rep0](v1/traces/t2-delete-order_rep0.json) | |

## t3-user-service-timeout

| Metric | naive | razor | razor/naive |
|---|---|---|---|
| **Pass (all ACs)** | PASS | PASS | |
| Acceptance criteria | AC1✓ AC2✓ AC3✓ AC4✓ | AC1✓ AC2✓ AC3✓ AC4✓ | |
| Total tokens | 129,368 | 133,779 | 1.03× |
|   output tokens | 1,938 | 2,158 | 1.11× |
| Peak context (tokens) | 28,570 | 30,043 | 1.05× |
| Initial context (tokens) | 21,637 | 22,368 | 1.03× |
| Time (min) | 0.29 | 0.40 | 1.38× |
| Cost (USD) | $0.110 | $0.118 | 1.08× |
| Turns | 5 | 5 | 1.00× |
| Tool calls | 4 | 4 | 1.00× |
| Tool calls before 1st edit | 3 | 2 | 0.67× |
| Tokens before 1st edit | 98,915 | 72,901 | 0.74× |
| Re-correction loops (confirmed) | 0 | 0 |  |
|   + unclear runs (exit status masked) | 0 | 0 |  |
| Regressions | 0 | 0 |  |
| Pack used | n/a | **unused** (read: none; skills: none; check.sh runs: 0) | |
| Test/lint runs in order (✓ pass, ✗ fail, ? unclear) | none | ✓ | |
| Traces | [rep0](baseline/traces/t3-user-service-timeout_rep0.json) | [rep0](v1/traces/t3-user-service-timeout_rep0.json) | |

