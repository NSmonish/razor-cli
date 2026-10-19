# Example: nodejs-testing-best-practices

A worked example of Razor on a real repo — one of the 20 from our launch eval.
Source repo: https://github.com/goldbergyoni/nodejs-testing-best-practices
(Express.js / Jest / Sequelize, TypeScript), at commit `2117875`.

This pack is also the **pinned Razor pack of the A/B eval**: for every
`eval/ab` task on this repo, the razor arm gets exactly these files (see
`eval/ab/repos/nodejs-testing-best-practices/repo.json` → `razor_pack`).
Changing anything under `pack/` changes what the eval measures, and the
harness refuses to resume a run with a different pack.

## Commands run

```bash
git clone https://github.com/goldbergyoni/nodejs-testing-best-practices /tmp/repo

# 1) scan — detect the stack as JSON (no LLM)
node index.js scan /tmp/repo > scan-output.json

# 2) scaffold — generate the full context pack in the Claude Code layout.
#    With GEMINI_API_KEY set, the LLM proposes repo-specific skills and
#    rewrites the prose docs; the skills and check script stay deterministic.
node index.js scaffold /tmp/repo -o pack --target claude
```

## What's here

- `scan-output.json` — the raw detection: language, framework, testing, ORM,
  scripts, structure, env var names, config files, the file list, and the
  `evidence` map (which file proved each fact).
- `pack/` — the generated agent context pack, laid out as it goes into the repo root:
  - `AGENTS.md` — entry point (links the docs + skills, points to the manifest)
  - `overview.md`, `architecture.md`, `workflows.md`, `verification.md`,
    `steering.md` — layered docs, grounded in the scan; `overview`,
    `architecture`, `workflows` and `steering` went through the LLM prose pass
  - `.claude/skills/<name>/SKILL.md` — on-demand skills chosen from evidence:
    `run-tests`, `lint-fix`, `code-push`, `db-migrations` (+ `reference.md`),
    `local-env`. Claude Code discovers these on its own.
  - `scripts/check.sh` — the repo's real lint + test commands
  - `skills.index.json` — routing manifest (skill → triggers → path → evidence)
- `README-FOR-CLAUDE.md` — how to install the pack by hand and point Claude Code
  at it. Kept outside `pack/` so it never reaches an agent's workspace.

## What to notice

- Every detected fact traces to a file (see `evidence` in the scan and in
  each skill's frontmatter).
- New since the first version of this example (3 skills, flat `skills/`):
  - `db-migrations` exists now: the migrations directory is nested
    (`example-application/data-access/migrations/`) and the namespaced
    `db:migrate` script is captured.
  - `local-env` exists now: nested `docker-compose.yml` files are detected.
  - The pack uses the Claude Code layout (`.claude/skills/`).
- LLM skill discovery proposed nothing beyond the standard registry for this
  repo, so all 5 skills come from the registry.

## Known defects in this pack (left in on purpose)

The pack is kept exactly as Razor produced it, so the eval measures what users
actually get. These are real errors an agent may trip over:

- **`npm run migrate` does not exist.** The script is `db:migrate`. The scanner
  stores its command under the key `migrate` and the LLM prose pass turned that
  into `npm run migrate` (`overview.md`, `architecture.md`, `steering.md`).
  The `db-migrations` skill itself has the correct underlying command.
- **Bare `eslint` / `jest` / `sequelize-cli`.** `scripts/check.sh` and the skills
  call the binaries directly. They aren't on `PATH` outside `npm run`/`npx`, so
  `bash scripts/check.sh` fails with "command not found". Separately, `eslint .`
  fails on this repo because it uses ESLint 9 without an `eslint.config.*`.
- **The prose pass dropped the guardrails.** The deterministic `steering.md`
  says "write tests with Jest", "use Sequelize, no raw SQL", "don't reformat
  unrelated code". The enriched one restates the stack and commands instead.
- **`local-env` cites the wrong compose file.** Its evidence is
  `recipes/db-optimization/docker-compose-mongo.yml`; the app's tests use
  `example-application/test/setup/docker-compose.yml`.
