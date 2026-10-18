// smoke tests for razor-cli — uses node's built-in runner, no extra deps
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildPrompt, mockAgentsMd, scanRepo } = require('../index.js');

const CLI = path.join(__dirname, '..', 'index.js');
const NODE_FIXTURE = path.join(__dirname, 'fixtures', 'node-express');
const PY_FIXTURE = path.join(__dirname, 'fixtures', 'python-flask');

test('scanRepo detects a node/express/jest/prisma repo', () => {
  const d = scanRepo(NODE_FIXTURE);
  assert.equal(d.language, 'JavaScript');
  assert.equal(d.framework, 'Express.js');
  assert.equal(d.testing, 'Jest');
  assert.equal(d.orm, 'Prisma');
  assert.equal(d.routes_folder, '/src/api/routes');
  // evidence-based: framework should be confirmed from actual code
  assert.match(d.evidence.framework, /imports express/);
  assert.equal(d.package_manager, 'npm');
  assert.equal(d.entry_point, 'src/index.js');
});

test('scanRepo detects a python/flask/pytest/sqlalchemy repo', () => {
  const d = scanRepo(PY_FIXTURE);
  assert.equal(d.language, 'Python');
  assert.equal(d.framework, 'Flask');
  assert.equal(d.testing, 'PyTest');
  assert.equal(d.orm, 'SQLAlchemy');
  assert.equal(d.routes_folder, '/app/routes');
  assert.match(d.evidence.framework, /flask/);
  assert.equal(d.entry_point, 'app.py');
});

test('scanRepo returns unknowns (not a crash) on an empty dir', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'razor-empty-'));
  const d = scanRepo(tmp);
  assert.equal(d.framework, 'unknown');
  assert.equal(d.testing, 'unknown');
  assert.equal(d.orm, 'unknown');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('scanRepo throws on a path that is not a directory', () => {
  assert.throws(() => scanRepo(path.join(__dirname, 'does-not-exist')));
});

test('extractScripts captures a namespaced migrate script without misreading test:dev', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'razor-scripts-'));
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
    dependencies: { express: '^4' },
    scripts: { test: 'jest', 'test:dev': 'jest --watch', lint: 'eslint .', 'db:migrate': 'sequelize-cli db:migrate' },
  }));
  const d = scanRepo(tmp);
  assert.equal(d.scripts.test, 'jest');
  assert.equal(d.scripts.migrate, 'sequelize-cli db:migrate'); // namespaced migrate caught
  assert.equal(d.scripts.dev, undefined); // test:dev must NOT be read as the dev script
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('fastapi is not mislabeled as Flask (word-boundary + order)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'razor-fa-'));
  // a pyproject that names fastapi but also mentions flask in an extra
  fs.writeFileSync(path.join(tmp, 'pyproject.toml'),
    'name = "fastapi"\ndependencies = ["fastapi", "starlette"]\n# note: not flask\n');
  fs.writeFileSync(path.join(tmp, 'main.py'), 'from fastapi import FastAPI\n');
  const d = scanRepo(tmp);
  assert.equal(d.framework, 'FastAPI');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('a python project with root JS tooling is still labeled Python', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'razor-pyjs-'));
  // JS tooling at root (like Django's Gruntfile) + strong python signals
  fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"x","devDependencies":{"grunt":"1"}}');
  fs.writeFileSync(path.join(tmp, 'pyproject.toml'), 'name = "django"\ndependencies = ["django"]\n');
  for (let i = 0; i < 6; i++) fs.writeFileSync(path.join(tmp, `mod${i}.py`), 'x = 1\n');
  const d = scanRepo(tmp);
  assert.equal(d.language, 'Python');
  assert.equal(d.framework, 'Django');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('razor init auto-scans a directory in mock mode', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'razor-scan-'));
  const output = path.join(tmp, 'AGENTS.md');

  const env = { ...process.env };
  delete env.GEMINI_API_KEY;

  execFileSync('node', [CLI, 'init', NODE_FIXTURE, '-o', output], { env, stdio: 'ignore' });

  assert.ok(fs.existsSync(output), 'AGENTS.md should be created from a scan');
  const md = fs.readFileSync(output, 'utf8');
  assert.ok(md.includes('Express.js') && md.includes('Jest') && md.includes('Prisma'),
    'scanned guardrails should appear in the output');

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('buildPrompt embeds the repo data and the strict rules', () => {
  const data = JSON.stringify({ framework: 'Express.js' });
  const p = buildPrompt(data);
  assert.ok(p.includes('Express.js'), 'repo data should be in the prompt');
  assert.ok(/ONLY raw markdown/i.test(p), 'should tell the model to output raw markdown');
  assert.ok(/testing framework/i.test(p), 'should ask for testing guardrail');
});

test('mockAgentsMd fills guardrails from json', () => {
  const data = JSON.stringify({
    framework: 'Express.js',
    testing: 'Jest',
    orm: 'Prisma',
    routes_folder: '/src/api/routes',
  });
  const md = mockAgentsMd(data);
  assert.ok(md.includes('Jest'));
  assert.ok(md.includes('Prisma'));
  assert.ok(md.includes('/src/api/routes'));
});

test('mockAgentsMd degrades gracefully on bad json', () => {
  const md = mockAgentsMd('{ not valid json');
  // should still produce a valid markdown doc, not crash, even with no data
  assert.ok(md.includes('# AGENTS.md'), 'should still render a document header');
  assert.ok(md.includes('## Guardrails for Agents'), 'should still render sections');
});

// integration: run the real CLI in a temp dir with NO api key -> mock path.
// deterministic and free (no network).
test('razor init writes AGENTS.md in mock mode', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'razor-'));
  const input = path.join(tmp, 'dummy_repo_data.json');
  const output = path.join(tmp, 'AGENTS.md');
  fs.writeFileSync(input, JSON.stringify({
    framework: 'Express.js', testing: 'Jest', orm: 'Prisma', routes_folder: '/src/api/routes',
  }));

  const env = { ...process.env };
  delete env.GEMINI_API_KEY; // force the offline mock path

  execFileSync('node', [CLI, 'init', '-i', input, '-o', output], {
    env,
    stdio: 'ignore',
  });

  assert.ok(fs.existsSync(output), 'AGENTS.md should be created');
  const md = fs.readFileSync(output, 'utf8');
  assert.ok(md.includes('Jest') && md.includes('Prisma'), 'mock output should carry guardrails');

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('razor init exits non-zero when input file is missing', () => {
  const env = { ...process.env };
  delete env.GEMINI_API_KEY;
  assert.throws(() => {
    execFileSync('node', [CLI, 'init', '-i', 'nope_does_not_exist.json'], {
      env,
      stdio: 'ignore',
    });
  }, 'missing input should make the CLI exit non-zero');
});
