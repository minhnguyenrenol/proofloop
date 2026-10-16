// Regression tests for the v0.3 review fixes: data loss, privacy and
// robustness edge cases, driven through the real MCP server. Synthetic data only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startLocalRelay } from '../relay/local.mjs';

const SERVER = path.resolve(process.env.PROOFLOOP_SERVER ?? 'src/server.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'proofloop-hard-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'project');
const research = path.join(project, 'research');
fs.mkdirSync(home, { recursive: true });
fs.mkdirSync(project, { recursive: true });
const RELAY = `http://127.0.0.1:${17000 + Math.floor(Math.random() * 1000)}`;
let client;
let relay;
let secrets;

async function call(name, args) {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content[0].text;
  if (r.isError) throw new Error(`${name}: ${text}`);
  return JSON.parse(text);
}

before(async () => {
  client = new Client({ name: 'hardening', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], cwd: project, env: { ...process.env, HOME: home } }));
  const setup = await call('setup_init', { path: research, location: 'laptop', confirm_managed_device: true, product_name: 'Test', relay_url: RELAY, user_name: 'Test Researcher' });
  secrets = JSON.parse(fs.readFileSync(setup.relay_secrets.stored_at, 'utf8'));
  relay = await startLocalRelay({ dir: path.join(tmp, 'relay-data'), port: Number(new URL(RELAY).port), secret: secrets.relay_secret, adminToken: secrets.admin_token });
});
after(async () => { await client?.close(); await relay?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('insights: resubmitting some insights keeps the others and their review decisions', async () => {
  await call('study_create', { slug: 'ins-merge', name: 'Insight merge', mode: 'unmoderated' });
  const d = path.join(research, 'ins-merge');
  const notes = ['P1', 'P2'].flatMap((p) => [
    { id: `${p}-o1`, participant: p, task_id: null, type: 'behaviour', text: `${p} missed the rate`, evidence: [{ kind: 'event', event_id: 'e00001' }] },
    { id: `${p}-o2`, participant: p, task_id: null, type: 'expectation', text: `${p} wanted fees up front`, evidence: [{ kind: 'quote', utterance_ids: ['u0001'], quote: 'fees up front' }] },
  ]);
  const groups = [{ id: 'g1', label: 'People miss the rate', note_ids: ['P1-o1', 'P2-o1'] }, { id: 'g2', label: 'People want fees up front', note_ids: ['P1-o2', 'P2-o2'] }];
  fs.mkdirSync(path.join(d, 'affinity'), { recursive: true });
  fs.writeFileSync(path.join(d, 'affinity', 'board.json'), JSON.stringify({ study: 'ins-merge', n_included: 2, status: 'done', notes, groups, themes: [], unsorted: [], history: [] }));
  const a = { id: 'ins-a', kind: 'pain_point', severity: 'major', title: 'Rate is missed', statement: 'Both missed the rate.', group_ids: ['g1'], context_relation: { type: 'new' } };
  const b = { id: 'ins-b', kind: 'pain_point', severity: 'minor', title: 'Fees are hidden', statement: 'Both wanted fees.', group_ids: ['g2'], context_relation: { type: 'new' } };
  assert.equal((await call('insights_submit', { slug: 'ins-merge', model: 'claude-opus-5-5', insights: [a, b] })).saved, 2);
  await call('review_record', { slug: 'ins-merge', insight_id: 'ins-a', decision: 'accepted', reviewer: 'Test Researcher' });
  await call('review_record', { slug: 'ins-merge', insight_id: 'ins-b', decision: 'accepted', reviewer: 'Test Researcher' });

  // The model fixes only B and resubmits it on its own.
  const r = await call('insights_submit', { slug: 'ins-merge', model: 'claude-opus-5-5', insights: [{ ...b, statement: 'Both wanted to see fees first.' }] });
  const saved = JSON.parse(fs.readFileSync(path.join(d, 'insights.json'), 'utf8'));
  assert.deepEqual(saved.insights.map((i) => i.id).sort(), ['ins-a', 'ins-b'], 'A is kept');
  const rv = JSON.parse(fs.readFileSync(path.join(d, 'review.json'), 'utf8')).decisions;
  assert.equal(rv['ins-a']?.decision, 'accepted', 'decision on unchanged A is kept');
  assert.equal(rv['ins-b'], undefined, 'changed B needs reviewing again');
  assert.deepEqual(r.review_reset, ['ins-b']);

  // A batch where everything is rejected changes nothing.
  await assert.rejects(call('insights_submit', { slug: 'ins-merge', model: 'claude-opus-5-5', insights: [{ ...a, group_ids: ['g9'] }] }), /nothing was saved/i);
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'insights.json'), 'utf8')).insights.length, 2);

  // replace: true starts over on purpose, keeping a backup.
  await call('insights_submit', { slug: 'ins-merge', model: 'claude-opus-5-5', insights: [b], replace: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d, 'insights.json'), 'utf8')).insights.map((i) => i.id), ['ins-b']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'review.json'), 'utf8')).decisions['ins-a'], undefined, 'decision on a removed insight goes');
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'insights.json.bak'), 'utf8')).insights.length, 2, 'backup before replace');

  // Kept insights are re-checked against the board: one whose notes are gone is dropped.
  await call('insights_submit', { slug: 'ins-merge', model: 'claude-opus-5-5', insights: [a] });
  const boardF = path.join(d, 'affinity', 'board.json');
  const board = JSON.parse(fs.readFileSync(boardF, 'utf8'));
  board.notes = board.notes.filter((n) => !n.id.endsWith('-o2'));
  board.groups[1].note_ids = [];
  fs.writeFileSync(boardF, JSON.stringify(board));
  const r2 = await call('insights_submit', { slug: 'ins-merge', model: 'claude-opus-5-5', insights: [a] });
  assert.deepEqual(r2.dropped.map((x) => x.id), ['ins-b']);

  // After a participant is erased the insights file is stale and is never merged into.
  const f = path.join(d, 'insights.json');
  fs.writeFileSync(f, JSON.stringify({ ...JSON.parse(fs.readFileSync(f, 'utf8')), stale: 'participant P9 erased', insights: [{ ...a, id: 'ins-old', note_ids: ['P1-o1'] }] }));
  await call('insights_submit', { slug: 'ins-merge', model: 'claude-opus-5-5', insights: [a] });
  const after2 = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.deepEqual(after2.insights.map((i) => i.id), ['ins-a']);
  assert.equal(after2.stale, undefined);
});

