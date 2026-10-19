// End-state grading: restore the hidden tests into the workspace, run the
// suite once, and score every acceptance criterion from the runner's JSON.
const fs = require('fs');
const path = require('path');
const { sh, run, repoEnv } = require('./util');
const { hook } = require('./workspace');

// what the agent changed relative to the initial commit (pack files are part
// of that commit, so they never show up here)
function captureDiff(ws) {
  sh('git', ['add', '-A'], { cwd: ws });
  const diff = sh('git', ['diff', '--cached', '--binary', 'HEAD'], { cwd: ws }).stdout;
  const stat = sh('git', ['diff', '--cached', '--numstat', 'HEAD'], { cwd: ws }).stdout;
  const files = stat.split('\n').filter(Boolean).map((l) => l.split('\t')[2]);
  return { diff, files };
}

function restoreHidden(task, ws, base) {
  for (const rel of task.hiddenFiles) {
    fs.copyFileSync(path.join(base, rel), path.join(ws, rel));
  }
  for (const [dest, src] of Object.entries(task.supp_files || {})) {
    fs.mkdirSync(path.dirname(path.join(ws, dest)), { recursive: true });
    fs.copyFileSync(path.join(task.dir, src), path.join(ws, dest));
  }
}

const key = (file, title) => `${file}::${title}`;

// test files to run: the task's regression_paths (else the repo's test_paths),
// plus every AC test file. Entries may use * globs within one directory.
function testFiles(task, ws) {
  const patterns = [...(task.regression_paths || task.repoConfig.test_paths), ...task.acceptance.filter((c) => c.file).map((c) => c.file)];
  const out = new Set();
  for (const p of patterns) {
    if (!p.includes('*')) {
      out.add(p);
      continue;
    }
    const dir = path.dirname(p);
    const re = new RegExp('^' + path.basename(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    for (const f of fs.readdirSync(path.join(ws, dir))) if (re.test(f)) out.add(path.join(dir, f));
  }
  return [...out].sort();
}

// node's JUnit reporter double-escapes quotes in names (&amp;quot;), so decode until stable
const unxml1 = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const unxml = (s) => {
  let prev;
  do { prev = s; s = unxml1(s); } while (s !== prev);
  return s;
};

// node:test, one process per file (its JUnit output carries no file name)
async function runNodeTest(task, ws, outDir) {
  const repo = task.repoConfig;
  const statuses = new Map();
  const summary = { passed: 0, failed: 0, total: 0, broken_suites: [] };
  for (const rel of testFiles(task, ws)) {
    if (!fs.existsSync(path.join(ws, rel))) continue;
    const out = path.join(outDir, `node-test-${rel.replace(/[/\\]/g, '_')}-${Date.now()}.xml`);
    const res = await run('node', ['--test', '--test-reporter=junit', `--test-reporter-destination=${out}`, rel], {
      cwd: ws,
      timeoutMs: (repo.test_timeout_s || 600) * 1000,
    });
    if (res.timedOut) throw Object.assign(new Error(`test run of ${rel} hit its wall-clock ceiling`), { failureClass: 'grader_timeout' });
    if (!fs.existsSync(out)) throw Object.assign(new Error(`node --test wrote no report for ${rel} (exit ${res.code})`), { failureClass: 'grader_error' });
    const xml = fs.readFileSync(out, 'utf8');
    let n = 0;
    for (const m of xml.matchAll(/<testcase name="([^"]*)"([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
      const failed = /\bfailure=/.test(m[2]) || /<failure\b/.test(m[4] || '');
      const skipped = /<skipped\b/.test(m[4] || '');
      const status = failed ? 'failed' : skipped ? 'skipped' : 'passed';
      statuses.set(key(rel, unxml(m[1])), status);
      n++;
      summary.total++;
      if (status === 'passed') summary.passed++;
      if (status === 'failed') summary.failed++;
    }
    // a test with subtests (or a describe) is reported as a <testsuite>
    for (const m of xml.matchAll(/<testsuite name="([^"]*)"[^>]*?\bfailures="(\d+)"/g)) {
      statuses.set(key(rel, unxml(m[1])), m[2] === '0' ? 'passed' : 'failed');
    }
    if (!n) summary.broken_suites.push(rel);
  }
  return { statuses, summary };
}

// jest --json → Map("rel/file.test.ts::title" -> status)
async function runJest(repo, ws, outFile) {
  const env = { ...process.env };
  delete env.CI; // the repo's global teardown tears docker down when CI is set
  const res = await run('npx', ['jest', '--json', `--outputFile=${outFile}`, '--forceExit', ...repo.test_paths], {
    cwd: ws,
    env,
    timeoutMs: (repo.test_timeout_s || 600) * 1000,
  });
  if (res.timedOut) throw Object.assign(new Error('test run hit its wall-clock ceiling'), { failureClass: 'grader_timeout' });
  if (!fs.existsSync(outFile)) throw Object.assign(new Error(`jest wrote no JSON (exit ${res.code})`), { failureClass: 'grader_error' });
  const report = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  const statuses = new Map();
  const brokenSuites = [];
  const wsReal = fs.realpathSync(ws); // jest reports resolved paths (/tmp -> /private/tmp on macOS)
  for (const suite of report.testResults) {
    const rel = path.relative(wsReal, suite.name);
    if (suite.status === 'failed' && !suite.assertionResults.length) brokenSuites.push(rel);
    for (const a of suite.assertionResults) statuses.set(key(rel, a.title), a.status);
  }
  return {
    statuses,
    summary: {
      passed: report.numPassedTests,
      failed: report.numFailedTests,
      total: report.numTotalTests,
      broken_suites: brokenSuites,
    },
  };
}

