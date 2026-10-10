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

  // build system — detect the real way this repo is built, beyond node/python.
  // ordered so the more specific/authoritative marker wins.
  let buildSystem = null;      // human label
  let buildCommand = null;     // the real build command
  let testCommand = null;      // the real test command
  const bs = (name, build, test, evidence) => {
    buildSystem = name; buildCommand = build; testCommand = test; ev.build_system = evidence;
  };
  if (exists(root, 'WORKSPACE') || exists(root, 'WORKSPACE.bazel') || exists(root, 'MODULE.bazel')) {
    bs('Bazel', 'bazel build //...', 'bazel test //...',
      firstExisting(root, ['MODULE.bazel', 'WORKSPACE.bazel', 'WORKSPACE']));
  } else if (exists(root, 'Cargo.toml')) {
    bs('Cargo (Rust)', 'cargo build', 'cargo test', 'Cargo.toml');
  } else if (exists(root, 'go.mod')) {
    bs('Go modules', 'go build ./...', 'go test ./...', 'go.mod');
  } else if (exists(root, 'pom.xml')) {
    bs('Maven', 'mvn compile', 'mvn test', 'pom.xml');
  } else if (exists(root, 'build.gradle') || exists(root, 'build.gradle.kts')) {
    bs('Gradle', './gradlew build', './gradlew test',
      firstExisting(root, ['build.gradle', 'build.gradle.kts']));
  } else if (exists(root, 'CMakeLists.txt')) {
    bs('CMake', 'cmake -S . -B build && cmake --build build', 'ctest --test-dir build', 'CMakeLists.txt');
  } else if (taskFile === 'Makefile') {
    // only treat Make as the build system if nothing more specific matched
    bs('Make', 'make', 'make test', 'Makefile');
  }

  return {
    hasGitRemote,
    hasCI,
    hasDocker,
    hasMigrations,
    hasLint,
    hasTaskRunner,
    buildSystem,
    buildCommand,
    testCommand,
    evidence: ev,
  };
}

module.exports = { detectWorkflows };
