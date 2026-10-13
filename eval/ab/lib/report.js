// Builds summary.md for a run: per task, naive vs razor side by side.
// Every number is recomputed from results.jsonl / errors.jsonl.
const fs = require('fs');
const path = require('path');
const { readJSONL, readJSON } = require('./util');

const ARMS = [
  { arm: 'naive', variant: 'baseline' },
  { arm: 'razor', variant: 'v1' },
];

const median = (xs) => {
  const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const fmtInt = (n) => (n == null ? '–' : Math.round(n).toLocaleString('en-US'));
const fmtNum = (n, d = 2) => (n == null ? '–' : n.toFixed(d));
const ratio = (a, b) => (a == null || b == null || b === 0 ? '–' : `${(a / b).toFixed(2)}×`);

// [label, row -> number, formatter, compare?]
const METRICS = [
  ['Total tokens', (r) => r.metrics.tokens.total, fmtInt, true],
  ['  output tokens', (r) => r.metrics.tokens.output, fmtInt, true],
  ['Peak context (tokens)', (r) => r.metrics.context.peak, fmtInt, true],
  ['Initial context (tokens)', (r) => r.metrics.context.initial, fmtInt, true],
  ['Time (min)', (r) => r.metrics.time.duration_min, (n) => fmtNum(n), true],
  ['Cost (USD)', (r) => r.metrics.cost_usd, (n) => (n == null ? '–' : `$${n.toFixed(3)}`), true],
  ['Turns', (r) => r.metrics.turns, fmtInt, true],
  ['Tool calls', (r) => r.metrics.tool_calls.total, fmtInt, true],
  ['Tool calls before 1st edit', (r) => r.metrics.explore_before_first_edit.tool_calls, fmtInt, true],
  ['Tokens before 1st edit', (r) => r.metrics.explore_before_first_edit.tokens, fmtInt, true],
  ['Re-correction loops (confirmed)', (r) => r.metrics.recorrection.loops, fmtInt, false],
  ['  + unclear runs (exit status masked)', (r) => r.metrics.recorrection.loops_unclear, fmtInt, false],
  ['Regressions', (r) => r.regressions, fmtInt, false],
];

function loadVariant(flow, variant) {
  return {
    rows: readJSONL(path.join(flow, variant, 'results.jsonl')),
    errors: readJSONL(path.join(flow, variant, 'errors.jsonl')),
  };
}

function cell(rows, fn, fmt) {
  const vals = rows.map(fn).filter((v) => typeof v === 'number');
  if (!vals.length) return { v: null, s: '–' };
  const m = median(vals);
  const spread = vals.length > 1 ? ` (${fmt(Math.min(...vals))}–${fmt(Math.max(...vals))})` : '';
  return { v: m, s: fmt(m) + spread };
}

const splitStr = (rows, vis) => {
  const xs = rows.map((r) => r.ac_split && r.ac_split[vis]).filter(Boolean);
  if (!xs.length) return '–';
  return `${xs.reduce((a, x) => a + x.passed, 0)}/${xs.reduce((a, x) => a + x.total, 0)}`;
};
const hiddenStr = (rows) => splitStr(rows, 'hidden');

function buildSummary(flow) {
  const meta = fs.existsSync(path.join(flow, 'meta.json')) ? readJSON(path.join(flow, 'meta.json')) : {};
  const data = Object.fromEntries(ARMS.map(({ arm, variant }) => [arm, loadVariant(flow, variant)]));
  const taskIds = [...new Set(ARMS.flatMap(({ arm }) => data[arm].rows.map((r) => r.prompt_id)))].sort();

  const L = [];
  L.push(`# Razor A/B eval — ${path.basename(flow)}`);
  L.push('');
  L.push(`- Model: \`${meta.model || '?'}\` · effort: \`${meta.effort || 'default'}\` · Claude Code ${meta.claude_code_version || '?'} · razor-cli ${meta.razor_commit || '?'}`);
  L.push(`- Tasks: ${taskIds.length} · reps per arm: ${meta.reps || '?'} · started ${meta.started_at || '?'}`);
  const nErr = ARMS.map(({ arm }) => `${arm} ${data[arm].errors.length}`).join(', ');
  L.push(`- Failed attempts (not scored, see errors.jsonl): ${nErr}`);
  if ((meta.reps || 1) < 2) {
    L.push('- ⚠ 1 rep per arm: each cell is a single run. Differences are anecdotes, not evidence — agent runs vary noticeably run to run.');
  } else {
    L.push('- Cells show the median over reps, with (min–max).');
  }
  L.push('');

  // overview
  L.push('## Overview');
  L.push('');
  L.push('| Task | naive pass | razor pass | naive hidden ACs | razor hidden ACs | razor/naive tokens | razor/naive peak ctx | razor/naive time | pack used |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  const tokenRatios = [];
  const timeRatios = [];
  const ctxRatios = [];
  for (const id of taskIds) {
    const n = data.naive.rows.filter((r) => r.prompt_id === id);
    const z = data.razor.rows.filter((r) => r.prompt_id === id);
    const passStr = (rows) => (rows.length ? `${rows.filter((r) => r.grade.pass === 1).length}/${rows.length}` : '–');
    // with hidden ACs, the efficiency comparison needs only the stated task
    // solved (all shown ACs); hidden ACs are a separate quality measure
    const solved = (r) => (r.ac_split && r.ac_split.hidden ? r.ac_split.shown.passed === r.ac_split.shown.total : r.grade.pass === 1);
    const comparable = n.length && z.length && n.every(solved) && z.every(solved);
    const t = [cell(n, METRICS[0][1], fmtInt).v, cell(z, METRICS[0][1], fmtInt).v];
    const c = [cell(n, METRICS[2][1], fmtInt).v, cell(z, METRICS[2][1], fmtInt).v];
    const m = [cell(n, METRICS[4][1], fmtNum).v, cell(z, METRICS[4][1], fmtNum).v];
    if (comparable) {
      tokenRatios.push(t[1] / t[0]);
      ctxRatios.push(c[1] / c[0]);
      timeRatios.push(m[1] / m[0]);
    }
    const packUsed = z.length ? `${z.filter((r) => r.metrics.pack && r.metrics.pack.used).length}/${z.length}` : '–';
    const mark = comparable ? '' : ' (not comparable)';
    L.push(`| ${id} | ${passStr(n)} | ${passStr(z)} | ${hiddenStr(n)} | ${hiddenStr(z)} | ${ratio(t[1], t[0])}${mark} | ${ratio(c[1], c[0])}${mark} | ${ratio(m[1], m[0])}${mark} | ${packUsed} |`);
  }
  L.push('');
  if (tokenRatios.length) {
    L.push('Hidden ACs: acceptance criteria from the real fix\'s tests that the prompt does not state; summed over reps. Efficiency ratios need every run to pass the shown ACs.');
  L.push('');
  L.push(`Median razor/naive ratio over the ${tokenRatios.length} task(s) where both arms solved the stated task: tokens ${median(tokenRatios).toFixed(2)}×, peak context ${median(ctxRatios).toFixed(2)}×, time ${median(timeRatios).toFixed(2)}× (below 1× means Razor used less).`);
  } else {
    L.push('No task where both arms passed — efficiency ratios are not comparable yet.');
  }
  L.push('');

  // per task detail
  for (const id of taskIds) {
    const n = data.naive.rows.filter((r) => r.prompt_id === id);
    const z = data.razor.rows.filter((r) => r.prompt_id === id);
    L.push(`## ${id}`);
    L.push('');
    const acIds = Object.keys((n[0] || z[0]).grade).filter((k) => k !== 'pass');
    const acStr = (rows) => rows.map((r) => acIds.map((k) => `${k}${r.grade[k] ? '✓' : '✗'}`).join(' ')).join(' / ') || '–';
    L.push('| Metric | naive | razor | razor/naive |');
    L.push('|---|---|---|---|');
    L.push(`| **Pass (all ACs)** | ${n.map((r) => (r.grade.pass ? 'PASS' : 'FAIL')).join(', ') || '–'} | ${z.map((r) => (r.grade.pass ? 'PASS' : 'FAIL')).join(', ') || '–'} | |`);
    L.push(`| Acceptance criteria | ${acStr(n)} | ${acStr(z)} | |`);
    if ([...n, ...z].some((r) => r.ac_split && r.ac_split.hidden)) {
      const ids = (rows, vis) => (rows.find((r) => r.ac_split && r.ac_split[vis]) || { ac_split: { [vis]: { ids: [] } } }).ac_split[vis].ids.join(' ');
      L.push(`| Shown ACs passed (${ids([...n, ...z], 'shown')}) | ${splitStr(n, 'shown')} | ${splitStr(z, 'shown')} | |`);
      L.push(`| Hidden ACs passed (${ids([...n, ...z], 'hidden')}) | ${splitStr(n, 'hidden')} | ${splitStr(z, 'hidden')} | |`);
    }
    for (const [label, fn, fmt, cmp] of METRICS) {
      const a = cell(n, fn, fmt);
      const b = cell(z, fn, fmt);
      L.push(`| ${label} | ${a.s} | ${b.s} | ${cmp ? ratio(b.v, a.v) : ''} |`);
    }
    const packStr = z
      .map((r) => {
        const p = r.metrics.pack;
        if (!p) return '–';
        return `${p.used ? 'used' : '**unused**'} (read: ${p.files_read.join(', ') || 'none'}; skills: ${p.skills_invoked.join(', ') || 'none'}; check.sh runs: ${p.check_sh_runs})`;
      })
      .join(' / ');
    L.push(`| Pack used | n/a | ${packStr || '–'} | |`);
    const sym = { pass: '✓', fail: '✗', unknown: '?' };
    const runsStr = (rows) => rows.map((r) => r.metrics.recorrection.runs.map((t) => sym[t.outcome]).join('') || 'none').join(' / ') || '–';
    L.push(`| Test/lint runs in order (✓ pass, ✗ fail, ? unclear) | ${runsStr(n)} | ${runsStr(z)} | |`);
    const traceLinks = (rows, variant) => rows.map((r) => `[rep${r.rep}](${variant}/traces/${r.prompt_id}_rep${r.rep}.json)`).join(' ');
    const leakStr = (rows) => rows.map((r) => (r.metrics.leaks ? (r.metrics.leaks.length ? `**${r.metrics.leaks.length} suspect**` : 'none') : '–')).join(' / ') || '–';
    L.push(`| Harness-file access (leak check) | ${leakStr(n)} | ${leakStr(z)} | |`);
    L.push(`| Traces | ${traceLinks(n, 'baseline')} | ${traceLinks(z, 'v1')} | |`);
    L.push('');
  }
  return L.join('\n') + '\n';
}

function writeSummary(flow) {
  const md = buildSummary(flow);
  fs.writeFileSync(path.join(flow, 'summary.md'), md);
  return md;
}

module.exports = { writeSummary, buildSummary, ARMS };
