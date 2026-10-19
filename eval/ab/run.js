#!/usr/bin/env node
// Razor A/B eval harness — runs each task twice in parallel (naive repo vs repo +
// Razor context pack) with headless Claude Code, grades the end state with
// hidden acceptance tests, and records tokens / context / time per run.
//
//   node eval/ab/run.js validate [--tasks t1,t2]
//   node eval/ab/run.js run --name pilot [--tasks ...] [--reps 1] [--model claude-opus-5-5]
//   node eval/ab/run.js report --name pilot
//
// See eval/ab/README.md and eval/ab/EVAL_SPEC.md.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Command } = require('commander');
const { AB_DIR, RAZOR_ROOT, WORK_DIR, readJSON, writeJSON, appendJSONL, readJSONL, sh, gitRev, claudeVersion, rmrf, log } = require('./lib/util');
const { loadTasks, prepareWorkspace, teardownWorkspace, razorPackDir, listPack } = require('./lib/workspace');
const { gradeWorkspace, captureDiff } = require('./lib/grade');
const { runAgent } = require('./lib/agent');
const { computeMetrics, toTurns, MetricsError } = require('./lib/metrics');
const { writeSummary, ARMS } = require('./lib/report');

const SLOTS = { validate: 0, naive: 1, razor: 2 };

// ---------------------------------------------------------------- validate

// fingerprint of everything that defines a task, so a stale validation is redone
function taskFingerprint(task) {
  const h = crypto.createHash('sha256');
  h.update(task.repoConfig.commit);
  for (const f of fs.readdirSync(task.dir, { recursive: true }).sort()) {
    const p = path.join(task.dir, String(f));
    if (fs.statSync(p).isFile()) h.update(String(f)).update(fs.readFileSync(p));
  }
  h.update(fs.readFileSync(path.join(task.repoConfig.dir, task.repoConfig.hooks || 'repo.json')));
  return h.digest('hex').slice(0, 16);
}

const validationFile = (task) => path.join(WORK_DIR, 'validated', `${task.id}.json`);

function loadValidation(task) {
  const f = validationFile(task);
  if (!fs.existsSync(f)) return null;
  const v = readJSON(f);
  return v.fingerprint === taskFingerprint(task) && v.ok ? v : null;
}

// static leak checks: a hidden AC's test title or its distinctive inputs must
// not appear in the prompt, and the installed dependencies must not carry
// another copy of the project itself (e.g. a plugin depending on a newer
// release that already contains the fix)
function leakProblems(task) {
  const problems = [];
  const prompt = task.promptText.toLowerCase();
  for (const c of task.acceptance.filter((a) => visibilityOf(a) === 'hidden')) {
    if (c.title && prompt.includes(c.title.toLowerCase())) problems.push(`leak: hidden ${c.id} test title appears in the prompt`);
    for (const s of c.leak_strings || []) {
      if (prompt.includes(s.toLowerCase())) problems.push(`leak: hidden ${c.id} input "${s}" appears in the prompt`);
    }
  }
  const { ensureBase } = require('./lib/workspace');
  const base = ensureBase(task.repoConfig, task.commit || task.repoConfig.commit);
  const pkgFile = path.join(base, 'package.json');
  if (fs.existsSync(pkgFile)) {
    const name = readJSON(pkgFile).name;
    const copies = sh('find', ['node_modules', '-path', `*/node_modules/${name}/package.json`], { cwd: base, allowFail: true }).stdout.split('\n').filter(Boolean);
    for (const c of copies) problems.push(`leak: dependency tree contains another copy of ${name} (${c})`);
  }
  return problems;
}

