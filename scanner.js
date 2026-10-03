// repo scanner — reads a project folder and figures out what stack it uses.
// detection is evidence-based: every fact records which file proved it, so the
// generated AGENTS.md isn't guessing. output keeps the original fields
// (language/framework/testing/orm/routes_folder) plus extras + an evidence map.
const fs = require('fs');
const path = require('path');

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.cache',
  'coverage', 'venv', '.venv', '__pycache__', '.idea', '.vscode', 'target',
]);

const MAX_DEPTH = 4;      // don't dig forever
const MAX_FILES = 4000;   // safety cap on big repos
const MAX_READ_BYTES = 200 * 1024; // only read the first chunk of a file

// walk the tree, collecting relative file paths (skipping ignored dirs)
function walk(root) {
  const files = [];
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length && files.length < MAX_FILES) {
    const { dir, depth } = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        if (depth < MAX_DEPTH) stack.push({ dir: full, depth: depth + 1 });
      } else if (e.isFile()) {
        files.push(path.relative(root, full));
        if (files.length >= MAX_FILES) break;
      }
    }
  }
  return files;
}

function readSafe(root, rel) {
  try {
    const fd = fs.openSync(path.join(root, rel), 'r');
    const buf = Buffer.alloc(MAX_READ_BYTES);
    const n = fs.readSync(fd, buf, 0, MAX_READ_BYTES, 0);
    fs.closeSync(fd);
    return buf.slice(0, n).toString('utf8');
  } catch (_) {
    return '';
  }
}

function parseJson(root, rel) {
  const txt = readSafe(root, rel);
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch (_) {
    return null;
  }
}

// does any file whose path matches `re` contain `needle`?
function codeContains(root, files, re, needle) {
  for (const f of files) {
    if (!re.test(f)) continue;
    const txt = readSafe(root, f);
    if (txt.includes(needle)) return f;
  }
  return null;
}

// ---- node detection -------------------------------------------------------

function detectNode(root, files, ev) {
  const pkg = parseJson(root, 'package.json');
  if (!pkg) return null;
  ev.language = 'package.json';

  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const has = (n) => Object.prototype.hasOwnProperty.call(deps, n);
  const jsRe = /\.(m?js|cjs|ts|tsx|jsx)$/;

  // framework — prefer code confirmation over a bare dep listing
  const fwTable = [
    ['next', 'Next.js', "next"],
    ['nuxt', 'Nuxt', "nuxt"],
    ['@angular/core', 'Angular', "@angular"],
    ['svelte', 'Svelte', "svelte"],
    ['express', 'Express.js', "express"],
    ['fastify', 'Fastify', "fastify"],
    ['@nestjs/core', 'NestJS', "@nestjs"],
    ['koa', 'Koa', "koa"],
    ['vue', 'Vue', "vue"],
    ['react', 'React', "react"],
    ['vite', 'Vite', "vite"],
  ];
  let framework = 'unknown';
  for (const [dep, name, needle] of fwTable) {
    if (!has(dep)) continue;
    const codeFile = codeContains(root, files, jsRe, needle);
    framework = name;
    ev.framework = codeFile ? `${codeFile} (imports ${needle})` : `package.json dep: ${dep}`;
    break;
  }

  // testing
  const testTable = [['jest', 'Jest'], ['vitest', 'Vitest'], ['mocha', 'Mocha']];
  let testing = 'unknown';
  for (const [dep, name] of testTable) {
    if (has(dep)) { testing = name; ev.testing = `package.json dep: ${dep}`; break; }
  }

  // orm
  const ormTable = [
    ['@prisma/client', 'Prisma'], ['prisma', 'Prisma'],
    ['sequelize', 'Sequelize'], ['typeorm', 'TypeORM'],
    ['mongoose', 'Mongoose'], ['drizzle-orm', 'Drizzle'],
  ];
  let orm = 'unknown';
  for (const [dep, name] of ormTable) {
    if (has(dep)) { orm = name; ev.orm = `package.json dep: ${dep}`; break; }
  }

  const language = files.some((f) => /\.tsx?$/.test(f)) ? 'TypeScript' : 'JavaScript';
  return { language, framework, testing, orm, _pkg: pkg };
}

// ---- python detection -----------------------------------------------------

