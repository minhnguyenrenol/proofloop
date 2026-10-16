// Study folder layout, config and path safety (FR-PLG-011).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const CONFIG_DIR = '.proofloop';

export function findResearchRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'research', CONFIG_DIR, 'config.json'))) return path.join(dir, 'research');
    if (path.basename(dir) === 'research' && fs.existsSync(path.join(dir, CONFIG_DIR, 'config.json'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export function loadConfig(root) {
  const f = path.join(root, CONFIG_DIR, 'config.json');
  if (!fs.existsSync(f)) throw new Error('Research folder is not set up. Run the research-setup skill first.');
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

export function saveConfig(root, cfg) {
  fs.mkdirSync(path.join(root, CONFIG_DIR), { recursive: true });
  writeJson(path.join(root, CONFIG_DIR, 'config.json'), cfg);
}

export function studyDir(root, slug) {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`Invalid study slug "${slug}" (lowercase letters, digits and dashes only)`);
  return path.join(root, slug);
}

export function sessionDir(root, slug, participant) {
  if (!/^P\d{1,3}$/.test(participant)) throw new Error(`Participant id must look like P1, P12 (got "${participant}")`);
  return path.join(studyDir(root, slug), 'sessions', participant);
}

export function isInside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function assertInside(root, p) {
  if (!isInside(root, p)) throw new Error(`Refusing to touch ${p}: outside the approved research folder ${root}`);
  return p;
}

export function readJson(f, fallback) {
  if (!fs.existsSync(f)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing file: ${f}`);
  }
  const text = fs.readFileSync(f, 'utf8');
  // Name the file, so a damaged one can be found and fixed.
  // The parser's own message can quote the file's text, so it isn't passed on.
  try { return JSON.parse(text); } catch { throw new Error(`${f} is damaged (not valid JSON). Restore it from a backup (or its .bak copy, if there is one), or remove it and redo that step.`); }
}

export function writeJson(f, data) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmp, f);
}

export function writeText(f, text) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
}

export function sha256File(f) {
  return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
}

export function listSessions(root, slug) {
  const d = path.join(studyDir(root, slug), 'sessions');
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((x) => /^P\d+$/.test(x)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

export function hasConsent(root, slug, participant) {
  const f = path.join(studyDir(root, slug), 'consent', `${participant}.json`);
  if (!fs.existsSync(f)) return false;
  const c = readJson(f); // a damaged record is an error naming the file, never a quoted name
  return c.agreed === true && !c.withdrawn_at;
}

// For git: nothing per participant is committed (recordings, transcripts,
// answers, events, notes, frames, analysis input). Study-level redacted
// outputs (study.yaml, guide.md, runner/, report.md, board, insights) may be.
export const GITIGNORE = `# Proofloop: never commit participant data, consent records or recordings.
*/sessions/
*/consent/*.json
*/context/sources/
*/.relay-seen.json
.proofloop/secrets*
.proofloop/exports/
*.tmp-*
`;

// Add any missing Proofloop lines to an existing .gitignore, keeping the user's own lines.
export function mergeIgnore(existing, wanted) {
  const have = new Set(existing.split(/\r?\n/).map((l) => l.trim()));
  const missing = wanted.split('\n').filter((l) => l.trim() && !l.startsWith('#') && !have.has(l.trim()));
  if (!existing.trim()) return { text: wanted, missing };
  return { text: missing.length ? `${existing.replace(/\s*$/, '\n')}${wanted.split('\n')[0]}\n${missing.join('\n')}\n` : existing, missing };
}

// For ripgrep (.ignore, which takes precedence over .gitignore): hide only the
// raw files, so agents can still search the redacted ones they may read.
// The first line re-includes sessions/, which .gitignore hides entirely.
export const SEARCH_IGNORE = `# Proofloop search: hide raw recordings, transcripts, notes and consent records.
!*/sessions/
*/sessions/*/media/
*/sessions/*/frames/
*/sessions/*/transcript.json
*/sessions/*/answers.json
*/sessions/*/.incoming/
*/sessions/*/notes.md
*/sessions/*/markers*.json
*/sessions/*/device.json
*/consent/*.json
*/context/sources/
.proofloop/secrets*
.proofloop/exports/
*.tmp-*
`;

export function appendLog(root, slug, entry) {
  const f = path.join(studyDir(root, slug), 'log.jsonl');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.appendFileSync(f, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}
