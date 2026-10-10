// tests for the scaffold foundation: workflow detection + the rule planner.
// no AI involved here, so these are fully deterministic.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { detectWorkflows } = require('../workflows.js');
const { planScaffold, candidateSkills, candidateDocs } = require('../planner.js');

const NODE_FIXTURE = path.join(__dirname, 'fixtures', 'node-express');
const PY_FIXTURE = path.join(__dirname, 'fixtures', 'python-flask');

// ---- workflow detection ---------------------------------------------------

test('detectWorkflows picks up a lint config when present', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'razor-lint-'));
  fs.writeFileSync(path.join(tmp, '.eslintrc.json'), '{}\n');
  const f = detectWorkflows(tmp);
  assert.equal(f.hasLint, true);
  assert.equal(f.evidence.lint, '.eslintrc.json');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('detectWorkflows returns all-false on an empty dir (no crash)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'razor-wf-'));
  const f = detectWorkflows(tmp);
  assert.equal(f.hasGitRemote, false);
  assert.equal(f.hasCI, false);
  assert.equal(f.hasDocker, false);
  assert.equal(f.hasMigrations, false);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('detectWorkflows finds a Dockerfile and migrations dir', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'razor-wf2-'));
  fs.writeFileSync(path.join(tmp, 'Dockerfile'), 'FROM node:20\n');
  fs.mkdirSync(path.join(tmp, 'migrations'));
  const f = detectWorkflows(tmp);
  assert.equal(f.hasDocker, true);
  assert.equal(f.hasMigrations, true);
  assert.equal(f.evidence.docker, 'Dockerfile');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('detectWorkflows identifies Bazel as the build system', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'razor-bazel-'));
  fs.writeFileSync(path.join(tmp, 'WORKSPACE'), '');
  fs.writeFileSync(path.join(tmp, 'BUILD'), '');
  const f = detectWorkflows(tmp);
  assert.equal(f.buildSystem, 'Bazel');
  assert.equal(f.buildCommand, 'bazel build //...');
  assert.equal(f.testCommand, 'bazel test //...');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('detectWorkflows identifies Cargo and Go', () => {
  const t1 = fs.mkdtempSync(path.join(os.tmpdir(), 'razor-cargo-'));
  fs.writeFileSync(path.join(t1, 'Cargo.toml'), '[package]\n');
  assert.equal(detectWorkflows(t1).buildSystem, 'Cargo (Rust)');
  fs.rmSync(t1, { recursive: true, force: true });

  const t2 = fs.mkdtempSync(path.join(os.tmpdir(), 'razor-go-'));
  fs.writeFileSync(path.join(t2, 'go.mod'), 'module x\n');
  assert.equal(detectWorkflows(t2).buildSystem, 'Go modules');
  fs.rmSync(t2, { recursive: true, force: true });
});

test('planner adds a build skill and build-system check script for a bazel repo', () => {
  const scan = { testing: 'unknown', orm: 'unknown', scripts: {}, structure: [], sub_projects: [], evidence: {} };
  const flows = {
    hasGitRemote: false, hasCI: false, hasDocker: false, hasMigrations: false, hasLint: false,
    buildSystem: 'Bazel', buildCommand: 'bazel build //...', testCommand: 'bazel test //...',
    evidence: { build_system: 'WORKSPACE' },
  };
  const plan = planScaffold(scan, flows);
  const build = plan.skills.find((s) => s.name === 'build');
  assert.ok(build, 'should propose a build skill');
  assert.equal(build.command, 'bazel build //...');
  assert.ok(plan.script, 'should emit a check script');
  assert.ok(plan.script.steps.includes('bazel test //...'), 'check script uses the bazel test command');
});

// ---- planner: candidate skills --------------------------------------------

test('candidateSkills proposes run-tests only when a test runner exists', () => {
  const withTests = candidateSkills(
    { testing: 'Jest', scripts: { test: 'jest' }, evidence: { testing: 'pkg: jest' } },
    { evidence: {} },
  );
  assert.ok(withTests.find((s) => s.name === 'run-tests'));

  const noTests = candidateSkills(
    { testing: 'unknown', scripts: {}, evidence: {} },
    { evidence: {} },
  );
  assert.ok(!noTests.find((s) => s.name === 'run-tests'));
});

test('candidateSkills proposes db-migrations only with ORM AND migrations', () => {
  const scan = { orm: 'Prisma', testing: 'unknown', scripts: {}, evidence: { orm: 'pkg: prisma' } };

  const withMig = candidateSkills(scan, { hasMigrations: true, evidence: { migrations: 'prisma/migrations/' } });
  assert.ok(withMig.find((s) => s.name === 'db-migrations'));

  const noMig = candidateSkills(scan, { hasMigrations: false, evidence: {} });
  assert.ok(!noMig.find((s) => s.name === 'db-migrations'));
});

