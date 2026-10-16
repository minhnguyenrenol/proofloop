import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { containsInOrder } from '../src/lib/text.mjs';
import { parseVtt, parseText, parseDocx, assignRoles } from '../src/lib/transcript.mjs';
import { redactText } from '../src/lib/redact.mjs';
import { verifyObservations, verifyInsights } from '../src/lib/verify.mjs';

test('speakers: non-ASCII and bracketed names, not times or URLs', () => {
  const t = parseText('Mod: How was it?\nJosé Núñez: Honestly it was confusing\nJane Doe (she/her): Hello\nat 10:30 we met\nsee https://example.com: there\n');
  assert.deepEqual(t.utterances.map((u) => u.speaker), ['Mod', 'José Núñez', 'Jane Doe (she/her)']);
  assert.equal(t.utterances[1].text, 'Honestly it was confusing');
  assert.equal(t.utterances[2].text, 'Hello at 10:30 we met see https://example.com: there');
  const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nAlex: Hi\n\n00:00:03.000 --> 00:00:04.000\nZoë O’Brien: Hi back\n';
  assert.deepEqual(parseVtt(vtt).utterances.map((u) => u.speaker), ['Alex', 'Zoë O’Brien']);
  const xml = '<w:document><w:body><w:p><w:r><w:t>Mod   0:05</w:t></w:r></w:p><w:p><w:r><w:t>Welcome</w:t></w:r></w:p><w:p><w:r><w:t>José Núñez   0:09</w:t></w:r></w:p><w:p><w:r><w:t>Thanks</w:t></w:r></w:p></w:body></w:document>';
  const d = parseDocx(Buffer.from(zipSync({ 'word/document.xml': strToU8(xml) })));
  assert.deepEqual(d.utterances.map((u) => [u.speaker, u.text, u.start_ms]), [['Mod', 'Welcome', 5000], ['José Núñez', 'Thanks', 9000]]);
});

test('VTT cue with two voices becomes two utterances', () => {
  const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n<v Alex>Ready?</v> <v Sam>Yes, go.</v>\n';
  const u = parseVtt(vtt).utterances;
  assert.deepEqual(u.map((x) => [x.speaker, x.text]), [['Alex', 'Ready?'], ['Sam', 'Yes, go.']]);
  assert.equal(u[0].start_ms, 1000);
  assert.equal(u[1].end_ms, 3000);
  const multi = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n<v Alex>Ready?</v>\n<v Sam>Yes.</v>\n';
  assert.deepEqual(parseVtt(multi).utterances.map((x) => x.speaker), ['Alex', 'Sam']);
});

const tr = (...speakers) => ({ utterances: speakers.map((speaker, i) => ({ id: `u${i}`, speaker, text: 'x' })) });

test('assignRoles: loose moderator matching and role warnings', () => {
  for (const name of ['jane doe', 'Jane Doe (Host)', 'Jane D', 'Jane', 'JANE DOE (she/her)']) {
    const t = assignRoles(tr(name, 'Sam Lee'), ['Jane Doe']);
    assert.deepEqual(t.utterances.map((u) => u.role), ['moderator', 'participant'], name);
    assert.deepEqual(t.role_warnings, []);
  }
  assert.equal(assignRoles(tr('Jane Doe', 'Sam'), ['Jane D']).utterances[0].role, 'moderator');
  assert.equal(assignRoles(tr('Janet', 'Sam'), ['Jane']).utterances[0].role, 'unknown');
  const three = assignRoles(tr('Jane Doe', 'Sam Lee', 'Kim Wu'), ['Jane']);
  assert.deepEqual(three.utterances.map((u) => u.role), ['moderator', 'unknown', 'unknown']);
  assert.deepEqual(three.role_warnings, ['Sam Lee', 'Kim Wu']);
  const none = assignRoles(tr('A', 'B'));
  assert.deepEqual(none.role_warnings, ['A', 'B']);
});