async function validateTask(task) {
  const slot = SLOTS.validate;
  const out = path.join(WORK_DIR, 'validate', task.id);
  const problems = [];
  const report = { task: task.id, fingerprint: taskFingerprint(task), checked_at: new Date().toISOString() };

  for (const mode of ['oracle', 'null']) {
    const ws = path.join(out, mode);
    log(`validate ${task.id}: ${mode} — preparing workspace`);
    const { base } = prepareWorkspace(task, mode, ws, slot);
    try {
      log(`validate ${task.id}: ${mode} — running tests`);
      const g = await gradeWorkspace(task, ws, base, { outDir: out, slot });
      report[mode] = { ac: g.ac_detail, test_summary: g.test_summary };
      for (const c of task.acceptance) {
        const status = g.ac_detail[c.id];
        const want = mode === 'oracle' ? 'pass' : c.null_expect || 'fail';
        const ok = want === 'pass' ? status === 'passed' : status === 'failed';
        if (!ok) problems.push(`${mode}: ${c.id} expected ${want}, got ${status}`);
      }
      if (mode === 'oracle') report.oracle_passing = g.passing_keys;
    } finally {
      teardownWorkspace(task, ws, slot);
    }
  }
  // decoys: plausible fixes of only what the prompt states. Each must land
  // where its `expect` says, which proves the hidden ACs actually discriminate.
  for (const d of task.decoys || []) {
    const ws = path.join(out, 'decoy');
    log(`validate ${task.id}: decoy ${d.patch} — preparing workspace`);
    const { base } = prepareWorkspace(task, 'null', ws, slot);
    try {
      sh('git', ['apply', path.join(task.dir, d.patch)], { cwd: ws });
      const g = await gradeWorkspace(task, ws, base, { outDir: out, slot });
      (report.decoys = report.decoys || {})[d.patch] = g.ac_detail;
      for (const [id, want] of Object.entries(d.expect)) {
        const status = g.ac_detail[id];
        if ((want === 'pass') !== (status === 'passed')) problems.push(`decoy ${d.patch}: ${id} expected ${want}, got ${status}`);
      }
    } finally {
      teardownWorkspace(task, ws, slot);
    }
  }
  problems.push(...leakProblems(task));
  report.ok = problems.length === 0;
  report.problems = problems;
  writeJSON(validationFile(task), report);
  return report;
}

async function cmdValidate(opts) {
  const tasks = loadTasks(opts.tasks);
  let allOk = true;
  for (const task of tasks) {
    const r = await validateTask(task);
    allOk = allOk && r.ok;
    const fmt = (m) => task.acceptance.map((c) => `${c.id}:${r[m].ac[c.id]}`).join(' ');
    console.log(`\n${r.ok ? 'OK  ' : 'FAIL'} ${task.id}`);
    console.log(`     oracle → ${fmt('oracle')}  (${r.oracle.test_summary.passed}/${r.oracle.test_summary.total} tests pass)`);
    console.log(`     null   → ${fmt('null')}`);
    for (const [d, ac] of Object.entries(r.decoys || {})) console.log(`     decoy ${d} → ${task.acceptance.map((c) => `${c.id}:${ac[c.id]}`).join(' ')}`);
    for (const p of r.problems) console.log(`     ✗ ${p}`);
  }
  if (!allOk) process.exitCode = 1;
}

// ---------------------------------------------------------------- run

const STATE = {
  metrics: [
    { id: 'pass', label: 'Pass', kind: 'binary' },
    { id: 'AC1', label: 'AC1', kind: 'binary' },
    { id: 'AC2', label: 'AC2', kind: 'binary' },
    { id: 'AC3', label: 'AC3', kind: 'binary' },
    { id: 'AC4', label: 'AC4', kind: 'binary' },
  ],
  perf_fields: [
    { id: 'total_tokens', label: 'Tokens' },
    { id: 'peak_context', label: 'Peak ctx' },
    { id: 'duration_min', label: 'Time', unit: 'min' },
    { id: 'claude_cost_usd', label: 'Cost', unit: '$' },
    { id: 'tool_calls', label: 'Tool calls' },
    { id: 'recorrection_loops', label: 'Loops' },
  ],
};

