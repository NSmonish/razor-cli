% Razor — Phase 1 Prototype Notes
% COMS E6998 Build an Agent Startup
% October 3, 2026

# Razor — Phase 1 Prototype: What We Built, Observations, and Limitations

## 1. Summary

Razor is a CLI tool that generates a repo-specific `AGENTS.md` file — a concise
"rulebook" that tells coding agents how a given project is set up (framework,
testing tool, ORM, where routes live). The goal is right-sized, on-demand
context so coding agents stop hallucinating and burning tokens on wrong guesses.

In Phase 1 we built a working end-to-end prototype: it scans a real repository,
detects the stack with evidence, and uses an LLM to produce a strict `AGENTS.md`.

## 2. What we built

**The pipeline:**

    repo folder  ->  scanner  ->  JSON (with evidence)  ->  LLM (Gemini)  ->  AGENTS.md

**Two commands:**

- `razor scan [dir]` — scans a repo and prints the detected data as JSON.
- `razor init [dir]` — scans the repo (or reads a provided JSON file), sends it
  to the LLM, and writes `AGENTS.md`. Supports `-i file.json` to skip scanning,
  `-o` for output path, and `-m` to pick the model.

**The scanner (evidence-based):**

- Walks the file tree, ignoring `node_modules`, `.git`, build dirs, etc., with
  depth and file-count caps so it stays fast on large repos.
- Records *evidence* for every fact — which file proved it (e.g.
  "eslint.config.js (imports react)"). This directly supports Razor's
  no-hallucination thesis.
- Confirms frameworks from actual code imports where possible, not just the
  dependency list.
- Detects Node and Python stacks:
  - Frameworks: Next.js, Nuxt, Angular, Svelte, Express, Fastify, NestJS, Koa,
    Vue, React, Vite / Django, Flask, FastAPI.
  - Testing: Jest, Vitest, Mocha / PyTest, unittest.
  - ORMs: Prisma, Sequelize, TypeORM, Mongoose, Drizzle / SQLAlchemy,
    Django ORM, Peewee.
- Static-site fallback for plain HTML/CSS/JS repos.
- Nested-package detection for monorepos (e.g. frontend/ + backend/).
- Extra signals: package manager, entry point, test locations, config files,
  file count.

**The LLM step:**

- Uses Google Gemini via the official SDK and a strict system prompt: output
  only raw markdown, only state facts present in the scan, omit anything marked
  "unknown" rather than guessing.
- Retries up to 3 times with backoff on transient 503/429 responses.
- Falls back to an offline "mock" `AGENTS.md` when no API key is set, so the
  pipeline is always demoable and testable without the network.

**Tests:** 10 automated tests (Node's built-in test runner, no extra deps),
all passing. They cover the scanner detection (Node + Python), evidence output,
empty-dir and bad-input handling, the prompt builder, the mock output, and a
full CLI run.

## 3. Observations from testing on real repositories

We tested the scanner against real GitHub repos (not just toy fixtures). This
surfaced real behavior:

| Repo | Detected | Correct? |
|------|----------|----------|
| Howzat | Python / Flask / SQLAlchemy | Yes — confirmed from requirements.txt |
| PersonalizedDreamInterpreter | JavaScript / React / npm | Yes — React confirmed from eslint.config.js import |
| Prudentia-Frontend | Static site (HTML/CSS/JS) | Yes — genuinely no framework |
| TechLoop | Static site (HTML/CSS/JS) | Yes — genuinely no framework |

**Key observations:**

- Testing on real repos was far more valuable than toy fixtures. Our first
  scanner version returned "unknown" for several repos; investigating showed
  most of those were actually *correct* (plain static sites with no framework),
  while a couple exposed real gaps (frontend frameworks and nested packages)
  that we then fixed.
- The evidence field makes results auditable — we can see *why* the scanner
  claims a repo uses React, which matters for trust and for debugging wrong
  detections.
- The strict prompt works: on Howzat the LLM correctly *omitted* the testing
  framework (which was unknown) instead of inventing one. That is the
  no-hallucination guardrail doing its job.

## 4. Limitations (honest)

- **Static detection, not full AST analysis.** Detection is based on
  dependency names and simple import matching. It handles common setups well
  but can miss unusual or heavily customized configurations.
- **Nested backends can be missed.** When a framework is detected at the repo
  root, the scanner does not also surface a nested project's stack. Example:
  a repo with a React frontend at the root and a separate `backend/` folder —
  the backend's framework/ORM is not reported once the root framework is found.
- **Front-end vs back-end ambiguity in monorepos.** For repos with both, we
  currently report one primary stack rather than a full per-package breakdown.
- **LLM dependency / availability.** The live generation step depends on the
  Gemini API. During development the fast "flash" model intermittently returned
  503 ("high demand"). The retry logic and the `-m` model override mitigate
  this, and the offline mock path sidesteps it entirely, but a live demo can be
  affected by upstream load.
- **Model names drift.** `gemini-1.5-flash` from the original plan was already
  retired; model IDs change, so the model is configurable rather than
  hard-coded.
- **Not yet measured.** Phase 1 proves "scan a real repo -> generate
  right-sized context." It does NOT yet measure token savings or reduction in
  developer correction loops. Those metrics are the next experiment (baseline
  vs. Razor) and are required to validate the core efficiency claim.

## 5. What is still to build (beyond Phase 1)

- Baseline measurement: tokens / correction-prompts without Razor vs. with
  Razor, on a real repo task.
- Beta testing with real users and measuring whether their rework drops.
- The harder context thesis from the proposal: on-demand / progressive context
  loading and the knowledge-graph "knowledge plane" that drove the larger token
  savings in our interviews.
- Deeper, per-package detection for monorepos.

## 6. Honest status

- As the course **Oct 4 prototype milestone**: done and demoable.
- As the full **Razor product**: this is the first layer — right-sized context
  generation from a real repo scan. The efficiency *gains* remain a hypothesis
  we have not yet measured.