test('studio: a second start cannot truncate a running recording, and stop with nothing open fails loudly', async () => {
  await call('study_create', { slug: 'studio-edge', name: 'Studio edge cases', mode: 'moderated' });
  await call('consent_record', { slug: 'studio-edge', participant: 'P1', method: 'written', consent_version: '1.0', recorded_by: 'Test Researcher' });
  await call('consent_record', { slug: 'studio-edge', participant: 'P2', method: 'written', consent_version: '1.0', recorded_by: 'Test Researcher' });
  const { url } = await call('studio_open', { slug: 'studio-edge', participant: 'P1' });
  const u = new URL(url);
  const key = new URLSearchParams(u.hash.slice(1)).get('k');
  const api = (p, pth, body, raw) => fetch(`${u.origin}/api/studio/studio-edge/${p}${pth}`, { method: body ? 'POST' : 'GET', headers: { 'x-proofloop-key': key, ...(raw ? {} : { 'content-type': 'application/json' }) }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const dir = path.join(research, 'studio-edge', 'sessions', 'P1');

  assert.equal((await api('P1', '/start', { started_at: Date.now(), tracks: ['bogus'] })).status, 400);
  assert.ok(!fs.existsSync(path.join(dir, 'session.json')), 'nothing written for a bad start');

  const t0 = Date.now() - 5000;
  assert.equal((await api('P1', '/start', { started_at: t0, tracks: ['screen', 'mic'] })).status, 200);
  assert.equal((await api('P1', '/chunk?track=screen&seq=0', true, Buffer.from('first piece'))).status, 200);
  assert.equal((await api('P1', '/marker', { t_ms: 100, kind: 'note', text: 'kept' })).status, 200);
  const info = await (await api('P1', '')).json();
  assert.equal(info.recording, true, 'a reloaded page learns a recording is running');
  assert.equal(info.started_at_ms, t0);
  const again = await api('P1', '/start', { started_at: Date.now(), tracks: ['screen', 'mic'] });
  assert.equal(again.status, 409);
  assert.match((await again.json()).error, /already running/);
  assert.equal(fs.readFileSync(path.join(dir, 'media', 'screen.webm'), 'utf8'), 'first piece', 'recording not truncated');
  assert.match(fs.readFileSync(path.join(dir, 'markers.json'), 'utf8'), /kept/, 'notes not wiped');

  const stopNothing = await api('P2', '/stop', { duration_ms: 1000 });
  assert.equal(stopNothing.status, 409);
  assert.ok(!fs.existsSync(path.join(research, 'studio-edge', 'sessions', 'P2', 'recording.json')), 'no empty recording.json');

  assert.equal((await api('P2', '/start', { started_at: Date.now(), tracks: ['mic', 'mic'] })).status, 400, 'duplicate tracks refused');

  // Stop after a reload has no duration from the page: the server's start time is used.
  const stop = await (await api('P1', '/stop', {})).json();
  assert.ok(stop.ok);
  assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'recording.json'), 'utf8')).duration_ms >= 5000);

  // Pieces left by a recording cut off by a plugin restart are kept, not overwritten.
  const d2 = path.join(research, 'studio-edge', 'sessions', 'P2');
  fs.mkdirSync(path.join(d2, 'media'), { recursive: true });
  fs.writeFileSync(path.join(d2, 'media', 'screen.webm'), 'earlier pieces');
  assert.equal((await api('P2', '/start', { started_at: Date.now(), tracks: ['screen'] })).status, 200);
  const partial = fs.readdirSync(path.join(d2, 'media')).find((x) => /^screen\.partial-.*\.webm$/.test(x));
  assert.ok(partial, 'earlier pieces moved aside');
  assert.equal(fs.readFileSync(path.join(d2, 'media', partial), 'utf8'), 'earlier pieces');
  assert.equal((await api('P2', '/stop', {})).status, 200);
});

