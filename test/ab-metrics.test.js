// Unit tests for the A/B eval's stream-json metrics parser (eval/ab/lib/metrics.js).
const test = require('node:test');
const assert = require('node:assert');
const { computeMetrics, MetricsError } = require('../eval/ab/lib/metrics');

const usage = (input, cacheRead, cacheWrite, output) => ({
  input_tokens: input, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheWrite, output_tokens: output,
});
const assistant = (id, u, content, parent = null) => ({ type: 'assistant', message: { id, usage: u, content }, parent_tool_use_id: parent });
const toolUse = (id, name, input) => ({ type: 'tool_use', id, name, input });
const toolResult = (id, text, isError = false) => ({
  type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: text, is_error: isError }] }, parent_tool_use_id: null,
});

function stream({ model = 'claude-opus-5-5', skills = [] } = {}) {
  return [
    { type: 'system', subtype: 'init', model, claude_code_version: '2.1.296', skills },
    assistant('m1', usage(2, 10000, 2000, 50), [toolUse('t1', 'Read', { file_path: '/ws/AGENTS.md' })]),
    toolResult('t1', 'pack contents'),
    assistant('m2', usage(2, 12000, 500, 80), [toolUse('t2', 'Bash', { command: 'npm test 2>&1; echo "EXIT: $?"' })]),
    toolResult('t2', 'Tests:       1 failed, 3 passed, 4 total\nEXIT: 1'),
    // the same message id repeated (multi-block message) must not double count
    assistant('m3', usage(2, 13000, 400, 60), [{ type: 'text', text: 'fixing' }]),
    assistant('m3', usage(2, 13000, 400, 60), [toolUse('t3', 'Edit', { file_path: '/ws/src/a.js' })]),
    toolResult('t3', 'ok'),
    assistant('s1', usage(2, 90000, 0, 10), [toolUse('t4', 'Grep', { pattern: 'x' })], 'task-1'),
    assistant('m4', usage(2, 14000, 300, 40), [toolUse('t5', 'Bash', { command: 'npx jest' })]),
    toolResult('t5', 'Tests:       4 passed, 4 total'),
    {
      type: 'result', subtype: 'success', is_error: false, duration_ms: 90000, duration_api_ms: 60000, num_turns: 5, total_cost_usd: 0.5,
      modelUsage: {
        'claude-opus-5-5': { inputTokens: 8, outputTokens: 230, cacheReadInputTokens: 52000, cacheCreationInputTokens: 3200 },
        'claude-haiku-5-5': { inputTokens: 2, outputTokens: 10, cacheReadInputTokens: 90000, cacheCreationInputTokens: 0 },
      },
    },
  ];
}

test('token consumption sums every model in modelUsage', () => {
  const m = computeMetrics(stream(), [], { ws: '/ws', requestedModel: 'claude-opus-5-5' });
  assert.strictEqual(m.tokens.total, 8 + 230 + 52000 + 3200 + 2 + 10 + 90000);
});

test('context is main-thread only, deduplicated by message id', () => {
  const m = computeMetrics(stream(), [], { ws: '/ws' });
  assert.strictEqual(m.context.peak, 2 + 14000 + 300); // subagent s1 (90k) excluded
  assert.strictEqual(m.context.initial, 2 + 10000 + 2000);
  assert.strictEqual(m.context.api_calls, 4);
});

test('masked exit status still counts as a failed test run', () => {
  const m = computeMetrics(stream(), [], { ws: '/ws' });
  assert.strictEqual(m.recorrection.test_runs, 2);
  assert.strictEqual(m.recorrection.loops, 1);
  assert.strictEqual(m.recorrection.last_run_passed, true);
});

test('exploration before first edit counts main-thread tools and tokens up to the edit call', () => {
  const m = computeMetrics(stream(), [], { ws: '/ws' });
  assert.strictEqual(m.explore_before_first_edit.tool_calls, 2);
  assert.strictEqual(m.explore_before_first_edit.tokens, 12052 + 12582 + 13462);
});

test('pack usage detects reads of pack files', () => {
  const m = computeMetrics(stream({ skills: ['run-tests'] }), [], {
    ws: '/ws', packFiles: ['AGENTS.md', '.claude/skills/run-tests/SKILL.md'],
  });
  assert.deepStrictEqual(m.pack.files_read, ['AGENTS.md']);
  assert.deepStrictEqual(m.pack.skills_loaded, ['run-tests']);
  assert.strictEqual(m.pack.used, true);
});

test('served-model mismatch fails loudly', () => {
  assert.throws(() => computeMetrics(stream({ model: 'claude-sonnet-5-5' }), [], { requestedModel: 'claude-opus-5-5' }), MetricsError);
});

