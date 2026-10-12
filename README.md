# Razor CLI

Generate repo-specific `AGENTS.md` context for coding agents.

Razor scans a repository to detect its framework, testing tool, ORM, structure,
and commands — recording evidence for each fact — then produces grounded context
for coding agents. It can generate either a single `AGENTS.md` (the `init`
command) or a full, right-sized agent context pack of layered docs + on-demand
skills + a verification script (the `scaffold` command). An offline mode
generates useful output with no API call.

> COMS E6998 "Build an Agent Startup" — team Razor.

## Quick start

```bash
npm install
cp .env.example .env        # then put your Gemini key in .env
npm test                    # should pass 40/40

# scan a repo (free, no LLM)
node index.js scan /path/to/repo

# generate a single AGENTS.md (uses the LLM)
node index.js init /path/to/repo -o AGENTS.md

# generate a full agent context pack (docs + skills + check script)
node index.js scaffold /path/to/repo -o .agent
```

Get a free Gemini key at https://aistudio.google.com/apikey

## Commands

- `node index.js scan [dir]` — scan a repo, print detected JSON (`-o` to write a file).
- `node index.js init [dir]` — scan + generate a single `AGENTS.md`.
  - `-i file.json` — skip scanning, use a provided JSON file.
  - `-o file` — output path (default `AGENTS.md`).
  - `-m model` — Gemini model (default `gemini-3.5-flash-lite`).
- `node index.js scaffold [dir]` — scan + generate a full agent context pack.
  - `-o dir` — output directory (default `.agent`).
  - `-t target` — output layout: `agents-md` (default), `kiro`, or `claude`.
  - `--offline` — skip the LLM pass, deterministic output only.
  - `-m model` — Gemini model for the prose-enrichment pass.
- `node index.js add-skill <skill> [dir]` — re-scan the repo and add a named
  skill into an existing pack.
  - Known skills: `run-tests`, `lint-fix`, `code-push`, `db-migrations`,
    `local-env`, `build`.
  - If the repo has evidence for the skill it is grounded; if not, it is still
    generated but clearly marked **UNVERIFIED**.
  - Regenerates `skills.index.json` so the new skill is routable.

## Generated structure (what `scaffold` produces)

Razor right-sizes the pack from the scan — a small static site gets a couple of
files; a full backend gets the lot. Every file and skill is grounded in evidence
(the file that proved it); nothing is invented.

Default (`agents-md`) layout:

```
.agent/
├── AGENTS.md              entry point — table of contents + always-on essentials,
│                          links every doc/skill, points to the routing manifest
├── overview.md            purpose, stack, key deps, how to run
├── architecture.md        directory layout (only emitted if non-trivial)
├── workflows.md           real build/test/deploy commands from the repo
├── verification.md        how to check work is correct (test/lint/build commands)
├── steering.md            concise global conventions
├── skills/                on-demand skills, each chosen from evidence
│   ├── run-tests/
│   │   └── SKILL.md        name+description header, evidence line, concrete steps
│   ├── lint-fix/
│   │   └── SKILL.md
│   ├── code-push/
│   │   └── SKILL.md
│   └── db-migrations/      (example of a "complex" skill)
│       ├── SKILL.md
│       └── reference.md    deeper context, only emitted for complex skills
├── scripts/
│   └── check.sh            runnable verification (e.g. `eslint . && jest`)
└── skills.index.json       routing manifest: skill → description, path, triggers,
                            evidence, verified flag
```

Every file begins with YAML frontmatter — `name`, `kind`, `description`,
`version`, `generated` date, `razor_format`, and `evidence` on skills — so packs
diff cleanly and are easy to search and version.

Skills are chosen from the scan: `run-tests` only if a test runner exists,
`code-push` only with a git remote, `db-migrations` only with an ORM **and** a
migrations dir, `local-env` only with Docker, `lint-fix` only with a linter,
`build` only with a build system (Bazel/Cargo/Go/Maven/Gradle/CMake/Make).

### Per-target layouts (`-t`)

The entry file is `AGENTS.md`, the cross-tool open standard read by Cursor,
Codex, GitHub Copilot, Gemini CLI, and Claude Code (v2.1.277+, when no
`CLAUDE.md` is present). The `-t` flag places docs/skills where each tool
auto-discovers them:

```
agents-md (default)      kiro                        claude
.agent/                  .agent/                     .agent/
├── AGENTS.md            ├── AGENTS.md               ├── AGENTS.md
├── overview.md ...      ├── .kiro/steering/         ├── overview.md ...
├── skills/<n>/SKILL.md  │   └── overview.md ...      ├── .claude/skills/<n>/SKILL.md
└── scripts/check.sh     ├── .kiro/skills/<n>/SKILL.md└── scripts/check.sh
                         └── scripts/check.sh
```

The skill/doc contents are plain markdown, so any agent can read them; the
target only controls where they go for automatic discovery.

### Routing manifest

`skills.index.json` is a machine-readable map of each skill's description, path,
and **trigger keywords**, so a coding agent can route a task to the right skill
without loading every `SKILL.md`. Triggers are derived automatically from each
skill's own data (name, intent, command, framework), and the manifest is
regenerated on every `scaffold` and `add-skill`, so it never drifts from the
skills on disk. Razor emits the manifest; the actual loading is done by the
consuming agent at runtime.

### Worked example and eval

- A full worked example (scan output + generated pack) is in
  [`examples/nodejs-testing-best-practices/`](examples/nodejs-testing-best-practices).
- A reproducible 20-repo evaluation (harness + results) is in
  [`eval/`](eval); summary and pass/fail analysis in `eval_launch_readiness.md`.

## Offline mode (no API)

```bash
# single file
env -u GEMINI_API_KEY node index.js init /path/to/repo -o AGENTS.md
# full pack, deterministic
node index.js scaffold /path/to/repo -o .agent --offline
```

## How it works

```
repo folder -> scanner -> JSON (+ evidence) -> LLM (Gemini) -> AGENTS.md
```

The scanner detects Node and Python stacks (Express/Next/Fastify/NestJS/Koa/
Vue/React/Vite/Svelte/Angular/Nuxt, Django/Flask/FastAPI), testing tools
(Jest/Vitest/Mocha/PyTest), and ORMs (Prisma/Sequelize/TypeORM/Mongoose/
Drizzle/SQLAlchemy/etc.), plus scripts, structure, env var names, and config
files. The LLM is told to only state facts present in the scan and omit
anything unknown.

## Known limitations

- Monorepos are partial — single-app repos give the fullest output.
- Static detection (dependency names, config files, import checks), not deep
  code understanding.
- Live generation depends on the Gemini API; free-tier keys are limited to
  flash models.
- Does not yet measure token savings / correction-loop reduction (next step).

See `razor_teammate_guide.md` for a full step-by-step testing walkthrough.
