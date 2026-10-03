% Razor — Phase 1 Prototype Notes
% COMS E6998 Build an Agent Startup
% October 3, 2026

# Razor — Phase 1 Prototype: What We Built, Observations, and Limitations

Repository: https://github.com/NSmonish/razor-cli

## 1. Summary

Razor is a command-line tool that generates a repo-specific `AGENTS.md` file —
a short reference that tells coding agents how a given project is set up
(framework, testing tool, ORM, structure, commands). The aim is to give coding
agents the context relevant to a repository so they rely less on guesswork.

In Phase 1 we built a working prototype that scans a repository, detects its
stack with supporting evidence, and uses an LLM to produce an `AGENTS.md`. It
also has an offline mode that produces the same file without an API call.

## 2. What we built

**Pipeline:**

    repo folder  ->  scanner  ->  JSON (with evidence)  ->  LLM (Gemini)  ->  AGENTS.md

**Two commands:**

- `razor scan [dir]` — scans a repo and prints the detected data as JSON.
- `razor init [dir]` — scans the repo (or reads a provided JSON file), sends it
  to the LLM, and writes `AGENTS.md`. Options: `-i` to use an input JSON file,
  `-o` for the output path, `-m` to choose the model.

**Scanner:**

- Walks the file tree, skipping `node_modules`, `.git`, and build folders, with
  depth and file-count caps for larger repos.
- Records evidence for each detected fact — which file supports it (for example
  "eslint.config.js imports react").
- Where possible, confirms a framework from an actual code import rather than
  the dependency list alone.
- Detects Node and Python stacks:
  - Frameworks: Next.js, Nuxt, Angular, Svelte, Express, Fastify, NestJS, Koa,
    Vue, React, Vite, Django, Flask, FastAPI.
  - Testing: Jest, Vitest, Mocha, PyTest, unittest.
  - ORMs: Prisma, Sequelize, TypeORM, Mongoose, Drizzle, SQLAlchemy,
    Django ORM, Peewee.
- Extracts additional signals: npm scripts (build/test/dev/lint with the actual
  commands), key dependencies, top-level directory structure, environment
  variable names (from `.env.example`, names only), a README summary, test
  locations, and config files.
- Has a static-site fallback (plain HTML/CSS/JS) and basic detection of
  sub-projects in monorepo layouts.

**LLM step:**

- Uses Google Gemini via the official SDK with a prompt that asks for a
  structured document (Overview, Tech Stack, Project Structure, Commands,
  Guardrails, Environment) and instructs the model to use only facts present in
  the scan and omit anything marked unknown.
- Retries up to three times on transient errors (503/429).
- Falls back to an offline rendering of the scan when no API key is set, so the
  pipeline can be run without the network.

**Tests:** 10 automated tests (Node's built-in test runner, no extra
dependencies), all passing. They cover scanner detection for Node and Python,
evidence output, empty-directory and missing-input handling, the prompt builder,
the offline rendering, and a full CLI run.

## 3. Observations from testing on real repositories

We ran the scanner against several real repositories rather than only toy
fixtures. This gave a more realistic picture.

| Repo | Detected | Notes |
|------|----------|-------|
| Howzat (ours) | Python / Flask / SQLAlchemy | Correct; confirmed from requirements.txt |
| PersonalizedDreamInterpreter (ours) | JavaScript / React / npm | React confirmed from an eslint config import |
| Static site repos (ours) | Static site (HTML/CSS/JS) | Correct; these have no framework |
| nodejs-testing-best-practices | Express.js / Jest / Sequelize | Produced a full document with commands and structure |
| full-stack-fastapi-template | React + FastAPI, with frontend/backend split | Detected the split and configs; per-package testing/ORM not fully reported |
| prisma-examples | TypeScript / Vitest, framework/ORM unknown | Large monorepo of ~50 projects; sparse result is expected |

**Notes on the results:**

- Testing on real repositories was more informative than toy fixtures. An early
  version returned "unknown" for several repos; on inspection most of those were
  correct (plain static sites), while a couple pointed to gaps we then
  addressed (frontend frameworks, nested packages).
- The evidence field makes results checkable — it shows which file supports a
  given detection, which helps when a result looks wrong.
- The prompt's "omit unknowns" instruction held up in practice: on a repo where
  the testing framework was not detected, the generated file left it out rather
  than filling it in.

## 4. How to use and test Razor

The full walkthrough is in `razor_teammate_guide.md` in the repository. Short
version:

### Setup

    git clone https://github.com/NSmonish/razor-cli
    cd razor-cli
    npm install
    cp .env.example .env        # then add a Gemini API key in .env

A free Gemini key can be created at https://aistudio.google.com/apikey.

### Run the tests

    npm test                    # expect 10 passing

### Try it on a public repo

    rm -rf /tmp/test-repo
    git clone --depth 1 https://github.com/zhanymkanov/fastapi-best-practices /tmp/test-repo

Scan only (no LLM call):

    node index.js scan /tmp/test-repo

Scan and generate the file:

    node index.js init /tmp/test-repo -o /tmp/test-AGENTS.md
    cat /tmp/test-AGENTS.md

### Offline mode (no API call)

    env -u GEMINI_API_KEY node index.js init /tmp/test-repo -o /tmp/test-AGENTS.mock.md

### Clean up

    rm -rf /tmp/test-repo /tmp/test-AGENTS.md /tmp/test-AGENTS.mock.md

### Command reference

- `node index.js scan [dir]` — scan a repo, print JSON (`-o` to write a file).
- `node index.js init [dir]` — scan and generate `AGENTS.md`.
  - `-i file.json` — use an input JSON file instead of scanning.
  - `-o file` — output path (default `AGENTS.md`).
  - `-m model` — Gemini model (default `gemini-3.5-flash-lite`).

## 5. Limitations

- **Monorepos are partial.** For repositories with separate frontend and backend
  packages, Razor detects the split and config files but may not report each
  sub-package's testing tool or ORM, because it reads root-level dependency
  files rather than deep-parsing every sub-package manifest. Single-application
  repositories produce the fullest output.
- **Static detection.** Detection is based on dependency names, config files,
  and simple import checks. It can miss unusual setups and does not capture
  domain-specific conventions that are not visible in the file layout.
- **Depends on the LLM service.** The generation step uses the Gemini API.
  During development the larger models were not available on a free-tier key and
  some models returned temporary "high demand" errors; the default model
  (`gemini-3.5-flash-lite`) worked, and the retry logic and offline mode reduce
  the impact.
- **Model names change.** The model originally planned (`gemini-1.5-flash`) was
  already retired, so the model is configurable rather than fixed.
- **Not yet measured.** The prototype shows that we can scan a repository and
  generate a relevant `AGENTS.md`. It does not yet measure token usage or any
  reduction in developer correction loops; that is the next step.

## 6. What is still to build

- A baseline measurement: tokens and correction prompts without Razor compared
  with Razor, on a real task.
- Beta testing with users and a measure of whether their rework decreases.
- Deeper, per-package detection for monorepos.
- The broader context approach from the proposal (on-demand or progressive
  context, and the knowledge-graph idea from our interviews).

## 7. Status

- As the course Oct 4 prototype milestone: complete and demonstrable.
- As the full product: this is a first layer — generating repo-specific context
  from a real scan. The efficiency benefits remain to be measured.
