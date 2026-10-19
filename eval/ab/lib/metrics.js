// Turns a Claude Code stream-json event list into the eval's per-run metrics.
// Every number comes from fields Claude Code reported; nothing is estimated.
// Definitions match EVAL_SPEC.md §4.
const path = require('path');

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
// Does a Bash command *run* tests / lint / the Razor check script (not just
// mention one, e.g. `cat scripts/check.sh` or a heredoc writing a test file)?
// Heredoc bodies are dropped, the command is split into segments, and a segment
// counts when it starts with a runner (after optional VAR=value prefixes).
const RUNNER = /^(?:\w+=\S*\s+)*(?:npx\s+(?:jest|eslint|mocha|vitest)|jest|eslint|mocha|vitest|npm\s+(?:run\s+)?(?:test|lint)\b|npm\s+t\b|yarn\s+(?:test|lint)|pnpm\s+(?:test|lint)|(?:bash|sh)\s+\S*check\.sh|\.?\/?\S*scripts\/check\.sh|pytest|python3?\s+-m\s+pytest|node\s+--test)\b/;
// drop heredoc bodies, and blank quoted strings so separators inside them
// (grep -E 'a|jest') don't split the command
const stripHeredocs = (command) =>
  String(command)
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, '')
    .replace(/'[^'\n]*'|"(?:[^"\\\n]|\\.)*"/g, "''");
function runsTests(command) {
  return stripHeredocs(command)
    .split(/\n|;|&&|\|\||\|/)
    .map((seg) => seg.trim().replace(/^\(+/, ''))
    .some((seg) => RUNNER.test(seg));
}
// the tool's exit status reflects the runner only when the runner is the last
// command and its output isn't piped (`npx jest | tail`, `...; echo $?` mask it)
function exitStatusReliable(command) {
  const parts = stripHeredocs(command).split(/\n|;|&&|\|\|/).map((seg) => seg.trim()).filter(Boolean);
  const last = parts[parts.length - 1] || '';
  return !last.includes('|') && RUNNER.test(last.replace(/^\(+/, '').replace(/\)+$/, ''));
}
const TEST_CMD = { test: runsTests };

class MetricsError extends Error {}

const ctxOf = (u) => (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
const totalOf = (u) => ctxOf(u) + (u.output_tokens || 0);

function resultText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => (c.type === 'text' ? c.text : `[${c.type}]`)).join('\n');
  return '';
}

function toolFailed(block) {
  if (block.is_error === true) return true;
  return /^Exit code [1-9]/m.test(resultText(block.content));
}

