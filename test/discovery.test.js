// tests for dynamic skill discovery — the LLM proposal path is not exercised
// here (no network in tests); we test the pure parts: the evidence validator
// (the honesty guard) and how discovered skills merge into the plan.
const { test } = require('node:test');
const assert = require('node:assert');

const { validateProposal, buildSignals } = require('../discoverer.js');
const { planScaffold } = require('../planner.js');

// ---- validateProposal: the honesty guard ---------------------------------

const files = new Set(['terraform/main.tf', 'schema.graphql', 'src/index.ts']);
const known = new Set(['run-tests', 'build', 'code-push']);

test('a proposal citing a real file is accepted and normalized', () => {
  const r = validateProposal(
    { name: 'apply-terraform', intent: 'apply infra', description: 'd', evidence_file: 'terraform/main.tf', steps: ['terraform apply'] },
    files, known, new Set(),
  );
  assert.ok(r);
  assert.equal(r.name, 'apply-terraform');
  assert.equal(r.discovered, true);
  assert.equal(r.verified, true);
  assert.match(r.evidence, /terraform\/main\.tf/);
});

test('a proposal citing a NON-existent file is dropped (no hallucinated evidence)', () => {
  const r = validateProposal(
    { name: 'deploy-k8s', intent: 'x', evidence_file: 'k8s/deploy.yaml', steps: ['kubectl apply'] },
    files, known, new Set(),
  );
  assert.equal(r, null);
});

test('a proposal colliding with a registry skill name is dropped', () => {
  const r = validateProposal(
    { name: 'build', intent: 'x', evidence_file: 'schema.graphql', steps: ['x'] },
    files, known, new Set(),
  );
  assert.equal(r, null);
});

test('a proposal with no steps is dropped', () => {
  const r = validateProposal(
    { name: 'gen-types', intent: 'x', evidence_file: 'schema.graphql', steps: [] },
    files, known, new Set(),
  );
  assert.equal(r, null);
});

test('a proposal with a malformed name is dropped', () => {
  const r = validateProposal(
    { name: 'Bad Name!', intent: 'x', evidence_file: 'schema.graphql', steps: ['x'] },
    files, known, new Set(),
  );
  assert.equal(r, null);
});

test('a duplicate name within one run is dropped', () => {
  const taken = new Set();
  const first = validateProposal(
    { name: 'gen-types', intent: 'x', evidence_file: 'schema.graphql', steps: ['codegen'] },
    files, known, taken,
  );
  assert.ok(first);
  taken.add(first.name);
  const second = validateProposal(
    { name: 'gen-types', intent: 'y', evidence_file: 'src/index.ts', steps: ['x'] },
    files, known, taken,
  );
  assert.equal(second, null);
});

test('a proposal whose steps cite a NON-existent file path is dropped', () => {
  const r = validateProposal(
    { name: 'gen-types', intent: 'x', description: 'd', evidence_file: 'schema.graphql', steps: ['edit schema.graphql', 'then update config/generated/types.ts'] },
    files, known, new Set(),
  );
  assert.equal(r, null); // config/generated/types.ts is not in the file set
});

test('a proposal whose steps only cite real paths is kept', () => {
  const r = validateProposal(
    { name: 'gen-types', intent: 'x', description: 'd', evidence_file: 'schema.graphql', steps: ['edit schema.graphql', 'update src/index.ts'] },
    files, known, new Set(),
  );
  assert.ok(r);
  assert.equal(r.name, 'gen-types');
});

// ---- plan merge -----------------------------------------------------------

test('planScaffold appends discovered skills after the registry ones', () => {
  const scan = { testing: 'Jest', scripts: { test: 'jest' }, structure: [], evidence: { testing: 'dep: jest' } };
  const flows = { evidence: {} };
  const discovered = [{ name: 'apply-terraform', intent: 'apply infra', description: 'd', steps: ['terraform apply'], evidence: 'terraform/main.tf (discovered)', discovered: true, verified: true, complex: false }];
  const plan = planScaffold(scan, flows, discovered);
  const names = plan.skills.map((s) => s.name);
  assert.ok(names.includes('run-tests')); // registry still there
  assert.ok(names.includes('apply-terraform')); // discovered appended
  // registry comes first
  assert.ok(names.indexOf('run-tests') < names.indexOf('apply-terraform'));
});

test('planScaffold drops a discovered skill that duplicates a registry name', () => {
  const scan = { testing: 'Jest', scripts: { test: 'jest' }, structure: [], evidence: { testing: 'dep: jest' } };
  const flows = { evidence: {} };
  const discovered = [{ name: 'run-tests', intent: 'dup', steps: ['x'], discovered: true, verified: true }];
  const plan = planScaffold(scan, flows, discovered);
  const count = plan.skills.filter((s) => s.name === 'run-tests').length;
  assert.equal(count, 1); // registry one wins, discovered dup dropped
});

test('planScaffold with no discovered skills behaves like before', () => {
  const scan = { testing: 'Jest', scripts: { test: 'jest' }, structure: [], evidence: { testing: 'dep: jest' } };
  const flows = { evidence: {} };
  const plan = planScaffold(scan, flows);
  assert.ok(plan.skills.some((s) => s.name === 'run-tests'));
});

// ---- buildSignals surfaces non-standard workflow files --------------------

test('buildSignals surfaces terraform/proto/graphql files for the model', () => {
  const scan = {
    language: 'unknown', framework: 'unknown', testing: 'unknown', orm: 'unknown',
    scripts: {}, config_files: [],
    files: ['main.tf', 'variables.tf', 'api/service.proto', 'schema.graphql', 'README.md', 'src/app.js'],
  };
  const sig = buildSignals(scan);
  assert.ok(sig.notable_files.includes('main.tf'));
  assert.ok(sig.notable_files.includes('api/service.proto'));
  assert.ok(sig.notable_files.includes('schema.graphql'));
  // ordinary source files should not be flagged as "notable"
  assert.ok(!sig.notable_files.includes('src/app.js'));
});
