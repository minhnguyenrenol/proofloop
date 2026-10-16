#!/usr/bin/env node
// Privacy guard for Claude Code and Cursor (FR-PLG-011, FR-PLG-012).
// Keeps the agent away from raw recordings, raw transcripts, consent
// records and unredacted notes, and stops research data being committed
// or copied out. Exit code 2 blocks the tool call in both tools.
//
// Paths are resolved against the working directory and checked by shape
// (…/sessions/P<n>/media, …/consent/P<n>.json), so they're caught however
// they are written: relative, absolute, Windows-style or with wildcards.
// For shell commands, anything that touches protected research data is
// blocked unless it's a listing command that can't print file contents.

import path from 'node:path';
import fs from 'node:fs';

// Case-insensitive: macOS and Windows file systems are, so SESSIONS/ is the same folder.
const PROTECTED = [
  [/\/sessions\/[^/]+\/(media|frames|\.incoming)(\/|$)/i, 'raw recordings and frames are not read directly. Use session_prepare, then read analysis-input.json.'],
  [/\/sessions\/[^/]+\/transcript\.json$/i, 'raw transcripts may contain personal details. Read transcript.redacted.json or analysis-input.json instead.'],
  [/\/sessions\/[^/]+\/(answers|device)\.json$/i, 'raw answers are read by the plugin tools, not directly.'],
  [/\/sessions\/[^/]+\/(notes\.md|markers[^/]*\.json)$/i, 'session notes are unredacted. The plugin includes them, redacted, in analysis-input.json.'],
  [/\/\.proofloop\/exports\//i, 'study export packages hold raw answers (and media if included). Share the file; don\'t read it.'],
  [/\/consent\/(P\d+|external-ids)\.json$/i, 'consent records hold participant names; the plugin tools read them for you.'],
  [/\/context\/sources(\/|$)/i, 'source documents are read through the add-context skill, which records what was used.'],
];
// Folders that hold protected files: searching or listing contents there needs care.
const PROTECTED_DIR = /\/(sessions(\/[^/]+)?|consent|context\/sources)$/i;
const SAFE_IN_SESSION = /\/sessions\/[^/]+\/(analysis-input\.json|observations\.json|transcript\.redacted\.json|session\.json|recording\.json|events\.json|runner-events\.json|signals\.json)$/i;

const norm = (p, cwd) => {
  let s = String(p).replace(/\\/g, '/').replace(/^["']|["']$/g, '');
  if (s.startsWith('~/')) s = `${process.env.HOME ?? ''}/${s.slice(2)}`;
  return path.posix.resolve(cwd.replace(/\\/g, '/'), s).replace(/\/+$/, '');
};
// Turn wildcards into "could be anything" so P*/transcript.json still matches.
const wild = (p) => p.replace(/\[[^\][]*\]|\{[^{}]*\}|\*\*|\*|\?/g, 'x');
// The hook times out after 10 s and a timeout lets the call through, so stop well before.
const deadline = Date.now() + 4000;
const why = (p) => { if (SAFE_IN_SESSION.test(p)) return null; for (const [re, msg] of PROTECTED) if (re.test(p) || re.test(wild(p))) return msg; return null; };
const dirWhy = (p) => (PROTECTED_DIR.test(p) ? 'this folder holds raw research data; only listing commands may touch it.' : null);

// A wildcard can hide the folder name (s*/P1/…), so expand it against the
// files that really exist, one path segment at a time, and check each match.
// Names are matched by a linear-time matcher (no RegExp built from command
// text), and the walk is capped. Anything too big to check where research data
// could be is refused rather than allowed.
const GLOB = /[*?[{]/;
const LIMIT = 20000;
const TOO_MUCH = 'that wildcard covers too many files to check. Name the files, or a narrower folder, instead.';
class TooMuch extends Error {}
const join = (d, n) => `${d === '/' ? '' : d}/${n}`;
const SKIP = new Set(['node_modules', '.git']);

// {a,b} alternatives, innermost first; ranges like {a..c} become *. At most 64 results.
function expandBraces(s, out = [], budget = { n: 0 }) {
  const m = s.match(/\{([^{}]*)\}/);
  if (!m) { if (++budget.n > 64) throw new TooMuch(); out.push(s); return out; }
  for (const alt of m[1].includes('..') ? ['*'] : m[1].split(',')) expandBraces(s.slice(0, m.index) + alt + s.slice(m.index + m[0].length), out, budget);
  return out;
}
// One path segment as tokens: '*', '?', a character class, or a literal character. Case-insensitive.
function compileSeg(seg) {
  const t = [];
  for (let i = 0; i < seg.length; i++) {
    const ch = seg[i];
    if (ch === '*') { if (t.at(-1) !== '*') t.push('*'); continue; }
    if (ch === '?') { t.push('?'); continue; }
    const j = ch === '[' ? seg.indexOf(']', i + 2) : -1;
    if (j < 0) { t.push(ch.toLowerCase()); continue; }
    let body = seg.slice(i + 1, j).toLowerCase();
    const neg = body[0] === '!' || body[0] === '^';
    if (neg) body = body.slice(1);
    const set = [];
    for (let k = 0; k < body.length; k++) {
      if (body[k + 1] === '-' && k + 2 < body.length) { set.push([body[k], body[k + 2]]); k += 2; } else set.push([body[k], body[k]]);
    }
    t.push({ neg, set });
    i = j;
  }
  return t;
}
const one = (tok, c) => tok === '?' || (typeof tok === 'string' ? tok === c : tok.neg !== tok.set.some(([a, b]) => a <= c && c <= b));
// Classic wildcard match: backtrack only to the last *, so time is linear-ish in the name.
function matchSeg(tok, name) {
  const s = name.toLowerCase();
  let p = 0; let i = 0; let star = -1; let mark = 0;
  while (i < s.length) {
    if (p < tok.length && tok[p] !== '*' && one(tok[p], s[i])) { p++; i++; } else if (tok[p] === '*') { star = p++; mark = i; } else if (star >= 0) { p = star + 1; i = ++mark; } else return false;
  }
  while (tok[p] === '*') p++;
  return p === tok.length;
}
const list = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } };
function globWhy(p) {
  if (!GLOB.test(p)) return null;
  const base0 = p.split('/').slice(0, p.split('/').findIndex((s) => GLOB.test(s))).join('/') || '/';
  try {
    let seen = 0;
    const count = () => { if (++seen > LIMIT) throw new TooMuch(); if (Date.now() > deadline) block('this command takes too long to check. Name the files directly.'); };
    // A folder named sessions/ or consent/ only matters inside a research folder.
    const hit = (f, isDir) => why(f) ?? (isDir && insideResearch(f) ? dirWhy(f) : null);
    for (const q of expandBraces(p)) {
      const parts = q.split('/');
      const first = parts.findIndex((s) => /[*?[]/.test(s));
      if (first < 0) { const m = hit(q, true); if (m) return m; continue; }
      let dirs = [parts.slice(0, first).join('/') || '/'];
      for (let i = first; i < parts.length && dirs.length; i++) {
        const seg = parts[i];
        const last = i === parts.length - 1;
        const next = [];
        if (seg === '**') {
          // This folder and every folder below it.
          const stack = [...dirs];
          while (stack.length) {
            const d = stack.pop();
            next.push(d);
            for (const e of list(d)) {
              count();
              const f = join(d, e.name);
              if (last) { const m = hit(f, e.isDirectory()); if (m) return m; }
              if (e.isDirectory() && !e.isSymbolicLink() && !SKIP.has(e.name)) stack.push(f);
            }
          }
        } else if (!/[*?[]/.test(seg)) {
          for (const d of dirs) {
            const f = join(d, seg);
            if (!fs.existsSync(f)) continue;
            const isDir = fs.statSync(f).isDirectory();
            if (last) { const m = hit(f, isDir); if (m) return m; } else if (isDir) next.push(f);
          }
        } else {
          const tok = compileSeg(seg);
          for (const d of dirs) {
            for (const e of list(d)) {
              count();
              if (!matchSeg(tok, e.name)) continue;
              const f = join(d, e.name);
              if (last) { const m = hit(f, e.isDirectory()); if (m) return m; } else if (e.isDirectory() && !e.isSymbolicLink()) next.push(f);
            }
          }
        }
        dirs = next;
      }
    }
    return null;
  } catch (e) {
    if (!(e instanceof TooMuch)) throw e;
    // Too big to walk: refuse if a wildcard could stand for a protected folder, or research data is nearby.
    const risky = p.split('/').some((s) => s !== '**' && /[*?[]/.test(s) && PROTECTED_NAMES.some((n) => matchSeg(compileSeg(s), n)));
    return risky || insideResearch(base0) || researchBelow(base0) ? TOO_MUCH : null;
  }
}
const PROTECTED_NAMES = ['sessions', 'consent', 'sources', 'media', 'frames', '.incoming', '.proofloop', 'exports'];
// Folders a wildcard cd target could be (at most 50), for following cd into them.
function expandDirs(p) {
  const parts = p.split('/');
  const first = parts.findIndex((s) => GLOB.test(s));
  let dirs = [parts.slice(0, first).join('/') || '/'];
  for (const seg of parts.slice(first)) {
    const tok = compileSeg(seg === '**' ? '*' : seg.replace(/[{}]/g, '*'));
    dirs = dirs.flatMap((d) => list(d).filter((e) => e.isDirectory() && matchSeg(tok, e.name)).map((e) => join(d, e.name))).slice(0, 50);
  }
  return dirs;
}
function insideResearch(d) {
  for (let x = d; x && x !== path.posix.dirname(x); x = path.posix.dirname(x)) if (fs.existsSync(`${x}/.proofloop/config.json`)) return true;
  return false;
}
// Is there a research folder up to 6 levels below d? Unknown (too big) counts as yes.
function researchBelow(d) {
  let n = 0;
  let level = [d];
  for (let depth = 0; depth <= 6 && level.length; depth++) {
    const nextLevel = [];
    for (const x of level) {
      if (fs.existsSync(`${x}/.proofloop/config.json`)) return true;
      for (const e of list(x)) if (e.isDirectory() && !e.isSymbolicLink() && !SKIP.has(e.name)) { if (++n > 20000 || Date.now() > deadline) return true; nextLevel.push(join(x, e.name)); }
    }
    level = nextLevel;
  }
  return false;
}

let raw = '';
process.stdin.on('data', (c) => { raw += c; });
const block = (msg) => { process.stderr.write(`Blocked by ProofLoop privacy guard: ${msg}\n`); process.exit(2); };
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch { process.exit(0); }
  // Fail closed: a crash would let the tool call through (exit 1 doesn't block).
  try { check(input); } catch { block('the privacy guard could not check this request, so it was stopped. Rephrase it more simply.'); }
});

function check(input) {
  const tool = String(input.tool_name ?? '');
  const ti = input.tool_input ?? {};
  const cwd = String(input.cwd ?? ti.cwd ?? process.cwd());

  // File tools: Read, Edit, Write, Glob, Grep and their Cursor equivalents.
  const file = ti.file_path ?? ti.path ?? ti.target_file ?? ti.notebook_path;
  const cmd = typeof ti.command === 'string' ? ti.command : '';
  if (!cmd) {
    const targets = [];
    if (file) targets.push(norm(file, cwd));
    if (ti.pattern && /glob/i.test(tool)) targets.push(norm(ti.pattern, file ? norm(file, cwd) : cwd));
    if (ti.glob) targets.push(norm(`**/${ti.glob}`, file ? norm(file, cwd) : cwd));
    for (const t of targets) { const m = why(t); if (m) block(m); }
    // Searching a folder that holds protected files would print their contents.
    const g = String(ti.glob ?? ti.include ?? '');
    const safeGlob = /^(\*\*\/)?(observations|analysis-input|transcript\.redacted)\.json$/i.test(g);
    const fd = file ? norm(file, cwd) : null;
    if (/grep|search/i.test(tool) && fd && PROTECTED_DIR.test(fd) && (insideResearch(fd) || !fs.existsSync(fd)) && !safeGlob) block('search inside sessions/ or consent/ only with glob set to observations.json, analysis-input.json or transcript.redacted.json.');
    // A search glob overrides ignore files, so check what it would really match,
    // and refuse one aimed at a raw file by name even where nothing exists yet.
    const RAW = ['transcript.json', 'answers.json', 'device.json', 'notes.md', 'markers.json'];
    const lastSeg = g.split('/').pop();
    // Only where research data is, or may be: in an ordinary project, notes.md is just a file.
    const base = fd ?? norm('.', cwd);
    const namesRaw = RAW.some((n) => lastSeg.toLowerCase().includes(n.split('.')[0]) && matchSeg(compileSeg(lastSeg), n)) && (!fs.existsSync(base) || insideResearch(base) || researchBelow(base));
    if (/grep|search/i.test(tool) && g && !safeGlob && namesRaw) {
      block('searching raw research files by name is not allowed. Use glob analysis-input.json, observations.json or transcript.redacted.json.');
    }
    if (/grep|search/i.test(tool) && g && !safeGlob) {
      const m = globWhy(norm(g.includes('/') ? g : `**/${g}`, file ? norm(file, cwd) : cwd));
      if (m) block(m);
    }
    process.exit(0);
  }

  // Shell commands.
  const c = cmd.replace(/\s+/g, ' ');
  const tokens = c.match(/"[^"]*"|'[^']*'|[^\s;|&<>()]+/g) ?? [];
  // A folder named sessions/ or consent/ matters inside a research folder. A
  // path that doesn't exist (yet) is treated as if it might be one; a bare word
  // ("fix consent banner", "grep sessions src/") is not a path.
  // A backslash counts as a separator only before a name (research\x\sessions), not in a regex like consent\|x.
  const folderWhy = (n, t, guess = true) => (dirWhy(n) && (insideResearch(n) || (guess && /\/|\\[\w.-]/.test(t) && !fs.existsSync(n))) ? 'this folder holds raw research data; only listing commands may touch it.' : null);
  // Paths may be relative to a folder the command moves into (cd, pushd, git -C),
  // so check them against every folder it could be in, including chained moves.
  const cwds = [norm('.', cwd)];
  for (const m of c.matchAll(/(?:\b(?:cd|pushd)|\s-C|--prefix(?:=|\s))\s*("[^"]*"|'[^']*'|[^\s;|&<>()]+)/g)) {
    const t = m[1].replace(/^["']|["']$/g, '');
    for (const d of [cwds[0], cwds.at(-1)]) for (const x of GLOB.test(t) ? expandDirs(norm(t, d)) : [norm(t, d)]) if (!cwds.includes(x)) cwds.push(x);
  }
  const hits = [];
  for (const d of cwds) { const m = why(d) ?? folderWhy(d, '/'); if (m) hits.push(m); }
  // Also look inside quoted code (python -c, node -e) for path-like text.
  // Word by word, capped, so a huge command can't make this slow.
  const embedded = c.split(' ').filter((w) => w.length <= 4096).flatMap((w) => w.match(/[A-Za-z0-9_.~*?[\]{}\\/-]*(?:sessions|consent|context[\\/]sources)[A-Za-z0-9_.*?[\]{}\\/-]*/gi) ?? []);
  for (const tk of [...tokens, ...embedded]) {
    if (hits.length) break;
    if (Date.now() > deadline) block('this command takes too long to check. Split it up, or name the files directly.');
    const t = tk.replace(/^["']|["']$/g, '');
    if (!/[/\\*?]|\.json$|\.md$|\.webm$|\.mp4$|\.wav$|\.m4a$|^(media|frames|consent|sessions)$/i.test(t)) continue;
    if (t.length > 4096) { hits.push('a path in this command is too long to check.'); break; }
    for (const [i, d] of cwds.entries()) {
      const n = norm(t, d);
      // Only the starting folder gets the benefit of the doubt for paths that don't exist.
      const m = why(n) ?? folderWhy(n, t, i === 0) ?? globWhy(n);
      if (m) { hits.push(m); break; }
    }
  }
  const isGit = /\bgit\b/.test(c);
  if (isGit && /\badd\b/.test(c) && /(-f\b|--force)/.test(c) && /research|sessions|consent/.test(c)) block('force-adding research files to git is not allowed.');
  // Plain "git add ." is fine: research/.gitignore already excludes research data.
  if (!hits.length) process.exit(0);
  // Listing names and sizes doesn't reveal contents. One command only: a newline
  // starts another command, and --files0-from reads names out of a file.
  const single = !/[|;&`$\n\r]/.test(cmd) && !/--files0-from/.test(c);
  const first = (tokens[0] ?? '').replace(/^.*\//, '');
  const listing = /^(ls|du|stat|wc|test|\[)$/.test(first) && single;
  const findOk = first === 'find' && !/-exec|-delete|-fprint|-ok\b/.test(c) && single;
  if (listing || findOk) process.exit(0);
  if (isGit && /\b(status|check-ignore|ls-files)\b/.test(c) && single) process.exit(0);
  block(hits[0]);
}