test('verifyEvidence: only participant utterances are quote evidence', () => {
  const session = { transcript: { utterances: [
    { id: 'u1', role: 'moderator', text: 'What do you think?' },
    { id: 'u2', role: 'unknown', text: 'It looks fine to me' },
    { id: 'u3', role: 'participant', text: 'I like the colours' },
  ] } };
  const obs = (id, ids, quote) => ({ id, type: 'quote', text: 't', evidence: [{ kind: 'quote', utterance_ids: ids, quote }] });
  const { accepted, rejected } = verifyObservations({ observations: [
    obs('o1', ['u3'], 'like the colours'),
    obs('o2', ['u1'], 'What do you think'),
    obs('o3', ['u2'], 'looks fine'),
    obs('o4', ['u3', 'u1'], 'like the colours'),
  ] }, session);
  assert.deepEqual(accepted.map((o) => o.id), ['o1']);
  assert.match(rejected[0].errors.join(), /moderator/);
  assert.match(rejected[1].errors.join(), /role unknown/);
  assert.match(rejected[2].errors.join(), /moderator/);
});

test('verifyInsights rejects duplicate ids', () => {
  const board = { notes: [{ id: 'n1', evidence: [] }], groups: [{ id: 'g1', note_ids: ['n1'] }] };
  const ins = { id: 'ins-1', kind: 'pain_point', severity: 'minor', title: 't', statement: 's', group_ids: ['g1'], context_relation: { type: 'new' } };
  const { accepted, rejected } = verifyInsights({ insights: [ins, { ...ins }] }, board);
  assert.equal(accepted.length, 1);
  assert.match(rejected[0].errors.join(), /duplicate id ins-1/);
});

test('containsInOrder: word boundaries and negations in ellipsis gaps', () => {
  assert.ok(!containsInOrder('I really dislike the colours', 'like the colours'));
  assert.ok(containsInOrder('I really like the colours.', 'like the colours'));
  assert.ok(!containsInOrder('I would never use this', 'I would ... use this'));
  assert.ok(!containsInOrder("I would not really use this", 'I would ... use this'));
  assert.ok(!containsInOrder("I wouldn’t ever, um, use this", 'I ... use this'));
  assert.ok(containsInOrder('I would, honestly, use this', 'I would ... use this'));
  assert.ok(containsInOrder('No. I would definitely use this', 'I would ... use this'), 'negation before the first fragment is fine');
  assert.ok(containsInOrder('I never said that. I would use this', 'I would ... use this'));
  assert.ok(containsInOrder('I couldn’t find the fee — it was hidden under "More".', 'couldn’t find ... hidden under'));
});

test('redaction: AU phones', () => {
  const r = redactText('Ring (02) 9876 5432, 13 22 21, 1300 123 456 or 1800 765 432.');
  assert.equal(r.text, 'Ring [PHONE], [PHONE], [PHONE] or [PHONE].');
  assert.equal(r.hits['[PHONE]'], 4);
});

test('redaction: TFN, account, BSB, Medicare ordering', () => {
  assert.equal(redactText('my tax file number is 123 456 782').text, 'my tax file number is [TFN]');
  assert.equal(redactText('TFN is 123 456 782').text, 'TFN is [TFN]');
  assert.equal(redactText('account 123 456 789').text, 'account [ACCOUNT]');
  assert.equal(redactText('acct 1234 5678').text, 'acct [ACCOUNT]');
  assert.equal(redactText('a/c 12345678').text, 'a/c [ACCOUNT]');
  assert.equal(redactText('account number 12345678').text, 'account number [ACCOUNT]');
  assert.equal(redactText('BSB 062 000 and 062-000').text, 'BSB [BSB] and [BSB]');
  assert.equal(redactText('about 250 000 dollars').text, 'about 250 000 dollars');
  assert.equal(redactText('Medicare 2123 45670 1').text, 'Medicare [MEDICARE]');
  assert.equal(redactText('ref 2123 45679 1').text, 'ref 2123 45679 1', 'bad Medicare check digit');
});

test('redaction: Unicode names and common-word name parts', () => {
  assert.equal(redactText('Hi, José Núñez here', ['José Núñez']).text, 'Hi, [NAME] [NAME] here');
  assert.equal(redactText('JOSÉ said', ['José Núñez']).text, '[NAME] said');
  assert.equal(redactText('I will call Will tomorrow', ['Will Smith']).text, 'I will call [NAME] tomorrow');
  assert.equal(redactText('ask will smith', ['Will Smith']).text, 'ask [NAME] [NAME]');
  assert.equal(redactText('Smithson is not Smith', ['Will Smith']).text, 'Smithson is not [NAME]');
  assert.equal(redactText('I am Sam Lee.', ['Sam Lee']).text, 'I am [NAME] [NAME].');
  assert.equal(redactText('Hello Jane', ['Jane Doe (she/her)']).text, 'Hello [NAME]');
});
