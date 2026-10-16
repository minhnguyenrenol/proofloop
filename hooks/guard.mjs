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

const PROTECTED = [
  [/\/sessions\/[^/]+\/(media|frames|\.incoming)(\/|$)/, 'raw recordings and frames are not read directly. Use session_prepare, then read analysis-input.json.'],
  [/\/sessions\/[^/]+\/transcript\.json$/, 'raw transcripts may contain personal details. Read transcript.redacted.json or analysis-input.json instead.'],
  [/\/sessions\/[^/]+\/(answers|device)\.json$/, 'raw answers are read by the plugin tools, not directly.'],
  [/\/sessions\/[^/]+\/notes\.md$/, 'session notes are unredacted. The plugin includes them, redacted, in analysis-input.json.'],
  [/\/\.proofloop\/exports\//, 'study export packages hold raw answers (and media if included). Share the file; don\'t read it.'],
  [/\/consent\/[^/]+\.json$/, 'consent records hold participant names; the plugin tools read them for you.'],
  [/\/context\/sources(\/|$)/, 'source documents are read through the add-context skill, which records what was used.'],
];
// Folders that hold protected files: searching or listing contents there needs care.
const PROTECTED_DIR = /\/(sessions(\/[^/]+)?|consent|context\/sources)$/;
const SAFE_IN_SESSION = /\/sessions\/[^/]+\/(analysis-input\.json|observations\.json|transcript\.redacted\.json|session\.json|recording\.json|events\.json|runner-events\.json|signals\.json)$/;

const norm = (p, cwd) => {
  let s = String(p).replace(/\\/g, '/').replace(/^["']|["']$/g, '');
  if (s.startsWith('~/')) s = `${process.env.HOME ?? ''}/${s.slice(2)}`;
  return path.posix.resolve(cwd.replace(/\\/g, '/'), s).replace(/\/+$/, '');
};
// Turn wildcards into "could be anything" so P*/transcript.json still matches.
const wild = (p) => p.replace(/\[[^\]]*\]|\{[^}]*\}|\*\*|\*|\?/g, 'x');
const why = (p) => { if (SAFE_IN_SESSION.test(p)) return null; for (const [re, msg] of PROTECTED) if (re.test(p) || re.test(wild(p))) return msg; return null; };

let raw = '';
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch { process.exit(0); }
  const tool = String(input.tool_name ?? '');
  const ti = input.tool_input ?? {};
  const cwd = String(input.cwd ?? ti.cwd ?? process.cwd());
  const block = (msg) => { process.stderr.write(`Blocked by ProofLoop privacy guard: ${msg}\n`); process.exit(2); };

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
    if (/grep|search/i.test(tool) && file) {
      const d = norm(file, cwd);
      if (PROTECTED_DIR.test(d) || /\/sessions\/[^/]+$/.test(d)) {
        const g = String(ti.glob ?? ti.include ?? '');
        if (!/^(\*\*\/)?(observations|analysis-input|transcript\.redacted)\.json$/.test(g)) block('search inside sessions/ or consent/ only with glob set to observations.json, analysis-input.json or transcript.redacted.json.');
      }
    }
    process.exit(0);
  }

  // Shell commands.
  const c = cmd.replace(/\s+/g, ' ');
  const cwdN = norm('.', cwd);
  const tokens = c.match(/"[^"]*"|'[^']*'|[^\s;|&<>()]+/g) ?? [];
  const hits = [];
  if (why(cwdN) || /\/sessions\/[^/]+$/.test(cwdN) || PROTECTED_DIR.test(cwdN)) hits.push(why(cwdN) ?? 'this folder holds raw research data.');
  // Also look inside quoted code (python -c, node -e) for path-like text.
  const embedded = c.match(/[A-Za-z0-9_.~*?[\]{}\\/-]*(?:sessions|consent|context[\\/]sources)[A-Za-z0-9_.*?[\]{}\\/-]*/g) ?? [];
  for (const tk of [...tokens, ...embedded]) {
    const t = tk.replace(/^["']|["']$/g, '');
    if (!/[/\\]|\.json$|\.md$|\.webm$|\.mp4$|\.wav$|\.m4a$|^(media|frames|consent|sessions)$/.test(t)) continue;
    const n = norm(t, cwd);
    const m = why(n) ?? (PROTECTED_DIR.test(n) || /\/sessions\/[^/]+$/.test(n) ? 'this folder holds raw research data; only listing commands may touch it.' : null);
    if (m) hits.push(m);
  }
  const isGit = /\bgit\b/.test(c);
  if (isGit && /\badd\b/.test(c) && /(-f\b|--force)/.test(c) && /research|sessions|consent/.test(c)) block('force-adding research files to git is not allowed.');
  // Plain "git add ." is fine: research/.gitignore already excludes research data.
  if (!hits.length) process.exit(0);
  // Listing names and sizes doesn't reveal contents.
  const first = (tokens[0] ?? '').replace(/^.*\//, '');
  const listing = /^(ls|du|stat|wc|file|test|\[)$/.test(first) && !/[|;&`$]/.test(c);
  const findOk = first === 'find' && !/-exec|-delete|-fprint|-ok\b/.test(c) && !/[|;&`$]/.test(c);
  if (listing || findOk) process.exit(0);
  if (isGit && /\b(status|check-ignore|ls-files)\b/.test(c) && !/[|;&`$]/.test(c)) process.exit(0);
  block(hits[0]);
});