test('missing result event fails loudly instead of reporting zeros', () => {
  assert.throws(() => computeMetrics(stream().slice(0, -1), [], {}), MetricsError);
});

test('with several jest summaries in one output, the last one decides', () => {
  const ev = stream();
  ev.splice(ev.length - 1, 0,
    assistant('m5', usage(2, 15000, 100, 20), [toolUse('t6', 'Bash', { command: 'git stash; npx jest a; git stash pop; npx jest a' })]),
    toolResult('t6', 'Tests:       3 failed, 2 passed, 5 total\nTests:       5 passed, 5 total'));
  const m = computeMetrics(ev, [], { ws: '/ws' });
  assert.strictEqual(m.recorrection.last_run_passed, true);
  assert.strictEqual(m.recorrection.loops, 1);
});

test('test-run detector counts executions, not mentions', () => {
  const { TEST_CMD } = require('../eval/ab/lib/metrics');
  const cases = {
    'npm test 2>&1; echo "EXIT: $?"': true,
    'cd /x; PATH=node_modules/.bin:$PATH bash scripts/check.sh > /tmp/c.log': true,
    '(cd example-application && npx jest)': true,
    'cd /x; cat verification.md; cat scripts/check.sh': false,
    "cat >> a.test.ts <<'EOF'\njest.fn(); npx jest\nEOF": false,
    "cat > t.test.ts <<'EOF'\nx\nEOF\nnpx jest t 2>&1 | tail": true,
    'grep -rn jest package.json': false,
    "grep -E '\"(axios|nock|jest)\"' package.json; cat SKILL.md": false,
  };
  for (const [cmd, want] of Object.entries(cases)) assert.strictEqual(TEST_CMD.test(cmd), want, cmd);
});

test('masked exit status with no runner summary is unclear, not a pass', () => {
  const ev = stream();
  ev.splice(ev.length - 1, 0,
    assistant('m6', usage(2, 15000, 100, 20), [toolUse('t7', 'Bash', { command: 'bash scripts/check.sh 2>&1 | grep -E "error"' })]),
    toolResult('t7', '(Bash completed with no output)'),
    assistant('m7', usage(2, 15000, 100, 20), [toolUse('t8', 'Bash', { command: 'npx jest' })]),
    toolResult('t8', 'Tests:       4 passed, 4 total'));
  const m = computeMetrics(ev, [], { ws: '/ws' });
  const outcomes = m.recorrection.runs.map((r) => r.outcome);
  assert.deepStrictEqual(outcomes, ['fail', 'pass', 'unknown', 'pass']);
  assert.strictEqual(m.recorrection.loops, 1);
  assert.strictEqual(m.recorrection.loops_unclear, 1);
});

test('tool calls that reach the harness files are flagged as possible leaks', () => {
  const ev = stream();
  ev.splice(ev.length - 1, 0,
    assistant('m8', usage(2, 15000, 100, 20), [toolUse('t9', 'Bash', { command: 'ls /tmp/razor-ab/cache/fastify@3aa8dfd7298c && git -C ../../cache log' })]),
    toolResult('t9', '...'),
    assistant('m9', usage(2, 15000, 100, 20), [toolUse('t10', 'Read', { file_path: '/ws/lib/reply.js' })]),
    toolResult('t10', '...'));
  const m = computeMetrics(ev, [], { ws: '/ws' });
  assert.strictEqual(m.leaks.length, 1);
  assert.strictEqual(m.leaks[0].tool, 'Bash');
});

test('skills_used counts a skill invoked or any of its files read, including via Bash', () => {
  const events = stream();
  events.splice(1, 0,
    assistant('m0', usage(2, 9000, 100, 20), [
      toolUse('s0', 'Skill', { skill: 'run-tests' }),
      toolUse('b0', 'Bash', { command: 'cat .claude/skills/db-migrations/reference.md' }),
    ]),
    toolResult('s0', 'skill loaded'),
    toolResult('b0', 'reference'),
  );
  const m = computeMetrics(events, [], {
    ws: '/ws',
    packFiles: [
      'AGENTS.md', '.claude/skills/run-tests/SKILL.md', '.claude/skills/db-migrations/SKILL.md',
      '.claude/skills/db-migrations/reference.md', '.claude/skills/local-env/SKILL.md',
    ],
  });
  assert.deepStrictEqual(m.pack.skills_invoked, ['run-tests']);
  assert.deepStrictEqual(m.pack.skills_used, ['run-tests', 'db-migrations']);
});
