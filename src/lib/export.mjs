// Upgrade path (FR-PLG-015): package one study folder for import into the
// R1 platform's research repository. Nothing is renamed: study slug,
// participant ids, note, group, insight and context ids stay as they are, so
// R1 can keep every link between evidence, notes and insights.
//
// The package is a .tar.gz with manifest.json first (file list with SHA-256).
// Left out by default: media, frames and raw transcripts (include_media adds
// them), unredacted session notes, device details, upload staging, context
// source documents and participant names in consent records.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { studyDir, listSessions } from './folder.mjs';

const MEDIA = /^sessions\/[^/]+\/(media|frames)\/|^sessions\/[^/]+\/transcript\.json$/;
const NEVER = [
  /^sessions\/[^/]+\/\.incoming\//, /^sessions\/[^/]+\/notes\.md$/, /^sessions\/[^/]+\/device\.json$/,
  /^context\/sources\//, /^runner\//, /(^|\/)\.DS_Store$/, /\.tmp-/,
];

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) walk(f, base, out); else if (e.isFile()) out.push(path.relative(base, f).split(path.sep).join('/'));
  }
  return out;
}

// Minimal ustar writer: regular files only, paths split into prefix/name.
function tarHeader(name, size, mtime) {
  const h = Buffer.alloc(512);
  let prefix = ''; let n = name;
  if (Buffer.byteLength(n) > 100) {
    let i = n.indexOf('/');
    while (i !== -1 && Buffer.byteLength(n.slice(i + 1)) > 100) i = n.indexOf('/', i + 1);
    if (i === -1 || Buffer.byteLength(n.slice(0, i)) > 155) throw new Error(`Path too long to package: ${name}`);
    prefix = n.slice(0, i); n = n.slice(i + 1);
  }
  const put = (s, off, len) => h.write(s, off, len, 'utf8');
  const oct = (v, len) => v.toString(8).padStart(len - 1, '0') + '\0';
  put(n, 0, 100); put(oct(0o644, 8), 100, 8); put(oct(0, 8), 108, 8); put(oct(0, 8), 116, 8);
  put(oct(size, 12), 124, 12); put(oct(Math.floor(mtime / 1000), 12), 136, 12);
  h.fill(0x20, 148, 156); put('0', 156, 1); put('ustar\0', 257, 6); put('00', 263, 2); put(prefix, 345, 155);
  let sum = 0; for (const b of h) sum += b;
  put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return h;
}

async function* tarStream(entries) {
  for (const e of entries) {
    yield tarHeader(e.path, e.bytes, e.mtime);
    if (e.data) yield e.data; else for await (const c of fs.createReadStream(e.file)) yield c;
    const pad = (512 - (e.bytes % 512)) % 512;
    if (pad) yield Buffer.alloc(pad);
  }
  yield Buffer.alloc(1024);
}

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
async function shaFile(f) { const h = crypto.createHash('sha256'); for await (const c of fs.createReadStream(f)) h.update(c); return h.digest('hex'); }

export async function exportStudy({ root, slug, study, includeMedia = false, version, outDir, now = new Date() }) {
  const dir = studyDir(root, slug);
  const files = walk(dir).sort();
  const entries = []; const left_out = { media: 0, private: 0 };
  for (const rel of files) {
    if (NEVER.some((re) => re.test(rel))) { left_out.private++; continue; }
    if (MEDIA.test(rel) && !includeMedia) { left_out.media++; continue; }
    const file = path.join(dir, rel);
    const st = fs.statSync(file);
    // Consent records keep the decision, version and method; the name is
    // only there for local redaction, so it stays behind.
    if (/^consent\/[^/]+\.json$/.test(rel) && rel !== 'consent/external-ids.json') {
      const c = JSON.parse(fs.readFileSync(file, 'utf8'));
      delete c.name;
      const data = Buffer.from(JSON.stringify(c, null, 2) + '\n');
      entries.push({ path: `${slug}/${rel}`, data, bytes: data.length, mtime: st.mtimeMs, sha256: sha(data) });
      continue;
    }
    if (rel === 'consent/external-ids.json') { left_out.private++; continue; }
    entries.push({ path: `${slug}/${rel}`, file, bytes: st.size, mtime: st.mtimeMs, sha256: await shaFile(file) });
  }
  const manifest = {
    format: 'proofloop-study-export', format_version: 1, plugin_version: version,
    exported_at: now.toISOString(), study: { slug, name: study.metadata?.name ?? null, version: study.metadata?.version ?? null, previous_version: study.metadata?.previousVersion ?? null },
    participants: listSessions(root, slug), includes_media: includeMedia,
    ids_unchanged: true, left_out,
    files: entries.map((e) => ({ path: e.path, bytes: e.bytes, sha256: e.sha256 })),
  };
  const mdata = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  const all = [{ path: `${slug}/manifest.json`, data: mdata, bytes: mdata.length, mtime: now.getTime() }, ...entries];
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15);
  const out = path.join(outDir, `${slug}-${stamp}${includeMedia ? '-with-media' : ''}.tar.gz`);
  const tmp = `${out}.tmp-${process.pid}`;
  try {
    await pipeline(Readable.from(tarStream(all)), zlib.createGzip(), fs.createWriteStream(tmp, { mode: 0o600 }));
    fs.renameSync(tmp, out);
  } finally { fs.rmSync(tmp, { force: true }); }
  return { file: out, files: entries.length, bytes: fs.statSync(out).size, participants: manifest.participants.length, includes_media: includeMedia, left_out };
}