test('relay import: one malformed participant does not block the others', async () => {
  await call('study_create', { slug: 'relay-bad', name: 'Relay bad upload', mode: 'unmoderated' });
  const lr = await call('runner_links', { slug: 'relay-bad', participants: ['P1', 'P2'], base_url: 'https://research.example.com/' });
  const links = fs.readFileSync(lr.links_file, 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  const token = (p) => new URL(links.find((l) => l[0] === p)[2]).searchParams.get('t');
  const up = async (p, name, text) => {
    const buf = Buffer.from(text);
    const r = await fetch(`${RELAY}/upload-url`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: token(p), name, size: buf.length }) });
    assert.equal(r.status, 200, await r.clone().text());
    assert.equal((await fetch((await r.json()).url, { method: 'PUT', body: buf })).status, 200);
  };
  await up('P1', 'events-0001.json', '{"events": [');
  await up('P1', 'meta.json', JSON.stringify({ consent: { agreed: true, version: '1.0', at: new Date().toISOString() } }));
  await up('P1', 'done.json', '{}');
  await up('P2', 'events-0001.json', JSON.stringify({ session_start: Date.now(), events: [{ id: 'e00001', t_ms: 0, type: 'session_start' }] }));
  await up('P2', 'meta.json', JSON.stringify({ consent: { agreed: true, version: '1.0', at: new Date().toISOString() } }));
  await up('P2', 'done.json', '{}');

  const imp = await call('relay_import', { slug: 'relay-bad' });
  assert.deepEqual(imp.imported.map((x) => x.participant), ['P2']);
  assert.match(imp.warnings.join('\n'), /P1: .*could not be imported/);
  const left = await (await fetch(`${RELAY}/list?study=relay-bad`, { headers: { authorization: `Bearer ${secrets.admin_token}` } })).json();
  assert.deepEqual([...new Set(left.objects.map((o) => o.key.split('/')[1]))], ['P1'], 'P1 stays on the relay to retry');
  assert.ok(!fs.existsSync(path.join(research, 'relay-bad', 'sessions', 'P1', '.incoming')));
  assert.ok(!fs.existsSync(path.join(research, 'relay-bad', 'consent', 'P1.json')), 'a failed import writes no consent record');
  assert.ok(!fs.existsSync(path.join(research, 'relay-bad', 'sessions', 'P1', 'session.json')), 'and no partial session');
  assert.ok(fs.existsSync(path.join(research, 'relay-bad', 'consent', 'P2.json')));
});