// per repo: which pack the razor arm gets. A pinned pack is identified by its
// content, so editing it can't silently mix two packs in one run.
function razorPackInfo(tasks) {
  const out = {};
  for (const { repoConfig: repo } of tasks) {
    if (out[repo.name]) continue;
    const dir = razorPackDir(repo);
    if (!dir) {
      out[repo.name] = { source: 'generated', command: 'RAZOR_NO_LLM=1 razor scaffold --target claude' };
      continue;
    }
    const files = listPack(dir);
    const h = crypto.createHash('sha256');
    for (const f of files) h.update(f).update(fs.readFileSync(path.join(dir, f)));
    out[repo.name] = { source: repo.razor_pack, fingerprint: h.digest('hex').slice(0, 16), files: files.length };
  }
  return out;
}

function initFlow(flow, opts, tasks) {
  const metaFile = path.join(flow, 'meta.json');
  const meta = {
    model: opts.model,
    effort: opts.effort || null,
    reps: opts.reps,
    timeout_min: opts.timeoutMin,
    max_budget_usd: opts.maxBudgetUsd,
    razor_hint: razorHintText(opts),
    verify_instruction: verifyInstructionText(opts),
    claude_code_version: claudeVersion(),
    razor_commit: gitRev(RAZOR_ROOT),
    razor_pack: razorPackInfo(tasks),
    tasks: tasks.map((t) => ({ id: t.id, fingerprint: taskFingerprint(t) })),
    started_at: new Date().toISOString(),
  };
  if (fs.existsSync(metaFile)) {
    const prev = readJSON(metaFile);
    for (const k of ['model', 'effort', 'claude_code_version', 'razor_hint', 'verify_instruction']) {
      if ((prev[k] ?? null) !== (meta[k] ?? null) && !opts.force) {
        throw new Error(`run "${path.basename(flow)}" was started with ${k}=${prev[k]}, now ${meta[k]}. Use a new --name, or --force to mix.`);
      }
    }
    // runs from before razor_pack was recorded used `scaffold --offline`; a
    // repo absent from an earlier invocation (other --tasks) is just added
    for (const [name, pack] of Object.entries(meta.razor_pack)) {
      const before = prev.razor_pack ? prev.razor_pack[name] : 'scaffold --offline (not recorded)';
      if (before !== undefined && JSON.stringify(before) !== JSON.stringify(pack) && !opts.force) {
        throw new Error(`run "${path.basename(flow)}" gave ${name}'s razor arm the pack ${JSON.stringify(before)}, now ${JSON.stringify(pack)}. Use a new --name, or --force to mix.`);
      }
    }
    meta.razor_pack = { ...(prev.razor_pack || {}), ...meta.razor_pack };
    meta.started_at = prev.started_at;
    meta.reps = Math.max(prev.reps || 0, opts.reps);
  }
  writeJSON(metaFile, meta);
  writeJSON(path.join(flow, '_state.json'), STATE);
  fs.mkdirSync(path.join(flow, 'v1'), { recursive: true });
  const packLines = Object.entries(meta.razor_pack).map(([name, p]) =>
    p.source === 'generated'
      ? `- ${name}: generated per workspace with \`${p.command}\``
      : `- ${name}: pinned pack \`${p.source}\` (${p.files} files, fingerprint ${p.fingerprint}), copied into the repo root`);
  fs.writeFileSync(
    path.join(flow, 'v1', 'change.md'),
    `Razor context pack added to the workspace (AGENTS.md, docs, .claude/skills, skills.index.json, scripts/check.sh):\n\n${packLines.join('\n')}\n\n\`baseline\` = naive arm (repo only). Everything else identical.\n`,
  );
  return meta;
}

// --razor-hint <file> (default eval/ab/razor-hint.md) or --no-razor-hint
function razorHintText(opts) {
  if (opts.razorHint === false) return null;
  const file = path.resolve(opts.razorHint || path.join(AB_DIR, 'razor-hint.md'));
  return fs.readFileSync(file, 'utf8').trim();
}

// --verify-instruction <file> (default eval/ab/verify-instruction.md) or --no-verify-instruction
function verifyInstructionText(opts) {
  if (opts.verifyInstruction === false) return null;
  const file = path.resolve(opts.verifyInstruction || path.join(AB_DIR, 'verify-instruction.md'));
  return fs.readFileSync(file, 'utf8').trim();
}

