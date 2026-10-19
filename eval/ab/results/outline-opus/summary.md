# Razor A/B eval — outline-opus

- Model: `claude-opus-5-5` · effort: `medium` · Claude Code 2.1.303 (Claude Code) · razor-cli ea85aab
- Tasks: 6 · reps per arm: 3 · started 2026-10-19T14:34:33.316Z
- Failed attempts (not scored, see errors.jsonl): naive 3, razor 3
- Cells show the median over reps, with (min–max).

## Overview

| Task | naive pass | razor pass | naive hidden ACs | razor hidden ACs | razor/naive tokens | razor/naive peak ctx | razor/naive time | pack used |
|---|---|---|---|---|---|---|---|---|
| o1-outline-deleted-by | 0/2 | 0/2 | 7/10 | 7/10 | 1.79× (not comparable) | 1.17× (not comparable) | 1.55× (not comparable) | 2/2 |
| o2-outline-tsvector-limit | 2/2 | 2/2 | 2/2 | 2/2 | 1.31× | 1.10× | 1.85× | 2/2 |
| o3-outline-findbypk-reject | 0/2 | 0/2 | 6/8 | 6/8 | 1.75× | 1.08× | 1.66× | 2/2 |
| o4-outline-group-duplicate-names | 2/2 | 2/2 | 2/2 | 2/2 | 0.77× | 0.90× | 1.02× | 2/2 |
| o5-outline-group-timestamp | 2/2 | 2/2 | 6/6 | 6/6 | 1.07× | 1.04× | 1.01× | 2/2 |
| o6-outline-import-cleanup | 1/2 | 1/2 | 1/2 | 1/2 | 1.48× | 1.07× | 1.40× | 2/2 |

Hidden ACs: acceptance criteria from the real fix's tests that the prompt does not state; summed over reps. Efficiency ratios need every run to pass the shown ACs.

Median razor/naive ratio over the 5 task(s) where both arms solved the stated task: tokens 1.31×, peak context 1.07×, time 1.40× (below 1× means Razor used less).

## o1-outline-deleted-by

| Metric | naive | razor | razor/naive |
|---|---|---|---|
| **Pass (all ACs)** | FAIL, FAIL | FAIL, FAIL | |
| Acceptance criteria | AC1✓ AC2✓ AC3✓ AC4✗ AC5✓ AC6✓ AC7✓ AC8✗ AC9✓ AC10✓ / AC1✓ AC2✓ AC3✓ AC4✗ AC5✓ AC6✓ AC7✓ AC8✗ AC9✗ AC10✓ | AC1✓ AC2✓ AC3✓ AC4✗ AC5✓ AC6✓ AC7✓ AC8✗ AC9✓ AC10✓ / AC1✓ AC2✓ AC3✓ AC4✗ AC5✓ AC6✓ AC7✓ AC8✗ AC9✗ AC10✓ | |
| Shown ACs passed (AC1 AC2 AC3 AC4 AC5) | 8/10 | 8/10 | |
| Hidden ACs passed (AC6 AC7 AC8 AC9 AC10) | 7/10 | 7/10 | |
| Total tokens | 877,791 (864,376–891,205) | 1,568,776 (1,264,439–1,873,113) | 1.79× |
|   output tokens | 11,354 (11,289–11,419) | 12,842 (10,055–15,628) | 1.13× |
| Peak context (tokens) | 57,736 (57,385–58,087) | 67,277 (58,487–76,067) | 1.17× |
| Initial context (tokens) | 24,388 (23,536–25,240) | 22,720 (21,868–23,572) | 0.93× |
| Time (min) | 5.11 (4.60–5.62) | 7.92 (7.54–8.30) | 1.55× |
| Cost (USD) | $0.783 ($0.781–$0.784) | $1.025 ($0.840–$1.209) | 1.31× |
| Turns | 21 (20–21) | 33 (29–37) | 1.61× |
| Tool calls | 20 (19–20) | 32 (28–36) | 1.64× |
| Tool calls before 1st edit | 10 (8–11) | 15 (13–16) | 1.53× |
| Tokens before 1st edit | 338,439 (260,722–416,155) | 525,248 (451,693–598,803) | 1.55× |
| Re-correction loops (confirmed) | 0 (0–0) | 1 (0–1) |  |
|   + unclear runs (exit status masked) | 2 (1–2) | 3 (2–4) |  |
| Regressions | 0 (0–0) | 0 (0–0) |  |
| Pack used | n/a | used (read: AGENTS.md, verification.md, steering.md, .claude/skills/run-tests/SKILL.md, .claude/skills/db-migrations/SKILL.md, scripts/check.sh; skills invoked: none; skills used: run-tests, db-migrations; check.sh runs: 0) / used (read: AGENTS.md, verification.md, steering.md, .claude/skills/run-tests/SKILL.md, .claude/skills/db-migrations/SKILL.md, scripts/check.sh; skills invoked: none; skills used: run-tests, db-migrations; check.sh runs: 1) | |
| Test/lint runs in order (✓ pass, ✗ fail, ? unclear) | ?? / ??? | ??? / ?✗???? | |
| Harness-file access (leak check) | none / none | none / none | |
| Traces | [rep0](baseline/traces/o1-outline-deleted-by_rep0.json) [rep1](baseline/traces/o1-outline-deleted-by_rep1.json) | [rep0](v1/traces/o1-outline-deleted-by_rep0.json) [rep1](v1/traces/o1-outline-deleted-by_rep1.json) | |

