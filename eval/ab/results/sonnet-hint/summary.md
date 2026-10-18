# Razor A/B eval — sonnet-hint

- Model: `claude-sonnet-5-5` · effort: `medium` · Claude Code 2.1.296 (Claude Code) · razor-cli bf9a7da
- Tasks: 5 · reps per arm: 1 · started 2026-10-13T06:01:59.748Z
- Failed attempts (not scored, see errors.jsonl): naive 0, razor 0
- ⚠ 1 rep per arm: each cell is a single run. Differences are anecdotes, not evidence — agent runs vary noticeably run to run.

## Overview

| Task | naive pass | razor pass | naive hidden ACs | razor hidden ACs | razor/naive tokens | razor/naive peak ctx | razor/naive time | pack used |
|---|---|---|---|---|---|---|---|---|
| t1-premium-discount | 1/1 | 1/1 | – | – | 2.11× | 1.11× | 3.05× | 1/1 |
| t2-delete-order | 1/1 | 1/1 | – | – | 3.06× | 1.27× | 3.50× | 1/1 |
| t3-user-service-timeout | 1/1 | 1/1 | – | – | 1.57× | 1.19× | 1.18× | 1/1 |
| t4-order-status-lifecycle | 1/1 | 1/1 | – | – | 2.12× | 1.10× | 2.77× | 1/1 |
| t5-order-listing | 1/1 | 1/1 | – | – | 3.21× | 1.27× | 3.08× | 1/1 |

Hidden ACs: acceptance criteria from the real fix's tests that the prompt does not state; summed over reps. Efficiency ratios need every run to pass the shown ACs.

Median razor/naive ratio over the 5 task(s) where both arms solved the stated task: tokens 2.12×, peak context 1.19×, time 3.05× (below 1× means Razor used less).

## t1-premium-discount

| Metric | naive | razor | razor/naive |
|---|---|---|---|
| **Pass (all ACs)** | PASS | PASS | |
| Acceptance criteria | AC1✓ AC2✓ AC3✓ | AC1✓ AC2✓ AC3✓ | |
| Total tokens | 95,180 | 200,539 | 2.11× |
|   output tokens | 1,190 | 1,600 | 1.34× |
| Peak context (tokens) | 25,239 | 27,927 | 1.11× |
| Initial context (tokens) | 21,615 | 22,490 | 1.04× |
| Time (min) | 0.19 | 0.58 | 3.05× |
| Cost (USD) | $0.086 | $0.111 | 1.29× |
| Turns | 4 | 8 | 2.00× |
| Tool calls | 3 | 7 | 2.33× |
| Tool calls before 1st edit | 2 | 6 | 3.00× |
| Tokens before 1st edit | 68,786 | 171,110 | 2.49× |
| Re-correction loops (confirmed) | 0 | 1 |  |
|   + unclear runs (exit status masked) | 0 | 0 |  |
| Regressions | 0 | 0 |  |
| Pack used | n/a | used (read: scripts/check.sh; skills: none; check.sh runs: 0) | |
| Test/lint runs in order (✓ pass, ✗ fail, ? unclear) | none | ✗✓ | |
| Harness-file access (leak check) | – | – | |
| Traces | [rep0](baseline/traces/t1-premium-discount_rep0.json) | [rep0](v1/traces/t1-premium-discount_rep0.json) | |

## t2-delete-order

| Metric | naive | razor | razor/naive |
|---|---|---|---|
| **Pass (all ACs)** | PASS | PASS | |
| Acceptance criteria | AC1✓ AC2✓ | AC1✓ AC2✓ | |
| Total tokens | 124,092 | 379,403 | 3.06× |
|   output tokens | 1,245 | 3,425 | 2.75× |
| Peak context (tokens) | 27,301 | 34,585 | 1.27× |
| Initial context (tokens) | 19,865 | 20,736 | 1.04× |
| Time (min) | 0.22 | 0.77 | 3.50× |
| Cost (USD) | $0.098 | $0.173 | 1.77× |
| Turns | 5 | 15 | 3.00× |
| Tool calls | 4 | 14 | 3.50× |
| Tool calls before 1st edit | 2 | 5 | 2.50× |
| Tokens before 1st edit | 68,768 | 120,733 | 1.76× |
| Re-correction loops (confirmed) | 0 | 0 |  |
|   + unclear runs (exit status masked) | 0 | 1 |  |
| Regressions | 0 | 0 |  |
| Pack used | n/a | used (read: AGENTS.md, verification.md, scripts/check.sh, steering.md; skills: none; check.sh runs: 0) | |
| Test/lint runs in order (✓ pass, ✗ fail, ? unclear) | none | ?✓✓ | |
| Harness-file access (leak check) | – | – | |
| Traces | [rep0](baseline/traces/t2-delete-order_rep0.json) | [rep0](v1/traces/t2-delete-order_rep0.json) | |

## t3-user-service-timeout

