# Razor A/B eval

Measures whether a Razor context pack makes Claude Code cheaper or faster on real
coding tasks without making it worse at them. Every task runs twice, at the same
moment, in two disposable copies of the repo:

- **naive**: the repo only
- **razor**: the repo plus a Razor context pack in the Claude Code layout
  (`AGENTS.md`, docs, `.claude/skills/`, `skills.index.json`, `scripts/check.sh`).
  If the repo's `repo.json` sets `razor_pack`, that pinned pack is copied in
  as-is. nodejs-testing-best-practices pins the worked example in
  [`examples/nodejs-testing-best-practices/pack`](../../examples/nodejs-testing-best-practices/pack).
  Otherwise the pack is generated per workspace with
  `RAZOR_NO_LLM=1 razor scaffold --target claude` (deterministic, no LLM).

The finished workspace is graded with hidden acceptance tests. Tokens, context,
time, cost, tool calls, exploration before the first edit, re-correction loops,
and pack usage are recorded per run. The design and exact definitions are in
[`EVAL_SPEC.md`](./EVAL_SPEC.md).

## Requirements

- Node 20+ and `npm install` in the razor-cli root
- Claude Code CLI (`claude`) logged in. CI needs an `ANTHROPIC_API_KEY`
- Docker running (the current tasks' tests need Postgres)
- git

### Outline tasks (o1–o6): one-time setup

Outline needs Node 26 and yarn 4, kept in the harness work dir so the host's
Node is untouched. `repo.json` → `path` puts them first on `PATH` for installs,
hooks, the agent and grading:

```bash
mkdir -p /tmp/razor-ab/tools && cd /tmp/razor-ab/tools
curl -O https://nodejs.org/dist/v26.12.0/node-v26.12.0-darwin-arm64.tar.gz
tar xzf node-v26.12.0-darwin-arm64.tar.gz
export PATH=/tmp/razor-ab/tools/node-v26.12.0-darwin-arm64/bin:$PATH
npm i -g corepack@0.34.0
corepack enable --install-directory /tmp/razor-ab/tools/node-v26.12.0-darwin-arm64/bin
```

Each slot also runs its own `postgres:16` and `redis:7` containers. See
`EVAL_SPEC.md` §12.

## Run it

From the razor-cli root:

```bash
# 1. check every task: the original code passes all ACs, the broken code fails them (no model calls)
node eval/ab/run.js validate

# 2. run both arms on every task (paid). Results: eval/ab/results/<name>/
node eval/ab/run.js run --name my-run
node eval/ab/run.js run --name my-run --tasks t1-premium-discount --reps 3

# 3. rebuild the summary table
node eval/ab/run.js report --name my-run
```

Useful `run` flags: `--model` (default `claude-opus-5-5`), `--effort`
(default `medium`), `--timeout-min` (default 20), `--max-budget-usd` (per agent,
default 10), `--arms naive` (run one arm only), `--keep-workspaces` (keep the
workspaces for debugging), `--claude-arg <arg>` (pass extra flags through to `claude`).

Runs can be resumed: re-running the same `--name` skips any (task, arm, rep) that
already has a result. A run refuses to resume with a different model, effort,
Claude Code version, or razor-arm pack unless you pass `--force`. A pinned pack
is identified by a hash of its files (`meta.razor_pack`), so editing the worked
example needs a new `--name`. Runs from before this was recorded used
`scaffold --offline` and can't be resumed with the current pack.

Workspaces, the repo cache, and validation results live in `/tmp/razor-ab`
(override with `RAZOR_AB_DIR`).

## Output (`eval/ab/results/<name>/`)

| Path | What |
|---|---|
| `summary.md` | naive vs razor per task: absolute numbers first, then razor/naive ratio |
| `baseline/` (naive arm), `v1/` (razor arm) | `results.jsonl` (one row per task × rep), `errors.jsonl` (failed attempts, never scored), `traces/<task>_rep<k>.stream.jsonl` (raw Claude Code output) + `.json` (readable turns), `diffs/<task>_rep<k>.patch` (what the agent changed) |
| `meta.json` / `_state.json` | run config and metric declarations |

This layout follows the `/claude-api build-eval` convention: `baseline` and
`v1` are variants. So the bundled report builder and `/claude-api hillclimb`
can work on it later, for example to tune Razor's pack against this eval.

## Adding a task

1. `repos/<repo>/repo.json`: URL, pinned commit, install command, test paths.
   Add a `hooks.sh` if the tests need isolated services. See the existing
   repo's per-arm Postgres for an example. Optional `razor_pack`: a pack
   directory (relative to the razor-cli root) to give the razor arm instead of
   generating one. Its files must not collide with repo files.
2. `tasks/<id>/`:
   - `prompt.md`: a symptom-style request. No file names, no fix.
   - `break.patch`: removes or breaks the behavior (against the pinned commit).
   - `hide.patch`: removes the original tests for it.
   - `supp/`: extra hidden tests for any prompt requirement the originals don't
     check.
   - `task.json`: the acceptance criteria. Each one is `file` + `title` of a
     test, with `null_expect: "fail"`, or `"pass"` for guard criteria that the
     broken code already satisfies.
3. `node eval/ab/run.js validate --tasks <id>` must pass before the task can run.

Rule: every requirement in the prompt is checked by at least one acceptance
criterion, and every **shown** criterion traces back to a sentence in the prompt.

### Real-fix tasks

A task can be a real fixed issue. Set `commit` in `task.json` to the fix's
parent, leave out `break` and `hide`, put the fix's `lib` diff in
`solution.patch` (the oracle), and copy the fix's test files, as they are after
the fix, into `supp/` and list them under `supp_files`. They're copied over the
workspace only at grading time. Set `regression_paths` to the test files around
the fix.

### Shown and hidden acceptance criteria

Each criterion has `"visibility": "shown"` (the default) or `"hidden"`.

- **Shown**: the prompt states it. It's what the issue reporter asked for.
- **Hidden**: the prompt does not state it. It comes from the real fix's tests
  and is what a careful engineer would also have handled: an edge case the
  spec implies, or existing behavior that a naive fix breaks. The agent never
  sees it. Its only feedback loop is the tests it writes itself and the
  repo's existing suite.

`validate` checks hidden criteria three ways:

- Static leak check: no hidden test title and no `leak_strings` entry appears
  in the prompt, and `node_modules` holds no other copy of the project (a
  dependency on a newer release would contain the fix).
- `decoys`: patches that fix only what the prompt states. Each must land
  where its `expect` says, normally passing every shown criterion and failing
  at least one hidden one. This proves the hidden criteria discriminate.
  If an upstream test can't catch the decoy, add a stricter test with
  `"source": "added"` and an `added_reason`.
- At run time, `metrics.leaks` flags any agent tool call that touches the
  harness's own files (cached upstream clones with full history, validation
  workspaces, task folders).

The report shows shown and hidden pass counts separately. Efficiency ratios
need every run to pass the shown criteria; hidden criteria are a separate
quality measure.