## o2-outline-tsvector-limit

| Metric | naive | razor | razor/naive |
|---|---|---|---|
| **Pass (all ACs)** | PASS, PASS | PASS, PASS | |
| Acceptance criteria | AC1✓ AC2✓ / AC1✓ AC2✓ | AC1✓ AC2✓ / AC1✓ AC2✓ | |
| Shown ACs passed (AC1) | 2/2 | 2/2 | |
| Hidden ACs passed (AC2) | 2/2 | 2/2 | |
| Total tokens | 735,648 (686,819–784,477) | 961,124 (935,795–986,452) | 1.31× |
|   output tokens | 9,832 (9,777–9,887) | 11,389 (10,679–12,099) | 1.16× |
| Peak context (tokens) | 42,055 (41,034–43,076) | 46,468 (45,083–47,852) | 1.10× |
| Initial context (tokens) | 23,408 (23,408–23,408) | 21,681 (21,681–21,681) | 0.93× |
| Time (min) | 3.44 (3.33–3.54) | 6.37 (5.63–7.11) | 1.85× |
| Cost (USD) | $0.602 ($0.583–$0.621) | $0.712 ($0.682–$0.742) | 1.18× |
| Turns | 23 (22–23) | 28 (27–28) | 1.22× |
| Tool calls | 22 (21–22) | 27 (26–27) | 1.23× |
| Tool calls before 1st edit | 8 (7–8) | 9 (7–11) | 1.20× |
| Tokens before 1st edit | 240,757 (226,796–254,717) | 268,990 (222,663–315,316) | 1.12× |
| Re-correction loops (confirmed) | 0 (0–0) | 1 (0–1) |  |
|   + unclear runs (exit status masked) | 4 (2–5) | 5 (5–5) |  |
| Regressions | 0 (0–0) | 0 (0–0) |  |
| Pack used | n/a | used (read: verification.md, .claude/skills/run-tests/SKILL.md, .claude/skills/db-migrations/SKILL.md, scripts/check.sh; skills invoked: none; skills used: run-tests, db-migrations; check.sh runs: 0) / used (read: verification.md, .claude/skills/run-tests/SKILL.md, .claude/skills/db-migrations/SKILL.md, scripts/check.sh; skills invoked: none; skills used: run-tests, db-migrations; check.sh runs: 0) | |
| Test/lint runs in order (✓ pass, ✗ fail, ? unclear) | ?????? / ??? | ?????✓✓ / ?✗????✓✓ | |
| Harness-file access (leak check) | none / none | none / none | |
| Traces | [rep0](baseline/traces/o2-outline-tsvector-limit_rep0.json) [rep1](baseline/traces/o2-outline-tsvector-limit_rep1.json) | [rep0](v1/traces/o2-outline-tsvector-limit_rep0.json) [rep1](v1/traces/o2-outline-tsvector-limit_rep1.json) | |

