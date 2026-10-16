# Razor A/B eval — hard-sonnet

- Model: `claude-sonnet-5-5` · effort: `medium` · Claude Code 2.1.296 (Claude Code) · razor-cli bf9a7da
- Tasks: 2 · reps per arm: 3 · started 2026-10-13T06:28:09.171Z
- Failed attempts (not scored, see errors.jsonl): naive 1, razor 1
- Cells show the median over reps, with (min–max).

## Overview

| Task | naive pass | razor pass | naive hidden ACs | razor hidden ACs | razor/naive tokens | razor/naive peak ctx | razor/naive time | pack used |
|---|---|---|---|---|---|---|---|---|
| t6-fastify-false-schemas | 3/3 | 3/3 | – | – | 0.64× | 0.94× | 0.76× | 3/3 |
| t7-fastify-header-case | 3/3 | 3/3 | – | – | 1.40× | 1.08× | 1.41× | 3/3 |

Hidden ACs: acceptance criteria from the real fix's tests that the prompt does not state; summed over reps. Efficiency ratios need every run to pass the shown ACs.

Median razor/naive ratio over the 2 task(s) where both arms solved the stated task: tokens 1.02×, peak context 1.01×, time 1.08× (below 1× means Razor used less).

## t6-fastify-false-schemas

| Metric | naive | razor | razor/naive |
|---|---|---|---|
| **Pass (all ACs)** | PASS, PASS, PASS | PASS, PASS, PASS | |
| Acceptance criteria | AC1✓ AC2✓ AC3✓ AC4✓ AC5✓ AC6✓ AC7✓ / AC1✓ AC2✓ AC3✓ AC4✓ AC5✓ AC6✓ AC7✓ / AC1✓ AC2✓ AC3✓ AC4✓ AC5✓ AC6✓ AC7✓ | AC1✓ AC2✓ AC3✓ AC4✓ AC5✓ AC6✓ AC7✓ / AC1✓ AC2✓ AC3✓ AC4✓ AC5✓ AC6✓ AC7✓ / AC1✓ AC2✓ AC3✓ AC4✓ AC5✓ AC6✓ AC7✓ | |
| Total tokens | 344,178 (287,210–369,094) | 218,968 (185,203–257,675) | 0.64× |
|   output tokens | 6,554 (5,489–7,065) | 4,583 (4,552–6,060) | 0.70× |
| Peak context (tokens) | 38,481 (37,003–39,436) | 36,116 (35,906–37,912) | 0.94× |
| Initial context (tokens) | 21,955 (20,252–21,956) | 22,787 (21,084–22,788) | 1.04× |
| Time (min) | 1.20 (1.19–1.24) | 0.91 (0.88–1.10) | 0.76× |
| Cost (USD) | $0.218 ($0.194–$0.225) | $0.175 ($0.170–$0.200) | 0.80× |
| Turns | 11 (9–11) | 8 (7–9) | 0.73× |
| Tool calls | 10 (8–10) | 7 (6–8) | 0.70× |
| Tool calls before 1st edit | 3 (3–4) | 3 (2–3) | 1.00× |
| Tokens before 1st edit | 108,873 (106,991–110,797) | 104,986 (77,638–109,443) | 0.96× |
| Re-correction loops (confirmed) | 0 (0–1) | 1 (1–1) |  |
|   + unclear runs (exit status masked) | 3 (2–4) | 0 (0–0) |  |
| Regressions | 0 (0–0) | 0 (0–0) |  |
| Pack used | n/a | used (read: scripts/check.sh; skills: none; check.sh runs: 0) / used (read: AGENTS.md, scripts/check.sh; skills: none; check.sh runs: 0) / used (read: scripts/check.sh; skills: none; check.sh runs: 0) | |
| Test/lint runs in order (✓ pass, ✗ fail, ? unclear) | ??✗✓ / ????✓ / ???✓✓ | ✗✓ / ✗✓ / ✗✓✓ | |
| Harness-file access (leak check) | – / – / – | – / – / – | |
| Traces | [rep0](baseline/traces/t6-fastify-false-schemas_rep0.json) [rep1](baseline/traces/t6-fastify-false-schemas_rep1.json) [rep2](baseline/traces/t6-fastify-false-schemas_rep2.json) | [rep0](v1/traces/t6-fastify-false-schemas_rep0.json) [rep1](v1/traces/t6-fastify-false-schemas_rep1.json) [rep2](v1/traces/t6-fastify-false-schemas_rep2.json) | |

