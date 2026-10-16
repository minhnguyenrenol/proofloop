import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { containsInOrder, normalise } from '../src/lib/text.mjs';
import { parseVtt, parseSrt, parseText, parseDocx, parseTimestamp, assignRoles } from '../src/lib/transcript.mjs';
import { redactText } from '../src/lib/redact.mjs';
import { adjustedWald, susScore, confidence, meanCi90 } from '../src/lib/stats.mjs';
import { verifyObservations, verifyInsights } from '../src/lib/verify.mjs';
import { detectSignals } from '../src/lib/signals.mjs';

test('FR-PLG-005 quotes match verbatim after typographic normalisation only', () => {
  const src = 'I couldn’t find the fee — it was hidden under "More".';
  assert.ok(containsInOrder(src, "I couldn't find the fee"));
  assert.ok(containsInOrder(src, 'couldn’t find ... hidden under'));
  assert.ok(!containsInOrder(src, 'I could not find the fee'), 'paraphrase must fail');
  assert.ok(!containsInOrder(src, 'hidden ... couldn’t'), 'fragments must be in order');
  assert.ok(!containsInOrder(src, ''), 'empty quote fails');
  assert.equal(normalise('  A,  b!! '), 'a b');
});

test('timestamps parse in VTT, SRT and short forms', () => {
  assert.equal(parseTimestamp('00:01:02.345'), 62345);
  assert.equal(parseTimestamp('01:02,5'), 62500);
  assert.equal(parseTimestamp('1:00:00'), 3600000);
  assert.equal(parseTimestamp('nope'), null);
});

