# Razor A/B eval — hidden-sonnet

- Model: `claude-sonnet-5-5` · effort: `medium` · Claude Code 2.1.296 (Claude Code) · razor-cli bf9a7da
- Tasks: 3 · reps per arm: 3 · started 2026-10-13T14:36:18.273Z
- Failed attempts (not scored, see errors.jsonl): naive 0, razor 0
- Cells show the median over reps, with (min–max).

## Overview

| Task | naive pass | razor pass | naive hidden ACs | razor hidden ACs | razor/naive tokens | razor/naive peak ctx | razor/naive time | pack used |
|---|---|---|---|---|---|---|---|---|
| t10-fastify-remove-raw-header | 3/3 | 3/3 | 6/6 | 6/6 | 1.05× | 1.05× | 1.46× | 3/3 |
| t8-fastify-content-type-quoted | 3/3 | 3/3 | 6/6 | 6/6 | 0.82× | 1.04× | 0.82× | 2/3 |
| t9-fastify-forwarded-host-trust | 1/3 | 0/3 | 4/6 | 3/6 | 1.04× | 1.01× | 0.90× | 1/3 |

Hidden ACs: acceptance criteria from the real fix's tests that the prompt does not state; summed over reps. Efficiency ratios need every run to pass the shown ACs.

Median razor/naive ratio over the 3 task(s) where both arms solved the stated task: tokens 1.04×, peak context 1.04×, time 0.90× (below 1× means Razor used less).

## t10-fastify-remove-raw-header

| Metric | naive | razor | razor/naive |
|---|---|---|---|
| **Pass (all ACs)** | PASS, PASS, PASS | PASS, PASS, PASS | |
| Acceptance criteria | AC1✓ AC2✓ AC3✓ / AC1✓ AC2✓ AC3✓ / AC1✓ AC2✓ AC3✓ | AC1✓ AC2✓ AC3✓ / AC1✓ AC2✓ AC3✓ / AC1✓ AC2✓ AC3✓ | |
| Shown ACs passed (AC1) | 3/3 | 3/3 | |
| Hidden ACs passed (AC2 AC3) | 6/6 | 6/6 | |
| Total tokens | 145,499 (120,365–146,451) | 152,104 (148,651–155,494) | 1.05× |
|   output tokens | 1,991 (1,891–2,010) | 1,997 (1,825–2,067) | 1.00× |
| Peak context (tokens) | 25,745 (25,251–26,143) | 26,952 (26,441–27,774) | 1.05× |
| Initial context (tokens) | 21,892 (21,892–21,892) | 22,727 (22,727–22,727) | 1.04× |
| Time (min) | 0.39 (0.34–0.47) | 0.57 (0.45–0.92) | 1.46× |
| Cost (USD) | $0.101 ($0.096–$0.103) | $0.107 ($0.102–$0.111) | 1.05× |
| Turns | 7 (6–7) | 7 (7–7) | 1.00× |
| Tool calls | 6 (5–6) | 6 (6–6) | 1.00× |
| Tool calls before 1st edit | 2 (2–3) | 2 (2–3) | 1.00× |
| Tokens before 1st edit | 68,517 (68,515–68,763) | 71,258 (70,073–71,959) | 1.04× |
| Re-correction loops (confirmed) | 0 (0–0) | 0 (0–0) |  |
|   + unclear runs (exit status masked) | 0 (0–0) | 0 (0–1) |  |
| Regressions | 0 (0–0) | 0 (0–0) |  |
| Pack used | n/a | used (read: scripts/check.sh; skills: none; check.sh runs: 0) / used (read: AGENTS.md, verification.md; skills: none; check.sh runs: 0) / used (read: scripts/check.sh; skills: none; check.sh runs: 0) | |
| Test/lint runs in order (✓ pass, ✗ fail, ? unclear) | ✓ / ✓ / ✓✓? | ?✓ / ✓✓ / ✓ | |
| Harness-file access (leak check) | none / none / none | none / none / none | |
| Traces | [rep0](baseline/traces/t10-fastify-remove-raw-header_rep0.json) [rep1](baseline/traces/t10-fastify-remove-raw-header_rep1.json) [rep2](baseline/traces/t10-fastify-remove-raw-header_rep2.json) | [rep0](v1/traces/t10-fastify-remove-raw-header_rep0.json) [rep1](v1/traces/t10-fastify-remove-raw-header_rep1.json) [rep2](v1/traces/t10-fastify-remove-raw-header_rep2.json) | |

## t8-fastify-content-type-quoted