// Agents often mask a test command's exit status (`npm test; echo "EXIT: $?"`,
// `| tail`), so for test runs also read failure from the output itself:
// printed exit codes and the runners' own failure summaries.
const TEST_FAIL_OUTPUT = [
  /\bEXIT(?:_CODE)?\s*[:=]\s*[1-9]/i,
  /\bexit(?:ed)?(?: with)?(?: code| status)\s*[:=]?\s*[1-9]/i,
  /^Tests:.*\b[1-9]\d* failed/m, // jest
  /^Test Suites:.*\b[1-9]\d* failed/m, // jest
  /^\s*[1-9]\d* failing\b/m, // mocha
  /^npm (?:ERR!|error) /m,
  /\b[1-9]\d* (?:problems?|errors?)\b.*\(/, // eslint summary: "✖ 3 problems (3 errors, 0 warnings)"
  /^=+ .*\b[1-9]\d* failed\b/m, // pytest
  /^\s*(?:ℹ|#) fail [1-9]/m, // node:test / borp
];

const TEST_PASS_OUTPUT = [
  /\bEXIT(?:_CODE)?\s*[:=]\s*0\b/i,
  /\bexit(?:ed)?(?: with)?(?: code| status)\s*[:=]?\s*0\b/i,
  /^\s*\d+ passing\b/m, // mocha (failures are caught above)
  /^=+ .*\b\d+ passed\b/m, // pytest
  /^\s*(?:ℹ|#) fail 0\b/m, // node:test / borp
];

// 'fail' | 'pass' | 'unknown' for one test/lint run
function testRunOutcome(block, command) {
  const text = resultText(block.content);
  // one command can hold several runs (e.g. "without the fix → fails, with it →
  // passes"); when jest printed summaries, the last one decides
  const jestSummaries = text.match(/^Tests:.*$/gm);
  if (jestSummaries) return /\b[1-9]\d* failed/.test(jestSummaries[jestSummaries.length - 1]) ? 'fail' : 'pass';
  if (toolFailed(block) || TEST_FAIL_OUTPUT.some((re) => re.test(text))) return 'fail';
  if (exitStatusReliable(command)) return 'pass';
  if (TEST_PASS_OUTPUT.some((re) => re.test(text))) return 'pass';
  return 'unknown'; // exit status masked and no runner summary in the output
}

// Bash commands that write files, for traces without git-watch timing
const BASH_WRITE = /\bsed\s+(-[a-zA-Z]*i|--in-place)\b|\bperl\s+-[a-zA-Z]*i|\bpython3?\s+-\s*<<|\bcat\s*>\s*\S|\btee\s+\S|\bgit\s+apply\b|\bpatch\s+-p/;
const WATCH_INTERVAL_MS = 2000;

// events: parsed stream-json lines; arrivals: ms-since-start per event
// opts: { ws, packFiles, requestedModel, firstChangeMs } — firstChangeMs is the
// harness's git-status watch (first moment the workspace changed)
const LEAK_PATHS = [/razor-ab\/cache\b/, /razor-ab\/validate\b/, /razor-ab\/validated\b/, /eval\/ab\/(tasks|results)\b/];

function computeMetrics(events, arrivals, { ws, packFiles = [], requestedModel, firstChangeMs = null }) {
  const init = events.find((e) => e.type === 'system' && e.subtype === 'init');
  const result = [...events].reverse().find((e) => e.type === 'result');
  if (!init) throw new MetricsError('no system/init event in stream');
  if (!result) throw new MetricsError('no result event in stream (agent crashed or was killed)');
  if (result.api_error_status) throw new MetricsError(`API error ${result.api_error_status}: ${String(result.result || '').slice(0, 300)}`);
  if (!result.modelUsage || !Object.keys(result.modelUsage).length) throw new MetricsError('result.modelUsage missing');

  // served-model assertion: the session must have run on the model we asked for
  if (requestedModel && init.model !== requestedModel) {
    throw new MetricsError(`served model ${init.model} != requested ${requestedModel}`);
  }

  // ---- token consumption: every model in modelUsage (subagents included)
  const tokens = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
  for (const u of Object.values(result.modelUsage)) {
    tokens.input += u.inputTokens || 0;
    tokens.output += u.outputTokens || 0;
    tokens.cache_read += u.cacheReadInputTokens || 0;
    tokens.cache_write += u.cacheCreationInputTokens || 0;
  }
  const totalTokens = tokens.input + tokens.output + tokens.cache_read + tokens.cache_write;

  // ---- per-API-call usage, deduplicated by message id (one message can span
  // several assistant events, each repeating the same usage)
  const calls = new Map(); // id -> { usage, main, firstIdx }
  const toolUses = new Map(); // tool_use_id -> { name, input, main, idx }
  const toolResults = new Map(); // tool_use_id -> { failed, text, idx }
  events.forEach((e, idx) => {
    if (e.type === 'assistant' && e.message) {
      const main = !e.parent_tool_use_id;
      const id = e.message.id || `anon-${idx}`;
      const prev = calls.get(id);
      calls.set(id, { usage: e.message.usage || (prev && prev.usage) || {}, main, firstIdx: prev ? prev.firstIdx : idx });
      for (const b of e.message.content || []) {
        if (b.type === 'tool_use') toolUses.set(b.id, { name: b.name, input: b.input || {}, main, idx, msgId: id });
      }
    } else if (e.type === 'user' && e.message && Array.isArray(e.message.content)) {
      for (const b of e.message.content) {
        if (b.type === 'tool_result') toolResults.set(b.tool_use_id, { block: b, idx });
      }
    }
  });
  const mainCalls = [...calls.values()].filter((c) => c.main).sort((a, b) => a.firstIdx - b.firstIdx);
  if (!mainCalls.length) throw new MetricsError('no main-thread API calls in stream');

  // ---- context used
  const contexts = mainCalls.map((c) => ctxOf(c.usage));
  const peakContext = Math.max(...contexts);
  const finalContext = contexts[contexts.length - 1];
  const initialContext = contexts[0];

  // ---- tool calls by name (all threads), main-thread count separately
  const byName = {};
  let mainToolCalls = 0;
  for (const t of toolUses.values()) {
    byName[t.name] = (byName[t.name] || 0) + 1;
    if (t.main) mainToolCalls++;
  }
  const orderedTools = [...toolUses.entries()].sort((a, b) => a[1].idx - b[1].idx);

  // ---- exploration before first edit (main thread). The first edit is the
  // earliest of: an Edit/Write-family call, or the first tool that could have
  // made the change the git watch saw (its result arrived after the change
  // window opened). Without watch timing, Bash write commands stand in.
  const mainTools = orderedTools.filter(([, t]) => t.main);
  const candidates = [];
  const editTool = mainTools.find(([, t]) => EDIT_TOOLS.has(t.name));
  if (editTool) candidates.push({ entry: editTool, method: 'edit_tool' });
  if (firstChangeMs != null && arrivals.length) {
    const lowerBound = firstChangeMs - WATCH_INTERVAL_MS;
    const watched = mainTools.find(([id]) => {
      const r = toolResults.get(id);
      return r && arrivals[r.idx] != null && arrivals[r.idx] >= lowerBound;
    });
    if (watched) candidates.push({ entry: watched, method: 'git_watch' });
  } else {
    const bashWrite = mainTools.find(([, t]) => t.name === 'Bash' && BASH_WRITE.test(String(t.input.command || '')));
    if (bashWrite) candidates.push({ entry: bashWrite, method: 'bash_heuristic' });
  }
  candidates.sort((a, b) => a.entry[1].idx - b.entry[1].idx);
  const firstEdit = candidates.length ? candidates[0].entry : null;
  const firstEditMethod = candidates.length ? candidates[0].method : null;
  let explore = { tool_calls: mainToolCalls, tokens: mainCalls.reduce((s, c) => s + totalOf(c.usage), 0), seconds: null, edited: false, method: null };
  if (firstEdit) {
    const [, fe] = firstEdit;
    const before = orderedTools.filter(([, t]) => t.main && t.idx < fe.idx).length;
    const feCall = calls.get(fe.msgId);
    const tokensUpTo = mainCalls.filter((c) => c.firstIdx <= feCall.firstIdx).reduce((s, c) => s + totalOf(c.usage), 0);
    explore = {
      tool_calls: before,
      tokens: tokensUpTo,
      seconds: arrivals[fe.idx] != null ? +(arrivals[fe.idx] / 1000).toFixed(1) : null,
      edited: true,
      method: firstEditMethod,
    };
  }

  // ---- re-correction loops: failed test/lint runs before the last such run
  const testRuns = orderedTools
    .filter(([, t]) => t.name === 'Bash' && TEST_CMD.test(String(t.input.command || '')))
    .map(([id, t]) => {
      const r = toolResults.get(id);
      const outcome = r ? testRunOutcome(r.block, t.input.command) : 'unknown';
      return { command: String(t.input.command).slice(0, 200), outcome, failed: outcome === 'fail' ? true : outcome === 'pass' ? false : null };
    });
  const beforeLast = testRuns.slice(0, -1);
  const lastRun = testRuns[testRuns.length - 1];
  const recorrection = {
    loops: beforeLast.filter((r) => r.outcome === 'fail').length,
    loops_unclear: beforeLast.filter((r) => r.outcome === 'unknown').length,
    test_runs: testRuns.length,
    last_run_passed: lastRun ? (lastRun.outcome === 'unknown' ? null : lastRun.outcome === 'pass') : null,
    runs: testRuns,
  };

  // ---- Razor pack usage
  const packSet = new Set(packFiles);
  const razorSkills = packFiles
    .map((f) => f.match(/^\.claude\/skills\/([^/]+)\/SKILL\.md$/))
    .filter(Boolean)
    .map((m) => m[1]);
  // paths as the agent saw them: relative to the session's own cwd (which is
  // the resolved path, e.g. /private/tmp/... on macOS), else the workspace
  const roots = [init.cwd, ws].filter(Boolean);
  const rel = (p) => {
    if (!p || !path.isAbsolute(p)) return p;
    for (const r of roots) if (p.startsWith(r + path.sep)) return path.relative(r, p);
    return p;
  };
  const packReads = orderedTools
    .filter(([, t]) => t.name === 'Read' && packSet.has(rel(t.input.file_path)))
    .map(([, t]) => rel(t.input.file_path));
  const skillCalls = orderedTools
    .filter(([, t]) => t.name === 'Skill')
    .map(([, t]) => t.input.skill || t.input.command || t.input.name)
    .filter((s) => razorSkills.includes(String(s)));
  // check.sh counts as run only when a command segment executes it; a mere
  // mention (`cat scripts/check.sh`) counts as reading it
  const runsCheck = (cmd) =>
    stripHeredocs(cmd).split(/\n|;|&&|\|\||\|/).map((seg) => seg.trim().replace(/^\(+/, ''))
      .some((seg) => /^(?:\w+=\S*\s+)*(?:(?:bash|sh)\s+)?\S*check\.sh\b/.test(seg));
  let checkRuns = 0;
  // agents often read with cat/sed/head instead of Read: count pack files named in Bash commands
  for (const [, t] of orderedTools) {
    if (t.name !== 'Bash') continue;
    const cmd = String(t.input.command || '');
    if (runsCheck(cmd)) checkRuns++;
    for (const f of packFiles) {
      if (!stripHeredocs(cmd).includes(f)) continue;
      if (f.startsWith('scripts/') && runsCheck(cmd)) continue;
      packReads.push(f);
    }
  }
  const pack = packFiles.length
    ? {
        skills_loaded: razorSkills.filter((s) => (init.skills || []).includes(s)),
        files_read: [...new Set(packReads)],
        skills_invoked: skillCalls,
        check_sh_runs: checkRuns,
      }
    : null;
  if (pack) {
    pack.used = pack.files_read.length > 0 || pack.skills_invoked.length > 0 || pack.check_sh_runs > 0;
    // per skill: invoked, or any of its files (SKILL.md, reference.md) read
    const readSkill = (s) => pack.files_read.some((f) => f.startsWith(`.claude/skills/${s}/`));
    pack.skills_used = razorSkills.filter((s) => pack.skills_invoked.includes(s) || readSkill(s));
  }

  // ---- leakage: tool calls that reach the harness's own files (the cached
  // upstream clone with full history, validation workspaces, task folders with
  // hidden tests and reference solutions). Any hit makes the run suspect.
  const leaks = [];
  for (const [, t] of orderedTools) {
    const text = JSON.stringify(t.input || {});
    const hit = LEAK_PATHS.find((re) => re.test(text));
    if (hit) leaks.push({ tool: t.name, input: text.slice(0, 200) });
  }

  return {
    model: init.model,
    claude_code_version: init.claude_code_version,
    result_subtype: result.subtype,
    is_error: !!result.is_error,
    terminal_reason: result.terminal_reason || null,
    tokens: { ...tokens, total: totalTokens },
    context: { peak: peakContext, final: finalContext, initial: initialContext, api_calls: mainCalls.length },
    time: {
      duration_min: +(result.duration_ms / 60000).toFixed(2),
      duration_api_min: +(result.duration_api_ms / 60000).toFixed(2),
    },
    cost_usd: result.total_cost_usd,
    turns: result.num_turns,
    tool_calls: { total: toolUses.size, main: mainToolCalls, by_name: byName },
    subagents: result.subagent_stats ? result.subagent_stats.spawned : null,
    explore_before_first_edit: explore,
    recorrection,
    pack,
    leaks,
    permission_denials: (result.permission_denials || []).length,
    usage: {
      input_tokens: tokens.input,
      output_tokens: tokens.output,
      cache_read_input_tokens: tokens.cache_read,
      cache_creation_input_tokens: tokens.cache_write,
    },
  };
}

// stream-json -> report-builder Turn[] (build-eval trace format)
function toTurns(events, prompt) {
  const turns = [];
  const init = events.find((e) => e.type === 'system' && e.subtype === 'init');
  if (init) turns.push({ role: 'system', content: `Claude Code ${init.claude_code_version} · model ${init.model} · cwd ${init.cwd}` });
  turns.push({ role: 'user', content: prompt });
  for (const e of events) {
    const sub = e.parent_tool_use_id ? '[subagent] ' : '';
    if (e.type === 'assistant' && e.message) {
      for (const b of e.message.content || []) {
        if (b.type === 'text' && b.text.trim()) turns.push({ role: 'assistant', content: sub + b.text });
        if (b.type === 'tool_use') turns.push({ role: 'tool_call', name: sub + b.name, content: JSON.stringify(b.input, null, 2) });
      }
    } else if (e.type === 'user' && e.message && Array.isArray(e.message.content)) {
      for (const b of e.message.content) {
        if (b.type === 'tool_result') {
          const text = resultText(b.content);
          turns.push({ role: 'tool_result', content: (b.is_error ? '[error] ' : '') + (text.length > 20000 ? text.slice(0, 20000) + '\n…[truncated]' : text) });
        }
      }
    } else if (e.type === 'result') {
      turns.push({ role: 'assistant', content: `[result: ${e.subtype}] ${e.result || ''}`.trim() });
    }
  }
  return turns;
}

module.exports = { computeMetrics, toTurns, MetricsError, TEST_CMD };
