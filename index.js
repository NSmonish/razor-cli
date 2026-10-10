#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const chalk = require('chalk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { scanRepo } = require('./scanner');
const { detectWorkflows } = require('./workflows');
const { planScaffold } = require('./planner');
const { emitScaffold, buildDocDrafts } = require('./emitter');
const { enrichDocs } = require('./enricher');

// strict prompt — keep the model terse, no fluff, raw markdown only
function buildPrompt(repoData) {
  return `You are an expert software architect writing an AGENTS.md file — a guide that tells AI coding agents how to work in THIS specific repository so they don't make mistakes or hallucinate conventions.

I'll give you a JSON object from a repo scanner. It includes an "evidence" map showing which file proved each fact. Write a clear, useful AGENTS.md with these sections (skip any section where you have no grounded data — never invent):

1. "## Overview" — one or two lines on what the project is (use readme_summary if present) and its stack (language/framework).
2. "## Tech Stack" — framework, testing tool, ORM, package manager. Only list what's known.
3. "## Project Structure" — bullet the key directories from "structure" and what each holds.
4. "## Commands" — the build/dev/test/lint commands from "scripts" (show the actual command). If none, say how to run based on entry_point.
5. "## Guardrails for Agents" — strict rules grounded in the data: use the detected testing framework for tests, use the detected ORM (no raw SQL), put routes in the routes folder, respect the config files, etc.
6. "## Environment" — list env var NAMES from env_vars if present (names only).

Rules: Only state facts present in the JSON. If a field is "unknown" or empty, omit it rather than guessing. Be concrete and concise. Output ONLY raw markdown, no pleasantries.

Repo Data:
${repoData}`;
}

// fallback so the pipeline works with no API key / no network.
// renders the rich scan fields into a real AGENTS.md so it's a faithful preview.
function mockAgentsMd(repoData) {
  let d = {};
  try { d = JSON.parse(repoData); } catch (_) {}
  const known = (v) => v && v !== 'unknown';
  const lines = [];

  lines.push('# AGENTS.md');
  lines.push('');
  lines.push('> generated offline (no GEMINI_API_KEY / API unavailable) — grounded in the repo scan');
  lines.push('');

  lines.push('## Overview');
  if (d.readme_summary) lines.push(`- ${d.readme_summary}`);
  if (known(d.language) || known(d.framework)) {
    lines.push(`- Stack: ${[d.language, d.framework].filter(known).join(' / ')}`);
  }
  lines.push('');

  lines.push('## Tech Stack');
  if (known(d.framework)) lines.push(`- Framework: ${d.framework}`);
  if (known(d.testing)) lines.push(`- Testing: ${d.testing}`);
  if (known(d.orm)) lines.push(`- ORM: ${d.orm}`);
  if (known(d.package_manager)) lines.push(`- Package manager: ${d.package_manager}`);
  if (known(d.entry_point)) lines.push(`- Entry point: \`${d.entry_point}\``);
  lines.push('');

  if (d.structure && d.structure.length) {
    lines.push('## Project Structure');
    for (const s of d.structure) lines.push(`- ${s}`);
    lines.push('');
  }

  if (d.scripts && Object.keys(d.scripts).length) {
    lines.push('## Commands');
    for (const [k, v] of Object.entries(d.scripts)) lines.push(`- \`${k}\`: \`${v}\``);
    lines.push('');
  }

  lines.push('## Guardrails for Agents');
  if (known(d.testing)) lines.push(`- Write all tests with ${d.testing}. Do not introduce other test runners.`);
  if (known(d.orm)) lines.push(`- Use ${d.orm} for all database access. Do not write raw SQL.`);
  if (known(d.routes_folder)) lines.push(`- Put route handlers in \`${d.routes_folder}\`.`);
  if (d.config_files && d.config_files.length) {
    lines.push(`- Respect existing config: ${d.config_files.map((c) => '`' + c + '`').join(', ')}.`);
  }
  if (lines[lines.length - 1] === '## Guardrails for Agents') lines.push('- (no specific guardrails detected)');
  lines.push('');

  if (d.env_vars && d.env_vars.length) {
    lines.push('## Environment');
    lines.push(`- Required env vars: ${d.env_vars.map((e) => '`' + e + '`').join(', ')}`);
    lines.push('');
  }

  return lines.join('\n');
}

