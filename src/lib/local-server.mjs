// Local pages for the moderator Studio (FR-PLG-016) and the affinity
// board (FR-PLG-019). Listens on 127.0.0.1 only, checks the Host header
// (DNS-rebinding defence) and a random per-run key on every API call.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { WEB } from './web-assets.mjs';
import { studyDir, sessionDir, hasConsent, readJson, writeJson, sha256File, appendLog } from './folder.mjs';
import { applyOp, boardSummary } from './board.mjs';
import { parseStudy } from './study.mjs';

const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8' };

export function startLocalServer({ root, port = 0 }) {
  const key = crypto.randomBytes(24).toString('hex');
  const server = http.createServer();
  const open = new Map(); // `${study}/${p}/${track}` -> { fd, seq }
  const openKeys = (slug, p) => [...open.keys()].filter((k) => k.startsWith(`${slug}/${p}/`));

  const send = (res, status, body, type = 'application/json') => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; media-src 'self' blob:; img-src 'self' data: blob:; frame-ancestors 'none'" });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  const readBody = async (req, limit) => {
    const chunks = [];
    let n = 0;
    for await (const c of req) { n += c.length; if (n > limit) throw Object.assign(new Error('body too large'), { status: 413 }); chunks.push(c); }
    return Buffer.concat(chunks);
  };
  const json = async (req) => { const b = await readBody(req, 1e6); return b.length ? JSON.parse(b.toString('utf8')) : {}; };

  server.on('request', async (req, res) => {
    try {
      const addr = server.address();
      const allowedHosts = [`127.0.0.1:${addr.port}`, `localhost:${addr.port}`];
      if (!allowedHosts.includes(req.headers.host)) return send(res, 421, { error: 'wrong host' });
      const url = new URL(req.url, `http://127.0.0.1:${addr.port}`);
      const parts = url.pathname.split('/').filter(Boolean);

      if (req.method === 'GET' && ['studio', 'board'].includes(parts[0]) && parts.length === 1) {
        return send(res, 200, WEB[`local/${parts[0]}.html`], TYPES.html);
      }
      if (req.method === 'GET' && parts[0] === 'assets' && /^[a-z-]+\.(js|css)$/.test(parts[1] ?? '')) {
        const asset = WEB[`local/${parts[1]}`];
        return asset ? send(res, 200, asset, TYPES[parts[1].split('.').pop()]) : send(res, 404, { error: 'not found' });
      }
      if (parts[0] !== 'api') return send(res, 404, { error: 'not found' });
      const given = Buffer.from(String(req.headers['x-proofloop-key'] ?? ''));
      if (given.length !== key.length * 1 || !crypto.timingSafeEqual(given, Buffer.from(key))) return send(res, 401, { error: 'bad key' });

      // ----- Studio -----
      if (parts[1] === 'studio') {
        const [, , slug, p, action] = parts;
        const sdir = sessionDir(root, slug, p);
        const studyFile = path.join(studyDir(root, slug), 'study.yaml');
        if (req.method === 'GET' && !action) {
          const parsed = parseStudy(fs.readFileSync(studyFile, 'utf8'));
          if (parsed.errors) return send(res, 400, { error: parsed.errors.join('; ') });
          const guidePath = path.join(studyDir(root, slug), 'guide.md');
          const guide = fs.existsSync(guidePath) ? fs.readFileSync(guidePath, 'utf8') : '';
          const sections = guide.split('\n').filter((l) => /^##\s/.test(l)).map((l, i) => ({ id: `sec${i + 1}`, title: l.replace(/^##\s+/, '') }));
          const recording = openKeys(slug, p).length > 0;
          return send(res, 200, { study: parsed.study.metadata.name, mediaDays: parsed.study.spec.retention.mediaDays, participant: p, consent: hasConsent(root, slug, p), sections, already: fs.existsSync(path.join(sdir, 'recording.json')), recording, started_at_ms: recording ? readJson(path.join(sdir, 'session.json'), {}).started_at_ms ?? null : null });
        }
        if (!hasConsent(root, slug, p)) return send(res, 403, { error: `No consent record for ${p}. Record consent first (consent/${p}.json).` });
        if (req.method === 'POST' && action === 'start') {
          if (fs.existsSync(path.join(sdir, 'recording.json'))) return send(res, 409, { error: 'This session already has a recording. Use a new participant id.' });
          const b = await json(req);
          if (!Array.isArray(b.tracks) || !b.tracks.length || !b.tracks.every((t) => t === 'screen' || t === 'mic') || new Set(b.tracks).size !== b.tracks.length) return send(res, 400, { error: 'tracks must be screen and/or mic, each once' });
          if (!Number.isFinite(b.started_at)) return send(res, 400, { error: 'started_at must be a time in milliseconds' });
          // A reloaded Studio page must not reopen (and so truncate) a running recording.
          // No await between this check and open.set, so two quick starts can't both pass.
          if (openKeys(slug, p).length) return send(res, 409, { error: `A recording is already running for ${p}. If this page was reloaded, press Stop to save what was recorded.` });
          fs.mkdirSync(path.join(sdir, 'media'), { recursive: true });
          // Pieces from a recording that was cut off (the plugin restarted mid-call) are kept beside the new one.
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          for (const f of ['media/screen.webm', 'media/mic.webm', 'markers.json']) {
            const src = path.join(sdir, f);
            if (fs.existsSync(src) && fs.statSync(src).size > 0) fs.renameSync(src, src.replace(/\.(webm|json)$/, `.partial-${stamp}.$1`));
          }
          writeJson(path.join(sdir, 'session.json'), { participant: p, mode: 'moderated', started_at: new Date(b.started_at).toISOString(), started_at_ms: b.started_at, tracks: b.tracks, capture: String(b.capture ?? 'unknown').slice(0, 40) });
          writeJson(path.join(sdir, 'markers.json'), { markers: [] });
          for (const t of b.tracks) open.set(`${slug}/${p}/${t}`, { fd: fs.openSync(path.join(sdir, 'media', `${t}.webm`), 'w'), seq: 0 });
          appendLog(root, slug, { skill: 'run-session', event: 'recording_start', participant: p });
          return send(res, 200, { ok: true });
        }
        if (req.method === 'POST' && action === 'chunk') {
          const track = url.searchParams.get('track');
          const seq = Number(url.searchParams.get('seq'));
          const o = open.get(`${slug}/${p}/${track}`);
          if (!o) return send(res, 409, { error: 'recording not started' });
          if (seq !== o.seq) return send(res, 409, { error: `expected piece ${o.seq}, got ${seq}`, expected: o.seq });
          const buf = await readBody(req, 50 * 1024 * 1024);
          fs.writeSync(o.fd, buf);
          o.seq++;
          return send(res, 200, { ok: true, next: o.seq });
        }
        if (req.method === 'POST' && action === 'marker') {
          const b = await json(req);
          const f = path.join(sdir, 'markers.json');
          const m = readJson(f, { markers: [] });
          m.markers.push({ id: `m${String(m.markers.length + 1).padStart(3, '0')}`, t_ms: Math.max(0, Number(b.t_ms) || 0), kind: String(b.kind ?? 'note').slice(0, 20), text: String(b.text ?? '').slice(0, 2000) });
          writeJson(f, m);
          return send(res, 200, { ok: true, id: m.markers.at(-1).id });
        }
        if (req.method === 'POST' && action === 'stop') {
          const b = await json(req);
          const keys = openKeys(slug, p);
          // Nothing open (never started, or the plugin restarted mid-call): say so rather than report "saved".
          if (!keys.length) return send(res, 409, { error: `Nothing is recording for ${p}, so nothing was saved. If Claude Code or Cursor restarted during the call, the pieces recorded so far are in sessions/${p}/media/.` });
          const session = readJson(path.join(sdir, 'session.json'), {});
          const durationMs = Number.isFinite(b.duration_ms) ? b.duration_ms : Number.isFinite(session.started_at_ms) ? Date.now() - session.started_at_ms : null;
          const files = {};
          for (const k of keys) {
            const o = open.get(k);
            fs.closeSync(o.fd);
            open.delete(k);
            const track = k.split('/').pop();
            const raw = path.join(sdir, 'media', `${track}.webm`);
            // Remux so the file has a proper duration and seek index.
            const fixed = path.join(sdir, 'media', `${track}.fixed.webm`);
            const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-c', 'copy', fixed]);
            if (r.status === 0) fs.renameSync(fixed, raw);
            files[track] = { file: `media/${track}.webm`, bytes: fs.statSync(raw).size, sha256: sha256File(raw), pieces: o.seq, remuxed: r.status === 0 };
          }
          writeJson(path.join(sdir, 'recording.json'), { participant: p, ended_at: new Date().toISOString(), duration_ms: durationMs, files });
          // Notes as Markdown with timestamps, for the analysis step.
          const m = readJson(path.join(sdir, 'markers.json'), { markers: [] });
          const fmt = (ms) => new Date(ms).toISOString().slice(11, 19);
          fs.writeFileSync(path.join(sdir, 'notes.md'), `# Moderator notes: ${p}\n\n${m.markers.map((x) => `- [${fmt(x.t_ms)}] (${x.kind}) ${x.text}`).join('\n')}\n`);
          appendLog(root, slug, { skill: 'run-session', event: 'recording_stop', participant: p, files: Object.keys(files) });
          return send(res, 200, { ok: true, files });
        }
      }

      // ----- Affinity board -----
      if (parts[1] === 'board') {
        const slug = parts[2];
        const f = path.join(studyDir(root, slug), 'affinity', 'board.json');
        if (req.method === 'GET') { const board = readJson(f); return send(res, 200, { board, summary: boardSummary(board) }); }
        if (req.method === 'POST' && parts[3] === 'op') {
          const op = await json(req);
          const board = readJson(f);
          applyOp(board, op, 'researcher');
          writeJson(f, board);
          return send(res, 200, { board, summary: boardSummary(board), op });
        }
      }
      return send(res, 404, { error: 'not found' });
    } catch (e) {
      return send(res, e.status ?? 400, { error: e.message });
    }
  });

  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve({ server, base, key, close: () => new Promise((r) => server.close(r)) });
  }));
}