function detectPython(root, files, ev) {
  const reqFiles = ['requirements.txt', 'pyproject.toml', 'Pipfile', 'setup.py']
    .filter((f) => files.includes(f));
  const hasPy = files.some((f) => f.endsWith('.py'));
  if (!reqFiles.length && !hasPy) return null;

  let text = '';
  for (const f of reqFiles) text += '\n' + readSafe(root, f).toLowerCase();
  if (reqFiles[0]) ev.language = reqFiles[0];
  else ev.language = 'has .py files';

  const has = (n) => text.includes(n);
  const where = reqFiles[0] || 'deps';

  let framework = 'unknown';
  if (has('django')) { framework = 'Django'; ev.framework = `${where}: django`; }
  else if (has('flask')) { framework = 'Flask'; ev.framework = `${where}: flask`; }
  else if (has('fastapi')) { framework = 'FastAPI'; ev.framework = `${where}: fastapi`; }

  let testing = 'unknown';
  if (has('pytest')) { testing = 'PyTest'; ev.testing = `${where}: pytest`; }
  else if (files.some((f) => /test_.*\.py$/.test(f))) { testing = 'unittest/pytest'; ev.testing = 'test_*.py files'; }

  let orm = 'unknown';
  if (has('sqlalchemy')) { orm = 'SQLAlchemy'; ev.orm = `${where}: sqlalchemy`; }
  else if (has('django')) { orm = 'Django ORM'; ev.orm = `${where}: django`; }
  else if (has('peewee')) { orm = 'Peewee'; ev.orm = `${where}: peewee`; }

  return { language: 'Python', framework, testing, orm };
}

// ---- shared signals -------------------------------------------------------

function detectRoutesFolder(root, files, ev) {
  const candidates = [
    'src/api/routes', 'src/routes', 'app/routes', 'routes',
    'src/api', 'api', 'app/api', 'pages/api', 'src/controllers', 'controllers',
  ];
  for (const c of candidates) {
    const p = path.join(root, c);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      ev.routes_folder = `found dir: ${c}`;
      return '/' + c;
    }
  }
  return 'unknown';
}

function detectTestLocations(files) {
  const dirs = new Set();
  for (const f of files) {
    if (/\.(test|spec)\.[tj]sx?$/.test(f) || /(^|\/)test_.*\.py$/.test(f) || /(^|\/)tests?\//.test(f)) {
      dirs.add(path.dirname(f) === '.' ? '(root)' : path.dirname(f));
    }
  }
  return [...dirs].slice(0, 10);
}

function detectConfigFiles(files) {
  const known = [
    'tsconfig.json', 'jest.config.js', 'jest.config.ts', 'vitest.config.ts',
    '.eslintrc', '.eslintrc.json', '.eslintrc.js', 'pyproject.toml',
    'docker-compose.yml', 'Dockerfile', '.prettierrc',
  ];
  return files.filter((f) => known.some((k) => f === k || f.endsWith('/' + k)));
}

function detectPackageManager(files) {
  if (files.includes('pnpm-lock.yaml')) return 'pnpm';
  if (files.includes('yarn.lock')) return 'yarn';
  if (files.includes('package-lock.json')) return 'npm';
  if (files.includes('poetry.lock')) return 'poetry';
  if (files.includes('Pipfile.lock')) return 'pipenv';
  return 'unknown';
}

// pull the handful of commands an agent actually needs (build/test/dev/start/lint)
function extractScripts(pkg) {
  if (!pkg || !pkg.scripts) return {};
  const wanted = ['dev', 'start', 'build', 'test', 'lint', 'typecheck', 'format', 'migrate'];
  const out = {};
  for (const k of wanted) {
    if (pkg.scripts[k]) out[k] = pkg.scripts[k];
  }
  return out;
}

// top-level dirs with a rough guess at what they hold
function extractStructure(root, files) {
  const topDirs = [...new Set(files.filter((f) => f.includes('/')).map((f) => f.split('/')[0]))]
    .filter((d) => !IGNORE_DIRS.has(d) && !d.startsWith('.'));
  const hint = (d) => {
    const m = {
      src: 'source code', app: 'application code', pages: 'routes/pages',
      components: 'UI components', routes: 'route handlers', api: 'api endpoints',
      controllers: 'controllers', models: 'data models', services: 'business logic',
      lib: 'shared libraries', utils: 'helpers', tests: 'tests', test: 'tests',
      public: 'static assets', prisma: 'prisma schema/migrations', migrations: 'db migrations',
      config: 'configuration', scripts: 'tooling scripts', docs: 'documentation',
      server: 'backend', client: 'frontend', frontend: 'frontend', backend: 'backend',
    };
    return m[d] || '';
  };
  return topDirs.slice(0, 20).map((d) => (hint(d) ? `${d}/ — ${hint(d)}` : `${d}/`));
}