test('robustness: CSV blank times and odd ids, quoted study names, errors that say what to do', async () => {
  const name = 'Q3: savings #2 $& "plan"';
  await call('study_create', { slug: 'csv-odd', name, mode: 'unmoderated' });
  assert.equal((await call('study_validate', { slug: 'csv-odd' })).valid, true, 'name with : # $& and quotes stays valid YAML');
  assert.match(fs.readFileSync(path.join(research, 'csv-odd', 'study.yaml'), 'utf8'), /name: "Q3: savings #2 \$& \\"plan\\""/);

  const csv = path.join(tmp, 'odd.csv');
  fs.writeFileSync(csv, ['Tester,Task 1 result,Task 1 time', '__proto__,Success,30', 'bob,Success,', 'carol,Success,abc'].join('\n') + '\n');
  const r = await call('results_import', { slug: 'csv-odd', csv_path: csv, participant_column: 'Tester', tasks: [{ task_id: 't1', outcome_column: 'Task 1 result', time_column: 'Task 1 time' }], consent_confirmed: true, consent_version: 'tool terms v1' });
  assert.deepEqual(r.imported.map((x) => x.participant), ['P1', 'P2', 'P3'], '__proto__ is just an id');
  const end = (p) => JSON.parse(fs.readFileSync(path.join(research, 'csv-odd', 'sessions', p, 'events.json'), 'utf8')).events.find((e) => e.type === 'task_end');
  assert.equal(end('P2').no_time, true, 'a blank time is no time, not 0 s');
  assert.equal(end('P1').t_ms - 0, 30000);
  assert.match(r.warnings.join('\n'), /P3.*not a number of seconds/);
  assert.ok(!/P2.*not a number/.test(r.warnings.join('\n')), 'a blank cell is not a warning');

  await assert.rejects(call('observations_submit', { slug: 'csv-odd', participant: 'P1', model: 'claude-opus-5-5', observations: [] }), /session_prepare/);
  fs.mkdirSync(path.join(research, 'csv-odd', 'affinity'), { recursive: true });
  fs.writeFileSync(path.join(research, 'csv-odd', 'affinity', 'board.json'), '{"notes": [');
  await assert.rejects(call('board_summary', { slug: 'csv-odd' }), /board\.json is damaged/);
});

test('privacy: free-text survey answers are redacted before analysis', async () => {
  await call('study_create', { slug: 'answers-redact', name: 'Answers redaction', mode: 'moderated' });
  await call('consent_record', { slug: 'answers-redact', participant: 'P1', method: 'written', consent_version: '1.0', recorded_by: 'Test Researcher', name: 'Priya Sharma' });
  const dir = path.join(research, 'answers-redact', 'sessions', 'P1');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'transcript.json'), JSON.stringify({ source: 'test', utterances: [{ id: 'u0001', speaker: 'P', role: 'participant', start_ms: 0, end_ms: 1000, text: 'Fine.' }] }));
  fs.writeFileSync(path.join(dir, 'answers.json'), JSON.stringify({ answers: { t1_seq: 5, q_open: 'I am Priya Sharma, email priya@example.com, call 0412 345 678', nested: { more: ['at 12 Smith St, Fitzroy VIC 3065'] } } }));
  const prep = await call('session_prepare', { slug: 'answers-redact', participant: 'P1' });
  const input = fs.readFileSync(path.join(research, 'answers-redact', prep.file), 'utf8');
  for (const leak of ['Priya', 'Sharma', 'priya@example.com', '0412 345 678', 'Smith St']) assert.ok(!input.includes(leak), `${leak} redacted`);
  const answers = JSON.parse(input).participant_data.answers;
  assert.equal(answers.t1_seq, 5, 'numbers untouched');
  assert.match(answers.q_open, /\[NAME\] \[NAME\], email \[EMAIL\], call \[PHONE\]/);
  assert.equal(prep.redactions['[EMAIL]'], 1);
});