// vitest --reporter=json (jest-shaped) → Map("rel/file.test.ts::Describe > title" -> status).
// Titles include their describe blocks: suites reuse short titles ("should succeed").
async function runVitest(task, ws, outFile) {
  const repo = task.repoConfig;
  const files = testFiles(task, ws).filter((rel) => fs.existsSync(path.join(ws, rel)));
  const env = { ...repoEnv(repo), TZ: 'UTC' };
  delete env.CI;
  const res = await run('yarn', ['vitest', 'run', '--reporter=json', `--outputFile=${outFile}`, ...files], {
    cwd: ws,
    env,
    timeoutMs: (repo.test_timeout_s || 600) * 1000,
  });
  if (res.timedOut) throw Object.assign(new Error('test run hit its wall-clock ceiling'), { failureClass: 'grader_timeout' });
  if (!fs.existsSync(outFile)) throw Object.assign(new Error(`vitest wrote no JSON (exit ${res.code})`), { failureClass: 'grader_error' });
  const report = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  const statuses = new Map();
  const brokenSuites = [];
  const wsReal = fs.realpathSync(ws);
  for (const suite of report.testResults) {
    const rel = path.relative(wsReal, suite.name);
    if (suite.status === 'failed' && !suite.assertionResults.length) brokenSuites.push(rel);
    for (const a of suite.assertionResults) statuses.set(key(rel, [...a.ancestorTitles, a.title].join(' > ')), a.status);
  }
  return {
    statuses,
    summary: { passed: report.numPassedTests, failed: report.numFailedTests, total: report.numTotalTests, broken_suites: brokenSuites },
  };
}

// an AC is either a test (file + title in the runner's report) or a command
// whose exit code decides (source: "cmd", e.g. "existing migration untouched")
async function scoreAcceptance(task, ws, statuses) {
  const ac = {};
  const detail = {};
  for (const c of task.acceptance) {
    if (c.cmd) {
      const res = await run(c.cmd[0], c.cmd.slice(1), { cwd: ws, timeoutMs: 120_000 });
      ac[c.id] = res.code === 0 ? 1 : 0;
      detail[c.id] = res.code === 0 ? 'passed' : 'failed';
      continue;
    }
    const status = statuses.get(key(c.file, c.title)) || 'not-run';
    ac[c.id] = status === 'passed' ? 1 : 0;
    detail[c.id] = status;
  }
  return { ac, detail };
}

// oraclePassing: list of test keys that pass on the original code (from validate)
// slot: the workspace's service slot; services are recreated before the tests
// so the agent's migrations are applied from scratch, as CI would
async function gradeWorkspace(task, ws, base, { oraclePassing = null, outDir, slot } = {}) {
  const { diff, files } = captureDiff(ws);
  restoreHidden(task, ws, base);
  if (slot !== undefined) hook(task.repoConfig, 'pregrade', ws, slot);
  fs.mkdirSync(outDir || ws, { recursive: true });
  const outFile = path.join(outDir || ws, `jest-${task.id}-${process.pid}-${Date.now()}.json`);
  const runner = task.repoConfig.test_runner || 'jest';
  const { statuses, summary } =
    runner === 'node-test' ? await runNodeTest(task, ws, outDir || ws)
      : runner === 'vitest' ? await runVitest(task, ws, outFile)
        : await runJest(task.repoConfig, ws, outFile);
  const { ac, detail } = await scoreAcceptance(task, ws, statuses);

  let regressions = null;
  let regressedTests = [];
  if (oraclePassing) {
    const acKeys = new Set(task.acceptance.filter((c) => !c.cmd).map((c) => key(c.file, c.title)));
    regressedTests = oraclePassing.filter((k) => !acKeys.has(k) && statuses.get(k) !== 'passed');
    regressions = regressedTests.length;
  }

  const pass = Object.values(ac).every((v) => v === 1) ? 1 : 0;
  return {
    grade: { pass, ...ac },
    ac_detail: detail,
    regressions,
    regressed_tests: regressedTests,
    no_op: files.length === 0,
    changed_files: files,
    diff,
    test_summary: summary,
    passing_keys: [...statuses].filter(([, s]) => s === 'passed').map(([k]) => k),
    jest_json: outFile,
  };
}

module.exports = { gradeWorkspace, captureDiff, restoreHidden };
