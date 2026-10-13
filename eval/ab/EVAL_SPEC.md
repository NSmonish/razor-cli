# Razor A/B eval — spec (draft for sign-off)

**Question:** does giving Claude Code a Razor context pack make it cheaper or
faster at real coding tasks *without* making it worse at them?

Each task runs twice, in parallel, on two identical disposable copies of the repo:

| Arm | What the agent gets |
|---|---|
| `razor` | repo + `razor scaffold --target claude --offline` output (`AGENTS.md` at root, skills in `.claude/skills/`, docs, `scripts/check.sh`) |
| `naive` | repo only |

Everything else is identical: same prompt, model, flags, Claude Code version,
and the user's normal Claude Code setup (shared by both arms, so it cancels out
of the comparison but is included in absolute numbers).

---

## 1. Task criteria

A task qualifies when **all** of these hold:

1. **Human-written acceptance tests exist** for the behavior. They're hidden
   from the agent and restored only for grading.
2. **Fails before, passes after:** with the behavior broken, the hidden tests
   fail (null check). With the original code, they pass (oracle check). Both
   are verified by the harness before any agent runs.
3. **Symptom, not solution:** the prompt reads like a bug report or feature
   request a user would write. It names no file, function, or test, and gives
   no fix.
4. **Small and fast:** targeted tests run in under ~2 min on a warm DB.
5. **Self-contained:** solvable from the local repo alone.