// both arms: task prompt + verification instruction; razor adds its hint
function buildPrompt(task, arm, meta) {
  const parts = [task.promptText];
  if (meta.verify_instruction) parts.push(meta.verify_instruction);
  if (arm === 'razor' && meta.razor_hint) parts.push(meta.razor_hint);
  return parts.join('\n\n');
}

// an account usage limit fails every later agent at once, so the run stops
// there; resuming the same --name later re-runs whatever has no result yet
const USAGE_LIMIT = /usage[_ ]limit|session limit|API error 429/i;
let usageLimitHit = null;

const variantOf = (arm) => ARMS.find((a) => a.arm === arm).variant;

function done(flow, arm, taskId, rep) {
  return readJSONL(path.join(flow, variantOf(arm), 'results.jsonl')).some((r) => r.prompt_id === taskId && r.rep === rep);
}

async function runArm(ctx, arm, prepared) {
  const { task, rep, flow, opts, validation } = ctx;
  const vdir = path.join(flow, variantOf(arm));
  const stem = `${task.id}_rep${rep}`;
  const { ws, base, packFiles } = prepared;

  const prompt = buildPrompt(task, arm, ctx.meta);
  log(`${task.id} rep${rep} ${arm}: agent started`);
  const agent = await runAgent({
    ws,
    repo: task.repoConfig,
    prompt,
    model: opts.model,
    effort: opts.effort,
    timeoutMs: opts.timeoutMin * 60_000,
    maxBudgetUsd: opts.maxBudgetUsd,
    extraArgs: opts.claudeArg || [],
    traceFile: path.join(vdir, 'traces', `${stem}.stream.jsonl`),
  });
  log(`${task.id} rep${rep} ${arm}: agent finished in ${(agent.wallMs / 60000).toFixed(1)} min${agent.timedOut ? ' (TIMEOUT)' : ''}`);
  fs.writeFileSync(path.join(vdir, 'traces', `${stem}.json`), JSON.stringify(toTurns(agent.events, prompt), null, 1));

  const errorRow = (failureClass, message, extra = {}) =>
    appendJSONL(path.join(vdir, 'errors.jsonl'), {
      prompt_id: task.id, rep, arm, failure_class: failureClass, message, wall_min: +(agent.wallMs / 60000).toFixed(2), at: new Date().toISOString(), ...extra,
    });

  if (agent.timedOut) {
    errorRow('timeout', `agent exceeded ${opts.timeoutMin} min wall-clock ceiling`);
    return;
  }
  let metrics;
  try {
    metrics = computeMetrics(agent.events, agent.arrivals, { ws, packFiles, requestedModel: opts.model, firstChangeMs: agent.firstChangeMs });
  } catch (e) {
    if (e instanceof MetricsError) {
      errorRow('harness_or_serving', e.message, { exit_code: agent.exitCode });
      if (USAGE_LIMIT.test(e.message)) usageLimitHit = e.message;
      return;
    }
    throw e;
  }

  // save the agent's diff before grading, so a grader failure can be re-graded
  // later (`regrade`) without re-running the agent
  const { diff } = captureDiff(ws);
  fs.mkdirSync(path.join(vdir, 'diffs'), { recursive: true });
  fs.writeFileSync(path.join(vdir, 'diffs', `${stem}.patch`), diff);

  const runMeta = {
    wall_min: +(agent.wallMs / 60000).toFixed(2),
    exit_code: agent.exitCode,
    claude_args: agent.args,
    pack_files: packFiles,
  };
  await gradeAndRecord({ task, rep, arm, prompt, vdir, ws, base, validation, metrics, runMeta, onError: (cls, msg) => errorRow(cls, msg, { metrics, run_meta: runMeta, regradable: true }) });
}

