% Razor CLI — Teammate Testing Guide
% COMS E6998 — Razor (Phase 1 Prototype)
% October 3, 2026

# Razor CLI — How to Test It (Step by Step)

This guide lets anyone on the team run the Razor prototype in their own terminal
and generate an `AGENTS.md` for a real repository.

## What Razor does (30-second version)

You point Razor at a code repository. It (1) scans the repo to detect the
framework, testing tool, ORM, structure, and commands — recording evidence for
each fact — and (2) uses an LLM (Google Gemini) to turn that into a concise,
grounded `AGENTS.md` file that tells coding agents how to work in that repo.

There is also an offline "mock" mode that produces a useful `AGENTS.md` with no
API call, so you can test the pipeline for free / without network.

---

## 0. Prerequisites

- Node.js 18+ (we developed on v22). Check:

        node --version

- A Google Gemini API key (free tier is fine). Get one at
  https://aistudio.google.com/apikey
- The `razor-cli` project folder (from the team repo or a zip from Monish).

---

## 1. Get into the project and install dependencies

From the folder that contains `index.js`:

    cd path/to/razor-cli
    npm install

This installs commander, chalk, @google/generative-ai, and dotenv.

---

## 2. Add your API key

Copy the template and paste your own key in:

    cp .env.example .env

Then open `.env` and set:

    GEMINI_API_KEY=your_actual_key_here

Note: `.env` is gitignored — do not commit your key.

---

## 3. Run the automated tests (free, no API)

    npm test

Expected: `# pass 10  # fail 0`. This confirms the install works.

---

## 4. Try it on a public repo

Clone a single-app repo (shallow clone = fast). Example — a FastAPI app:

    rm -rf /tmp/test-repo
    git clone --depth 1 https://github.com/zhanymkanov/fastapi-best-practices /tmp/test-repo

### 4a. Scan only (free, no LLM) — see what it detects

    node index.js scan /tmp/test-repo

Look at the JSON output: `framework`, `testing`, `orm`, `scripts`,
`structure`, `env_vars`, and the `evidence` map (which file proved each fact).

### 4b. Generate the AGENTS.md (full pipeline, uses the LLM)

    node index.js init /tmp/test-repo -o /tmp/test-AGENTS.md
    cat /tmp/test-AGENTS.md

You should get a structured file: Overview, Tech Stack, Project Structure,
Commands, and Guardrails — all grounded in the scan.

---

## 5. Offline mock mode (no API, free)

Useful for demos or if the API is unavailable. It renders the same scan data
into an `AGENTS.md` without calling the LLM:

    env -u GEMINI_API_KEY node index.js init /tmp/test-repo -o /tmp/test-AGENTS.mock.md
    cat /tmp/test-AGENTS.mock.md

---

## 6. Clean up

    rm -rf /tmp/test-repo /tmp/test-AGENTS.md /tmp/test-AGENTS.mock.md

---

## Command reference

- `node index.js scan [dir]` — scan a repo, print detected JSON. Use `-o file`
  to write it instead of printing.
- `node index.js init [dir]` — scan + generate `AGENTS.md`.
  - `-i file.json` — skip scanning, use a provided JSON file as input.
  - `-o file` — output path (default `AGENTS.md`).
  - `-m model` — Gemini model (default `gemini-3.5-flash-lite`).
- `node index.js --help` — full help.

---

## Good repos to try

- Single app (Razor at its best):
  - https://github.com/zhanymkanov/fastapi-best-practices (FastAPI)
  - any single Express/Next.js + Prisma app
- Full-stack monorepo (shows the current limitation — see below):
  - https://github.com/fastapi/full-stack-fastapi-template
- Your own: `node index.js init ~/path/to/your/repo`

---

## Known limitations (so results make sense)

- **Monorepos are partial.** For repos with separate `frontend/` and `backend/`
  packages, Razor detects the split and configs but may not report each
  sub-package's testing tool / ORM, because it reads root-level dependency files
  rather than deep-parsing every sub-package manifest. Single-app repos give the
  fullest output.
- **Static detection, not deep code understanding.** Detection is based on
  dependency names, config files, and simple import checks — it can miss unusual
  setups and does not capture domain-specific conventions.
- **LLM availability.** The live step depends on Gemini. On the free tier, the
  larger "pro" models are blocked and some "flash" models can return 503 (high
  demand). The default `gemini-3.5-flash-lite` is reliable; the mock mode avoids
  the API entirely.
- **Not yet measured.** This prototype proves "scan a real repo -> generate
  right-sized context." It does not yet measure token savings or reduction in
  developer correction loops — that is the next experiment (baseline vs. Razor).

---

## Troubleshooting

- `command not found` for a package → you are in the wrong folder; `cd` into
  `razor-cli` (the one with `index.js`) and re-run.
- "Model busy" / 503 → re-run the command (it retries 3x), or use mock mode.
- "API key not valid" → check `.env` has a real key (not the placeholder).
- "Quota exceeded" on a model → you tried a model your key can't use; stick with
  the default or pass `-m gemini-3.5-flash-lite`.
