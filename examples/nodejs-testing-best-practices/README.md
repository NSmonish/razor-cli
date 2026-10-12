# Example: nodejs-testing-best-practices

A worked example of Razor on a real repo — one of the 20 from our launch eval.
Source repo: https://github.com/goldbergyoni/nodejs-testing-best-practices
(Express.js / Jest / Sequelize, TypeScript).

## Commands run

```bash
git clone --depth 1 https://github.com/goldbergyoni/nodejs-testing-best-practices /tmp/repo

# 1) scan — detect the stack as JSON (no LLM)
node index.js scan /tmp/repo > scan-output.json

# 2) scaffold — generate the full context pack (deterministic, no LLM)
node index.js scaffold /tmp/repo -o pack --offline
```

## What's here

- `scan-output.json` — the raw detection: language, framework, testing, ORM,
  scripts, structure, env var names, config files, and the `evidence` map
  (which file proved each fact).
- `pack/` — the generated agent context pack:
  - `AGENTS.md` — entry point (links the docs + skills, points to the manifest)
  - `overview.md`, `architecture.md`, `workflows.md`, `verification.md`,
    `steering.md` — layered docs, each grounded in the scan
  - `skills/<name>/SKILL.md` — on-demand skills chosen from evidence
    (`run-tests`, `lint-fix`, `code-push` here)
  - `scripts/check.sh` — a runnable `eslint . && jest` (the repo's real commands)
  - `skills.index.json` — routing manifest (skill → triggers → path)

## What to notice

- Every detected fact traces to a file (see `evidence` in the scan).
- The skills are chosen from the scan: `code-push` only exists because the repo
  has a git remote + CI; there's no `db-migrations` skill because, although it
  uses Sequelize, no migrations directory was detected.
- `check.sh` runs the project's actual lint + test commands, not generic ones.
- This pack was generated with `--offline` so it's fully reproducible; the
  optional LLM pass only polishes the wording of the prose docs.