test('db-migrations is flagged complex (gets a reference doc)', () => {
  const scan = { orm: 'SQLAlchemy', testing: 'unknown', scripts: {}, evidence: {} };
  const skills = candidateSkills(scan, { hasMigrations: true, evidence: {} });
  const mig = skills.find((s) => s.name === 'db-migrations');
  assert.equal(mig.complex, true);
});

// ---- planner: right-sizing (the key behavior) -----------------------------

test('a tiny static site yields a much smaller plan than a full backend', () => {
  const staticScan = {
    framework: 'Static site', language: 'HTML/CSS/JS (static)',
    testing: 'unknown', orm: 'unknown', scripts: {}, structure: [], sub_projects: [],
    evidence: {},
  };
  const staticFlows = { hasGitRemote: false, hasCI: false, hasDocker: false, hasMigrations: false, hasLint: false, evidence: {} };
  const small = planScaffold(staticScan, staticFlows);

  const backendScan = {
    framework: 'Express.js', language: 'JavaScript', testing: 'Jest', orm: 'Prisma',
    scripts: { test: 'jest', lint: 'eslint .', build: 'tsc', migrate: 'prisma migrate' },
    structure: ['src/ — source code', 'routes/ — route handlers', 'models/ — data models'],
    sub_projects: [], evidence: { testing: 'x', orm: 'y' },
  };
  const backendFlows = { hasGitRemote: true, hasCI: true, hasDocker: true, hasMigrations: true, hasLint: true, evidence: { lint: '.eslintrc', docker: 'Dockerfile', migrations: 'prisma/migrations/', git_remote: 'x', ci: 'y' } };
  const big = planScaffold(backendScan, backendFlows);

  assert.ok(big.size > small.size, 'backend plan should be larger than static-site plan');
  assert.ok(big.skills.length >= 4, 'backend should propose several skills');
  assert.ok(small.skills.length === 0, 'static site should propose no skills');
});

test('candidateDocs skips architecture/workflows for a bare repo', () => {
  const docs = candidateDocs(
    { structure: [], sub_projects: [], scripts: {}, testing: 'unknown' },
    { hasCI: false, hasDocker: false, hasMigrations: false, hasLint: false },
  );
  const names = docs.map((d) => d.name);
  assert.ok(names.includes('overview'), 'overview is always present');
  assert.ok(!names.includes('architecture'), 'no architecture for a bare repo');
  assert.ok(!names.includes('verification'), 'no verification without tests/lint');
});

// ---- planner end to end on the real fixtures ------------------------------

test('planScaffold runs on the python fixture and proposes grounded skills', () => {
  const { scanRepo } = require('../scanner.js');
  const scan = scanRepo(PY_FIXTURE);
  const flows = detectWorkflows(PY_FIXTURE);
  const plan = planScaffold(scan, flows);
  // flask+sqlalchemy+pytest fixture should at least get a run-tests skill
  assert.ok(plan.skills.find((s) => s.name === 'run-tests'), 'should propose run-tests');
  assert.ok(plan.docs.find((d) => d.name === 'overview'), 'should always include overview');
});

// ---- emitter --------------------------------------------------------------

