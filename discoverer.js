// discoverer — dynamic, repo-specific skill generation via the LLM.
// the fixed registry in planner.js only knows 6 skills. this module lets razor
// propose BRAND-NEW skills we never predefined, grounded in what's actually in
// the repo (a terraform dir, a graphql schema, a custom makefile target, a
// data-pipeline, etc).
//
// honesty guard (same spirit as the registry's "no evidence -> no skill"):
// every proposed skill MUST cite an evidence_file that really exists in the
// scan's file list. we validate each citation against scan.files and DROP any
// skill whose evidence can't be confirmed, or whose name collides with a
// registry skill, or that looks malformed. the LLM can suggest; it cannot
// invent a file into existence.
//
// offline / no-key: returns [] so the deterministic registry still works.
const { GoogleGenerativeAI } = require('@google/generative-ai');

function hasRealKey() {
  const k = process.env.GEMINI_API_KEY;
  return !!(k && k !== 'your_actual_key_here');
}

// a compact, cheap view of the repo for the model: the stuff that actually
// signals special workflows without shipping the whole tree.
function buildSignals(scan) {
  const files = scan.files || [];
  // notable top-level + second-level dirs
  const dirs = [...new Set(files
    .filter((f) => f.includes('/'))
    .map((f) => f.split('/').slice(0, 2).join('/')))]
    .slice(0, 60);
  // files that commonly indicate a workflow we don't hardcode.
  // two separate tests: EXT matches file extensions (anywhere), NAME matches a
  // filename/path component. a single (?:^|/)...\.ext$ alternation silently
  // fails for the extension branches, so keep them apart.
  const EXT = /\.(tf|proto|ipynb|sol)$/i;
  const NAME = /(?:^|\/)(Makefile|Justfile|Taskfile\.ya?ml|docker-compose\.ya?ml|dvc\.yaml|dbt_project\.yml|serverless\.ya?ml|Procfile|kustomization\.ya?ml|Chart\.yaml)$/i;
  const PATH = /(\.github\/workflows\/|\/terraform\/|schema\.(graphql|prisma|sql)|openapi|swagger|airflow|\/helm\/|\/k8s\/|\.circleci\/|fastlane\/)/i;
  const interesting = files.filter((f) => EXT.test(f) || NAME.test(f) || PATH.test(f))
    .slice(0, 60);
  return {
    stack: {
      language: scan.language, framework: scan.framework,
      testing: scan.testing, orm: scan.orm,
    },
    scripts: scan.scripts || {},
    config_files: scan.config_files || [],
    notable_dirs: dirs,
    notable_files: interesting,
    readme: scan.readme_summary || '',
  };
}

function buildPrompt(signals, knownNames) {
  return `You are analyzing a code repository to propose REPO-SPECIFIC "skills" for an AI coding agent. A skill is a short, named capability describing a concrete workflow this repo supports (e.g. "apply-terraform", "generate-graphql-types", "run-dbt-models", "deploy-serverless").

You are given signals extracted from the repo. Propose ONLY skills that are clearly justified by these signals. For each skill you MUST cite one evidence_file: an exact path taken verbatim from notable_files or config_files below. If you cannot cite a real file from those lists, DO NOT propose the skill.

Hard rules:
- Do NOT propose any of these already-handled skills: ${knownNames.join(', ')}.
- Do NOT invent file paths. evidence_file must be copied exactly from notable_files or config_files.
- Propose at most 4 skills. Fewer is better. If nothing special stands out, return an empty array.
- Each "steps" entry must be a concrete action grounded in the evidence (reference the real tool/file). No vague filler.

Return ONLY valid JSON (no markdown fence), shape:
{"skills":[{"name":"kebab-case-name","intent":"one short phrase","description":"one sentence: what it does + when to use it","evidence_file":"exact/path/from/lists","steps":["step 1","step 2"]}]}

REPO SIGNALS:
${JSON.stringify(signals, null, 2)}`;
}

