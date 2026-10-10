// planner — turns a repo scan (+ workflow signals) into a scaffold plan:
// which top-level docs and which skills to generate, each grounded in evidence.
// this is the deterministic rule layer. the LLM layer (later) only trims this
// list and writes prose; it can never add a skill that isn't proposed here.
// that's the honesty guard: no evidence -> no skill.

const known = (v) => v && v !== 'unknown';

// decide which skills a repo warrants, based on what the scan actually found.
// each candidate carries its evidence and (where relevant) the repo's real
// command, so downstream rendering never invents commands.
function candidateSkills(scan, flows) {
  const skills = [];
  const scripts = scan.scripts || {};

  // run-tests — only if a test runner was detected
  if (known(scan.testing)) {
    skills.push({
      name: 'run-tests',
      intent: 'run the test suite',
      command: scripts.test || null,
      framework: scan.testing,
      evidence: scan.evidence.testing || `testing: ${scan.testing}`,
      complex: false,
    });
  }

  // lint-fix — only if a lint/format config exists
  if (flows.hasLint) {
    skills.push({
      name: 'lint-fix',
      intent: 'lint and auto-fix code style',
      command: scripts.lint || null,
      evidence: flows.evidence.lint,
      complex: false,
    });
  }

  // code-push — only if there's somewhere to push (remote) and ideally CI
  if (flows.hasGitRemote) {
    skills.push({
      name: 'code-push',
      intent: 'verify and push changes',
      // steps use whatever verification the repo actually has
      verify: [scripts.lint, scripts.test].filter(Boolean),
      hasCI: flows.hasCI,
      evidence: [flows.evidence.git_remote, flows.evidence.ci].filter(Boolean).join('; '),
      complex: false,
    });
  }

  // db-migrations — only if there's an ORM AND migration machinery
  if (known(scan.orm) && flows.hasMigrations) {
    skills.push({
      name: 'db-migrations',
      intent: 'create and apply database migrations',
      command: scripts.migrate || null,
      orm: scan.orm,
      evidence: [scan.evidence.orm, flows.evidence.migrations].filter(Boolean).join('; '),
      // migrations are fiddly -> flag for a deeper reference doc
      complex: true,
    });
  }

  // local-env — only if the repo is containerized
  if (flows.hasDocker) {
    skills.push({
      name: 'local-env',
      intent: 'build and run the app locally with containers',
      evidence: flows.evidence.docker,
      complex: false,
    });
  }

  return skills;
}

// decide which top-level docs make sense. a tiny repo gets almost nothing;
// a richer repo gets the full layered set. driven by what the scan contains.
function candidateDocs(scan, flows) {
  const docs = [];

  // overview — always worth it as long as we detected *something*
  docs.push({ name: 'overview', reason: 'what the repo is + how to run it' });

  // architecture — only if there's real structure to describe
  const structured = (scan.structure && scan.structure.length >= 3) ||
    (scan.sub_projects && scan.sub_projects.length > 0);
  if (structured) {
    docs.push({ name: 'architecture', reason: 'non-trivial directory structure' });
  }

  // workflows — only if there are real workflows (scripts or ci/docker/migrations)
  const hasWorkflows = (scan.scripts && Object.keys(scan.scripts).length > 0) ||
    flows.hasCI || flows.hasDocker || flows.hasMigrations;
  if (hasWorkflows) {
    docs.push({ name: 'workflows', reason: 'has build/test/deploy workflows' });
  }

  // verification — only if there's a way to verify (tests or lint)
  if (known(scan.testing) || flows.hasLint) {
    docs.push({ name: 'verification', reason: 'has tests and/or lint to verify work' });
  }

  // steering — global conventions. worth it once the repo is non-trivial.
  if (structured || hasWorkflows) {
    docs.push({ name: 'steering', reason: 'enough conventions to be worth stating' });
  }

  return docs;
}

// should we emit a runnable check script? only if there's something to run.
function candidateScript(scan, flows) {
  const scripts = scan.scripts || {};
  const steps = [];
  if (scripts.lint) steps.push(scripts.lint);
  if (scripts.test) steps.push(scripts.test);
  // python repos without npm scripts: fall back to common commands if evidenced
  if (!steps.length && known(scan.testing) && /pytest/i.test(scan.testing)) {
    steps.push('pytest');
  }
  if (!steps.length) return null;
  return { file: 'scripts/check.sh', steps };
}

// top-level: full scaffold plan for a repo.
function planScaffold(scan, flows) {
  const skills = candidateSkills(scan, flows);
  const docs = candidateDocs(scan, flows);
  const script = candidateScript(scan, flows);

  return {
    docs,
    skills,
    script,
    // a rough size signal, handy for the "right-sizing" demo
    size: skills.length + docs.length + (script ? 1 : 0),
  };
}

module.exports = { planScaffold, candidateSkills, candidateDocs, candidateScript };