test('emitScaffold writes a full pack with entry, docs, skills and script', () => {
  const { scanRepo } = require('../scanner.js');
  const { emitScaffold } = require('../emitter.js');
  const scan = scanRepo(NODE_FIXTURE);
  const flows = detectWorkflows(NODE_FIXTURE);
  const plan = planScaffold(scan, flows);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'razor-emit-'));
  const { written } = emitScaffold(scan, flows, plan, tmp);

  // entry file always exists and is non-trivial
  const entry = fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8');
  assert.ok(entry.includes('# Agent Context Pack'), 'entry has a header');
  assert.ok(entry.includes('## Documents'), 'entry links docs');
  assert.ok(entry.length > 300, 'entry is substantive, not a stub');

  // overview doc exists and carries real stack facts
  const overview = fs.readFileSync(path.join(tmp, 'overview.md'), 'utf8');
  assert.ok(overview.includes('Express.js'), 'overview names the framework');

  // every proposed skill produced a SKILL.md with frontmatter
  for (const s of plan.skills) {
    const skillMd = fs.readFileSync(path.join(tmp, 'skills', s.name, 'SKILL.md'), 'utf8');
    assert.ok(skillMd.includes('name: ' + s.name), `${s.name} has frontmatter name`);
    assert.ok(skillMd.includes('description:'), `${s.name} has a description`);
    assert.ok(skillMd.includes('Evidence:'), `${s.name} records evidence`);
  }

  assert.ok(written.length >= 2, 'wrote multiple files');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('kiro target places docs under .kiro/steering and skills under .kiro/skills', () => {
  const { scanRepo } = require('../scanner.js');
  const { emitScaffold } = require('../emitter.js');
  const scan = scanRepo(NODE_FIXTURE);
  const flows = detectWorkflows(NODE_FIXTURE);
  const plan = planScaffold(scan, flows);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'razor-kiro-'));
  const { written, note } = emitScaffold(scan, flows, plan, tmp, { target: 'kiro' });

  assert.ok(fs.existsSync(path.join(tmp, 'AGENTS.md')), 'entry still at root');
  assert.ok(fs.existsSync(path.join(tmp, '.kiro', 'steering', 'overview.md')), 'docs under .kiro/steering');
  const firstSkill = plan.skills[0].name;
  assert.ok(fs.existsSync(path.join(tmp, '.kiro', 'skills', firstSkill, 'SKILL.md')), 'skills under .kiro/skills');
  assert.match(note, /Kiro/);
  // entry links should point into .kiro/steering
  const entry = fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8');
  assert.ok(entry.includes('.kiro/steering/overview.md'), 'entry links to the kiro doc path');
  void written;
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('claude target puts skills under .claude/skills and keeps AGENTS.md (no CLAUDE.md)', () => {
  const { scanRepo } = require('../scanner.js');
  const { emitScaffold } = require('../emitter.js');
  const scan = scanRepo(NODE_FIXTURE);
  const flows = detectWorkflows(NODE_FIXTURE);
  const plan = planScaffold(scan, flows);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'razor-claude-'));
  emitScaffold(scan, flows, plan, tmp, { target: 'claude' });

  assert.ok(fs.existsSync(path.join(tmp, 'AGENTS.md')), 'AGENTS.md entry (no bridge)');
  assert.ok(!fs.existsSync(path.join(tmp, 'CLAUDE.md')), 'no CLAUDE.md bridge is written');
  const firstSkill = plan.skills[0].name;
  assert.ok(fs.existsSync(path.join(tmp, '.claude', 'skills', firstSkill, 'SKILL.md')), 'skills under .claude/skills');
  // docs at root for claude
  assert.ok(fs.existsSync(path.join(tmp, 'overview.md')), 'docs at root for claude');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('complex skill (db-migrations) also emits a reference.md', () => {
  const { emitScaffold } = require('../emitter.js');
  const scan = {
    language: 'Python', framework: 'Django', testing: 'unknown', orm: 'Django ORM',
    scripts: {}, structure: [], sub_projects: [], env_vars: ['DATABASE_URL'],
    config_files: [], test_locations: [], evidence: { orm: 'requirements: django' },
  };
  const flows = { hasGitRemote: false, hasCI: false, hasDocker: false, hasMigrations: true, hasLint: false, evidence: { migrations: 'migrations/' } };
  const plan = planScaffold(scan, flows);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'razor-emit3-'));
  emitScaffold(scan, flows, plan, tmp);
  assert.ok(fs.existsSync(path.join(tmp, 'skills', 'db-migrations', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(tmp, 'skills', 'db-migrations', 'reference.md')),
    'complex skill should get a reference doc');
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---- enricher (no network needed) -----------------------------------------

test('enrichDocs is a no-op passthrough when there is no API key', async () => {
  const { enrichDocs } = require('../enricher.js');
  const saved = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const drafts = { overview: '# Overview\nhi', 'run-tests': 'x' };
    const res = await enrichDocs(drafts, '{}');
    assert.equal(res.usedLLM, false);
    assert.deepEqual(res.docs, drafts, 'docs returned unchanged without a key');
  } finally {
    if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
  }
});

test('isProseDoc only flags the prose docs, not skills/verification', () => {
  const { isProseDoc } = require('../enricher.js');
  assert.equal(isProseDoc('overview'), true);
  assert.equal(isProseDoc('architecture'), true);
  assert.equal(isProseDoc('steering'), true);
  assert.equal(isProseDoc('verification'), false); // mechanical, leave alone
  assert.equal(isProseDoc('run-tests'), false);
});

test('enrich prompt forbids invention and keeps the heading', () => {
  const { buildEnrichPrompt } = require('../enricher.js');
  const p = buildEnrichPrompt('overview', '# Overview\n- Framework: Express.js', '{"framework":"Express.js"}');
  assert.ok(/do not invent/i.test(p), 'prompt must forbid invention');
  assert.ok(/only facts/i.test(p), 'prompt must restrict to given facts');
  assert.ok(p.includes('# Overview'), 'prompt should preserve the heading');
});
