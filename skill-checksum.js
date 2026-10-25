// skill checksum — one canonical SHA-256 for a skill's file map, shared by
// the CLI client (compute on publish, verify on pull) and the registry
// server/store (compute on write, serve with the record). canonical form:
// for each file name in sorted order, hash name + NUL + content + NUL, so
// the digest covers both the file set and every byte of content.
const crypto = require('node:crypto');

function skillChecksum(files) {
  const h = crypto.createHash('sha256');
  for (const name of Object.keys(files || {}).sort()) {
    h.update(name);
    h.update('\0');
    h.update(String(files[name]));
    h.update('\0');
  }
  return h.digest('hex');
}

module.exports = { skillChecksum };
