// Pulls finished sessions from the short relay into the laptop study
// folder, verifies them, then deletes them from the relay (FR-PLG-009).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { sessionDir, studyDir, writeJson, readJson, sha256File, appendLog } from './folder.mjs';
import { assembleChunks, probe, which } from './media.mjs';

const MAX_PIECE = 25 * 1024 * 1024;

async function call(relayUrl, adminToken, method, p, query) {
  const u = new URL(relayUrl.replace(/\/$/, '') + p);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  const r = await fetch(u, { method, headers: { authorization: `Bearer ${adminToken}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`relay ${method} ${p}: ${r.status} ${j.error ?? ''}`);
  return j;
}

export async function importFromRelay({ root, slug, relayUrl, adminToken, includeIncomplete = false, keepOnRelay = false, now = Date.now() }) {
  const { objects, retention_days: retentionDays = 1 } = await call(relayUrl, adminToken, 'GET', '/list', { study: slug });
  const limitH = retentionDays * 24;
  const byP = new Map();
  for (const o of objects) {
    const [, p, name] = o.key.split('/');
    if (!/^P\d{1,3}$/.test(p ?? '') || !/^(chunk-(screen|mic)-\d{6}\.webm|events-\d{4}\.json|meta\.json|answers\.json|done\.json)$/.test(name ?? '')) continue;
    if (!byP.has(p)) byP.set(p, []);
    byP.get(p).push({ ...o, name });
  }
  const report = { imported: [], skipped: [], deleted: 0, warnings: [] };
  for (const [p, objs] of [...byP].sort()) {
    const dir = sessionDir(root, slug, p);
    const prevRec = readJson(path.join(dir, 'recording.json'), null);
    const studioRec = !!prevRec && prevRec.source !== 'relay';
    if (prevRec?.source === 'relay' || fs.existsSync(path.join(dir, 'runner-import.json'))) {
      report.warnings.push(`${p}: new uploads arrived after this session was imported. They were not imported${keepOnRelay ? '' : ' and were deleted from the relay'}. If ${p} really took part twice, give the second session a new participant id.`);
      if (!keepOnRelay) for (const o of objs) { await call(relayUrl, adminToken, 'DELETE', '/object', { study: slug, key: o.key }); report.deleted++; }
      continue;
    }
    const done = objs.some((o) => o.name === 'done.json');
    const newest = Math.max(...objs.map((o) => Date.parse(o.modified) || 0));
    const ageH = (now - newest) / 3600000;
    if (!done && !(includeIncomplete && ageH > 2)) {
      report.skipped.push({ participant: p, reason: done ? '' : `not finished yet (last upload ${ageH.toFixed(1)} h ago)` });
      if (ageH > limitH - 4) report.warnings.push(`${p}: unfinished and close to the ${limitH}-hour relay limit. Import with include_incomplete to keep what arrived.`);
      continue;
    }
    // A link stays valid for days. Uploads that arrive after a session was
    // imported must not replace it: report them and delete them.
    const tooBig = objs.find((o) => o.size > MAX_PIECE);
    if (tooBig) { report.warnings.push(`${p}: ${tooBig.name} is larger than the ${MAX_PIECE / 1e6} MB limit, so the session was not imported. Check the relay.`); continue; }
    const stage = path.join(dir, '.incoming');
    fs.mkdirSync(stage, { recursive: true });
    try {
    for (const o of objs) {
      const { url } = await call(relayUrl, adminToken, 'GET', '/object', { study: slug, key: o.key });
      const r = await fetch(url);
      if (!r.ok) throw new Error(`download ${o.key} failed: ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (o.size && buf.length !== o.size) throw new Error(`${o.key}: size ${buf.length} != ${o.size}`);
      fs.writeFileSync(path.join(stage, o.name), buf);
    }
    const files = {};
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    for (const track of ['screen', 'mic']) {
      const chunks = fs.readdirSync(stage).filter((f) => f.startsWith(`chunk-${track}-`)).sort();
      if (!chunks.length) continue;
      // Gaps in numbering mean lost pieces; report them rather than hide them.
      const nums = chunks.map((c) => Number(c.match(/(\d{6})/)[1]));
      const missing = nums.length ? nums[nums.length - 1] + 1 - nums.length : 0;
      const out = path.join(dir, 'media', `${track}.webm`);
      if (which('ffmpeg')) assembleChunks(chunks.map((c) => path.join(stage, c)), out);
      else fs.writeFileSync(out, Buffer.concat(chunks.map((c) => fs.readFileSync(path.join(stage, c)))));
      let duration = null;
      try { duration = which('ffprobe') ? probe(out).duration_s : null; } catch { duration = null; }
      const expected = chunks.length * 5;
      if (duration != null && Math.abs(duration - expected) > 6) report.warnings.push(`${p} ${track}: duration ${duration.toFixed(1)} s vs about ${expected} s expected from ${chunks.length} pieces`);
      if (missing > 0) report.warnings.push(`${p} ${track}: ${missing} piece(s) missing`);
      files[track] = { file: `media/${track}.webm`, bytes: fs.statSync(out).size, sha256: sha256File(out), pieces: chunks.length, missing_pieces: missing, duration_s: duration };
    }
    // Events: concatenate batches in order.
    const evFiles = fs.readdirSync(stage).filter((f) => /^events-\d{4}\.json$/.test(f)).sort();
    let sessionStart = null;
    const events = [];
    for (const f of evFiles) { const j = JSON.parse(fs.readFileSync(path.join(stage, f), 'utf8')); sessionStart ??= j.session_start; events.push(...j.events); }
    events.sort((a, b) => a.t_ms - b.t_ms);
    if (events.length) {
      const target = path.join(dir, fs.existsSync(path.join(dir, 'session.json')) ? 'runner-events.json' : 'events.json');
      writeJson(target, { source: 'runner', session_start: sessionStart, events });
    }
    if (fs.existsSync(path.join(stage, 'answers.json'))) fs.copyFileSync(path.join(stage, 'answers.json'), path.join(dir, 'answers.json'));
    if (fs.existsSync(path.join(stage, 'meta.json'))) {
      const meta = JSON.parse(fs.readFileSync(path.join(stage, 'meta.json'), 'utf8'));
      if (meta.consent?.agreed) {
        const cf = path.join(studyDir(root, slug), 'consent', `${p}.json`);
        if (!fs.existsSync(cf)) writeJson(cf, { participant: p, agreed: true, version: meta.consent.version, at: meta.consent.at, method: 'runner-checkbox', recorded_by: 'participant' });
      }
      writeJson(path.join(dir, 'device.json'), { userAgent: meta.userAgent, screen: meta.screen, session_start: meta.session_start });
    }
    if (!fs.existsSync(path.join(dir, 'session.json'))) writeJson(path.join(dir, 'session.json'), { participant: p, mode: 'unmoderated', started_at_ms: sessionStart, started_at: sessionStart ? new Date(sessionStart).toISOString() : null });
    const doneInfo = fs.existsSync(path.join(stage, 'done.json')) ? JSON.parse(fs.readFileSync(path.join(stage, 'done.json'), 'utf8')) : {};
    if (doneInfo.interrupted) report.warnings.push(`${p}: the participant's page was reloaded mid-test, so the session ends early. Tasks after that point have no result.`);
    const rec = { participant: p, imported_at: new Date().toISOString(), source: 'relay', complete: done && !doneInfo.interrupted, interrupted: !!doneInfo.interrupted, files };
    // A Studio session keeps its own recording.json; the click data import is noted beside it.
    writeJson(path.join(dir, studioRec ? 'runner-import.json' : 'recording.json'), rec);
    if (!keepOnRelay) {
      for (const o of objs) { await call(relayUrl, adminToken, 'DELETE', '/object', { study: slug, key: o.key }); report.deleted++; }
    }
    report.imported.push({ participant: p, complete: rec.complete, interrupted: rec.interrupted, tracks: Object.keys(files), events: events.length });
    } finally {
      fs.rmSync(stage, { recursive: true, force: true });
    }
  }
  // FR-PLG-009: a session seen on the relay that is gone before it was
  // imported has been deleted by the relay's time limit. Say so once.
  const seenF = path.join(studyDir(root, slug), '.relay-seen.json');
  const seen = readJson(seenF, { participants: {} });
  for (const p of byP.keys()) seen.participants[p] = { last_seen: new Date(now).toISOString(), reported_lost: false };
  report.lost = [];
  for (const [p, info] of Object.entries(seen.participants)) {
    if (byP.has(p) || info.reported_lost) continue;
    if (fs.existsSync(path.join(sessionDir(root, slug, p), 'recording.json')) || fs.existsSync(path.join(sessionDir(root, slug, p), 'runner-import.json'))) { delete seen.participants[p]; continue; }
    info.reported_lost = true;
    report.lost.push(p);
    report.warnings.push(`${p}: uploads were waiting on the relay (last seen ${info.last_seen}) but were deleted by its ${limitH}-hour limit before they were imported. That session is lost; invite ${p} again with a new link if needed.`);
  }
  for (const x of report.imported) delete seen.participants[x.participant];
  writeJson(seenF, seen);
  report.retention_hours = limitH;
  appendLog(root, slug, { skill: 'import-sessions', source: 'relay', lost: report.lost, imported: report.imported.map((x) => x.participant), deleted_from_relay: report.deleted, warnings: report.warnings });
  return report;
}

export function newSecret() {
  return crypto.randomBytes(32).toString('base64url');
}

export function readSecrets(root) {
  return readJson(path.join(root, '.proofloop', 'secrets.json'), null);
}
