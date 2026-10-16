// Fallback import from the current testing tool (FR-PLG-009): a results CSV
// plus, optionally, one video file per participant. Each row becomes a
// session P<n>. The tool's own participant ids (often usernames or emails)
// stay in consent/external-ids.json and never reach the model; re-importing
// the same CSV maps them to the same P<n> and skips sessions already there.
// Only the mapped columns are read. Cell values are never returned.

import fs from 'node:fs';
import path from 'node:path';
import { sessionDir, studyDir, readJson, writeJson, appendLog, listSessions } from './folder.mjs';
import { assertMediaFile } from './media.mjs';

export function parseCsv(text) {
  const s = text.replace(/^﻿/, '');
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (q) throw new Error('The CSV has an unclosed quote.');
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  if (!rows.length) throw new Error('The CSV is empty.');
  const header = rows[0].map((h) => h.trim());
  return { header, rows: rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()]))) };
}

const norm = (v) => v.trim().toLowerCase();
const SUCCESS = ['success', 'successful', 'succeeded', 'completed', 'complete', 'pass', 'passed', 'yes', 'y', 'true', '1'];
const FAILURE = ['fail', 'failed', 'failure', 'gave up', 'give up', 'abandoned', 'incomplete', 'not completed', 'no', 'n', 'false', '0'];

