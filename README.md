# Razor CLI

Generate repo-specific `AGENTS.md` context for coding agents.

Razor scans a repository to detect its framework, testing tool, ORM, structure,
and commands — recording evidence for each fact — then uses an LLM (Google
Gemini) to produce a concise, grounded `AGENTS.md` that tells coding agents how
to work in that repo. An offline mock mode generates a useful file with no API
call.

> COMS E6998 "Build an Agent Startup" — team Razor, Phase 1 prototype.

## Quick start

```bash
npm install
cp .env.example .env        # then put your Gemini key in .env
npm test                    # should pass 10/10

# scan a repo (free, no LLM)
node index.js scan /path/to/repo

# scan + generate AGENTS.md (uses the LLM)
node index.js init /path/to/repo -o AGENTS.md
```

Get a free Gemini key at https://aistudio.google.com/apikey

## Commands

- `node index.js scan [dir]` — scan a repo, print detected JSON (`-o` to write a file).
- `node index.js init [dir]` — scan + generate `AGENTS.md`.
  - `-i file.json` — skip scanning, use a provided JSON file.
  - `-o file` — output path (default `AGENTS.md`).
  - `-m model` — Gemini model (default `gemini-3.5-flash-lite`).

## Offline mock mode (no API)

```bash
env -u GEMINI_API_KEY node index.js init /path/to/repo -o AGENTS.md
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