| Metric | naive | razor | razor/naive |
|---|---|---|---|
| **Pass (all ACs)** | PASS | PASS | |
| Acceptance criteria | AC1✓ AC2✓ AC3✓ AC4✓ | AC1✓ AC2✓ AC3✓ AC4✓ | |
| Total tokens | 151,712 | 238,349 | 1.57× |
|   output tokens | 2,231 | 2,769 | 1.24× |
| Peak context (tokens) | 28,012 | 33,411 | 1.19× |
| Initial context (tokens) | 21,643 | 22,522 | 1.04× |
| Time (min) | 0.44 | 0.52 | 1.18× |
| Cost (USD) | $0.113 | $0.148 | 1.31× |
| Turns | 7 | 9 | 1.29× |
| Tool calls | 6 | 8 | 1.33× |
| Tool calls before 1st edit | 4 | 3 | 0.75× |
| Tokens before 1st edit | 94,583 | 75,987 | 0.80× |
| Re-correction loops (confirmed) | 0 | 0 |  |
|   + unclear runs (exit status masked) | 0 | 1 |  |
| Regressions | 0 | 0 |  |
| Pack used | n/a | used (read: AGENTS.md, scripts/check.sh; skills: none; check.sh runs: 1) | |
| Test/lint runs in order (✓ pass, ✗ fail, ? unclear) | ✓ | ?✓ | |
| Harness-file access (leak check) | – | – | |
| Traces | [rep0](baseline/traces/t3-user-service-timeout_rep0.json) | [rep0](v1/traces/t3-user-service-timeout_rep0.json) | |

## t4-order-status-lifecycle

| Metric | naive | razor | razor/naive |
|---|---|---|---|
| **Pass (all ACs)** | PASS | PASS | |
| Acceptance criteria | AC1✓ AC2✓ AC3✓ AC4✓ AC5✓ AC6✓ AC7✓ AC8✓ AC9✓ | AC1✓ AC2✓ AC3✓ AC4✓ AC5✓ AC6✓ AC7✓ AC8✓ AC9✓ | |
| Total tokens | 154,055 | 327,312 | 2.12× |
|   output tokens | 3,912 | 4,935 | 1.26× |
| Peak context (tokens) | 35,891 | 39,627 | 1.10× |
| Initial context (tokens) | 21,873 | 22,753 | 1.04× |
| Time (min) | 0.43 | 1.19 | 2.77× |
| Cost (USD) | $0.161 | $0.203 | 1.26× |
| Turns | 5 | 11 | 2.20× |
| Tool calls | 4 | 10 | 2.50× |
| Tool calls before 1st edit | 2 | 5 | 2.50× |
| Tokens before 1st edit | 78,641 | 134,269 | 1.71× |
| Re-correction loops (confirmed) | 0 | 0 |  |
|   + unclear runs (exit status masked) | 0 | 0 |  |
| Regressions | 0 | 0 |  |
| Pack used | n/a | used (read: AGENTS.md, scripts/check.sh, steering.md; skills: none; check.sh runs: 1) | |
| Test/lint runs in order (✓ pass, ✗ fail, ? unclear) | none | ? | |
| Harness-file access (leak check) | – | – | |
| Traces | [rep0](baseline/traces/t4-order-status-lifecycle_rep0.json) | [rep0](v1/traces/t4-order-status-lifecycle_rep0.json) | |

## t5-order-listing

| Metric | naive | razor | razor/naive |
|---|---|---|---|
| **Pass (all ACs)** | PASS | PASS | |
| Acceptance criteria | AC1✓ AC2✓ AC3✓ AC4✓ AC5✓ | AC1✓ AC2✓ AC3✓ AC4✓ AC5✓ | |
| Total tokens | 134,876 | 432,427 | 3.21× |
|   output tokens | 2,766 | 5,354 | 1.94× |
| Peak context (tokens) | 30,701 | 39,129 | 1.27× |
| Initial context (tokens) | 19,992 | 22,571 | 1.13× |
| Time (min) | 0.39 | 1.20 | 3.08× |
| Cost (USD) | $0.127 | $0.215 | 1.69× |
| Turns | 5 | 14 | 2.80× |
| Tool calls | 4 | 13 | 3.25× |
| Tool calls before 1st edit | 2 | 5 | 2.50× |
| Tokens before 1st edit | 70,986 | 134,985 | 1.90× |
| Re-correction loops (confirmed) | 0 | 4 |  |
|   + unclear runs (exit status masked) | 0 | 0 |  |
| Regressions | 0 | 0 |  |
| Pack used | n/a | used (read: AGENTS.md, overview.md, architecture.md, verification.md, steering.md, scripts/check.sh; skills: none; check.sh runs: 0) | |
| Test/lint runs in order (✓ pass, ✗ fail, ? unclear) | none | ✗✗✗✗✓ | |
| Harness-file access (leak check) | – | – | |
| Traces | [rep0](baseline/traces/t5-order-listing_rep0.json) | [rep0](v1/traces/t5-order-listing_rep0.json) | |