export function importResultsCsv({ root, slug, study, csvPath, participantColumn, tasks, susColumns, videoColumn, videoDir, consentVersion }) {
  const { header, rows } = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const studyTasks = new Map(study.spec.blocks.filter((b) => b.type === 'task').map((t) => [t.id, t]));
  const need = [participantColumn, ...tasks.flatMap((t) => [t.outcome_column, t.time_column, t.seq_column]), ...(susColumns ?? []), videoColumn].filter(Boolean);
  const missing = need.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`Columns not in the CSV: ${missing.join(', ')}. The CSV has: ${header.join(', ')}`);
  for (const t of tasks) {
    if (!studyTasks.has(t.task_id)) throw new Error(`Task "${t.task_id}" is not in study.yaml.`);
    if (t.seq_column && !(studyTasks.get(t.task_id).followUps ?? []).some((f) => f.type === 'seq')) throw new Error(`Task "${t.task_id}" has no SEQ question in study.yaml, so seq_column can't be stored.`);
  }
  const susBlock = study.spec.blocks.find((b) => b.type === 'question' && b.questionType === 'sus');
  if (susColumns && !susBlock) throw new Error('study.yaml has no SUS question, so sus_columns can\'t be stored.');
  if (videoColumn && !videoDir) throw new Error('video_dir is needed with video_column.');

  const idsFile = path.join(studyDir(root, slug), 'consent', 'external-ids.json');
  const ids = readJson(idsFile, { source: 'csv', map: {} });
  let next = Math.max(0, ...listSessions(root, slug).map((p) => Number(p.slice(1))), ...Object.values(ids.map).map((p) => Number(p.slice(1)))) + 1;
  const report = { rows: rows.length, imported: [], skipped: [], warnings: [], note: 'Task success is the testing tool\'s own result, taken as given. Imported sessions have no click data, so behaviour notes need the video or transcript.' };
  const success = (t) => new Set((t.success_values ?? SUCCESS).map(norm));
  const failure = (t) => new Set((t.failure_values ?? FAILURE).map(norm));

  rows.forEach((row, i) => {
    const line = i + 2;
    const ext = row[participantColumn];
    if (!ext) { report.warnings.push(`Row ${line}: no participant id, skipped.`); return; }
    const p = ids.map[ext] ?? `P${next++}`;
    ids.map[ext] = p;
    const dir = sessionDir(root, slug, p);
    if (fs.existsSync(path.join(dir, 'session.json'))) { report.skipped.push(p); return; }

    // Each attempted task becomes a start and an end event. Time is the
    // tool's task time; tasks with no outcome were not attempted.
    const events = []; let seq = 0; let t0 = 0;
    const answers = {};
    for (const t of tasks) {
      const raw = norm(row[t.outcome_column]);
      if (!raw) continue;
      const ok = success(t).has(raw); const bad = failure(t).has(raw);
      if (!ok && !bad) { report.warnings.push(`Row ${line} (${p}): outcome for ${t.task_id} isn't a known success or failure value, so that task is left out. Pass success_values or failure_values to map it.`); continue; }
      const secs = t.time_column ? Number(row[t.time_column].replace(',', '.')) : NaN;
      const dur = Number.isFinite(secs) && secs >= 0 ? Math.round(secs * 1000) : null;
      if (t.time_column && dur === null && row[t.time_column]) report.warnings.push(`Row ${line} (${p}): time for ${t.task_id} is not a number of seconds, so no time is recorded.`);
      const id = () => `e${String(++seq).padStart(5, '0')}`;
      events.push({ id: id(), t_ms: t0, type: 'task_start', task_id: t.task_id });
      const end = { id: id(), t_ms: t0 + (dur ?? 0), type: 'task_end', task_id: t.task_id, outcome: ok ? 'completed' : 'gave_up', reached: ok, source: 'csv' };
      // Without a time, start and end share t_ms and the report skips the time.
      if (dur === null) end.no_time = true;
      events.push(end);
      t0 += (dur ?? 0) + 1000;
      if (t.seq_column && row[t.seq_column]) {
        const v = Number(row[t.seq_column]);
        const q = studyTasks.get(t.task_id).followUps.find((f) => f.type === 'seq');
        if (Number.isInteger(v) && v >= 1 && v <= 7) answers[q.id] = v; else report.warnings.push(`Row ${line} (${p}): SEQ for ${t.task_id} is not 1 to 7, left out.`);
      }
    }
    if (susColumns) {
      const vals = susColumns.map((c) => Number(row[c]));
      if (vals.every((v) => Number.isInteger(v) && v >= 1 && v <= 5)) answers[susBlock.id] = vals;
      else if (susColumns.some((c) => row[c])) report.warnings.push(`Row ${line} (${p}): SUS answers incomplete or not 1 to 5, left out.`);
    }

    let files = {};
    if (videoColumn && row[videoColumn]) {
      const name = row[videoColumn];
      if (path.basename(name) !== name) report.warnings.push(`Row ${line} (${p}): video name must be a file name in video_dir, not a path. Video left out.`);
      else {
        const src = path.join(videoDir, name);
        try {
          if (!fs.existsSync(src)) throw new Error('file not found in video_dir');
          assertMediaFile(src);
          const e = /^\.(mp4|m4a|mov|webm|mkv|wav|mp3|ogg)$/.test(path.extname(name).toLowerCase()) ? path.extname(name).toLowerCase() : '.mp4';
          fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
          fs.copyFileSync(src, path.join(dir, 'media', `screen${e}`));
          files = { screen: { file: `media/screen${e}`, bytes: fs.statSync(src).size } };
        } catch (err) { report.warnings.push(`Row ${line} (${p}): video left out (${err.message}).`); }
      }
    }

    fs.mkdirSync(dir, { recursive: true });
    if (events.length) writeJson(path.join(dir, 'events.json'), { source: 'csv', session_start: null, events });
    if (Object.keys(answers).length) writeJson(path.join(dir, 'answers.json'), { source: 'csv', answers });
    writeJson(path.join(dir, 'recording.json'), { participant: p, imported_at: new Date().toISOString(), source: 'csv', complete: true, files });
    writeJson(path.join(dir, 'session.json'), { participant: p, mode: 'unmoderated', source: 'csv' });
    const cf = path.join(studyDir(root, slug), 'consent', `${p}.json`);
    if (!fs.existsSync(cf)) writeJson(cf, { participant: p, agreed: true, version: consentVersion, method: 'external-tool', recorded_by: 'testing tool', at: new Date().toISOString() });
    report.imported.push({ participant: p, tasks: events.length / 2, answers: Object.keys(answers).length, video: !!files.screen });
  });

  writeJson(idsFile, ids);
  appendLog(root, slug, { skill: 'import-sessions', source: 'csv', rows: rows.length, imported: report.imported.length, skipped: report.skipped.length });
  return report;
}