## o3-outline-findbypk-reject

| Metric | naive | razor | razor/naive |
|---|---|---|---|
| **Pass (all ACs)** | FAIL, FAIL | FAIL, FAIL | |
| Acceptance criteria | AC1✓ AC2✓ AC3✓ AC4✓ AC5✓ AC6✓ AC7✓ AC8✗ AC9✓ / AC1✓ AC2✓ AC3✓ AC4✓ AC5✓ AC6✓ AC7✓ AC8✗ AC9✓ | AC1✓ AC2✓ AC3✓ AC4✓ AC5✓ AC6✓ AC7✓ AC8✗ AC9✓ / AC1✓ AC2✓ AC3✓ AC4✓ AC5✓ AC6✓ AC7✓ AC8✗ AC9✓ | |
| Shown ACs passed (AC1 AC2 AC3 AC4 AC5) | 10/10 | 10/10 | |
| Hidden ACs passed (AC6 AC7 AC8 AC9) | 6/8 | 6/8 | |
| Total tokens | 502,574 (450,119–555,029) | 880,207 (880,116–880,298) | 1.75× |
|   output tokens | 7,457 (7,076–7,838) | 9,430 (9,115–9,744) | 1.26× |
| Peak context (tokens) | 47,889 (46,391–49,386) | 51,946 (47,697–56,194) | 1.08× |
| Initial context (tokens) | 25,162 (25,161–25,162) | 23,433 (23,433–23,433) | 0.93× |
| Time (min) | 2.85 (1.94–3.77) | 4.74 (4.06–5.42) | 1.66× |
| Cost (USD) | $0.554 ($0.524–$0.583) | $0.700 ($0.661–$0.739) | 1.26× |
| Turns | 15 (13–16) | 22 (21–23) | 1.52× |
| Tool calls | 14 (12–15) | 21 (20–22) | 1.56× |
| Tool calls before 1st edit | 5 (4–6) | 4 (3–4) | 0.70× |
| Tokens before 1st edit | 167,368 (149,029–185,707) | 121,871 (111,169–132,573) | 0.73× |
| Re-correction loops (confirmed) | 0 (0–0) | 1 (1–1) |  |
|   + unclear runs (exit status masked) | 2 (1–2) | 3 (0–5) |  |
| Regressions | 0 (0–0) | 0 (0–0) |  |
| Pack used | n/a | used (read: verification.md, .claude/skills/run-tests/SKILL.md, scripts/check.sh; skills invoked: none; skills used: run-tests; check.sh runs: 0) / used (read: AGENTS.md, verification.md, .claude/skills/run-tests/SKILL.md, scripts/check.sh; skills invoked: none; skills used: run-tests; check.sh runs: 0) | |
| Test/lint runs in order (✓ pass, ✗ fail, ? unclear) | ?? / ??? | ?✗??✓??✓ / ✗✓ | |
| Harness-file access (leak check) | none / none | none / none | |
| Traces | [rep0](baseline/traces/o3-outline-findbypk-reject_rep0.json) [rep1](baseline/traces/o3-outline-findbypk-reject_rep1.json) | [rep0](v1/traces/o3-outline-findbypk-reject_rep0.json) [rep1](v1/traces/o3-outline-findbypk-reject_rep1.json) | |

## o4-outline-group-duplicate-names

