// Runs one headless Claude Code session in a workspace and captures its
// stream-json output verbatim, plus the harness-side arrival time of each line.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { run, repoEnv } = require('./util');

// first moment the workspace differs from its initial commit, whichever tool
// made the change (Edit, Write, sed -i, a python heredoc, ...)
function watchFirstChange(ws, started, everyMs = 2000) {
  const state = { firstChangeMs: null };
  const timer = setInterval(() => {
    const res = spawnSync('git', ['status', '--porcelain'], { cwd: ws, encoding: 'utf8' });
    if (res.status === 0 && res.stdout.trim()) {
      state.firstChangeMs = Date.now() - started;
      clearInterval(timer);
    }
  }, everyMs);
  timer.unref();
  state.stop = () => clearInterval(timer);
  return state;
}

// Don't leak the coordinating session's Claude Code state (session ids, effort,
// messaging sockets) into the agent. Keep only auth/config knobs.
const KEEP_ENV = new Set(['CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_OAUTH_TOKEN']);
function agentEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if ((k.startsWith('CLAUDE') && !KEEP_ENV.has(k) && !k.startsWith('CLAUDE_CODE_USE_')) || k === 'CI') continue;
    env[k] = v;
  }
  return env;
}

async function runAgent({ ws, repo, prompt, model, effort, timeoutMs, maxBudgetUsd, extraArgs = [], traceFile }) {
  const args = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--model', model,
    '--permission-mode', 'bypassPermissions',
    '--no-session-persistence',
    '--disallowedTools', 'WebSearch,WebFetch',
  ];
  if (effort) args.push('--effort', effort);
  if (maxBudgetUsd) args.push('--max-budget-usd', String(maxBudgetUsd));
  args.push(...extraArgs);

  fs.mkdirSync(path.dirname(traceFile), { recursive: true });
  const out = fs.openSync(traceFile, 'w');
  const err = fs.openSync(traceFile.replace(/\.jsonl$/, '') + '.stderr.txt', 'w');
  const started = Date.now();
  const events = [];
  const arrivals = []; // ms since start, parallel to events
  const watcher = watchFirstChange(ws, started);

  const res = await run('claude', args, {
    cwd: ws,
    env: repo ? repoEnv(repo, agentEnv()) : agentEnv(),
    stdio: ['ignore', 'pipe', err],
    timeoutMs,
    onStdoutLine: (line) => {
      if (!line.trim()) return;
      fs.writeSync(out, line + '\n');
      try {
        events.push(JSON.parse(line));
        arrivals.push(Date.now() - started);
      } catch (_) {
        // non-JSON noise stays in the raw trace only
      }
    },
  });
  fs.closeSync(out);
  fs.closeSync(err);
  watcher.stop();
  const timing = { arrivals, first_change_ms: watcher.firstChangeMs, wall_ms: Date.now() - started };
  fs.writeFileSync(traceFile.replace(/\.jsonl$/, '') + '.timing.json', JSON.stringify(timing) + '\n');

  return {
    events,
    arrivals,
    firstChangeMs: watcher.firstChangeMs,
    exitCode: res.code,
    timedOut: res.timedOut,
    wallMs: Date.now() - started,
    args: args.map((a) => (a === prompt ? '<prompt>' : a)),
  };
}

module.exports = { runAgent };
