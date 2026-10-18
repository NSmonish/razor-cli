// registry tests — exercise the server + client against the local file store,
// over a real ephemeral HTTP server on a random port. no cloud needed.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createApp } = require('../server/index.js');
const { localStore } = require('../server/store.js');

// spin up the app on an ephemeral port with a temp local store
async function withServer(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'razor-reg-'));
  const store = localStore(path.join(tmp, 'registry.json'));
  await store.init();
  const app = createApp(store);
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const sampleSkill = (over = {}) => ({
  namespace: 'team-x',
  name: 'run-tests',
  version: '1',
  description: 'run the suite',
  triggers: ['test', 'jest'],
  evidence: 'package.json dep: jest',
  files: { 'SKILL.md': '---\nname: run-tests\n---\n# run-tests\n' },
  ...over,
});

test('health reports the store kind', async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/health`);
    const b = await r.json();
    assert.equal(b.ok, true);
    assert.equal(b.store, 'local');
  });
});

test('publish then pull round-trips a skill with files', async () => {
  await withServer(async (base) => {
    const pub = await fetch(`${base}/api/skills`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sampleSkill()),
    });
    assert.equal(pub.status, 201);
    const pulled = await (await fetch(`${base}/api/skills/team-x/run-tests`)).json();
    assert.equal(pulled.name, 'run-tests');
    assert.match(pulled.files['SKILL.md'], /# run-tests/);
    assert.deepEqual(pulled.triggers, ['test', 'jest']);
  });
});

test('list returns metadata only (no files) and supports namespace filter', async () => {
  await withServer(async (base) => {
    await fetch(`${base}/api/skills`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sampleSkill()) });
    await fetch(`${base}/api/skills`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sampleSkill({ namespace: 'team-y', name: 'lint-fix' })) });
    const all = await (await fetch(`${base}/api/skills`)).json();
    assert.equal(all.count, 2);
    assert.ok(all.skills.every((s) => s.files === undefined)); // list = metadata only
    const onlyX = await (await fetch(`${base}/api/skills?namespace=team-x`)).json();
    assert.equal(onlyX.count, 1);
    assert.equal(onlyX.skills[0].name, 'run-tests');
  });
});

test('publishing the same name overwrites (last write wins)', async () => {
  await withServer(async (base) => {
    await fetch(`${base}/api/skills`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sampleSkill({ version: '1' })) });
    await fetch(`${base}/api/skills`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sampleSkill({ version: '2', description: 'updated' })) });
    const pulled = await (await fetch(`${base}/api/skills/team-x/run-tests`)).json();
    assert.equal(pulled.version, '2');
    assert.equal(pulled.description, 'updated');
    const all = await (await fetch(`${base}/api/skills`)).json();
    assert.equal(all.count, 1); // not duplicated
  });
});

test('publish rejects invalid namespace / missing SKILL.md', async () => {
  await withServer(async (base) => {
    const bad1 = await fetch(`${base}/api/skills`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sampleSkill({ namespace: 'Bad NS!' })) });
    assert.equal(bad1.status, 400);
    const bad2 = await fetch(`${base}/api/skills`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sampleSkill({ files: { 'reference.md': 'x' } })) });
    assert.equal(bad2.status, 400);
  });
});

test('missing skill returns 404', async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/api/skills/team-x/nope`);
    assert.equal(r.status, 404);
  });
});
