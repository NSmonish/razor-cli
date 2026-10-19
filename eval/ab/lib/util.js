// Shared helpers for the Razor A/B harness: paths, process spawning, fs bits.
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const AB_DIR = path.resolve(__dirname, '..');
const RAZOR_ROOT = path.resolve(AB_DIR, '..', '..');
const WORK_DIR = process.env.RAZOR_AB_DIR || '/tmp/razor-ab';

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function appendJSONL(file, row) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(row) + '\n');
}

function readJSONL(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

// run a command to completion; throws with stderr on non-zero unless allowFail
function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: opts.env || process.env,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    timeout: opts.timeoutMs,
  });
  if (res.error) throw res.error;
  if (res.status !== 0 && !opts.allowFail) {
    const msg = `${cmd} ${args.join(' ')} exited ${res.status}\n${(res.stderr || '').slice(-4000)}`;
    throw new Error(msg);
  }
  return res;
}

// async variant with a hard wall-clock ceiling; returns { code, signal, timedOut }
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env || process.env, stdio: opts.stdio || 'ignore' });
    let timedOut = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
          setTimeout(() => child.kill('SIGKILL'), 10_000).unref();
        }, opts.timeoutMs)
      : null;
    if (opts.onStdoutLine && child.stdout) {
      let buf = '';
      child.stdout.on('data', (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          opts.onStdoutLine(buf.slice(0, i));
          buf = buf.slice(i + 1);
        }
      });
      child.stdout.on('end', () => buf && opts.onStdoutLine(buf));
    }
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({ code, signal, timedOut });
    });
  });
}

// copy-on-write clone where the filesystem supports it (APFS / reflink), so
// copying a checkout with node_modules is cheap
function cloneTree(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const flag = process.platform === 'darwin' ? ['-c', '-R'] : ['--reflink=auto', '-R'];
  const res = spawnSync('cp', [...flag, src, dest], { encoding: 'utf8' });
  if (res.status !== 0) sh('cp', ['-R', src, dest]);
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

// files a unified diff touches (new-side paths)
function patchedFiles(patchText) {
  const files = [];
  for (const line of patchText.split('\n')) {
    const m = line.match(/^\+\+\+ b\/(.+)$/);
    if (m) files.push(m[1]);
  }
  return files;
}

function gitRev(cwd) {
  const res = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, encoding: 'utf8' });
  return res.status === 0 ? res.stdout.trim() : 'n/a';
}

function claudeVersion() {
  const res = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  return res.status === 0 ? res.stdout.trim() : 'unknown';
}

// env for anything that runs the repo's own tooling (install, hooks, tests, the
// agent): the repo's `path` entries go first on PATH, e.g. a pinned Node the
// host doesn't have. ${RAZOR_AB_DIR} in an entry is the harness work dir.
function repoEnv(repo, base = process.env) {
  const dirs = (repo.path || []).map((p) => p.replace('${RAZOR_AB_DIR}', WORK_DIR));
  return dirs.length ? { ...base, PATH: [...dirs, base.PATH].join(path.delimiter) } : { ...base };
}

function log(...args) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}]`, ...args);
}

module.exports = {
  AB_DIR, RAZOR_ROOT, WORK_DIR,
  readJSON, writeJSON, appendJSONL, readJSONL,
  sh, run, cloneTree, rmrf, patchedFiles, gitRev, claudeVersion, log, repoEnv,
};
