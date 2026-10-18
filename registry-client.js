// registry client — the CLI side of the Razor skill hub. reads skills out of a
// generated pack and publishes them; pulls a skill from the hub into a pack.
// uses global fetch (node 18+), no extra deps.
const fs = require('fs');
const path = require('path');

// read one skill dir (skills/<name>/) into a publish record. pulls triggers +
// evidence from skills.index.json if present, else derives nothing (triggers []).
function readSkillForPublish(packDir, name, namespace) {
  const skillDir = path.join(packDir, 'skills', name);
  const skillMd = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMd)) throw new Error(`no SKILL.md for skill '${name}' in ${packDir}`);

  const files = { 'SKILL.md': fs.readFileSync(skillMd, 'utf8') };
  const ref = path.join(skillDir, 'reference.md');
  if (fs.existsSync(ref)) files['reference.md'] = fs.readFileSync(ref, 'utf8');

  // frontmatter fields from SKILL.md
  const fm = (k) => {
    const m = files['SKILL.md'].match(new RegExp(`^${k}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim() : '';
  };

  // enrich with manifest data if available
  let triggers = [];
  let description = fm('description');
  let evidence = fm('evidence');
  const manifestPath = path.join(packDir, 'skills.index.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const entry = (manifest.skills || []).find((s) => s.name === name);
      if (entry) {
        triggers = entry.triggers || [];
        description = description || entry.description || '';
        evidence = evidence || entry.evidence || '';
      }
    } catch (_) { /* ignore malformed manifest */ }
  }

  return {
    namespace,
    name,
    version: fm('version') || '1',
    description,
    triggers,
    evidence,
    files,
  };
}

// list the skill names present in a pack
function listPackSkills(packDir) {
  const dir = path.join(packDir, 'skills');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md')))
    .map((e) => e.name);
}

async function publishSkill(registry, rec, token) {
  const res = await fetch(`${registry.replace(/\/$/, '')}/api/skills`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { 'x-publish-token': token } : {}) },
    body: JSON.stringify(rec),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `publish failed (${res.status})`);
  return body;
}

async function pullSkill(registry, namespace, name) {
  const res = await fetch(`${registry.replace(/\/$/, '')}/api/skills/${namespace}/${name}`);
  if (res.status === 404) throw new Error(`skill not found: ${namespace}/${name}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `pull failed (${res.status})`);
  return body;
}

// write a pulled skill's files into packDir/skills/<name>/
function writePulledSkill(packDir, rec) {
  const outDir = path.join(packDir, 'skills', rec.name);
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const [fname, content] of Object.entries(rec.files || {})) {
    // guard against path traversal in file names from the registry
    const safe = path.basename(fname);
    fs.writeFileSync(path.join(outDir, safe), content);
    written.push(path.join('skills', rec.name, safe));
  }
  return written;
}

module.exports = {
  readSkillForPublish, listPackSkills, publishSkill, pullSkill, writePulledSkill,
};