## t7-fastify-header-case

| Metric | naive | razor | razor/naive |
|---|---|---|---|
| **Pass (all ACs)** | PASS, PASS, PASS | PASS, PASS, PASS | |
| Acceptance criteria | AC1✓ AC2✓ AC3✓ AC4✓ AC5✓ AC6✓ AC7✓ AC8✓ / AC1✓ AC2✓ AC3✓ AC4✓ AC5✓ AC6✓ AC7✓ AC8✓ / AC1✓ AC2✓ AC3✓ AC4✓ AC5✓ AC6✓ AC7✓ AC8✓ | AC1✓ AC2✓ AC3✓ AC4✓ AC5✓ AC6✓ AC7✓ AC8✓ / AC1✓ AC2✓ AC3✓ AC4✓ AC5✓ AC6✓ AC7✓ AC8✓ / AC1✓ AC2✓ AC3✓ AC4✓ AC5✓ AC6✓ AC7✓ AC8✓ | |
| Total tokens | 382,402 (331,776–444,835) | 533,565 (490,106–552,385) | 1.40× |
|   output tokens | 11,688 (9,378–12,037) | 9,754 (9,226–10,997) | 0.83× |
| Peak context (tokens) | 40,236 (37,495–43,220) | 43,647 (42,107–46,677) | 1.08× |
| Initial context (tokens) | 22,094 (21,998–22,095) | 22,928 (22,832–22,929) | 1.04× |
| Time (min) | 1.86 (1.44–2.18) | 2.62 (2.18–4.00) | 1.41× |
| Cost (USD) | $0.272 ($0.250–$0.292) | $0.294 ($0.277–$0.299) | 1.08× |
| Turns | 12 (11–15) | 16 (14–17) | 1.33× |
| Tool calls | 11 (10–14) | 15 (13–16) | 1.36× |
| Tool calls before 1st edit | 4 (3–4) | 4 (4–4) | 1.00× |
| Tokens before 1st edit | 94,806 (93,841–99,319) | 105,748 (98,945–128,497) | 1.12× |
| Re-correction loops (confirmed) | 1 (0–2) | 1 (0–2) |  |
|   + unclear runs (exit status masked) | 3 (1–5) | 5 (4–5) |  |
| Regressions | 0 (0–0) | 0 (0–0) |  |
| Pack used | n/a | used (read: scripts/check.sh; skills: none; check.sh runs: 2) / used (read: scripts/check.sh; skills: none; check.sh runs: 0) / used (read: scripts/check.sh; skills: none; check.sh runs: 6) | |
| Test/lint runs in order (✓ pass, ✗ fail, ? unclear) | ?✗✓✓ / ????✗?✗✓ / ???? | ✓???✗✗??✓ / ???✗??✓ / ????✓✓ | |
| Harness-file access (leak check) | – / – / – | – / – / – | |
| Traces | [rep0](baseline/traces/t7-fastify-header-case_rep0.json) [rep1](baseline/traces/t7-fastify-header-case_rep1.json) [rep2](baseline/traces/t7-fastify-header-case_rep2.json) | [rep0](v1/traces/t7-fastify-header-case_rep0.json) [rep1](v1/traces/t7-fastify-header-case_rep1.json) [rep2](v1/traces/t7-fastify-header-case_rep2.json) | |

