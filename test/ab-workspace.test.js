// Unit tests for how the A/B eval installs a pinned Razor pack (eval/ab/lib/workspace.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadRepo, razorPackDir, listPack, installPinnedPack } = require('../eval/ab/lib/workspace');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'razor-ab-ws-'));

test('nodejs-testing-best-practices pins the worked-example pack', () => {
  const dir = razorPackDir(loadRepo('nodejs-testing-best-practices'));
  const files = listPack(dir);
  for (const f of ['AGENTS.md', 'skills.index.json', 'scripts/check.sh', '.claude/skills/db-migrations/SKILL.md', '.claude/skills/local-env/SKILL.md']) {
    assert.ok(files.includes(f), `pack is missing ${f}`);
  }
  // instructions for humans running the eval must never reach the agent
  assert.ok(!files.some((f) => /README-FOR-CLAUDE/.test(f)));
});

test('every skill in the pinned pack is routable from skills.index.json', () => {
  const dir = razorPackDir(loadRepo('nodejs-testing-best-practices'));
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'skills.index.json'), 'utf8'));
  const skills = listPack(dir).filter((f) => f.endsWith('/SKILL.md'));
  assert.deepStrictEqual(manifest.skills.map((s) => s.path).sort(), skills);
});

test('installPinnedPack copies hidden dirs and returns relative paths', () => {
  const pack = tmp();
  const ws = tmp();
  fs.mkdirSync(path.join(pack, '.claude/skills/run-tests'), { recursive: true });
  fs.writeFileSync(path.join(pack, 'AGENTS.md'), 'entry');
  fs.writeFileSync(path.join(pack, '.claude/skills/run-tests/SKILL.md'), 'skill');
  assert.deepStrictEqual(installPinnedPack(ws, pack), ['.claude/skills/run-tests/SKILL.md', 'AGENTS.md']);
  assert.strictEqual(fs.readFileSync(path.join(ws, '.claude/skills/run-tests/SKILL.md'), 'utf8'), 'skill');
});

test('installPinnedPack refuses to overwrite a repo file', () => {
  const pack = tmp();
  const ws = tmp();
  fs.writeFileSync(path.join(pack, 'AGENTS.md'), 'pack');
  fs.writeFileSync(path.join(ws, 'AGENTS.md'), 'repo');
  assert.throws(() => installPinnedPack(ws, pack), /overwrite repo files: AGENTS.md/);
  assert.strictEqual(fs.readFileSync(path.join(ws, 'AGENTS.md'), 'utf8'), 'repo');
});

test('repos without a pinned pack fall back to generating one', () => {
  assert.strictEqual(razorPackDir(loadRepo('fastify')), null);
});