| Metric | naive | razor | razor/naive |
|---|---|---|---|
| **Pass (all ACs)** | PASS, PASS | PASS, PASS | |
| Acceptance criteria | AC1✓ AC2✓ AC3✓ AC4✓ / AC1✓ AC2✓ AC3✓ AC4✓ | AC1✓ AC2✓ AC3✓ AC4✓ / AC1✓ AC2✓ AC3✓ AC4✓ | |
| Shown ACs passed (AC1 AC2 AC3) | 6/6 | 6/6 | |
| Hidden ACs passed (AC4) | 2/2 | 2/2 | |
| Total tokens | 584,520 (451,348–717,692) | 451,630 (451,403–451,857) | 0.77× |
|   output tokens | 8,802 (7,363–10,240) | 7,306 (7,080–7,532) | 0.83× |
| Peak context (tokens) | 47,552 (45,198–49,906) | 42,893 (42,588–43,197) | 0.90× |
| Initial context (tokens) | 23,459 (23,459–23,459) | 22,581 (21,729–23,433) | 0.96× |
| Time (min) | 2.96 (2.57–3.36) | 3.04 (2.94–3.13) | 1.02× |
| Cost (USD) | $0.594 ($0.520–$0.667) | $0.501 ($0.499–$0.503) | 0.84× |
| Turns | 16 (13–18) | 14 (14–14) | 0.90× |
| Tool calls | 15 (12–17) | 13 (13–13) | 0.90× |
| Tool calls before 1st edit | 6 (4–8) | 6 (5–7) | 1.00× |
| Tokens before 1st edit | 205,407 (111,803–299,010) | 166,906 (132,368–201,443) | 0.81× |
| Re-correction loops (confirmed) | 0 (0–0) | 1 (0–1) |  |
|   + unclear runs (exit status masked) | 2 (2–2) | 2 (1–3) |  |
| Regressions | 0 (0–0) | 0 (0–0) |  |
| Pack used | n/a | used (read: verification.md, .claude/skills/run-tests/SKILL.md, scripts/check.sh; skills invoked: none; skills used: run-tests; check.sh runs: 0) / used (read: verification.md, .claude/skills/run-tests/SKILL.md, scripts/check.sh; skills invoked: none; skills used: run-tests; check.sh runs: 0) | |
| Test/lint runs in order (✓ pass, ✗ fail, ? unclear) | ??? / ??? | ?✗??? / ?✗ | |
| Harness-file access (leak check) | none / none | none / none | |
| Traces | [rep0](baseline/traces/o4-outline-group-duplicate-names_rep0.json) [rep1](baseline/traces/o4-outline-group-duplicate-names_rep1.json) | [rep0](v1/traces/o4-outline-group-duplicate-names_rep0.json) [rep1](v1/traces/o4-outline-group-duplicate-names_rep1.json) | |

## o5-outline-group-timestamp

| Metric | naive | razor | razor/naive |
|---|---|---|---|
| **Pass (all ACs)** | PASS, PASS | PASS, PASS | |
| Acceptance criteria | AC1✓ AC2✓ AC3✓ AC4✓ AC5✓ AC6✓ / AC1✓ AC2✓ AC3✓ AC4✓ AC5✓ AC6✓ | AC1✓ AC2✓ AC3✓ AC4✓ AC5✓ AC6✓ / AC1✓ AC2✓ AC3✓ AC4✓ AC5✓ AC6✓ | |
| Shown ACs passed (AC1 AC2 AC3) | 6/6 | 6/6 | |
| Hidden ACs passed (AC4 AC5 AC6) | 6/6 | 6/6 | |
| Total tokens | 1,540,507 (1,131,385–1,949,628) | 1,647,515 (1,182,738–2,112,291) | 1.07× |
|   output tokens | 16,147 (14,956–17,337) | 16,872 (14,741–19,002) | 1.04× |
| Peak context (tokens) | 63,100 (57,693–68,507) | 65,668 (60,036–71,299) | 1.04× |
| Initial context (tokens) | 25,073 (25,073–25,073) | 22,491 (21,639–23,343) | 0.90× |
| Time (min) | 6.47 (4.43–8.51) | 6.54 (5.22–7.85) | 1.01× |
| Cost (USD) | $1.052 ($0.904–$1.200) | $1.108 ($0.929–$1.287) | 1.05× |
| Turns | 33 (27–39) | 36 (28–43) | 1.08× |
| Tool calls | 32 (26–38) | 35 (27–42) | 1.08× |
| Tool calls before 1st edit | 7 (6–7) | 6 (5–7) | 0.92× |
| Tokens before 1st edit | 194,621 (180,951–208,291) | 172,226 (143,742–200,710) | 0.88× |
| Re-correction loops (confirmed) | 0 (0–0) | 1 (1–1) |  |
|   + unclear runs (exit status masked) | 9 (5–13) | 8 (6–9) |  |
| Regressions | 0 (0–0) | 0 (0–0) |  |
| Pack used | n/a | used (read: verification.md, steering.md, .claude/skills/run-tests/SKILL.md, scripts/check.sh; skills invoked: none; skills used: run-tests; check.sh runs: 0) / used (read: verification.md, steering.md, .claude/skills/run-tests/SKILL.md, scripts/check.sh; skills invoked: none; skills used: run-tests; check.sh runs: 0) | |
| Test/lint runs in order (✓ pass, ✗ fail, ? unclear) | ?????? / ?????????????✓ | ?????✗????? / ???✗???✓ | |
| Harness-file access (leak check) | none / none | none / none | |
| Traces | [rep0](baseline/traces/o5-outline-group-timestamp_rep0.json) [rep1](baseline/traces/o5-outline-group-timestamp_rep1.json) | [rep0](v1/traces/o5-outline-group-timestamp_rep0.json) [rep1](v1/traces/o5-outline-group-timestamp_rep1.json) | |

