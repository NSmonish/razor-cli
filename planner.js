// planner — turns a repo scan (+ workflow signals) into a scaffold plan:
// which top-level docs and which skills to generate, each grounded in evidence.
// this is the deterministic rule layer. the LLM layer (later) only trims this
// list and writes prose; it can never add a skill that isn't proposed here.
// that's the honesty guard: no evidence -> no skill.

const known = (v) => v && v !== 'unknown';

// SKILL REGISTRY — one declared entry per possible skill. each has:
//   name     : skill id
//   build(scan, flows) -> a skill object if the repo's evidence supports it,
//                         or null if it should NOT be generated.
// keeping every skill in one list makes coverage auditable (easy to see the
// full catalog) and lets the user-add flow look a skill up by name. adding a
// new skill = one registry entry; it can't be "missed" by a scattered if.
const SKILL_REGISTRY = [
  {
    name: 'run-tests',
    build: (scan) => known(scan.testing) && {
      name: 'run-tests',
      intent: 'run the test suite',
      command: (scan.scripts || {}).test || null,
      framework: scan.testing,
      evidence: scan.evidence.testing || `testing: ${scan.testing}`,
      complex: false,
    },
  },
  {
    name: 'lint-fix',
    build: (scan, flows) => flows.hasLint && {
      name: 'lint-fix',
      intent: 'lint and auto-fix code style',
      command: (scan.scripts || {}).lint || null,
      evidence: flows.evidence.lint,
      complex: false,
    },
  },
  {
    name: 'code-push',
    build: (scan, flows) => flows.hasGitRemote && {
      name: 'code-push',
      intent: 'verify and push changes',
      verify: [(scan.scripts || {}).lint, (scan.scripts || {}).test].filter(Boolean),
      hasCI: flows.hasCI,
      evidence: [flows.evidence.git_remote, flows.evidence.ci].filter(Boolean).join('; '),
      complex: false,
    },
  },
  {
    name: 'db-migrations',
    build: (scan, flows) => (known(scan.orm) && flows.hasMigrations) && {
      name: 'db-migrations',
      intent: 'create and apply database migrations',
      command: (scan.scripts || {}).migrate || null,
      orm: scan.orm,
      evidence: [scan.evidence.orm, flows.evidence.migrations].filter(Boolean).join('; '),
      complex: true,
    },
  },
  {
    name: 'local-env',
    build: (scan, flows) => flows.hasDocker && {
      name: 'local-env',
      intent: 'build and run the app locally with containers',
      evidence: flows.evidence.docker,
      complex: false,
    },
  },
  {
    name: 'build',
    build: (scan, flows) => flows.buildSystem && {
      name: 'build',
      intent: `build the project with ${flows.buildSystem}`,
      buildSystem: flows.buildSystem,
      command: flows.buildCommand,
      testCommand: flows.testCommand,
      evidence: flows.evidence.build_system,
      complex: false,
    },
  },
];

// the full catalog of skill names Razor knows how to generate
function knownSkillNames() {
  return SKILL_REGISTRY.map((s) => s.name);
}

// decide which skills a repo warrants, by running every registry entry's
// detector. each returned candidate is grounded (carries evidence + real
// command). the LLM layer may later trim this, never add to it.
function candidateSkills(scan, flows) {
  const skills = [];
  for (const entry of SKILL_REGISTRY) {
    const s = entry.build(scan, flows);
    if (s) skills.push(s);
  }
  return skills;
}

// user-requested skill: try to build the named skill from the current scan.
// returns { skill, verified }:
//  - if the registry detector fires (evidence exists) -> grounded skill.
//  - if evidence is missing but the skill is known -> a stub marked verified:false
//    (honest: generated on request but flagged as not grounded in this repo).
//  - if the name is unknown -> null.
function buildRequestedSkill(name, scan, flows) {
  const entry = SKILL_REGISTRY.find((s) => s.name === name);
  if (!entry) return null;
  const grounded = entry.build(scan, flows);
  if (grounded) return { skill: { ...grounded, verified: true }, verified: true };
  // known skill, no evidence -> honest unverified stub
  return {
    skill: {
      name,
      intent: `(user-requested) ${name}`,
      evidence: null,
      complex: false,
      verified: false,
    },
    verified: false,
  };
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

  // workflows — only if there are real workflows (scripts or ci/docker/migrations/build)
  const hasWorkflows = (scan.scripts && Object.keys(scan.scripts).length > 0) ||
    flows.hasCI || flows.hasDocker || flows.hasMigrations || !!flows.buildSystem;
  if (hasWorkflows) {
    docs.push({ name: 'workflows', reason: 'has build/test/deploy workflows' });
  }

  // verification — only if there's a way to verify (tests, lint, or a build system)
  if (known(scan.testing) || flows.hasLint || !!flows.buildSystem) {
    docs.push({ name: 'verification', reason: 'has tests, lint, or a build to verify work' });
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
  // non-node/python repos: prefer the detected build system's test command
  if (!steps.length && flows.testCommand) {
    steps.push(flows.testCommand);
  }
  // python repos without npm scripts or a build system: fall back to pytest
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

module.exports = {
  planScaffold, candidateSkills, candidateDocs, candidateScript,
  knownSkillNames, buildRequestedSkill,
};
