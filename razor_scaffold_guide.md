% Razor CLI — Context Pack (scaffold) Testing Guide
% COMS E6998 — Razor
% October 10, 2026

# Razor — Generate a Full Agent Context Pack (Step by Step)

This guide lets anyone on the team download Razor from GitHub, run it on a repo
of their choice, and verify every file it produces.

Repo: https://github.com/NSmonish/razor-cli

## What this does (30-second version)

You point Razor at a code repository. Instead of one `AGENTS.md`, the `scaffold`
command generates a whole **agent context pack**: an entry file, a set of
layered docs, on-demand skill folders, a runnable check script, and a routing
manifest. Everything is **grounded in evidence from the scan** — if the repo has
no database, you get no database skill. The pack is **right-sized**: a tiny
static site gets a couple of files; a big backend gets the full set.

---

## 0. Prerequisites

- Node.js 18+ (developed on v22). Check:

        node --version

- Git (to clone a test repo).
- A Google Gemini API key (free tier is fine) ONLY if you want the LLM prose
  polish. Everything works without it using `--offline`. Key:
  https://aistudio.google.com/apikey

---

## 1. Download Razor from GitHub

    git clone https://github.com/NSmonish/razor-cli
    cd razor-cli
    npm install

---

## 2. (Optional) Add your API key for the LLM pass

    cp .env.example .env
    # then open .env and set:  GEMINI_API_KEY=your_actual_key_here

`.env` is gitignored — do not commit your key. Skip this step entirely if you
only plan to use `--offline`.

---

## 3. Run the automated tests (free, no API)

    npm test

Expected: `# pass 38  # fail 0`. Confirms the install works.

---

## 4. Pick any repo you like and clone it

Shallow clone keeps it fast. Pick one of these, or use your own:

    rm -rf /tmp/myrepo
    git clone --depth 1 https://github.com/goldbergyoni/nodejs-testing-best-practices /tmp/myrepo

Other good ones to try:

- FastAPI (Python):  https://github.com/zhanymkanov/fastapi-best-practices
- A Bazel / C++ repo: https://github.com/google-deepmind/lab
- A tiny static repo: https://github.com/octocat/Spoon-Knife
- Your own project:   just point Razor at its folder.

---

## 5. Scan only — see what Razor detects (free, no LLM)

    node index.js scan /tmp/myrepo

Look at the JSON: `framework`, `testing`, `orm`, `scripts`, `structure`,
`env_vars`, and the `evidence` map (which file proved each fact). This is the
grounding — nothing downstream is invented.

---

## 6. Generate the context pack

Deterministic / free (recommended for a first look):

    node index.js scaffold /tmp/myrepo -o /tmp/pack --offline

Or with the LLM prose polish (needs the API key from step 2):

    node index.js scaffold /tmp/myrepo -o /tmp/pack

The terminal prints the detected stack, the plan size, and every file written.

---

## 7. Verify the files it produced

List everything:

    find /tmp/pack -type f | sort

You should see something like (fewer files for a small repo):

    /tmp/pack/AGENTS.md
    /tmp/pack/overview.md
    /tmp/pack/architecture.md
    /tmp/pack/workflows.md
    /tmp/pack/verification.md
    /tmp/pack/steering.md
    /tmp/pack/skills/run-tests/SKILL.md
    /tmp/pack/skills/code-push/SKILL.md
    /tmp/pack/scripts/check.sh
    /tmp/pack/skills.index.json

Now open and check each piece:

### 7a. Entry file (table of contents)

    cat /tmp/pack/AGENTS.md

Verify: it links the docs and skills and points to `skills.index.json`.

### 7b. The docs — grounded in the real repo

    cat /tmp/pack/overview.md        # stack, deps, how to run
    cat /tmp/pack/verification.md    # the repo's REAL test/lint commands

Verify: the commands match what the project actually uses.

### 7c. Skills — only the ones the repo warrants

    cat /tmp/pack/skills/run-tests/SKILL.md

Verify: the `Evidence:` line in the header names the file that justified the
skill. A skill you did NOT get (e.g. db-migrations) is correct if the repo has
no database — that's the right-sizing working.