// strip a ```json fence if the model added one despite instructions
function stripFence(t) {
  return t.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

// validate + normalize a single proposed skill against reality.
// returns a clean skill object or null if it fails any check.
function validateProposal(p, fileSet, knownSet, takenNames) {
  if (!p || typeof p !== 'object') return null;
  const name = typeof p.name === 'string' && /^[a-z][a-z0-9-]{1,39}$/.test(p.name) ? p.name : null;
  if (!name) return null;
  if (knownSet.has(name) || takenNames.has(name)) return null; // no collisions/dupes
  // THE honesty check: the cited evidence file must actually exist in the repo
  const ev = typeof p.evidence_file === 'string' ? p.evidence_file.trim() : '';
  if (!ev || !fileSet.has(ev)) return null;
  const steps = Array.isArray(p.steps)
    ? p.steps.filter((s) => typeof s === 'string' && s.trim()).slice(0, 8)
    : [];
  if (!steps.length) return null;

  // extra honesty guard: the steps may name OTHER file paths beyond the cited
  // evidence_file. any path-looking token (has a slash + extension, or is a
  // known manifest) that is NOT in the repo means the LLM invented a file ->
  // drop the whole skill. this stops hallucinated paths leaking into steps.
  const pathLike = /\b([\w.-]+\/[\w./-]+\.\w{1,6})\b/g;
  for (const step of steps) {
    const matches = step.match(pathLike) || [];
    for (const m of matches) {
      // ignore urls and obvious non-repo tokens
      if (/^https?:/i.test(m) || m.includes('://')) continue;
      if (!fileSet.has(m)) return null;
    }
  }

  const intent = typeof p.intent === 'string' && p.intent.trim() ? p.intent.trim() : name.replace(/-/g, ' ');
  const description = typeof p.description === 'string' && p.description.trim()
    ? p.description.trim() : intent;
  return {
    name,
    intent,
    description,
    steps,
    evidence: `${ev} (discovered)`,
    discovered: true,
    verified: true, // evidence confirmed to exist
    complex: false,
  };
}

// main: ask the LLM for repo-specific skills, keep only the validated ones.
// knownNames = registry skill names (to avoid collisions).
// returns { skills, usedLLM }.
async function discoverSkills(scan, knownNames, opts = {}) {
  // RAZOR_NO_LLM lets the eval harness / CI run deterministically with no API
  // calls. there's no user-facing --offline flag; this is an internal switch.
  if (opts.offline || process.env.RAZOR_NO_LLM === '1' || !hasRealKey()) {
    return { skills: [], usedLLM: false };
  }

  const fileSet = new Set(scan.files || []);
  const knownSet = new Set(knownNames);
  const signals = buildSignals(scan);

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const modelName = process.env.GEMINI_MODEL || opts.model || 'gemini-3.5-flash-lite';
  const model = genAI.getGenerativeModel({ model: modelName });

  let raw;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await model.generateContent(buildPrompt(signals, knownNames));
      raw = result.response.text();
      break;
    } catch (e) {
      const msg = e.message || '';
      if (/\b(503|429)\b/.test(msg) && attempt < 3) { await sleep(attempt * 2000); continue; }
      return { skills: [], usedLLM: false }; // non-transient -> no discovery, pack still fine
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(stripFence(raw || ''));
  } catch (_) {
    return { skills: [], usedLLM: false }; // unparseable -> drop, don't crash
  }

  const proposals = Array.isArray(parsed && parsed.skills) ? parsed.skills : [];
  const taken = new Set();
  const skills = [];
  for (const p of proposals) {
    const v = validateProposal(p, fileSet, knownSet, taken);
    if (v) { skills.push(v); taken.add(v.name); }
  }
  return { skills, usedLLM: true };
}

module.exports = { discoverSkills, buildSignals, buildPrompt, validateProposal, hasRealKey };
