// workflow detection — extra repo signals the scaffold planner needs.
// kept separate from scanner.js so the core scan stays stable. every signal
// records evidence (which file/dir proved it) so nothing downstream guesses.
const fs = require('fs');
const path = require('path');

function exists(root, rel) {
  try {
    return fs.existsSync(path.join(root, rel));
  } catch (_) {
    return false;
  }
}

function isDir(root, rel) {
  try {
    return fs.statSync(path.join(root, rel)).isDirectory();
  } catch (_) {
    return false;
  }
}

// first match from a list of candidate paths, or null
function firstExisting(root, candidates) {
  for (const c of candidates) {
    if (exists(root, c)) return c;
  }
  return null;
}

// look at a repo and report the workflow-relevant facts the planner keys off.
// returns plain booleans + an evidence map, same spirit as scanner.js.
function detectWorkflows(dir) {
  const root = path.resolve(dir);
  const ev = {};

  // git remote — .git/config with a [remote ...] section
  let hasGitRemote = false;
  if (exists(root, '.git/config')) {
    try {
      const cfg = fs.readFileSync(path.join(root, '.git/config'), 'utf8');
      if (/\[remote /.test(cfg)) {
        hasGitRemote = true;
        ev.git_remote = '.git/config has a remote';
      }
    } catch (_) { /* ignore */ }
  }

  // CI config
  let hasCI = false;
  if (isDir(root, '.github/workflows')) {
    hasCI = true;
    ev.ci = '.github/workflows/';
  } else {
    const ciFile = firstExisting(root, [
      '.gitlab-ci.yml', '.circleci/config.yml', 'azure-pipelines.yml',
      '.travis.yml', 'Jenkinsfile',
    ]);
    if (ciFile) { hasCI = true; ev.ci = ciFile; }
  }

  // containerization
  let hasDocker = false;
  const dockerFile = firstExisting(root, [
    'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yml',
  ]);
  if (dockerFile) { hasDocker = true; ev.docker = dockerFile; }

  // db migrations — a dir or a known migration tool config
  let hasMigrations = false;
  const migDir = ['migrations', 'prisma/migrations', 'alembic', 'db/migrate']
    .find((d) => isDir(root, d));
  if (migDir) {
    hasMigrations = true;
    ev.migrations = `${migDir}/`;
  } else if (exists(root, 'prisma/schema.prisma')) {
    hasMigrations = true;
    ev.migrations = 'prisma/schema.prisma';
  } else if (exists(root, 'alembic.ini')) {
    hasMigrations = true;
    ev.migrations = 'alembic.ini';
  }

  // lint / format config
  let hasLint = false;
  const lintFile = firstExisting(root, [
    '.eslintrc', '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs',
    'eslint.config.js', 'eslint.config.mjs', '.prettierrc', '.prettierrc.json',
    'ruff.toml', '.flake8', '.pylintrc',
  ]);
  if (lintFile) { hasLint = true; ev.lint = lintFile; }

  // task runner (make/just/taskfile)
  let hasTaskRunner = false;
  const taskFile = firstExisting(root, ['Makefile', 'justfile', 'Taskfile.yml']);
  if (taskFile) { hasTaskRunner = true; ev.task_runner = taskFile; }

  return {
    hasGitRemote,
    hasCI,
    hasDocker,
    hasMigrations,
    hasLint,
    hasTaskRunner,
    evidence: ev,
  };
}

module.exports = { detectWorkflows };
