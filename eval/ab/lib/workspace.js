// Task/repo loading and disposable workspace preparation.
//
// A workspace is: the repo at its pinned commit (installed once into a cache),
// cloned copy-on-write, with the task's break applied, the hidden tests removed,
// per-slot env isolation applied, optionally the Razor pack added, then
// committed into a *fresh* git repo so the original code and hidden tests exist
// in no object, branch, or reflog the agent could find.
const fs = require('fs');
const path = require('path');
const { AB_DIR, RAZOR_ROOT, WORK_DIR, readJSON, sh, cloneTree, rmrf, patchedFiles, log, repoEnv } = require('./util');

const MODES = ['oracle', 'null', 'naive', 'razor'];

function loadRepo(name) {
  const dir = path.join(AB_DIR, 'repos', name);
  const repo = readJSON(path.join(dir, 'repo.json'));
  repo.dir = dir;
  return repo;
}

function loadTasks(ids) {
  const root = path.join(AB_DIR, 'tasks');
  const all = fs
    .readdirSync(root)
    .filter((d) => fs.existsSync(path.join(root, d, 'task.json')))
    .sort();
  const picked = ids && ids.length ? ids : all;
  return picked.map((id) => {
    if (!all.includes(id)) throw new Error(`unknown task "${id}" (known: ${all.join(', ')})`);
    const dir = path.join(root, id);
    const task = readJSON(path.join(dir, 'task.json'));
    task.dir = dir;
    task.promptText = fs.readFileSync(path.join(dir, task.prompt), 'utf8').trim();
    const hidePath = task.hide && path.join(dir, task.hide);
    task.hiddenFiles = hidePath && fs.existsSync(hidePath) ? patchedFiles(fs.readFileSync(hidePath, 'utf8')) : [];
    task.repoConfig = loadRepo(task.repo);
    return task;
  });
}

// clone + install the repo at its pinned commit (or the task's own `commit`,
// e.g. a real fix's parent), once per (repo, commit)
function ensureBase(repo, commit = repo.commit) {
  const base = path.join(WORK_DIR, 'cache', `${repo.name}@${commit.slice(0, 12)}`);
  const marker = path.join(base, '.razor-ab-ready');
  if (fs.existsSync(marker)) return base;
  rmrf(base);
  log(`cache: cloning ${repo.url} @ ${commit.slice(0, 12)}`);
  sh('git', ['clone', '--quiet', repo.url, base]);
  sh('git', ['checkout', '--quiet', commit], { cwd: base });
  for (const cmd of repo.install || []) {
    log(`cache: ${cmd.join(' ')}`);
    sh(cmd[0], cmd.slice(1), { cwd: base, env: repoEnv(repo), timeoutMs: 30 * 60_000 });
  }
  fs.writeFileSync(marker, new Date().toISOString() + '\n');
  return base;
}

function hook(repo, cmd, ws, slot) {
  if (!repo.hooks) return;
  sh('bash', [path.join(repo.dir, repo.hooks), cmd, ws, String(slot)], { env: repoEnv(repo), timeoutMs: 10 * 60_000 });
}

// break/hide are optional: a real-issue task has neither (the fix PR's tests
// come in through supp_files at grading time)
function applyPatch(ws, patchFile) {
  if (!fs.existsSync(patchFile) || !fs.readFileSync(patchFile, 'utf8').trim()) return;
  sh('git', ['apply', '--whitespace=nowarn', patchFile], { cwd: ws });
}

// the razor arm's pack: the repo's pinned pack (repo.json `razor_pack`, a
// directory relative to the razor-cli root) when it has one, else generated
function razorPackDir(repo) {
  return repo.razor_pack ? path.join(RAZOR_ROOT, repo.razor_pack) : null;
}

// every file under a pack directory, as sorted relative paths
function listPack(dir) {
  return fs
    .readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => fs.statSync(path.join(dir, f)).isFile())
    .sort();
}

// copy a pinned pack into the workspace root. A pack file must not replace a
// repo file, or the razor arm would also differ in the repo itself.
function installPinnedPack(ws, dir) {
  const files = listPack(dir);
  if (!files.length) throw new Error(`razor pack ${dir} is empty`);
  const clash = files.filter((f) => fs.existsSync(path.join(ws, f)));
  if (clash.length) throw new Error(`razor pack would overwrite repo files: ${clash.join(', ')}`);
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(ws, f)), { recursive: true });
    fs.copyFileSync(path.join(dir, f), path.join(ws, f));
  }
  return files;
}

// RAZOR_NO_LLM=1 keeps a generated pack deterministic (scaffold has no
// --offline flag any more; with a key it would call the LLM)
function razorScaffold(ws) {
  const res = sh('node', [path.join(RAZOR_ROOT, 'index.js'), 'scaffold', ws, '-o', ws, '--target', 'claude'], {
    cwd: RAZOR_ROOT,
    env: { ...process.env, RAZOR_NO_LLM: '1' },
  });
  // the CLI lists written files as two-space-indented relative paths after "Context pack written"
  const out = res.stdout.split('Context pack written')[1] || '';
  const files = out.split('\n').filter((l) => /^ {2}\S+$/.test(l)).map((l) => l.trim());
  if (!files.length) throw new Error(`razor scaffold wrote no files:\n${res.stdout}`);
  return files;
}

// fixed identity + dates so the initial commit is reproducible
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'razor-ab', GIT_AUTHOR_EMAIL: 'razor-ab@localhost',
  GIT_COMMITTER_NAME: 'razor-ab', GIT_COMMITTER_EMAIL: 'razor-ab@localhost',
  GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
};

// mode: oracle (original code + reference solution if any, all tests)
//       null (broken / feature missing, tests hidden)
//       naive | razor (broken, tests hidden; razor adds the pack)
function prepareWorkspace(task, mode, ws, slot) {
  if (!MODES.includes(mode)) throw new Error(`bad mode ${mode}`);
  const repo = task.repoConfig;
  const base = ensureBase(repo, task.commit || repo.commit);
  rmrf(ws);
  cloneTree(base, ws);
  rmrf(path.join(ws, '.git'));
  fs.rmSync(path.join(ws, '.razor-ab-ready'), { force: true });

  if (mode === 'oracle') {
    if (task.solution) applyPatch(ws, path.join(task.dir, task.solution));
  } else {
    if (task.break) applyPatch(ws, path.join(task.dir, task.break));
    if (task.hide) applyPatch(ws, path.join(task.dir, task.hide));
  }
  hook(repo, 'patch', ws, slot);

  let packFiles = [];
  if (mode === 'razor') {
    const dir = razorPackDir(repo);
    packFiles = dir ? installPinnedPack(ws, dir) : razorScaffold(ws);
  }

  sh('git', ['init', '--quiet', '-b', 'main'], { cwd: ws });
  sh('git', ['add', '-A'], { cwd: ws });
  sh('git', ['commit', '--quiet', '-m', 'initial'], { cwd: ws, env: GIT_ENV });

  hook(repo, 'up', ws, slot);
  return { ws, base, packFiles };
}

function teardownWorkspace(task, ws, slot, { keep } = {}) {
  hook(task.repoConfig, 'down', ws, slot);
  if (!keep) rmrf(ws);
}

module.exports = { loadTasks, loadRepo, ensureBase, prepareWorkspace, teardownWorkspace, hook, razorPackDir, listPack, installPinnedPack };