test('Zoom VTT: speaker prefixes, merges continuous turns, assigns ids', () => {
  const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:03.000
Alex Moderator: Can you find the interest rate?

2
00:00:04.000 --> 00:00:06.000
Sam Lee: Um, I'm looking at the top.

3
00:00:06.500 --> 00:00:08.000
Sam Lee: I don't see it anywhere.
`;
  const t = assignRoles(parseVtt(vtt), ['Alex Moderator']);
  assert.equal(t.utterances.length, 2);
  assert.equal(t.utterances[1].text, "Um, I'm looking at the top. I don't see it anywhere.");
  assert.equal(t.utterances[1].start_ms, 4000);
  assert.equal(t.utterances[1].end_ms, 8000);
  assert.equal(t.utterances[0].role, 'moderator');
  assert.equal(t.utterances[1].role, 'participant');
  assert.equal(t.utterances[0].id, 'u0001');
});

test('Teams VTT voice tags and SRT', () => {
  const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<v Jo Smith>Hello there</v>\n';
  assert.equal(parseVtt(vtt).utterances[0].speaker, 'Jo Smith');
  const srt = '1\n00:00:01,000 --> 00:00:02,000\nA: one\n\n2\n00:00:05,000 --> 00:00:06,000\nB: two\n';
  const s = parseSrt(srt);
  assert.deepEqual(s.utterances.map((u) => u.speaker), ['A', 'B']);
});

test('plain text and DOCX (Teams layout) transcripts', () => {
  const t = parseText('[00:00:05] Mod: Hi\n[00:00:09] Pat: I see a form\ncontinued line\n');
  assert.equal(t.utterances.length, 2);
  assert.equal(t.utterances[1].text, 'I see a form continued line');
  assert.equal(t.utterances[0].end_ms, 9000);
  const xml = '<w:document><w:body><w:p><w:r><w:t>Mod   0:05</w:t></w:r></w:p><w:p><w:r><w:t>Welcome</w:t></w:r></w:p><w:p><w:r><w:t>Pat   0:09</w:t></w:r></w:p><w:p><w:r><w:t>Thanks &amp; hi</w:t></w:r></w:p></w:body></w:document>';
  const docx = zipSync({ 'word/document.xml': strToU8(xml) });
  const d = parseDocx(Buffer.from(docx));
  assert.deepEqual(d.utterances.map((u) => [u.speaker, u.text, u.start_ms]), [['Mod', 'Welcome', 5000], ['Pat', 'Thanks & hi', 9000]]);
});

test('FR-PLG-012 redaction: Luhn cards, AU phones, emails, BSB, names', () => {
  const r = redactText('Card 4111 1111 1111 1111, not 1234 5678 9012 3456. Call 0412 345 678 or +61 2 9876 5432, mail sam.lee@example.com, BSB 062-000, account number 12345678. I am Sam Lee.', ['Sam Lee']);
  assert.match(r.text, /Card \[CARD\], not 1234 5678 9012 3456/);
  assert.match(r.text, /Call \[PHONE\] or \[PHONE\]/);
  assert.match(r.text, /mail \[EMAIL\]/);
  assert.match(r.text, /BSB \[BSB\]/);
  assert.match(r.text, /account number \[ACCOUNT\]/);
  assert.match(r.text, /I am \[NAME\] \[NAME\]\./);
  assert.equal(r.hits['[CARD]'], 1);
});

test('stats: adjusted Wald, SUS, mean CI and the H.5 confidence rule', () => {
  const w = adjustedWald(4, 5, 0.9);
  assert.equal(w.rate, 0.8);
  assert.ok(w.low > 0.4 && w.low < 0.5 && w.high > 0.95, `${w.low} ${w.high}`);
  assert.equal(adjustedWald(0, 5).low, 0);
  assert.throws(() => adjustedWald(6, 5));
  assert.equal(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1]), 100);
  assert.equal(susScore([3, 3, 3, 3, 3, 3, 3, 3, 3, 3]), 50);
  assert.throws(() => susScore([1, 2]));
  assert.equal(meanCi90([5, 6, 7]).mean, 6);
  assert.equal(confidence({ sessions: 1, nIncluded: 5, hasBehaviour: true, hasVerbal: true }), 'low');
  assert.equal(confidence({ sessions: 3, nIncluded: 8, hasBehaviour: true, hasVerbal: true }), 'high');
  assert.equal(confidence({ sessions: 3, nIncluded: 8, hasBehaviour: true, hasVerbal: true, stable: false }), 'medium');
  assert.equal(confidence({ sessions: 2, nIncluded: 10, hasBehaviour: false, hasVerbal: true }), 'low');
  assert.equal(confidence({ sessions: 4, nIncluded: 8, hasBehaviour: true, hasVerbal: true, counterSessions: 2 }), 'low');
});

const session = {
  transcript: { utterances: [
    { id: 'u0001', role: 'moderator', text: 'Where would you find the fee?' },
    { id: 'u0002', role: 'participant', text: "I'd expect the fee near the rate, but I can't see it." },
  ] },
  events: { events: [{ id: 'e00001', t_ms: 1000, type: 'click', handled: false }] },
  frames: { frames: [{ id: 'f01', t_ms: 1000 }] },
};

test('FR-PLG-005 observations: unknown ids, paraphrases and moderator quotes are rejected', () => {
  const { accepted, rejected } = verifyObservations({ observations: [
    { id: 'P1-o1', type: 'expectation', text: 'Expected the fee next to the rate', evidence: [{ kind: 'quote', utterance_ids: ['u0002'], quote: "I'd expect the fee near the rate" }] },
    { id: 'P1-o2', type: 'quote', text: 'Paraphrased', evidence: [{ kind: 'quote', utterance_ids: ['u0002'], quote: 'I would expect fees near rates' }] },
    { id: 'P1-o3', type: 'quote', text: 'Moderator words', evidence: [{ kind: 'quote', utterance_ids: ['u0001'], quote: 'Where would you find the fee' }] },
    { id: 'P1-o4', type: 'behaviour', text: 'Clicked a non-interactive area', evidence: [{ kind: 'event', event_id: 'e00001' }, { kind: 'frame', frame_id: 'f01' }] },
    { id: 'P1-o5', type: 'behaviour', text: 'Behaviour with only a quote', evidence: [{ kind: 'quote', utterance_ids: ['u0002'], quote: "can't see it" }] },
    { id: 'P1-o6', type: 'bug', text: 'Made up event', evidence: [{ kind: 'event', event_id: 'e99999' }] },
  ] }, session);
  assert.deepEqual(accepted.map((o) => o.id), ['P1-o1', 'P1-o4']);
  assert.deepEqual(rejected.map((r) => r.id), ['P1-o2', 'P1-o3', 'P1-o5', 'P1-o6']);
  assert.match(rejected[1].errors.join(), /moderator/);
});

test('insights: groups, notes, quotes and context relation are checked', () => {
  const board = { notes: [{ id: 'P1-o1', participant: 'P1', evidence: [{ kind: 'quote', quote: 'hidden fee' }] }], groups: [{ id: 'g1', label: 'People cannot find the fee', note_ids: ['P1-o1'] }] };
  const { accepted, rejected } = verifyInsights({ insights: [
    { id: 'ins-1', kind: 'pain_point', severity: 'major', title: 'Fee hidden', statement: 's', group_ids: ['g1'], quotes: ['hidden fee'], context_relation: { type: 'new' } },
    { id: 'ins-2', kind: 'opportunity', title: 'x', statement: 's', group_ids: ['g1'], context_relation: { type: 'confirms', ctx_ids: [] } },
    { id: 'ins-3', kind: 'pain_point', severity: 'major', title: 'x', statement: 's', group_ids: ['g9'], quotes: ['not there'], context_relation: { type: 'new' } },
  ] }, board);
  assert.deepEqual(accepted.map((i) => i.id), ['ins-1']);
  assert.deepEqual(accepted[0].note_ids, ['P1-o1']);
  assert.match(rejected[0].errors.join(), /How might we/);
  assert.match(rejected[0].errors.join(), /confirms needs ctx_ids/);
  assert.match(rejected[1].errors.join(), /unknown group g9/);
});

test('H.1 signals: misclick burst, rage click, backtrack, idle, give up', () => {
  const ev = { events: [
    { id: 'a', t_ms: 0, type: 'task_start', task_id: 't1' },
    { id: 'b', t_ms: 1000, type: 'click', handled: false, frame: 'F1', x: 10, y: 10, task_id: 't1' },
    { id: 'c', t_ms: 1200, type: 'click', handled: false, frame: 'F1', x: 12, y: 11, task_id: 't1' },
    { id: 'd', t_ms: 1400, type: 'click', handled: false, frame: 'F1', x: 11, y: 12, task_id: 't1' },
    { id: 'e', t_ms: 2000, type: 'navigate', frame: 'F1', task_id: 't1' },
    { id: 'f', t_ms: 3000, type: 'navigate', frame: 'F2', task_id: 't1' },
    { id: 'g', t_ms: 4000, type: 'navigate', frame: 'F1', task_id: 't1' },
    { id: 'h', t_ms: 5000, type: 'navigate', frame: 'F2', task_id: 't1' },
    { id: 'i', t_ms: 40000, type: 'task_end', task_id: 't1', outcome: 'gave_up' },
  ] };
  const types = detectSignals(ev, { speech: [] }).map((s) => s.type);
  for (const t of ['misclick_burst', 'rage_click', 'backtrack_loop', 'idle_on_task', 'give_up']) assert.ok(types.includes(t), `${t} in ${types}`);
  const quiet = detectSignals(ev, { speech: [{ start_ms: 5000, end_ms: 39000 }] }).map((s) => s.type);
  assert.ok(!quiet.includes('idle_on_task'), 'talking aloud is not idle');
});

test('SigV4 presign matches the AWS documented example, and can sign Content-Length', async () => {
  const { presign } = await import('../relay/sigv4.mjs');
  const base = { method: 'GET', host: 'examplebucket.s3.amazonaws.com', path: '/test.txt', region: 'us-east-1', accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', expires: 86400, now: new Date('2013-05-24T00:00:00Z') };
  assert.match(presign(base), /X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404$/);
  const put = presign({ ...base, method: 'PUT', signHeaders: { 'Content-Length': 1234 } });
  assert.match(put, /X-Amz-SignedHeaders=content-length%3Bhost/);
  assert.notEqual(put.split('X-Amz-Signature=')[1], presign({ ...base, method: 'PUT', signHeaders: { 'content-length': 1235 } }).split('X-Amz-Signature=')[1]);
});

test('research folder reached through a symlink and a path with spaces finds its relay secrets', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'proofloop space '));
  const real = path.join(base, 'My Work'); fs.mkdirSync(real);
  const link = path.join(base, 'link'); fs.symlinkSync(real, link);
  const home = path.join(base, 'home'); fs.mkdirSync(home);
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const client = new Client({ name: 't', version: '1' });
  // The server starts in the real folder; setup is called with the symlinked path.
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.resolve(process.env.PROOFLOOP_SERVER ?? 'src/server.mjs')], cwd: real, env: { ...process.env, HOME: home } }));
  try {
    const r = await client.callTool({ name: 'setup_init', arguments: { path: path.join(link, 'research'), location: 'laptop', confirm_managed_device: true, product_name: 'X', relay_url: 'http://127.0.0.1:9', runner_base_url: 'https://r.example.com/', user_name: 'T' } });
    assert.ok(!r.isError, r.content[0].text);
    await client.callTool({ name: 'study_create', arguments: { slug: 's1', name: 'Study one', mode: 'unmoderated' } });
    const b = await client.callTool({ name: 'runner_links', arguments: { slug: 's1', participants: ['P1'] } });
    assert.ok(!/No relay secrets/.test(b.content[0].text), b.content[0].text);
  } finally { await client.close(); fs.rmSync(base, { recursive: true, force: true }); }
});
