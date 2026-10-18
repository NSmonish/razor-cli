// registry storage — two backends behind one small interface.
// - DATABASE_URL set  -> Postgres (persists on Render free tier)
// - otherwise         -> a local JSON file (dev / tests, no cloud needed)
//
// a "skill" record is the published unit: name (unique per namespace),
// version, description, triggers, evidence, and the files map
// ({ "SKILL.md": "...", "reference.md": "..." }). publishing the same name
// again bumps/overwrites to the newest version (last-write-wins, simple on
// purpose for a v1 team hub).
const fs = require('fs');
const path = require('path');

// ---- local JSON backend ---------------------------------------------------

function localStore(file) {
  const load = () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return { skills: {} }; }
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
      db.skills[key] = { ...rec, updated_at: new Date().toISOString() };
      save(db);
      return db.skills[key];
    },
    async list(namespace, q) {
      const db = load();
      let items = Object.values(db.skills);
      if (namespace) items = items.filter((s) => s.namespace === namespace);
      if (q) {
        const needle = q.toLowerCase();
        items = items.filter((s) => (`${s.name} ${s.description} ${(s.triggers || []).join(' ')}`).toLowerCase().includes(needle));
      }
      return items.sort((a, b) => a.name.localeCompare(b.name))
        .map(({ files, ...meta }) => meta); // list = metadata only
    },
    async get(namespace, name) {
      const db = load();
      return db.skills[`${namespace}/${name}`] || null;
    },
  };
}

// ---- Postgres backend -----------------------------------------------------

function pgStore(databaseUrl) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? false : { rejectUnauthorized: false },
  });
  return {
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
    },
    async publish(rec) {
      const { rows } = await pool.query(
        `INSERT INTO skills (namespace, name, version, description, triggers, evidence, files, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7, now())
         ON CONFLICT (namespace, name) DO UPDATE SET
           version=EXCLUDED.version, description=EXCLUDED.description,
           triggers=EXCLUDED.triggers, evidence=EXCLUDED.evidence,
           files=EXCLUDED.files, updated_at=now()
         RETURNING namespace, name, version, description, triggers, evidence, updated_at;`,
        [rec.namespace, rec.name, rec.version || '1', rec.description || '',
          JSON.stringify(rec.triggers || []), rec.evidence || '', JSON.stringify(rec.files || {})],
      );
      return rows[0];
    },
    async list(namespace, q) {
      const clauses = []; const args = [];
      if (namespace) { args.push(namespace); clauses.push(`namespace = $${args.length}`); }
      if (q) { args.push(`%${q.toLowerCase()}%`); clauses.push(`lower(name || ' ' || coalesce(description,'')) LIKE $${args.length}`); }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const { rows } = await pool.query(
        `SELECT namespace, name, version, description, triggers, evidence, updated_at
         FROM skills ${where} ORDER BY name ASC;`, args);
      return rows;
    },
    async get(namespace, name) {
      const { rows } = await pool.query(
        `SELECT namespace, name, version, description, triggers, evidence, files, updated_at
         FROM skills WHERE namespace=$1 AND name=$2;`, [namespace, name]);
      return rows[0] || null;
    },
  };
}

// pick a backend from the environment
function createStore(opts = {}) {
  const url = opts.databaseUrl || process.env.DATABASE_URL;
  if (url) return pgStore(url);
  const file = opts.file || process.env.REGISTRY_FILE || path.join(__dirname, 'data', 'registry.json');
  return localStore(file);
}

module.exports = { createStore, localStore, pgStore };
