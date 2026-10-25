// registry storage — two backends behind one small interface.
// - DATABASE_URL set  -> Postgres (persists on Render free tier)
// - otherwise         -> a local JSON file (dev / tests, no cloud needed)
//
// a "skill" record is the published unit: name (unique per namespace),
// version, description, triggers, evidence, the files map
// ({ "SKILL.md": "...", "reference.md": "..." }), and a SHA-256 checksum
// over the files (see ../skill-checksum.js).
//
// VERSIONING (v2): versions are IMMUTABLE. publishing ns/name@version with
// content that differs from what's already stored under that version is a
// conflict (error code VERSION_CONFLICT -> HTTP 409); re-publishing the
// identical content is an idempotent no-op. publishing a NEW version adds it
// to the history and moves the "latest" pointer forward (never backward).
// every version stays retrievable via get(ns, name, version).
const fs = require('fs');
const path = require('path');
const { skillChecksum } = require('../skill-checksum');

// dotted-numeric version compare ('1' < '1.1' < '2' < '10'); non-numeric
// segments count as 0. returns <0, 0, >0.
function cmpVer(a, b) {
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function conflictError(namespace, name, version) {
  const err = new Error(
    `version conflict: ${namespace}/${name}@${version} already exists with different content — bump the version to publish changes`,
  );
  err.code = 'VERSION_CONFLICT';
  return err;
}

// ---- local JSON backend ---------------------------------------------------
// on-disk shape: { skills: { "ns/name": { namespace, name, latest_version,
//   versions: { "1": rec, "2": rec } } } }. legacy flat records (a bare rec
// per skill, pre-v2) are migrated in-memory on load and persisted on the
// next write.

function migrateDb(db) {
  if (!db || typeof db !== 'object') return { skills: {} };
  db.skills = db.skills || {};
  for (const [key, entry] of Object.entries(db.skills)) {
    if (entry && !entry.versions) {
      const v = entry.version || '1';
      if (!entry.checksum) entry.checksum = skillChecksum(entry.files || {});
      db.skills[key] = {
        namespace: entry.namespace, name: entry.name,
        latest_version: v, versions: { [v]: entry },
      };
    }
  }
  return db;
}

function localStore(file) {
  const load = () => {
    let raw;
    try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return { skills: {} }; }
    return migrateDb(raw);
  };
  const save = (db) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(db, null, 2));
  };
  return {
    kind: 'local',
    async init() { if (!fs.existsSync(file)) save({ skills: {} }); },
    async publish(rec) {
      const db = load();
      const key = `${rec.namespace}/${rec.name}`;
      const checksum = skillChecksum(rec.files || {});
      const full = { ...rec, checksum, updated_at: new Date().toISOString() };
      let entry = db.skills[key];
      if (!entry) {
        entry = { namespace: rec.namespace, name: rec.name, latest_version: rec.version, versions: {} };
        db.skills[key] = entry;
      }
      const existing = entry.versions[rec.version];
      if (existing) {
        if (existing.checksum === checksum) return existing; // idempotent re-publish
        throw conflictError(rec.namespace, rec.name, rec.version);
      }
      entry.versions[rec.version] = full;
      if (cmpVer(rec.version, entry.latest_version) >= 0) entry.latest_version = rec.version;
      save(db);
      return full;
    },
    async list(namespace, q) {
      const db = load();
      let entries = Object.values(db.skills);
      if (namespace) entries = entries.filter((e) => e.namespace === namespace);
      let items = entries.map((e) => {
        const latest = e.versions[e.latest_version];
        const { files, ...meta } = latest;
        return { ...meta, versions: Object.keys(e.versions).sort(cmpVer) };
      });
      if (q) {
        const needle = q.toLowerCase();
        items = items.filter((s) => (`${s.name} ${s.description} ${(s.triggers || []).join(' ')}`).toLowerCase().includes(needle));
      }
      return items.sort((a, b) => a.name.localeCompare(b.name));
    },
    async get(namespace, name, version) {
      const db = load();
      const entry = db.skills[`${namespace}/${name}`];
      if (!entry) return null;
      return entry.versions[version || entry.latest_version] || null;
    },
  };
}

// ---- Postgres backend -----------------------------------------------------
// `skills` stays the latest-pointer table (list/get read it); a second
// table `skill_versions` holds the immutable history. init() creates both,
// adds the checksum column to pre-v2 databases, and backfills history +
// checksums for skills published before versioning existed.