### 7d. Standard versioned header (on every file)

    head -9 /tmp/pack/overview.md

Verify: frontmatter with `name`, `kind`, `version`, `generated`, `razor_format`.

### 7e. Routing manifest

    cat /tmp/pack/skills.index.json

Verify: each skill has `triggers` (keywords for routing a task to it) and a
`path`. Triggers are derived automatically from the skill — e.g. `jest` shows up
under run-tests because that's the real test command.

### 7f. The runnable check script

    cat /tmp/pack/scripts/check.sh

Verify: it runs the repo's actual lint/test (or build-system test) commands.

---

## 8. Try the different target layouts

Different agent tools look for files in different places. The `-t` flag places
them correctly:

    node index.js scaffold /tmp/myrepo -o /tmp/pack-kiro   -t kiro   --offline
    node index.js scaffold /tmp/myrepo -o /tmp/pack-claude -t claude --offline

    find /tmp/pack-kiro -type f | sort      # docs under .kiro/steering, skills under .kiro/skills
    find /tmp/pack-claude -type f | sort    # skills under .claude/skills

Default (`agents-md`) puts skills under `skills/` and is the most portable — the
`AGENTS.md` open standard is read by Cursor, Codex, Copilot, Gemini CLI, and
Claude Code.

---

## 9. Add a skill yourself

Ask Razor for a specific skill; it re-scans and adds it to your pack:

    # grounded — only if the repo has evidence for it:
    node index.js add-skill run-tests /tmp/myrepo -o /tmp/pack

    # requested but unsupported — generated, but clearly marked UNVERIFIED:
    node index.js add-skill db-migrations /tmp/myrepo -o /tmp/pack
    cat /tmp/pack/skills/db-migrations/SKILL.md     # see the UNVERIFIED banner

Known skills: run-tests, lint-fix, code-push, db-migrations, local-env, build.
The routing manifest is regenerated automatically so the new skill is routable.

---

## 10. Clean up

    rm -rf /tmp/myrepo /tmp/pack /tmp/pack-kiro /tmp/pack-claude

---

## Command reference

- `node index.js scan [dir]` — scan a repo, print detected JSON (`-o file` to save).
- `node index.js scaffold [dir]` — generate the context pack.
  - `-o dir`      output directory (default `.agent`)
  - `-t target`   layout: `agents-md` (default) | `kiro` | `claude`
  - `--offline`   skip the LLM, deterministic output
  - `-m model`    Gemini model for the prose pass
- `node index.js add-skill <skill> [dir]` — add a named skill to a pack.
- `node index.js init [dir]` — the original single-file `AGENTS.md` generator.
- `node index.js --help` — full help (works on any subcommand).

---

## What's honest about this (so results make sense)

- **Grounded, not guessed.** Every file/skill traces to evidence. If a field is
  unknown, Razor omits it rather than inventing it.
- **Right-sized by design.** Fewer files for small/simple repos is correct
  behavior, not a bug.
- **Detectors cover Node, Python, and common build systems** (Bazel, Cargo, Go,
  Maven, Gradle, CMake, Make). A repo outside these may be labeled thinly — e.g.
  a C/C++/Bazel repo is detected via its build system, but its internals aren't
  deeply understood. That's a known limitation.
- **Monorepos are partial** — single-app repos give the fullest output.
- **Razor is a generator, not a runtime.** It writes the context + the routing
  manifest; the actual loading/routing is done by whatever coding agent consumes
  the pack.
- **Token savings not yet measured.** The pack is designed for right-sized,
  on-demand context, but the baseline-vs-Razor measurement is the next step, not
  a claim we're making yet.

---

## Troubleshooting

- `command not found` for a package → wrong folder; `cd` into `razor-cli` (the
  one with `index.js`).
- "Model busy" / 503 → re-run (it retries 3x), or add `--offline`.
- "API key not valid" → `.env` still has the placeholder; put a real key or use
  `--offline`.
- Empty / tiny pack → the repo genuinely has little to detect, or it's outside
  the supported stacks (see limitations). Try `node index.js scan <dir>` to see
  what was found.
- `-o` is a **directory** for `scaffold`/`add-skill` (it's a file for `init`).
