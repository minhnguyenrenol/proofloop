// End-to-end: drives the real MCP server over stdio through a full
// unmoderated study and a moderated Studio session, with a local relay
// and FFmpeg-generated media. Synthetic data only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startLocalRelay } from '../relay/local.mjs';

const SERVER = process.env.PROOFLOOP_SERVER ?? path.resolve('src/server.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'proofloop-e2e-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'project');
fs.mkdirSync(home, { recursive: true });
fs.mkdirSync(project, { recursive: true });
let client;
let relay;
const RELAY_PORT = 18000 + Math.floor(Math.random() * 1000);

const readLinks = (r) => fs.readFileSync(r.links_file, 'utf8').trim().split('\n').slice(1).map((l) => { const [participant, expires, url] = l.split(','); return { participant, expires, url }; }).filter((l) => r.participants.includes(l.participant));
async function call(name, args) {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content[0].text;
  if (r.isError) throw new Error(`${name}: ${text}`);
  return JSON.parse(text);
}

before(async () => {
  client = new Client({ name: 'e2e', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], cwd: project, env: { ...process.env, HOME: home } }));
});
after(async () => { await client?.close(); await relay?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
function makeVideo(file, seconds) {
  spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc=size=640x360:rate=10:duration=${seconds}`, '-c:v', 'libvpx', '-b:v', '200k', file]);
}

test('tools are registered', async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  for (const n of ['setup_init', 'study_create', 'study_validate', 'runner_build', 'runner_links', 'relay_import', 'studio_open', 'session_prepare', 'observations_submit', 'board_create', 'board_open', 'insights_submit', 'review_record', 'context_changes_submit', 'context_apply', 'report_render', 'cleanup']) assert.ok(names.includes(n), n);
});

test('full unmoderated study: runner → relay → laptop folder → affinity → report', { skip: !hasFfmpeg && 'ffmpeg missing' }, async () => {
  const relayUrl = `http://127.0.0.1:${RELAY_PORT}`;
  const setup = await call('setup_init', { path: path.join(project, 'research'), location: 'laptop', confirm_managed_device: true, product_name: 'Savings', relay_url: relayUrl, runner_base_url: 'https://research.example.com/savings/', user_name: 'Test Researcher' });
  assert.ok(fs.existsSync(path.join(project, 'research', '.gitignore')));
  const secrets = JSON.parse(fs.readFileSync(setup.relay_secrets.stored_at, 'utf8'));
  assert.ok(!setup.relay_secrets.stored_at.startsWith(project), 'secrets live outside the project');
  relay = await startLocalRelay({ dir: path.join(tmp, 'relay-data'), port: RELAY_PORT, secret: secrets.relay_secret, adminToken: secrets.admin_token });

  await call('study_create', { slug: 'savings-v1', name: 'Open a savings account', mode: 'unmoderated' });
  const sdir = path.join(project, 'research', 'savings-v1');
  let y = fs.readFileSync(path.join(sdir, 'study.yaml'), 'utf8');
  // Leading wording and a UI giveaway, to check the linter catches them.
  y = y.replace('Describe the goal in the participant\'s words, without naming buttons or menus.', 'Click the Rates button and find the interest rate.')
    .replace('What, if anything, was unclear?', 'How easy was that?');
  fs.writeFileSync(path.join(sdir, 'study.yaml'), y);
  const lint = await call('study_validate', { slug: 'savings-v1' });
  assert.equal(lint.valid, true);
  const msgs = lint.issues.map((i) => i.message).join('\n');
  assert.match(msgs, /names UI controls/);
  assert.match(msgs, /Leading wording/);

  y = y.replace('Click the Rates button and find the interest rate.', 'Find out what interest you would earn.').replace('How easy was that?', 'What, if anything, was unclear?')
    .replace('success:\n        selfReport: true', 'success:\n        reachNode: "2:20"');
  fs.writeFileSync(path.join(sdir, 'study.yaml'), y);
  const runner = await call('runner_build', { slug: 'savings-v1' });
  assert.ok(runner.files.includes('index.html'));
  const pub = fs.readFileSync(path.join(sdir, 'runner', 'study.js'), 'utf8');
  assert.ok(!pub.includes('researchQuestions') && !pub.includes(path.join(project, 'research')), 'no private fields published');
  const csp = fs.readFileSync(path.join(sdir, 'runner', 'index.html'), 'utf8');
  assert.match(csp, new RegExp(`connect-src 'self' ${relayUrl}`));
  const lr = await call('runner_links', { slug: 'savings-v1', participants: ['P1', 'P2'] });
  assert.ok(!JSON.stringify(lr).includes('?t='), 'links are not returned into the chat');
  assert.equal((fs.statSync(lr.links_file).mode & 0o777), 0o600);
  assert.ok(!lr.links_file.startsWith(project));
  const links = readLinks(lr);
  assert.equal(links.length, 2);

  // Simulate two participants' browsers uploading through the relay.
  const video = path.join(tmp, 'screen.webm');
  makeVideo(video, 12);
  const bytes = fs.readFileSync(video);
  for (const [i, link] of links.entries()) {
    const token = new URL(link.url).searchParams.get('t');
    const up = async (name, buf) => {
      const r = await fetch(`${relayUrl}/upload-url`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, name, size: buf.length }) });
      assert.equal(r.status, 200, await r.clone().text());
      const { url } = await r.json();
      const put = await fetch(url, { method: 'PUT', body: buf });
      assert.equal(put.status, 200);
    };
    const third = Math.ceil(bytes.length / 3);
    for (let k = 0; k < 3; k++) await up(`chunk-screen-${String(k).padStart(6, '0')}.webm`, bytes.subarray(k * third, (k + 1) * third));
    const t0 = Date.now() - 60000;
    const ev = [
      { id: 'e00001', t_ms: 0, type: 'session_start' },
      { id: 'e00002', t_ms: 1000, type: 'task_start', task_id: 't1' },
      { id: 'e00003', t_ms: 2000, type: 'click', task_id: 't1', frame: '2:10', handled: false, x: 5, y: 5 },
      { id: 'e00004', t_ms: 2500, type: 'click', task_id: 't1', frame: '2:10', handled: false, x: 6, y: 5 },
      { id: 'e00005', t_ms: 3000, type: 'click', task_id: 't1', frame: '2:10', handled: false, x: 5, y: 6 },
      { id: 'e00006', t_ms: 6000, type: 'navigate', task_id: 't1', frame: '2:20' },
      { id: 'e00007', t_ms: 9000, type: 'task_end', task_id: 't1', outcome: i === 0 ? 'completed' : 'gave_up' },
    ];
    await up('events-0001.json', Buffer.from(JSON.stringify({ session_start: t0, events: ev })));
    await up('meta.json', Buffer.from(JSON.stringify({ consent: { agreed: true, version: '1.0', at: new Date().toISOString() }, userAgent: 'test', session_start: t0 })));
    await up('answers.json', Buffer.from(JSON.stringify({ answers: { t1_seq: i === 0 ? 5 : 2, sus: [4, 2, 4, 2, 4, 2, 4, 2, 4, 2] } })));
    await up('done.json', Buffer.from('{}'));
    // A finished session rejects more uploads.
    const late = await fetch(`${relayUrl}/upload-url`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, name: 'answers.json', size: 2 }) });
    assert.equal(late.status, 409);
  }
  // Forged token is rejected.
  const forged = await fetch(`${relayUrl}/upload-url`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'eyJzdHVkeSI6InNhdmluZ3MtdjEiLCJwIjoiUDkiLCJleHAiOjk5OTk5OTk5OTk5OTl9.AAAA', name: 'answers.json', size: 2 }) });
  assert.equal(forged.status, 401);

  const imp = await call('relay_import', { slug: 'savings-v1' });
  assert.deepEqual(imp.imported.map((x) => x.participant), ['P1', 'P2']);
  assert.equal(imp.warnings.length, 0, JSON.stringify(imp.warnings));
  assert.ok(fs.existsSync(path.join(sdir, 'sessions', 'P1', 'media', 'screen.webm')));
  assert.ok(fs.existsSync(path.join(sdir, 'consent', 'P1.json')), 'runner consent becomes a consent record');
  const left = await (await fetch(`${relayUrl}/list?study=savings-v1`, { headers: { authorization: `Bearer ${secrets.admin_token}` } })).json();
  assert.equal(left.objects.length, 0, 'relay copy deleted after import');

  // A link reused after import can't replace the imported session.
  const t1 = new URL(links[0].url).searchParams.get('t');
  const again = await fetch(`${relayUrl}/upload-url`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: t1, name: 'answers.json', size: 2 }) });
  const { url: againUrl } = await again.json();
  assert.equal((await fetch(againUrl, { method: 'PUT', body: Buffer.from('{}!') })).status, 400, 'upload must match the declared size');
  const { url: againUrl2 } = await (await fetch(`${relayUrl}/upload-url`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: t1, name: 'answers.json', size: 2 }) })).json();
  await fetch(againUrl2, { method: 'PUT', body: Buffer.from('{}') });
  const sha = JSON.parse(fs.readFileSync(path.join(sdir, 'sessions', 'P1', 'recording.json'), 'utf8')).files.screen.sha256;
  const imp2 = await call('relay_import', { slug: 'savings-v1', include_incomplete: true });
  assert.equal(imp2.imported.length, 0);
  assert.match(imp2.warnings.join(' '), /arrived after this session was imported/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(sdir, 'sessions', 'P1', 'recording.json'), 'utf8')).files.screen.sha256, sha);
  assert.ok(!fs.existsSync(path.join(sdir, 'sessions', 'P1', '.incoming')));

  // Transcripts (as whisper.cpp would produce from the participant's mic).
  for (const p of ['P1', 'P2']) {
    fs.writeFileSync(path.join(sdir, 'sessions', p, 'transcript.json'), JSON.stringify({ source: 'test', utterances: [
      { id: 'u0001', speaker: 'participant', role: 'participant', start_ms: 1500, end_ms: 4000, text: 'Where is the interest rate? I keep clicking this and nothing happens. My email is sam@example.com.' },
      { id: 'u0002', speaker: 'participant', role: 'participant', start_ms: 6000, end_ms: 8500, text: p === 'P1' ? 'Oh there it is, but I expected it on the first screen.' : 'I give up, I really expected the rate up front.' },
    ] }));
    const prep = await call('session_prepare', { slug: 'savings-v1', participant: p });
    assert.ok(prep.signals >= 1, 'misclick burst detected');
    assert.ok(prep.frames >= 1, 'key frames extracted');
    assert.equal(prep.redactions['[EMAIL]'], 1);
    const input = JSON.parse(fs.readFileSync(path.join(sdir, prep.file), 'utf8'));
    assert.ok(!JSON.stringify(input).includes('sam@example.com'), 'model input is redacted');
    assert.ok(!('context' in input), 'product context withheld from analysis');
    const frame = input.participant_data.frames[0].id;
    const sub = await call('observations_submit', { slug: 'savings-v1', participant: p, model: 'claude-opus-5-5', observations: [
      { id: 'o1', type: 'behaviour', text: 'Clicked a non-interactive area three times while looking for the rate', task_id: 't1', evidence: [{ kind: 'event', event_id: 'e00003' }, { kind: 'frame', frame_id: frame }] },
      { id: 'o2', type: 'expectation', text: 'Expected the interest rate on the first screen', task_id: 't1', evidence: [{ kind: 'quote', utterance_ids: ['u0002'], quote: p === 'P1' ? 'I expected it on the first screen' : 'I really expected the rate up front' }] },
      { id: 'o3', type: 'quote', text: 'Invented quote', evidence: [{ kind: 'quote', utterance_ids: ['u0001'], quote: 'This bank is terrible' }] },
    ] });
    assert.equal(sub.saved, 2);
    assert.equal(sub.rejected.length, 1);
  }

  await assert.rejects(call('insights_submit', { slug: 'savings-v1', model: 'claude-opus-5-5', insights: [{ id: 'ins-x', kind: 'pain_point', severity: 'major', title: 'x', statement: 'x', group_ids: ['g1'], context_relation: { type: 'new' } }] }), /No such file|board/i);
  const board = await call('board_create', { slug: 'savings-v1',
    groups: [
      { id: 'g1', label: 'People click the summary expecting it to show the rate', note_ids: ['P1-o1', 'P2-o1'] },
      { id: 'g2', label: 'People expect to see the rate before anything else', note_ids: ['P1-o2', 'P2-o2'] },
    ],
    themes: [{ id: 't1', label: 'The rate is the first thing people look for', group_ids: ['g1', 'g2'] }] });
  assert.equal(board.notes, 4);
  assert.equal(board.groups[0].n_of_N, '2 of 2');
  await assert.rejects(call('board_create', { slug: 'savings-v1', groups: [{ id: 'g1', label: 'x y z', note_ids: [] }] }), /already exists/);

  // Researcher edits on the board page, through the local server API.
  const { url } = await call('board_open', { slug: 'savings-v1' });
  const u = new URL(url);
  const key = new URLSearchParams(u.hash.slice(1)).get('k');
  const op = (o) => fetch(`${u.origin}/api/board/savings-v1/op`, { method: 'POST', headers: { 'x-proofloop-key': key, 'content-type': 'application/json' }, body: JSON.stringify(o) });
  assert.equal((await fetch(`${u.origin}/api/board/savings-v1`)).status, 401, 'API needs the key');
  const rebind = await new Promise((resolve) => http.get({ host: '127.0.0.1', port: u.port, path: '/api/board/savings-v1', headers: { host: 'evil.example', 'x-proofloop-key': key } }, (res) => { res.resume(); resolve(res.statusCode); }));
  assert.equal(rebind, 421, 'DNS rebinding blocked');
  assert.equal((await op({ op: 'rename_group', group_id: 'g2', label: 'People look for the rate before reading anything else' })).status, 200);
  assert.equal((await op({ op: 'mark_done' })).status, 200);

  // Product context pack.
  fs.mkdirSync(path.join(sdir, 'context', 'sources'), { recursive: true });
  fs.writeFileSync(path.join(sdir, 'context', 'sources', 'personas.pdf'), 'pdf');
  fs.writeFileSync(path.join(sdir, 'context', 'context.md'), `# Product context: Savings

## Product vision {#ctx-vision}
- Opening a savings account takes under 5 minutes {#ctx-vision-1} [src: doc:personas.pdf#p1] [status: assumption]

## Problem statement {#ctx-problem}
- Customers abandon because the form is long {#ctx-problem-1} [src: entered:Minh:2026-10-16] [status: assumption]

## Target users and personas {#ctx-personas}
### First saver {#ctx-persona-1}
- Wants to compare rates quickly {#ctx-persona-1-goal-1} [src: doc:personas.pdf#p3] [status: assumption]

## User journeys {#ctx-journeys}
### Open an account {#ctx-journey-1}
#### Stage 1: Compare {#ctx-journey-1-stage-1}
- Reads product summary {#ctx-journey-1-stage-1-step-1} [src: doc:personas.pdf#p5] [status: assumption]

## Goals and success measures {#ctx-goals}
_Not provided._

## Assumptions and open questions {#ctx-assumptions}
_Not provided._

## Constraints {#ctx-constraints}
_Not provided._
`);
  const cv = await call('context_validate', { slug: 'savings-v1' });
  assert.equal(cv.ok, true, cv.errors.join('\n'));

  const ins = [
    { id: 'ins-rate-hidden', kind: 'pain_point', severity: 'major', title: 'The interest rate is hard to find', statement: 'Both participants looked for the rate first and clicked non-interactive areas.', group_ids: ['g1', 'g2'], quotes: ['I expected it on the first screen'], context_relation: { type: 'contradicts', ctx_ids: ['ctx-problem-1'], explanation: 'Abandonment here is about finding the rate, not form length.' } },
    { id: 'ins-rate-first', kind: 'opportunity', title: 'Lead with the rate', statement: 'People want the rate before anything else.', hmw: 'How might we show the rate before people have to look for it?', group_ids: ['g2'], context_relation: { type: 'extends', ctx_ids: ['ctx-persona-1-goal-1'] } },
  ];
  const r1 = await call('insights_submit', { slug: 'savings-v1', model: 'claude-opus-5-5', run: 1, insights: ins, open_questions: [{ question: 'Would a rate on the summary card change who applies?', why: 'Nobody reached the apply step, so we could not see it.', group_ids: ['g2'] }] });
  assert.equal(r1.saved, 2);
  const r2 = await call('insights_submit', { slug: 'savings-v1', model: 'claude-opus-5-5', run: 2, insights: [ins[0]] });
  assert.deepEqual(r2.stability, { stable: 1, unstable: 1 });

  await assert.rejects(call('report_render', { slug: 'savings-v1' }), /No accepted insights/);
  await call('review_record', { slug: 'savings-v1', insight_id: 'ins-rate-hidden', decision: 'accepted', reviewer: 'Test Researcher' });
  await call('review_record', { slug: 'savings-v1', insight_id: 'ins-rate-first', decision: 'edited', edited: { title: 'Show the rate up front' }, reviewer: 'Test Researcher' });

  await assert.rejects(call('context_changes_submit', { slug: 'savings-v1', changes: [{ id: 'chg-bad', action: 'modify', ctx_id: 'ctx-problem-1', after: 'x', insight_ids: ['ins-unknown'], rationale: 'r' }] }), /not an accepted insight/);
  await call('context_changes_submit', { slug: 'savings-v1', changes: [
    { id: 'chg-problem', action: 'modify', ctx_id: 'ctx-problem-1', status: 'validated', after: 'Customers struggle to find the interest rate before they start', insight_ids: ['ins-rate-hidden'], rationale: 'Contradicted by testing' },
    { id: 'chg-journey', action: 'add', parent: 'ctx-journey-1-stage-1', new_id: 'ctx-journey-1-stage-1-pain-1', after: 'Pain point: the rate is not visible on the summary', insight_ids: ['ins-rate-hidden'], rationale: 'New pain point' },
    { id: 'chg-goal', action: 'add', parent: 'ctx-goals', new_id: 'ctx-goals-1', after: 'People can find the rate within 10 seconds', insight_ids: ['ins-rate-first'], rationale: 'Measurable goal' },
  ] });
  await assert.rejects(call('context_apply', { slug: 'savings-v1' }), /Decide these changes first/);
  await call('context_change_decide', { slug: 'savings-v1', change_id: 'chg-problem', decision: 'accepted', reviewer: 'Test Researcher' });
  await call('context_change_decide', { slug: 'savings-v1', change_id: 'chg-journey', decision: 'accepted', reviewer: 'Test Researcher' });
  await call('context_change_decide', { slug: 'savings-v1', change_id: 'chg-goal', decision: 'rejected', reviewer: 'Test Researcher' });
  const v = await call('context_apply', { slug: 'savings-v1' });
  assert.equal(v.version, 'v1');
  assert.equal(v.valid, true, v.errors.join('\n'));
  const v1 = fs.readFileSync(path.join(sdir, v.file), 'utf8');
  assert.match(v1, /Customers struggle to find the interest rate before they start \{#ctx-problem-1\} \[src: entered:Minh:2026-10-16; study:savings-v1\] \[status: validated\] \[evidence: ins-rate-hidden\]/);
  assert.match(v1, /#### Stage 1: Compare \{#ctx-journey-1-stage-1\}\n- Reads product summary.*\n- Pain point: the rate is not visible/);
  assert.ok(!v1.includes('People can find the rate within 10 seconds'), 'rejected change not applied');
  assert.match(fs.readFileSync(path.join(sdir, 'context', 'context.md'), 'utf8'), /Customers abandon because the form is long/, 'original kept');

  const rep = await call('report_render', { slug: 'savings-v1' });
  assert.equal(rep.insights, 2);
  const md = fs.readFileSync(path.join(sdir, 'report.md'), 'utf8');
  assert.ok(md.indexOf('The interest rate is hard to find') < md.indexOf('Show the rate up front'), 'contradictions first');
  assert.match(md, /Seen in:\*\* 2 of 2 participants/);
  assert.match(md, /Confidence:\*\* medium/, 'unstable insight capped below high');
  assert.match(md, /\| Find out what interest you would earn\. \| 2 \| 50%/);
  assert.match(md, /SUS:\*\* 75\.0/);
  assert.match(md, /3\.5 \(1\.0–7\.0\) · small sample/, 'SEQ interval clamped to the 1–7 scale');
  assert.match(md, /No facial expression or emotion analysis/);
  assert.match(md, /## Summary\n\n- \*\*The interest rate is hard to find\*\* \(2 of 2 participants/);
  assert.match(md, /## Questions for further research\n\n- Would a rate on the summary card change who applies\?/);
  const html = fs.readFileSync(path.join(sdir, 'report.html'), 'utf8');
  assert.match(html, /<h3>Before<\/h3><p>Customers abandon because the form is long<\/p>/);
  assert.match(html, /id="ins-rate-hidden"/);

  const dry = await call('cleanup', { slug: 'savings-v1', participant: 'P2' });
  assert.equal(dry.dry_run, true);
  assert.ok(fs.existsSync(path.join(sdir, 'sessions', 'P2')));
  await call('cleanup', { slug: 'savings-v1', participant: 'P2', dry_run: false });
  assert.ok(!fs.existsSync(path.join(sdir, 'sessions', 'P2')) && !fs.existsSync(path.join(sdir, 'consent', 'P2.json')));
  const boardAfter = JSON.parse(fs.readFileSync(path.join(sdir, 'affinity', 'board.json'), 'utf8'));
  assert.ok(!boardAfter.notes.some((n) => n.participant === 'P2'), 'erasure removes derived board notes');
  assert.equal(boardAfter.status, 'draft');
  await assert.rejects(call('report_render', { slug: 'savings-v1' }), /not marked done|out of date/);
});

test('moderated Studio session records tracks into the folder, only with consent', { skip: !hasFfmpeg && 'ffmpeg missing' }, async () => {
  await call('study_create', { slug: 'loan-interviews', name: 'Home loan interviews', mode: 'moderated' });
  const { url, consent_on_file } = await call('studio_open', { slug: 'loan-interviews', participant: 'P1' });
  assert.equal(consent_on_file, false);
  const u = new URL(url);
  const key = new URLSearchParams(u.hash.slice(1)).get('k');
  const api = (p, body, raw) => fetch(`${u.origin}/api/studio/loan-interviews/P1${p}`, { method: body ? 'POST' : 'GET', headers: { 'x-proofloop-key': key, ...(raw ? {} : { 'content-type': 'application/json' }) }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  assert.equal((await api('/start', { started_at: Date.now(), tracks: ['screen', 'mic'] })).status, 403, 'no recording without consent');
  await call('consent_record', { slug: 'loan-interviews', participant: 'P1', method: 'verbal-recorded', consent_version: '1.0', recorded_by: 'Test Researcher', name: 'Jo Citizen' });
  const info = await (await api('')).json();
  assert.equal(info.consent, true);
  assert.equal(info.mediaDays, 90);
  assert.ok(info.sections.length >= 3, 'guide sections become markers');
  assert.equal((await api('/start', { started_at: Date.now(), tracks: ['screen', 'mic'] })).status, 200);
  const video = path.join(tmp, 'call.webm');
  makeVideo(video, 6);
  const buf = fs.readFileSync(video);
  const half = Math.ceil(buf.length / 2);
  assert.equal((await api('/chunk?track=screen&seq=1', true, buf.subarray(half))).status, 409, 'out-of-order piece refused');
  assert.equal((await api('/chunk?track=screen&seq=0', true, buf.subarray(0, half))).status, 200);
  assert.equal((await api('/chunk?track=screen&seq=1', true, buf.subarray(half))).status, 200);
  assert.equal((await api('/chunk?track=mic&seq=0', true, buf)).status, 200);
  assert.equal((await api('/marker', { t_ms: 1200, kind: 'issue', text: 'Missed the fee link' })).status, 200);
  const stop = await (await api('/stop', { duration_ms: 6000 })).json();
  assert.equal(stop.files.screen.remuxed, true);
  const dir = path.join(project, 'research', 'loan-interviews', 'sessions', 'P1');
  assert.ok(fs.statSync(path.join(dir, 'media', 'screen.webm')).size > 1000);
  assert.match(fs.readFileSync(path.join(dir, 'notes.md'), 'utf8'), /\[00:00:01\] \(issue\) Missed the fee link/);
  assert.equal((await api('/start', { started_at: Date.now(), tracks: ['screen'] })).status, 409, 'cannot overwrite a recording');
});