// shown ACs are stated in the prompt; hidden ones come from the real fix's
// tests and are never shown to the agent (see EVAL_SPEC.md §10)
const visibilityOf = (c) => c.visibility || 'shown';
function acSplit(task, grade) {
  const out = {};
  for (const vis of ['shown', 'hidden']) {
    const ids = task.acceptance.filter((c) => visibilityOf(c) === vis).map((c) => c.id);
    if (ids.length) out[vis] = { passed: ids.filter((id) => grade[id] === 1).length, total: ids.length, ids };
  }
  return out;
}

async function gradeAndRecord({ task, rep, arm, prompt, vdir, ws, base, validation, metrics, runMeta, onError }) {
  log(`${task.id} rep${rep} ${arm}: grading`);
  let g;
  try {
    g = await gradeWorkspace(task, ws, base, { oraclePassing: validation.oracle_passing, outDir: path.join(vdir, 'grading'), slot: SLOTS[arm] });
  } catch (e) {
    onError(e.failureClass || 'grader_error', e.message);
    return null;
  }
  const row = {
    prompt_id: task.id,
    rep,
    arm,
    prompt: prompt || task.promptText,
    tags: [...task.tags, arm],
    status: 'ok',
    stop_reason: metrics.result_subtype,
    model: metrics.model,
    grade: g.grade,
    ac_detail: g.ac_detail,
    ac_split: acSplit(task, g.grade),
    regressions: g.regressions,
    regressed_tests: g.regressed_tests,
    no_op: g.no_op,
    changed_files: g.changed_files,
    test_summary: g.test_summary,
    usage: metrics.usage,
    latency_s: +(metrics.time.duration_min * 60).toFixed(1),
    tool_calls: metrics.tool_calls.total,
    total_tokens: metrics.tokens.total,
    peak_context: metrics.context.peak,
    duration_min: metrics.time.duration_min,
    claude_cost_usd: metrics.cost_usd,
    recorrection_loops: metrics.recorrection.loops,
    metrics,
    meta: { ...runMeta, finished_at: new Date().toISOString() },
  };
  appendJSONL(path.join(vdir, 'results.jsonl'), row);
  log(`${task.id} rep${rep} ${arm}: ${g.grade.pass ? 'PASS' : 'FAIL'} · ${metrics.tokens.total.toLocaleString('en-US')} tokens · peak ctx ${metrics.context.peak.toLocaleString('en-US')} · ${metrics.time.duration_min} min`);
  return row;
}