| Metric | naive | razor | razor/naive |
|---|---|---|---|
| **Pass (all ACs)** | PASS, PASS, PASS | PASS, PASS, PASS | |
| Acceptance criteria | AC1✓ AC2✓ AC3✓ AC4✓ / AC1✓ AC2✓ AC3✓ AC4✓ / AC1✓ AC2✓ AC3✓ AC4✓ | AC1✓ AC2✓ AC3✓ AC4✓ / AC1✓ AC2✓ AC3✓ AC4✓ / AC1✓ AC2✓ AC3✓ AC4✓ | |
| Shown ACs passed (AC1 AC2) | 6/6 | 6/6 | |
| Hidden ACs passed (AC3 AC4) | 6/6 | 6/6 | |
| Total tokens | 133,717 (133,026–215,209) | 110,248 (105,346–177,628) | 0.82× |
|   output tokens | 3,772 (3,206–3,780) | 3,138 (3,017–3,723) | 0.83× |
| Peak context (tokens) | 29,844 (29,219–30,627) | 31,007 (29,096–33,721) | 1.04× |
| Initial context (tokens) | 21,923 (21,826–21,923) | 22,664 (21,057–22,761) | 1.03× |
| Time (min) | 0.61 (0.56–0.61) | 0.50 (0.45–0.87) | 0.82× |
| Cost (USD) | $0.133 ($0.131–$0.139) | $0.128 ($0.122–$0.153) | 0.96× |
| Turns | 5 (5–8) | 4 (4–7) | 0.80× |
| Tool calls | 4 (4–7) | 3 (3–6) | 0.75× |
| Tool calls before 1st edit | 2 (2–3) | 2 (2–4) | 1.00× |
| Tokens before 1st edit | 71,790 (70,159–92,847) | 76,259 (73,136–107,626) | 1.06× |
| Re-correction loops (confirmed) | 0 (0–1) | 0 (0–0) |  |
|   + unclear runs (exit status masked) | 0 (0–3) | 0 (0–0) |  |
| Regressions | 0 (0–0) | 0 (0–0) |  |
| Pack used | n/a | used (read: scripts/check.sh; skills: none; check.sh runs: 0) / **unused** (read: none; skills: none; check.sh runs: 0) / used (read: AGENTS.md, scripts/check.sh; skills: none; check.sh runs: 0) | |
| Test/lint runs in order (✓ pass, ✗ fail, ? unclear) | ✗✓ / ???✓ / ✓✓ | ✓ / ✓ / ✓ | |
| Harness-file access (leak check) | none / none / none | none / none / none | |
| Traces | [rep0](baseline/traces/t8-fastify-content-type-quoted_rep0.json) [rep1](baseline/traces/t8-fastify-content-type-quoted_rep1.json) [rep2](baseline/traces/t8-fastify-content-type-quoted_rep2.json) | [rep0](v1/traces/t8-fastify-content-type-quoted_rep0.json) [rep1](v1/traces/t8-fastify-content-type-quoted_rep1.json) [rep2](v1/traces/t8-fastify-content-type-quoted_rep2.json) | |

## t9-fastify-forwarded-host-trust

| Metric | naive | razor | razor/naive |
|---|---|---|---|
| **Pass (all ACs)** | FAIL, FAIL, PASS | FAIL, FAIL, FAIL | |
| Acceptance criteria | AC1✓ AC2✓ AC3✗ AC4✓ / AC1✓ AC2✓ AC3✗ AC4✓ / AC1✓ AC2✓ AC3✓ AC4✓ | AC1✓ AC2✓ AC3✗ AC4✓ / AC1✓ AC2✓ AC3✗ AC4✓ / AC1✓ AC2✓ AC3✗ AC4✓ | |
| Shown ACs passed (AC1 AC2) | 6/6 | 6/6 | |
| Hidden ACs passed (AC3 AC4) | 4/6 | 3/6 | |
| Total tokens | 158,715 (125,930–214,660) | 164,678 (162,035–193,641) | 1.04× |
|   output tokens | 2,993 (2,422–3,695) | 2,848 (2,818–3,345) | 0.95× |
| Peak context (tokens) | 30,836 (28,284–36,316) | 31,285 (30,532–32,148) | 1.01× |
| Initial context (tokens) | 20,331 (20,331–22,035) | 22,868 (22,868–22,868) | 1.12× |
| Time (min) | 0.59 (0.43–0.65) | 0.53 (0.49–0.57) | 0.90× |
| Cost (USD) | $0.132 ($0.113–$0.166) | $0.133 ($0.130–$0.144) | 1.00× |
| Turns | 6 (5–8) | 6 (6–8) | 1.00× |
| Tool calls | 5 (4–7) | 5 (5–7) | 1.00× |
| Tool calls before 1st edit | 3 (2–5) | 3 (2–3) | 1.00× |
| Tokens before 1st edit | 95,585 (68,406–140,102) | 99,417 (73,432–99,683) | 1.04× |
| Re-correction loops (confirmed) | 0 (0–0) | 0 (0–0) |  |
|   + unclear runs (exit status masked) | 0 (0–0) | 0 (0–0) |  |
| Regressions | 0 (0–0) | 0 (0–0) |  |
| Pack used | n/a | **unused** (read: none; skills: none; check.sh runs: 0) / **unused** (read: none; skills: none; check.sh runs: 0) / used (read: scripts/check.sh; skills: none; check.sh runs: 0) | |
| Test/lint runs in order (✓ pass, ✗ fail, ? unclear) | ✓ / ✓ / ✓ | ✓ / ✓ / ✓ | |
| Harness-file access (leak check) | none / none / none | none / none / none | |
| Traces | [rep0](baseline/traces/t9-fastify-forwarded-host-trust_rep0.json) [rep1](baseline/traces/t9-fastify-forwarded-host-trust_rep1.json) [rep2](baseline/traces/t9-fastify-forwarded-host-trust_rep2.json) | [rep0](v1/traces/t9-fastify-forwarded-host-trust_rep0.json) [rep1](v1/traces/t9-fastify-forwarded-host-trust_rep1.json) [rep2](v1/traces/t9-fastify-forwarded-host-trust_rep2.json) | |