function runCli() {
  program
    .name('razor')
    .description('Razor — generate repo-specific AGENTS.md context for coding agents')
    .version('0.1.0');

  program
    .command('scan')
    .description('Scan a repository and print the detected data as JSON')
    .argument('[dir]', 'directory to scan', '.')
    .option('-o, --output <file>', 'write JSON to a file instead of stdout')
    .action((dir, opts) => {
      try {
        const data = scanRepo(dir);
        const json = JSON.stringify(data, null, 2);
        if (opts.output) {
          fs.writeFileSync(opts.output, json);
          console.log(chalk.green(`Scan written to ${opts.output}`));
        } else {
          console.log(json);
        }
      } catch (e) {
        console.error(chalk.red('Scan failed:'), e.message || e);
        process.exit(1);
      }
    });

  program
    .command('init')
    .description('Scan the repo (or read a JSON file) and generate AGENTS.md')
    .argument('[dir]', 'directory to scan when no --input given', '.')
    .option('-i, --input <file>', 'repo data JSON (skip scanning, use this file)')
    .option('-o, --output <file>', 'output file', 'AGENTS.md')
    .option('-m, --model <name>', 'Gemini model to use', 'gemini-3.5-flash-lite')
    .action(async (dir, opts) => {
      console.log(chalk.blue('Razor is analyzing your repository...'));

      // 1. get repo data — either from a provided JSON file, or by scanning the dir
      let repoData;
      if (opts.input) {
        const inputPath = path.resolve(process.cwd(), opts.input);
        if (!fs.existsSync(inputPath)) {
          console.error(chalk.red(`Error: input file not found: ${opts.input}`));
          process.exit(1);
        }
        repoData = fs.readFileSync(inputPath, 'utf8');
      } else {
        try {
          const scanned = scanRepo(dir);
          console.log(chalk.gray(`Detected: ${scanned.framework} / ${scanned.testing} / ${scanned.orm}`));
          repoData = JSON.stringify(scanned, null, 2);
        } catch (e) {
          console.error(chalk.red('Scan failed:'), e.message || e);
          process.exit(1);
        }
      }

      // 2. no (or placeholder) key -> write the mock so the pipeline is testable offline
      const apiKey = process.env.GEMINI_API_KEY;
      const hasRealKey = apiKey && apiKey !== 'your_actual_key_here';
      if (!hasRealKey) {
        console.log(chalk.yellow('No GEMINI_API_KEY found — writing placeholder AGENTS.md.'));
        fs.writeFileSync(opts.output, mockAgentsMd(repoData));
        console.log(chalk.green(`Success! ${opts.output} created (placeholder).`));
        return;
      }

      // 3. hit the model (with a couple retries for transient 503s)
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // flash-lite is cheap/fast and reliable on the free tier; the bigger
        // flash models have been 503-ing and pro is blocked on free tier
        const modelName = process.env.GEMINI_MODEL || opts.model || 'gemini-3.5-flash-lite';
        const model = genAI.getGenerativeModel({ model: modelName });

        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        let responseText;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const result = await model.generateContent(buildPrompt(repoData));
            responseText = result.response.text();
            break;
          } catch (e) {
            const msg = e.message || '';
            // only retry on transient overload / rate limits
            if (/\b(503|429)\b/.test(msg) && attempt < 3) {
              console.log(chalk.yellow(`Model busy (attempt ${attempt}/3), retrying...`));
              await sleep(attempt * 2000);
              continue;
            }
            throw e;
          }
        }

        fs.writeFileSync(opts.output, responseText);
        console.log(chalk.green(`Success! Highly optimized ${opts.output} created.`));
      } catch (error) {
        console.error(chalk.red('Error generating context:'), error.message || error);
        process.exit(1);
      }
    });

  program
    .command('scaffold')
    .description('Scan a repo and generate a full agent context pack (entry + docs + skills + check script)')
    .argument('[dir]', 'directory to scan', '.')
    .option('-o, --output <dir>', 'output directory for the context pack', '.agent')
    .option('-t, --target <tool>', 'target format: agents-md | kiro | claude', 'agents-md')
    .option('--offline', 'skip the LLM enrichment pass (deterministic output only)')
    .option('-m, --model <name>', 'Gemini model for the enrichment pass', 'gemini-3.5-flash-lite')
    .action(async (dir, opts) => {
      console.log(chalk.blue('Razor is scanning the repository...'));
      try {
        const scan = scanRepo(dir);
        const flows = detectWorkflows(dir);
        const plan = planScaffold(scan, flows);

        console.log(chalk.gray(`Detected: ${scan.framework} / ${scan.testing} / ${scan.orm}`));
        console.log(chalk.gray(`Plan size: ${plan.size} (docs: ${plan.docs.length}, skills: ${plan.skills.length})`));

        // build deterministic drafts first — these are the grounded source of truth
        let docs = buildDocDrafts(scan, flows, plan);

        // optional LLM pass: rewrite prose docs for clarity (facts preserved).
        // falls back to drafts if --offline, no key, or the call fails.
        if (!opts.offline) {
          const scanJson = JSON.stringify(scan, null, 2);
          const res = await enrichDocs(docs, scanJson, { model: opts.model });
          docs = res.docs;
          if (res.usedLLM) console.log(chalk.gray('Enriched prose docs with the LLM.'));
          else console.log(chalk.yellow('No LLM enrichment (no key or offline) — using grounded drafts.'));
        } else {
          console.log(chalk.gray('Offline mode — deterministic output only.'));
        }

        // place files where the chosen target tool expects them
        const result = emitScaffold(scan, flows, plan, opts.output, { target: opts.target, docs });
        const written = result.written;

        console.log(chalk.green(`\nContext pack written to ${opts.output}/ (${written.length} files):`));
        for (const f of written) console.log(chalk.gray(`  ${f}`));
        console.log(chalk.gray(`\n${result.note}`));
      } catch (e) {
        console.error(chalk.red('Scaffold failed:'), e.message || e);
        process.exit(1);
      }
    });

  program.parse(process.argv);
}

// only run the CLI when invoked directly, not when required by tests
if (require.main === module) {
  runCli();
}

module.exports = { buildPrompt, mockAgentsMd, scanRepo, planScaffold, detectWorkflows };