// re-grade attempts whose agent run finished but grading failed: rebuild the
// workspace, apply the saved diff, grade. No model calls.
async function cmdRegrade(opts) {
  const flow = path.join(AB_DIR, 'results', opts.name);
  const meta = readJSON(path.join(flow, 'meta.json'));
  for (const { arm, variant } of ARMS) {
    const vdir = path.join(flow, variant);
    const scored = new Set(readJSONL(path.join(vdir, 'results.jsonl')).map((r) => `${r.prompt_id}#${r.rep}`));
    const pending = readJSONL(path.join(vdir, 'errors.jsonl')).filter((e) => e.regradable && !scored.has(`${e.prompt_id}#${e.rep}`));
    const seen = new Set();
    for (const e of pending) {
      const k = `${e.prompt_id}#${e.rep}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const [task] = loadTasks([e.prompt_id]);
      let validation = loadValidation(task);
      if (!validation) validation = await validateTask(task);
      const ws = path.join(WORK_DIR, 'regrade', opts.name, `${e.prompt_id}_rep${e.rep}_${arm}`);
      log(`${e.prompt_id} rep${e.rep} ${arm}: rebuilding workspace from saved diff`);
      const prepared = prepareWorkspace(task, arm, ws, SLOTS[arm]);
      try {
        const patch = path.join(vdir, 'diffs', `${e.prompt_id}_rep${e.rep}.patch`);
        if (fs.readFileSync(patch, 'utf8').trim()) sh('git', ['apply', '--binary', patch], { cwd: ws });
        const metrics = computeMetricsFromTrace(vdir, e.prompt_id, e.rep, prepared.packFiles, meta.model);
        await gradeAndRecord({
          task, rep: e.rep, arm, vdir, ws, base: prepared.base, validation, metrics,
          prompt: buildPrompt(task, arm, meta),
          runMeta: { ...(e.run_meta || {}), pack_files: prepared.packFiles, regraded_at: new Date().toISOString() },
          onError: (cls, msg) => log(`${e.prompt_id} rep${e.rep} ${arm}: regrade failed again (${cls}): ${msg}`),
        });
      } finally {
        teardownWorkspace(task, ws, SLOTS[arm]);
      }
    }
  }
  console.log(writeSummary(flow));
}

function computeMetricsFromTrace(vdir, taskId, rep, packFiles, model) {
  const stem = path.join(vdir, 'traces', `${taskId}_rep${rep}.stream`);
  const events = fs.readFileSync(stem + '.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const timing = fs.existsSync(stem + '.timing.json') ? readJSON(stem + '.timing.json') : { arrivals: [], first_change_ms: null };
  return computeMetrics(events, timing.arrivals, { packFiles, requestedModel: model, firstChangeMs: timing.first_change_ms });
}

async function cmdRun(opts) {
  if (!opts.name) throw new Error('--name is required (results go to eval/ab/results/<name>/)');
  const tasks = loadTasks(opts.tasks);
  const arms = opts.arms;
  const flow = path.join(AB_DIR, 'results', opts.name);
  const meta = initFlow(flow, opts, tasks);
  log(`run "${opts.name}": ${tasks.length} task(s) × ${opts.reps} rep(s) × [${arms.join(', ')}] on ${opts.model} (Claude Code ${meta.claude_code_version})`);

  for (const task of tasks) {
    let validation = loadValidation(task);
    if (!validation) {
      log(`${task.id}: no current validation — validating first`);
      validation = await validateTask(task);
      if (!validation.ok) {
        log(`${task.id}: VALIDATION FAILED, skipping: ${validation.problems.join('; ')}`);
        continue;
      }
    }
    for (let rep = 0; rep < opts.reps; rep++) {
      const todo = arms.filter((arm) => !done(flow, arm, task.id, rep));
      if (!todo.length) {
        log(`${task.id} rep${rep}: already done, skipping`);
        continue;
      }
      const runRoot = path.join(WORK_DIR, 'runs', opts.name, `${task.id}_rep${rep}_${Date.now()}`);
      const prepared = {};
      try {
        for (const arm of todo) {
          log(`${task.id} rep${rep} ${arm}: preparing workspace`);
          prepared[arm] = prepareWorkspace(task, arm, path.join(runRoot, arm), SLOTS[arm]);
        }
        const ctx = { task, rep, flow, opts, validation, meta };
        await Promise.all(todo.map((arm) => runArm(ctx, arm, prepared[arm])));
      } finally {
        for (const arm of Object.keys(prepared)) teardownWorkspace(task, prepared[arm].ws, SLOTS[arm], { keep: opts.keepWorkspaces });
        if (!opts.keepWorkspaces) rmrf(runRoot);
      }
      if (usageLimitHit) {
        writeSummary(flow);
        throw new Error(`stopping: ${usageLimitHit}. Resume later with the same --name.`);
      }
    }
  }
  const md = writeSummary(flow);
  console.log('\n' + md);
  log(`summary: ${path.relative(process.cwd(), path.join(flow, 'summary.md'))}`);
}

// recompute metrics for every scored row from its saved trace (grades are kept);
// use after a metrics-definition change so old runs stay comparable
function cmdRescore(opts) {
  const flow = path.join(AB_DIR, 'results', opts.name);
  const meta = readJSON(path.join(flow, 'meta.json'));
  for (const { variant } of ARMS) {
    const file = path.join(flow, variant, 'results.jsonl');
    const rows = readJSONL(file);
    if (!rows.length) continue;
    const out = rows.map((row) => {
      const metrics = computeMetricsFromTrace(path.join(flow, variant), row.prompt_id, row.rep, row.meta.pack_files || [], meta.model);
      const stem = path.join(flow, variant, 'traces', `${row.prompt_id}_rep${row.rep}.stream`);
      return {
        ...row,
        usage: metrics.usage,
        latency_s: +(metrics.time.duration_min * 60).toFixed(1),
        tool_calls: metrics.tool_calls.total,
        total_tokens: metrics.tokens.total,
        peak_context: metrics.context.peak,
        duration_min: metrics.time.duration_min,
        claude_cost_usd: metrics.cost_usd,
        recorrection_loops: metrics.recorrection.loops,
        metrics,
        meta: { ...row.meta, rescored_at: new Date().toISOString(), timing: fs.existsSync(stem + '.timing.json') },
      };
    });
    fs.writeFileSync(file, out.map((r) => JSON.stringify(r)).join('\n') + '\n');
    log(`rescored ${out.length} row(s) in ${variant}`);
  }
  console.log(writeSummary(flow));
}

function cmdReport(opts) {
  if (!opts.name) throw new Error('--name is required');
  const flow = path.join(AB_DIR, 'results', opts.name);
  if (!fs.existsSync(flow)) throw new Error(`no results at ${flow}`);
  console.log(writeSummary(flow));
}

// ---------------------------------------------------------------- cli

const list = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);
const collect = (v, prev) => [...(prev || []), v];

const program = new Command();
program.name('razor-ab').description('Razor A/B eval: naive vs Razor context pack on real coding tasks');

program
  .command('validate')
  .description('oracle/null check every task (no model calls)')
  .option('--tasks <ids>', 'comma-separated task ids (default: all)', list)
  .action((o) => cmdValidate(o).catch(fail));

program
  .command('run')
  .description('run tasks with both arms in parallel, grade, and summarize')
  .requiredOption('--name <name>', 'run name; results go to eval/ab/results/<name>/ (resumable)')
  .option('--tasks <ids>', 'comma-separated task ids (default: all)', list)
  .option('--reps <n>', 'runs per arm per task', (v) => parseInt(v, 10), 1)
  .option('--arms <arms>', 'arms to run', list, ['naive', 'razor'])
  .option('--model <id>', 'Claude model for both arms', 'claude-opus-5-5')
  .option('--effort <level>', 'Claude Code effort for both arms (low|medium|high|xhigh|max)', 'medium')
  .option('--timeout-min <n>', 'hard wall-clock ceiling per agent run', (v) => parseFloat(v), 20)
  .option('--max-budget-usd <n>', 'per-agent spend cap passed to claude', (v) => parseFloat(v), 10)
  .option('--claude-arg <arg>', 'extra arg passed to claude (repeatable)', collect)
  .option('--razor-hint <file>', 'text appended to the razor arm\'s prompt (default eval/ab/razor-hint.md)')
  .option('--no-razor-hint', 'give the razor arm the same prompt as naive')
  .option('--verify-instruction <file>', 'verification instruction appended to both arms (default eval/ab/verify-instruction.md)')
  .option('--no-verify-instruction', 'no verification instruction')
  .option('--keep-workspaces', 'keep workspaces after grading (for debugging)')
  .option('--force', 'allow resuming a run with a different model/effort/Claude Code version')
  .action((o) => cmdRun(o).catch(fail));

program
  .command('regrade')
  .description('re-grade attempts whose grading failed, from their saved diffs (no model calls)')
  .requiredOption('--name <name>', 'run name')
  .action((o) => cmdRegrade(o).catch(fail));

program
  .command('rescore')
  .description('recompute metrics from saved traces (keeps grades), then rebuild summary.md')
  .requiredOption('--name <name>', 'run name')
  .action((o) => {
    try { cmdRescore(o); } catch (e) { fail(e); }
  });

program
  .command('report')
  .description('rebuild summary.md for a run')
  .requiredOption('--name <name>', 'run name')
  .action((o) => {
    try { cmdReport(o); } catch (e) { fail(e); }
  });

function fail(e) {
  console.error(`error: ${e.message || e}`);
  process.exit(1);
}

program.parse();