// env var names from .env.example / .env.sample (names only, never values)
function extractEnvVars(root, files) {
  const envFile = ['.env.example', '.env.sample', '.env.template']
    .find((f) => files.includes(f));
  if (!envFile) return [];
  const txt = readSafe(root, envFile);
  const names = [];
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m) names.push(m[1]);
  }
  return names.slice(0, 30);
}

// key runtime deps (not dev) — gives the LLM the real libraries in play
function extractKeyDeps(pkg) {
  if (!pkg || !pkg.dependencies) return [];
  return Object.keys(pkg.dependencies).slice(0, 25);
}

// first non-empty heading/line of the readme as a one-liner description
function extractReadmeSummary(root, files) {
  const rf = files.find((f) => /^readme\.md$/i.test(f));
  if (!rf) return '';
  const txt = readSafe(root, rf);
  for (const line of txt.split('\n')) {
    const t = line.replace(/^#+\s*/, '').trim();
    if (t && !t.startsWith('![') && !t.startsWith('<')) return t.slice(0, 160);
  }
  return '';
}


// ---- main -----------------------------------------------------------------

function scanRepo(dir) {
  const root = path.resolve(dir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`not a directory: ${dir}`);
  }

  const files = walk(root);
  const ev = {};

  let stack = detectNode(root, files, ev);
  if (!stack) stack = detectPython(root, files, ev);

  // nothing at root — look one level down for a package.json / python project
  // (common for monorepos: frontend/, backend/, client/, server/, api/)
  const subProjects = [];
  if (!stack || stack.framework === 'unknown') {
    const subDirs = [...new Set(files
      .filter((f) => f.includes('/'))
      .map((f) => f.split('/')[0]))]
      .filter((d) => !IGNORE_DIRS.has(d));
    for (const sub of subDirs) {
      const subRoot = path.join(root, sub);
      const subFiles = walk(subRoot);
      const subEv = {};
      let s = detectNode(subRoot, subFiles, subEv) || detectPython(subRoot, subFiles, subEv);
      if (s && s.framework !== 'unknown') {
        delete s._pkg;
        subProjects.push({ path: sub, ...s, evidence: subEv });
      }
    }
    // if root found nothing at all, promote the first sub-project up
    if ((!stack || stack.framework === 'unknown') && subProjects.length) {
      const main = subProjects[0];
      stack = { language: main.language, framework: main.framework, testing: main.testing, orm: main.orm };
      ev.framework = `${main.path}/: ${main.evidence.framework || main.framework}`;
    }
  }

  // static site fallback — html + no package.json/python
  if (!stack) {
    const hasHtml = files.some((f) => f.endsWith('.html'));
    if (hasHtml) {
      stack = { language: 'HTML/CSS/JS (static)', framework: 'Static site', testing: 'unknown', orm: 'unknown' };
      ev.framework = 'has .html, no package.json';
    } else {
      stack = { language: 'unknown', framework: 'unknown', testing: 'unknown', orm: 'unknown' };
    }
  }

  const entryPoint =
    (stack._pkg && stack._pkg.main) ||
    ['index.js', 'src/index.js', 'src/index.ts', 'main.py', 'app.py', 'manage.py', 'index.html']
      .find((f) => files.includes(f)) || 'unknown';
  const pkg = stack._pkg || null;
  delete stack._pkg;

  return {
    language: stack.language,
    framework: stack.framework,
    testing: stack.testing,
    orm: stack.orm,
    routes_folder: detectRoutesFolder(root, files, ev),
    package_manager: detectPackageManager(files),
    entry_point: entryPoint,
    scripts: extractScripts(pkg),
    key_dependencies: extractKeyDeps(pkg),
    env_vars: extractEnvVars(root, files),
    structure: extractStructure(root, files),
    readme_summary: extractReadmeSummary(root, files),
    test_locations: detectTestLocations(files),
    config_files: detectConfigFiles(files),
    sub_projects: subProjects.map((s) => ({ path: s.path, framework: s.framework, language: s.language })),
    file_count: files.length,
    evidence: ev,
  };
}

module.exports = { scanRepo, walk };
