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
npm test                    # should pass 26/26

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

## The context pack (scaffold)

Razor right-sizes the pack from the scan — a small static site gets a couple of
files; a full backend gets the lot. Every file and skill is grounded in evidence
(the file that proved it); nothing is invented.

```
.agent/
├── AGENTS.md          entry point (table of contents + essentials)
├── overview.md        stack, deps, how to run
├── architecture.md    directory layout (only if non-trivial)
├── workflows.md       real build/test/deploy commands
├── verification.md    how to check work is correct
├── steering.md        global conventions
├── skills/
│   ├── run-tests/SKILL.md
│   ├── code-push/SKILL.md
│   └── db-migrations/SKILL.md (+ reference.md if complex)
└── scripts/
    └── check.sh       runnable lint + test
```

Skills are chosen from the scan: `run-tests` only if a test runner exists,
`code-push` only with a git remote, `db-migrations` only with an ORM **and** a
migrations dir, `local-env` only with Docker, `lint-fix` only with a linter,
`build` only with a build system (Bazel/Cargo/Go/Maven/Gradle/CMake/Make).

### Standard headers and versioning

Every generated file starts with YAML frontmatter — `name`, `kind`,
`description`, `version`, `generated` date, `razor_format`, and `evidence` on
skills — so packs diff cleanly and are easy to search and version.

### Routing manifest

Packs with skills also emit `skills.index.json`: a machine-readable map of each
skill's description, path, and **trigger keywords**, so a coding agent can route
a task to the right skill without loading every `SKILL.md`. Triggers are derived
automatically from each skill's own data (name, intent, command, framework),
and the manifest is regenerated on every `scaffold` and `add-skill`, so it never
drifts from the skills on disk. Razor emits the manifest; the actual loading is
done by the consuming agent at runtime.

### Targets (which agent tool consumes it)

The entry file is `AGENTS.md`, the cross-tool open standard read by Cursor,
Codex, GitHub Copilot, Gemini CLI, and Claude Code (v2.1.277+, when no
`CLAUDE.md` is present). The `-t` flag places skills where each tool
auto-discovers them:

- `agents-md` (default) — `skills/` at root. Most portable.
- `kiro` — docs under `.kiro/steering/`, skills under `.kiro/skills/`.
- `claude` — skills under `.claude/skills/`; `AGENTS.md` at root, no bridge file.

The skill/doc contents are plain markdown, so any agent can read them; the
target only controls where they go for automatic discovery.

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