test('privacy: setup upgrades an existing .gitignore and git ignores every participant file', async () => {
  const gi = path.join(research, '.gitignore');
  fs.writeFileSync(gi, '# my own rule\nscratch/\n*/sessions/*/media/\n');
  const check = await call('setup_check', {});
  assert.match(check.gitignore, /missing/i);
  await call('setup_init', { path: research, location: 'laptop', confirm_managed_device: true, user_name: 'Test Researcher' });
  const text = fs.readFileSync(gi, 'utf8');
  assert.match(text, /^scratch\/$/m, 'user lines kept');
  assert.equal(text.match(/^\*\/sessions\/\*\/media\/$/gm).length, 1, 'no duplicate lines');
  assert.match((await call('setup_check', {})).gitignore, /protects/);
  spawnSync('git', ['init', '-q'], { cwd: project });
  const files = ['answers-redact/sessions/P1/analysis-input.json', 'answers-redact/sessions/P1/events.json', 'answers-redact/sessions/P1/runner-events.json', 'answers-redact/sessions/P1/frames.json', 'answers-redact/sessions/P1/markers.json', 'answers-redact/sessions/P1/transcript.redacted.json', 'answers-redact/.relay-seen.json', 'answers-redact/consent/external-ids.json'];
  for (const f of files) assert.equal(spawnSync('git', ['check-ignore', '-q', path.join('research', f)], { cwd: project }).status, 0, `${f} ignored`);
  assert.equal(spawnSync('git', ['check-ignore', '-q', 'research/answers-redact/study.yaml'], { cwd: project }).status, 1, 'study.yaml can be committed');

  // Upgrade warnings: files git already tracks, and analysis inputs from older redaction.
  const old = path.join(research, 'answers-redact', 'sessions', 'P7');
  fs.mkdirSync(old, { recursive: true });
  fs.writeFileSync(path.join(old, 'analysis-input.json'), JSON.stringify({ participant_data: {} }));
  spawnSync('git', ['add', '-f', path.join('research', 'answers-redact', 'sessions', 'P7', 'analysis-input.json')], { cwd: project });
  const after = await call('setup_check', {});
  assert.match(after.stale_analysis_input, /answers-redact\/P7/);
  assert.ok(!/P1/.test(after.stale_analysis_input), 'freshly prepared P1 is not stale');
  assert.match(after.tracked_research_files, /1 research file.*git rm -r --cached/);
  fs.rmSync(old, { recursive: true, force: true });
  spawnSync('git', ['rm', '-q', '-r', '--cached', '.'], { cwd: project });
});

test('privacy: exports leave out moderator notes, and retention uses import time, not folder dates', async () => {
  // studio-edge P1 has markers.json with the moderator's free-text notes.
  const r = await call('study_export', { slug: 'studio-edge' });
  const out = path.join(tmp, 'unpacked-edge');
  fs.mkdirSync(out);
  assert.equal(spawnSync('tar', ['-xzf', r.file, '-C', out]).status, 0);
  const m = JSON.parse(fs.readFileSync(path.join(out, 'studio-edge', 'manifest.json'), 'utf8'));
  assert.ok(!m.files.some((f) => /markers(\.partial-[^/]*)?\.json$/.test(f.path)), 'no moderator notes in the export');
  const erase = await call('cleanup', { slug: 'studio-edge', participant: 'P2' });
  assert.ok(erase.delete.some((f) => f.includes(path.basename(r.file))), 'erasing a participant also removes export packages that hold their data');

  // A call-tool transcript imported long ago is due for cleanup even if the folder was touched today.
  await call('consent_record', { slug: 'answers-redact', participant: 'P2', method: 'written', consent_version: '1.0', recorded_by: 'Test Researcher' });
  const vtt = path.join(tmp, 'call.vtt');
  fs.writeFileSync(vtt, 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n<v P2>It was fine\n');
  await call('session_import', { slug: 'answers-redact', participant: 'P2', transcript_path: vtt });
  const p2 = path.join(research, 'answers-redact', 'sessions', 'P2');
  assert.ok(!fs.existsSync(path.join(p2, 'recording.json')), 'a transcript-only import has no recording');
  const sesF = path.join(p2, 'session.json');
  const ses = JSON.parse(fs.readFileSync(sesF, 'utf8'));
  assert.ok(ses.imported_at, 'import time recorded');
  fs.writeFileSync(sesF, JSON.stringify({ ...ses, imported_at: new Date(Date.now() - 200 * 86400000).toISOString() }));
  const dry = await call('cleanup', { slug: 'answers-redact' });
  assert.ok(dry.delete.some((f) => f.endsWith('P2/transcript.json')), 'old import selected for cleanup');
  assert.ok(!dry.delete.some((f) => f.includes('/P1/')), 'P1 has no import time and is new');
  // Transcribing a transcript-only session refuses rather than overwriting the imported transcript.
  await assert.rejects(call('session_transcribe', { slug: 'answers-redact', participant: 'P2' }), /no recording to transcribe/);
  assert.match(fs.readFileSync(path.join(p2, 'transcript.json'), 'utf8'), /It was fine/);
});