> **Source deviation (agreed):** nodejs-testing-best-practices has no
> post–mid-2026 fixed issues (last code PR: #171, Feb 2025). So tasks are made
> by *re-breaking already-tested behavior*: remove the code, hide its tests,
> describe the symptom. Known risk: the repo is public, so the model may
> partially recall the original code. Both arms share this risk equally.
> The harness is generic, and a task can equally be a real issue
> (`base_commit` + `hidden_test_patch`) when we move to active repos.

## 2. Leakage guards (both arms)

- **Fresh git history:** the workspace is the base tree in a newly `git init`-ed
  repo with one commit. The original code and the hidden tests aren't in any
  object, branch, or reflog.
- **Hidden tests are physically absent** from the workspace during the run, not
  just "please don't read".
- **Web tools disabled:** `--disallowedTools WebSearch WebFetch`.
- **Prompted scope:** each prompt ends with the same instruction:
  *"Work within this local repository and the context you have been given. Do
  not look up this project or its history online."* Network itself is not
  blocked, so `npm install` still works.

## 3. Grading

**Primary (pass/fail, programmatic, end state):** after the agent exits, the
hidden tests are put back into the workspace and run. A task **passes only if
every acceptance criterion (AC) listed for it in §7 passes**. Each AC is checked
by one of two kinds of test:

- **[orig]**: the repo's own human-written test, removed from the workspace
  before the run.
- **[supp]**: a small supplementary test we wrote, which lives in
  `tests/hidden/` and is never in the workspace. Used only where the prompt
  states a requirement that no original test checks. Each one is listed
  verbatim in the task folder for review.

Each AC is also recorded separately (`grade.ac = {AC1: true, ...}`), so a
partial solution is visible even though the task as a whole fails.

Rule for prompts: **every requirement in a prompt is checked by at least one
AC, and every AC traces back to a sentence in the prompt.** Anything not
stated in the prompt is out of scope and not graded.

**Secondary, also programmatic:**

- `regressions`: number of tests in the full suite that passed on the oracle
  but fail now.
- `no_op`: the agent claimed success but the workspace diff is empty (excluding
  Razor pack files).

No LLM judge in v1.

## 4. Metrics recorded per run

All metrics come from Claude Code's own `stream-json` output, never estimates.

| Metric | Definition |
|---|---|
| **Token consumption** | Sum over every model in `result.modelUsage` (so subagents count) of input + output + cache-read + cache-write tokens. The four parts are also stored separately. |
| **Context used** | Peak main-thread context: max over the agent's own API calls (deduplicated by message id, `parent_tool_use_id == null`) of input + cache-read + cache-write. The final value is stored too. |
| **Time consumed** | `result.duration_ms` (agent wall time) and `duration_api_ms`, in minutes. Harness wall clock is stored separately. |
| Cost (USD) | `result.total_cost_usd` |
| Turns and tool calls | `num_turns`, plus tool calls counted by tool name (Read / Grep / Glob / Bash / Edit / Write / Skill / Task…) |
| Exploration before first edit | Tokens (cumulative usage at the call before the first Edit/Write) and tool calls made before the agent's first file edit |
| Re-correction loops | Number of Bash calls that ran a test or lint command (`jest`, `npm test`, `npm run lint`, `eslint`, `check.sh`) and exited non-zero, before the agent's last such run |
| Pack used (razor arm) | Whether `AGENTS.md` was in loaded context or read, whether any Razor skill was invoked, and whether `scripts/check.sh` was run. If none of these happened, the run is flagged: Razor was present but unused. |
| Status | `ok` / `timeout` / `error` (harness or API failure, written to `errors.jsonl` and never scored as a fail) / `max_turns` |

**Headline:** per task, razor vs naive side by side as absolute numbers first,
then the ratio. Tokens/time are only compared head-to-head when *both* arms
passed; otherwise the row is marked "not comparable".

## 5. Harness requirements

- Arms launch at the same moment, each in its own `/tmp` workspace with a unique
  path, so auto-memory can't leak between arms or runs.
- **Separate Postgres per arm.** The repo's teardown randomly wipes the orders
  table (1 run in 10), so a shared DB could fail one arm's tests because of the
  other arm. Each arm gets its own compose project and port, applied
  identically to both copies.
- Hard wall-clock ceiling per run (default 20 min) → `status: timeout`.
- Same `--model`, `--permission-mode bypassPermissions` (throwaway copies), and
  `--no-session-persistence` for both arms.
- Writes `results.jsonl` (one row per task × arm × rep), the raw
  `traces/<task>_<arm>_rep<k>.jsonl`, and `errors.jsonl`. Resume skips already
  completed (task, arm, rep) keys.
- Generic: tasks live in `eval/ab/tasks/<id>/` (`task.json` + `break.patch` +
  hidden test files), and `--repo`, `--tasks`, and `--reps` are flags, so more
  repos, tasks, or reps need no code change.

## 6. Size and what this run can and can't tell us

**v1 = 3 tasks × 1 run per arm** (6 agent sessions). This is a harness
validation and a first look, **not** evidence. Agent runs on the same task
commonly vary noticeably in tokens and time, and one rep can't separate a Razor
effect from that noise. Results will be reported as per-task anecdotes with
that caveat. Scaling up is just `--reps 3` or more tasks.

---


## 7. Tasks (approved; acceptance criteria tightened)

All three are on `example-application/` (Express + Sequelize/Postgres, Jest).
"Hidden" means the test is not in the workspace while the agent runs.

**Applies to every task:**
- **Pass** = every AC listed for the task passes.
- `regressions` (secondary, reported but not part of pass/fail) = number of
  tests in the visible suite that pass on the oracle and fail after the agent's
  changes.
- Oracle check: the original code passes every AC. Null check: the broken code
  fails every AC that the task is about. The harness verifies both before any
  agent runs, and a task that fails either check is not run.

| id | Type | Break (what is removed from the workspace) | ACs |
|---|---|---|---|
| `t1-premium-discount` | bug fix (business logic) | the `isPremiumUser` discount block in `business-logic/order-service.js` `addOrder` | 3 |
| `t2-delete-order` | feature (wire an endpoint) | the `router.delete('/:id', …)` route in `entry-points/api.ts` only. `orderService.deleteOrder` and the repository method stay, because the message-queue consumer uses them | 2 |
| `t3-user-service-timeout` | resilience (cross-cutting) | in `getUserFromUsersService`: the `timeout` option and the `ECONNABORTED` → `AppError(503)` mapping (`validateStatus` stays) | 4 |

---

### t1-premium-discount

**Prompt**

````text
Premium customers are being charged full price. Our pricing policy is that an
order placed by a premium user (isPremiumUser: true) gets a 10% discount on its
totalPrice, rounded up to the nearest whole number. Orders from non-premium
users are charged their totalPrice unchanged. The price stored for the order,
and returned when the order is fetched with GET /order/:id, must be the final
price. Please fix this.

Work within this local repository and the context you have been given. Do not
look up this project or its history online.
````

**Acceptance criteria** (each: POST `/order` with a valid authenticated order,
then GET `/order/:id`, then check `totalPrice`)

| AC | Requirement (prompt sentence) | Check | By |
|---|---|---|---|
| AC1 | premium users get 10% off | premium, `totalPrice: 100` → `90` | [orig] `responseCheck` › "When ordered by a premium user, Then 10% discount is applied" |
| AC2 | rounded up to whole number | premium, `totalPrice: 59` → `54` (59 × 0.9 = 53.1) | [supp] |
| AC3 | non-premium unchanged | `isPremiumUser: false`, `totalPrice: 100` → `100` | [supp] |

**Out of scope (not graded):** `discountCode` / `discountAmount` fields, invalid
or negative prices, and the POST response body (only the stored/fetched value
is graded).

---

### t2-delete-order

**Prompt**

````text
We need to be able to delete orders over the API. Add support for
DELETE /order/:id: it should delete that order and respond with HTTP 204 and
an empty body. After deletion, fetching that order with GET /order/:id must
return 404, and other orders must be unaffected.

Work within this local repository and the context you have been given. Do not
look up this project or its history online.
````

**Acceptance criteria**

| AC | Requirement (prompt sentence) | Check | By |
|---|---|---|---|
| AC1 | deleted order gone; others unaffected | create A and B; DELETE A; GET A → `404`, GET B → `200` | [orig] `stateCheck` › "When deleting an existing order, Then it should NOT be retrievable" |
| AC2 | responds 204, empty body | DELETE an existing order → status `204`, body empty | [supp] |

**Out of scope (not graded):** deleting an id that doesn't exist, authorization
rules beyond the existing auth middleware, and soft-delete vs hard-delete.

---

### t3-user-service-timeout

**Prompt**

````text
When an order is created (POST /order), the API verifies the user by calling
the users service, and it currently waits for as long as that service takes;
if the users service hangs, order requests hang with it. Add a timeout to
that call: 2000 ms by default, overridable through the HTTP_TIMEOUT
environment variable (in milliseconds). The variable is read on each request,
so changing it takes effect without a restart. When the call times out, the
API must respond with HTTP 503, because the user can't be verified.

Work within this local repository and the context you have been given. Do not
look up this project or its history online.
````

**Acceptance criteria** (users service mocked with `nock` and an artificial
response delay)

| AC | Requirement (prompt sentence) | Check | By |
|---|---|---|---|
| AC1 | timeout → 503 | `HTTP_TIMEOUT=2000`, users service delays 3000 ms → `503` | [orig] `callingOtherServices` › "When users service doesn't reply and times out, then return 503" |
| AC2 | overridable via env, read per request | `HTTP_TIMEOUT=500` set after the server has started, delay 1000 ms → `503` | [supp] |
| AC3 | default isn't too short | `HTTP_TIMEOUT` unset, delay 1000 ms → `200`, order created | [supp] |
| AC4 | default isn't too long | `HTTP_TIMEOUT` unset, delay 2500 ms → `503` | [supp] |

AC3 and AC4 together pin the default between 1 s and 2.5 s, i.e. they accept
the specified 2000 ms without timing-flaky margins.

**Out of scope (not graded):** retries, any timeout on other outbound calls,
the response body of the 503, and logging.

---

## 8. Implementation notes (decided while building)

- **Harness:** `node eval/ab/run.js validate|run|report`. It runs on its own,
  with no coordinating agent. See `README.md`.
- **Pinned:** repo commit `2117875`. Each run records the Claude Code version
  and razor-cli commit, and refuses to resume under a different model, effort,
  or Claude Code version.
- **Agent flags (both arms):** `claude -p <prompt> --output-format stream-json
  --verbose --model claude-opus-5-5 --effort medium --permission-mode
  bypassPermissions --no-session-persistence --disallowedTools
  WebSearch,WebFetch --max-budget-usd 10`, with a 20 min wall-clock ceiling.
  Effort is pinned to `medium`, which matches the interactive default here, so
  results don't depend on inherited environment. The coordinating session's
  `CLAUDE*` env vars are stripped from the agent.
- **Null check and guard ACs:** t1 AC3 (non-premium price unchanged) and t3
  AC3 (1 s reply succeeds) already pass on the broken code. They exist to catch
  over-broad fixes, so validation expects `pass` for them on the null run and
  `fail` for every other AC.
- **Masked exit codes:** agents often run `npm test; echo "EXIT: $?"`, which
  makes the command exit 0. For re-correction loops, a test run also counts as
  failed when its output shows a non-zero printed exit code or a runner failure
  summary (jest `Tests: N failed`, mocha `N failing`, `npm ERR!`, eslint
  problems, pytest).
- **Known risk: docs show test examples.** The repo's `README.md` and
  `mocking.md` include the premium-discount test (expected value 90), and
  `README.md` has a similar "users service doesn't reply within 2 seconds →
  503" test. They contain test code, not the implementation. Both arms see
  them, and they're ordinary project docs, so they're left in.
- **Pass/fail ignores todo/skipped tests:** the oracle suite has 12 `todo` /
  skipped / `test.only`-excluded tests. `regressions` only counts tests that
  passed on the oracle.

---

## 9. Longer-horizon tasks (t4, t5) and the Razor prompt hint

**New-feature tasks.** t1–t3 turned out too easy for a context pack to matter
(Sonnet's naive arm solved t1 in 3 tool calls). t4 and t5 ask for features that
span several layers. There is no original code to remove, so each ships a
reference `solution.patch`: the oracle check is base + solution (every AC must
pass), and the null check is the untouched base (every AC except the guards
must fail). All their ACs are [supp] tests or [cmd] checks.

**Grading change (all tasks):** before tests run, the workspace's DB is
recreated from the workspace's own migrations (hook `pregrade`), the way CI
would. A migration the agent wrote but never ran is still applied, and one that
can't run from scratch fails.

| id | Layers touched | ACs |
|---|---|---|
| `t4-order-status-lifecycle` | migration, model, service (transition rules), route, queue event | 9 |
| `t5-order-listing` | route, service (query validation), repository (filter + paging), OpenAPI doc | 5 |

### t4-order-status-lifecycle

The prompt is in `tasks/t4-order-status-lifecycle/prompt.md`. Each AC traces to
a sentence in it:

| AC | Check | By |
|---|---|---|
| AC1 | POST with `status: shipped` → GET shows `processing` | [supp] |
| AC2 | PATCH processing → shipped: 200, body has `status: shipped`, GET agrees | [supp] |
| AC3 | shipped → delivered → returned, and processing → cancelled, all 200 | [supp] |
| AC4 | processing → delivered and cancelled → processing: 409, status unchanged | [supp] |
| AC5 | unknown or missing status value: 400, status unchanged | [supp] |
| AC6 | unknown order id: 404 (guard, since the untouched app also 404s) | [supp] |
| AC7 | exactly one publish to `order.events` / `order.events.status-changed` with `{orderId, from, to}` | [supp] |
| AC8 | `SELECT status FROM "Orders"` shows the new status (raw SQL) | [supp] |
| AC9 | existing migration file unchanged (guard) | [cmd] `git diff --quiet` |

Out of scope: auth rules beyond the existing middleware, concurrency, and
history of past statuses.

### t5-order-listing

| AC | Check | By |
|---|---|---|
| AC1 | `?userId=U` returns exactly U's 3 orders, ids ascending, `total: 3` | [supp] |
| AC2 | `?userId=U&limit=2&offset=1` returns orders 2–3, `total: 3` | [supp] |
| AC3 | 22 orders with no paging params: 20 items, starting at the first, `total: 22` | [supp] |
| AC4 | `userId=abc`, `limit=0`, `limit=101`, `limit=1.5`, `offset=-1`, `offset=x` → 400 each | [supp] |
| AC5 | `openapi.json` has `paths['/order'].get` with query params userId, limit, offset | [supp] |

Out of scope: sorting options, filters other than userId, and the exact error
body.

### Razor prompt hint (design change)

From run `sonnet-hint` on, the **razor arm's prompt = task prompt + the hint in
`razor-hint.md`** (recorded in `meta.razor_hint`; `--no-razor-hint` turns it
off). The arms are therefore no longer identical apart from the pack: a
difference now measures *pack + being told to use it*. The runs `pilot` and
`sonnet` had no hint (`razor_hint: null`), so for t1–t3 the Sonnet runs with
and without the hint can be compared directly. The hint deliberately doesn't
point at `scripts/check.sh` specifically, because that script currently fails
on this repo's ESLint 9 setup.

## 10. Real-fix tasks with shown and hidden acceptance criteria (t6–t10)

From t6 on, tasks are real fastify fixes (fastify is about 79k lines), pinned
to the fix's parent commit. The fix's own tests grade them. Both arms get the
same verification instruction (`verify-instruction.md`): add tests, run them
with the existing tests for the touched code, make sure they pass.

t8–t10 make the tasks more open-ended. Each acceptance criterion is either:

- **shown**: stated in the issue-style prompt, or
- **hidden**: not stated, but checked by the real fix's tests.

A hidden criterion must be something a careful engineer would handle without
being told, e.g.:

- an edge case of the spec the prompt cites, such as RFC 9110 quoted-pairs;
- a deployment the prompt says must keep working;
- a failure mode of the obvious fix.

It must never be an arbitrary name or message. How the guards work:

- **Prompt leak check.** `validate` fails if a hidden test title or a
  `leak_strings` entry appears in the prompt.
- **Dependency leak check.** `validate` also fails if `node_modules` contains
  another copy of the project.
- **Decoys.** Each task carries at least one decoy: a plausible fix of only
  the stated issue. It must pass the shown criteria and fail at least one
  hidden one.
- **Run-time leak scan.** At run time, `metrics.leaks` records tool calls that
  reach the harness's files. These include `/tmp/razor-ab/cache`, which holds
  full upstream clones whose history contains the fixes.
- **Scoring.**
  - `pass` still means every criterion.
  - Rows carry `ac_split` (shown / hidden).
  - The efficiency comparison needs every run to pass the shown criteria.

| Task | Real fix | Shown | Hidden | Decoy result |
|---|---|---|---|---|
| t8-fastify-content-type-quoted | 29bdcbb9 (#6865) quoted-string Content-Type params | AC1 `;` inside quotes; AC2 no fake params from quoted text | AC3 quoted-pair unescape; AC4 reply.send still appends charset | regex `"[^"]*"` without escapes: AC1 ✓ AC2 ✓ **AC3 ✗** AC4 ✓ |
| t9-fastify-forwarded-host-trust | 4e1db5bd (GHSA-444r-cwp2-x5xf) + follow-up 8dee9be0 (#6613) | AC1 untrusted peer can't spoof host/protocol; AC2 trusted proxy still works (guard) | AC3/AC4 hop-count `trustProxy` with undefined/null socket address keeps working (guards) | the first upstream fix itself: **AC3 ✗ AC4 ✗** |
| t10-fastify-remove-raw-header | e4ffc205 (#6860) | AC1 removeHeader removes raw headers | AC2 header set both raw and via reply.header; AC3 no throw after headers are sent (guard) | unguarded `raw.removeHeader`: **AC3 ✗** |

Notes:

- **t8.** The supp file drops the upstream test "skips invalid quoted string
  parameters". The fix changed that test's expectation, and the visible
  pre-fix test asserts the old behavior, so it would be unfair either way.
- **t10.** AC3 is an eval-added test. The upstream test passes even when
  `removeHeader` throws: the hijacked handler swallows the assertion error and
  the test passes after an 8-second hang.