function pgStore(databaseUrl) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? false : { rejectUnauthorized: false },
  });
  const api = {
    kind: 'postgres',
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS skills (
          namespace   TEXT NOT NULL,
          name        TEXT NOT NULL,
          version     TEXT NOT NULL DEFAULT '1',
          description TEXT,
          triggers    JSONB NOT NULL DEFAULT '[]',
          evidence    TEXT,
          files       JSONB NOT NULL DEFAULT '{}',
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (namespace, name)
        );`);
      await pool.query(`ALTER TABLE skills ADD COLUMN IF NOT EXISTS checksum TEXT;`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS skill_versions (
          namespace   TEXT NOT NULL,
          name        TEXT NOT NULL,
          version     TEXT NOT NULL,
          description TEXT,
          triggers    JSONB NOT NULL DEFAULT '[]',
          evidence    TEXT,
          files       JSONB NOT NULL DEFAULT '{}',
          checksum    TEXT NOT NULL DEFAULT '',
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (namespace, name, version)
        );`);
      // backfill: every pre-v2 latest row becomes its version-history entry
      await pool.query(`
        INSERT INTO skill_versions (namespace, name, version, description, triggers, evidence, files, checksum)
        SELECT namespace, name, version, description, triggers, evidence, files, ''
        FROM skills ON CONFLICT DO NOTHING;`);
      // fill in checksums computed from the stored files
      const missing = await pool.query(
        `SELECT namespace, name, version, files FROM skill_versions WHERE checksum = '';`);
      for (const row of missing.rows) {
        await pool.query(
          `UPDATE skill_versions SET checksum=$4 WHERE namespace=$1 AND name=$2 AND version=$3;`,
          [row.namespace, row.name, row.version, skillChecksum(row.files || {})]);
      }
      const noSum = await pool.query(
        `SELECT namespace, name, files FROM skills WHERE checksum IS NULL;`);
      for (const row of noSum.rows) {
        await pool.query(
          `UPDATE skills SET checksum=$3 WHERE namespace=$1 AND name=$2;`,
          [row.namespace, row.name, skillChecksum(row.files || {})]);
      }
    },
    async publish(rec) {
      const checksum = skillChecksum(rec.files || {});
      const ex = await pool.query(
        `SELECT checksum FROM skill_versions WHERE namespace=$1 AND name=$2 AND version=$3;`,
        [rec.namespace, rec.name, rec.version]);
      if (ex.rows.length) {
        if (ex.rows[0].checksum === checksum) return api.get(rec.namespace, rec.name, rec.version);
        throw conflictError(rec.namespace, rec.name, rec.version);
      }
      await pool.query(
        `INSERT INTO skill_versions (namespace, name, version, description, triggers, evidence, files, checksum)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8);`,
        [rec.namespace, rec.name, rec.version, rec.description || '',
          JSON.stringify(rec.triggers || []), rec.evidence || '',
          JSON.stringify(rec.files || {}), checksum]);
      const cur = await pool.query(
        `SELECT version FROM skills WHERE namespace=$1 AND name=$2;`,
        [rec.namespace, rec.name]);
      if (!cur.rows.length || cmpVer(rec.version, cur.rows[0].version) >= 0) {
        await pool.query(
          `INSERT INTO skills (namespace, name, version, description, triggers, evidence, files, checksum, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
           ON CONFLICT (namespace, name) DO UPDATE SET
             version=EXCLUDED.version, description=EXCLUDED.description,
             triggers=EXCLUDED.triggers, evidence=EXCLUDED.evidence,
             files=EXCLUDED.files, checksum=EXCLUDED.checksum, updated_at=now();`,
          [rec.namespace, rec.name, rec.version, rec.description || '',
            JSON.stringify(rec.triggers || []), rec.evidence || '',
            JSON.stringify(rec.files || {}), checksum]);
      }
      return api.get(rec.namespace, rec.name, rec.version);
    },
    async list(namespace, q) {
      const clauses = []; const args = [];
      if (namespace) { args.push(namespace); clauses.push(`namespace = $${args.length}`); }
      if (q) {
        args.push(`%${q.toLowerCase()}%`);
        // name + description + triggers — same fields the local store searches
        clauses.push(`lower(name || ' ' || coalesce(description,'') || ' ' || coalesce(triggers::text,'')) LIKE $${args.length}`);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const { rows } = await pool.query(
        `SELECT namespace, name, version, description, triggers, evidence, checksum, updated_at
         FROM skills ${where} ORDER BY name ASC;`, args);
      // attach the version list per skill (one extra query, registries are small)
      for (const row of rows) {
        const vs = await pool.query(
          `SELECT version FROM skill_versions WHERE namespace=$1 AND name=$2;`,
          [row.namespace, row.name]);
        row.versions = vs.rows.map((r) => r.version).sort(cmpVer);
      }
      return rows;
    },
    async get(namespace, name, version) {
      if (version) {
        const { rows } = await pool.query(
          `SELECT namespace, name, version, description, triggers, evidence, files, checksum, created_at AS updated_at
           FROM skill_versions WHERE namespace=$1 AND name=$2 AND version=$3;`,
          [namespace, name, version]);
        return rows[0] || null;
      }
      const { rows } = await pool.query(
        `SELECT namespace, name, version, description, triggers, evidence, files, checksum, updated_at
         FROM skills WHERE namespace=$1 AND name=$2;`, [namespace, name]);
      return rows[0] || null;
    },
  };
  return api;
}

// pick a backend from the environment
function createStore(opts = {}) {
  const url = opts.databaseUrl || process.env.DATABASE_URL;
  if (url) return pgStore(url);
  const file = opts.file || process.env.REGISTRY_FILE || path.join(__dirname, 'data', 'registry.json');
  return localStore(file);
}

module.exports = { createStore, localStore, pgStore, cmpVer };