## o6-outline-import-cleanup

| Metric | naive | razor | razor/naive |
|---|---|---|---|
| **Pass (all ACs)** | PASS, FAIL | PASS, FAIL | |
| Acceptance criteria | AC1✓ AC2✓ / AC1✓ AC2✗ | AC1✓ AC2✓ / AC1✓ AC2✗ | |
| Shown ACs passed (AC1) | 2/2 | 2/2 | |
| Hidden ACs passed (AC2) | 1/2 | 1/2 | |
| Total tokens | 670,026 (667,231–672,820) | 988,526 (735,188–1,241,863) | 1.48× |
|   output tokens | 7,767 (7,308–8,226) | 10,412 (8,476–12,347) | 1.34× |
| Peak context (tokens) | 58,784 (57,409–60,158) | 62,698 (57,702–67,694) | 1.07× |
| Initial context (tokens) | 24,267 (23,415–25,119) | 23,448 (23,448–23,448) | 0.97× |
| Time (min) | 3.06 (2.45–3.66) | 4.27 (3.96–4.58) | 1.40× |
| Cost (USD) | $0.678 ($0.676–$0.680) | $0.825 ($0.697–$0.953) | 1.22× |
| Turns | 16 (15–16) | 24 (17–31) | 1.55× |
| Tool calls | 15 (14–15) | 23 (16–30) | 1.59× |
| Tool calls before 1st edit | 8 (7–9) | 10 (8–12) | 1.25× |
| Tokens before 1st edit | 302,828 (269,295–336,361) | 373,405 (291,276–455,533) | 1.23× |
| Re-correction loops (confirmed) | 0 (0–0) | 0 (0–0) |  |
|   + unclear runs (exit status masked) | 2 (1–2) | 4 (2–5) |  |
| Regressions | 0 (0–0) | 0 (0–0) |  |
| Pack used | n/a | used (read: AGENTS.md, verification.md, .claude/skills/run-tests/SKILL.md, scripts/check.sh; skills invoked: none; skills used: run-tests; check.sh runs: 0) / used (read: AGENTS.md, verification.md, .claude/skills/run-tests/SKILL.md, scripts/check.sh; skills invoked: none; skills used: run-tests; check.sh runs: 0) | |
| Test/lint runs in order (✓ pass, ✗ fail, ? unclear) | ??? / ?? | ?????? / ??? | |
| Harness-file access (leak check) | none / none | none / none | |
| Traces | [rep0](baseline/traces/o6-outline-import-cleanup_rep0.json) [rep1](baseline/traces/o6-outline-import-cleanup_rep1.json) | [rep0](v1/traces/o6-outline-import-cleanup_rep0.json) [rep1](v1/traces/o6-outline-import-cleanup_rep1.json) | |

