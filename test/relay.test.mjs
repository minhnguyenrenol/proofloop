import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { signRequest } from '../relay/sigv4.mjs';
import { createRelay, loadSecrets, fetchSecret, parseRetentionDays } from '../relay/handler.mjs';
import { folderStore } from '../relay/stores.mjs';
import { sweepOld } from '../relay/local.mjs';

const SECRET = 's'.repeat(32);
const ADMIN = 'a'.repeat(32);

test('SigV4 header signing matches the AWS test-suite vector get-vanilla', () => {
  const h = signRequest({
    method: 'GET', host: 'example.amazonaws.com', path: '/', region: 'us-east-1', service: 'service',
    accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    now: new Date('2015-08-30T12:36:00Z'),
  });
  assert.equal(h['x-amz-date'], '20150830T123600Z');
  assert.equal(h.authorization, 'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
  assert.equal(h['x-amz-security-token'], undefined);
});

test('SigV4 header signing adds and signs the session token', () => {
  const base = { method: 'POST', host: 'secretsmanager.eu-west-2.amazonaws.com', path: '/', region: 'eu-west-2', service: 'secretsmanager', body: '{}', accessKeyId: 'AKID', secretAccessKey: 'SECRET', now: new Date('2026-01-01T00:00:00Z') };
  const h = signRequest({ ...base, sessionToken: 'TOKEN', headers: { 'X-Amz-Target': 'secretsmanager.GetSecretValue' } });
  assert.equal(h['x-amz-security-token'], 'TOKEN');
  assert.match(h.authorization, /SignedHeaders=host;x-amz-date;x-amz-security-token;x-amz-target,/);
  const h2 = signRequest({ ...base, sessionToken: 'OTHER', headers: { 'X-Amz-Target': 'secretsmanager.GetSecretValue' } });
  assert.notEqual(h.authorization, h2.authorization);
});

test('loadSecrets falls back to RELAY_SECRET / ADMIN_TOKEN env vars without calling AWS', async () => {
  let called = false;
  const s = await loadSecrets({ env: { RELAY_SECRET: SECRET, ADMIN_TOKEN: ADMIN, SECRET_ARN: 'arn:x' }, fetchImpl: () => { called = true; } });
  assert.deepEqual(s, { secret: SECRET, adminToken: ADMIN });
  assert.equal(called, false);
});

test('fetchSecret calls Secrets Manager GetSecretValue with a signed request', async () => {
  const arn = 'arn:aws:secretsmanager:eu-west-2:123456789012:secret:relay-AbCdEf';
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ SecretString: JSON.stringify({ relay_secret: SECRET, admin_token: ADMIN }) }) }; };
  const env = { SECRET_ARN: arn, AWS_REGION: 'eu-west-2', AWS_ACCESS_KEY_ID: 'AKID', AWS_SECRET_ACCESS_KEY: 'SK', AWS_SESSION_TOKEN: 'ST' };
  const s = await loadSecrets({ env, fetchImpl });
  assert.deepEqual(s, { secret: SECRET, adminToken: ADMIN });
  assert.equal(seen.url, 'https://secretsmanager.eu-west-2.amazonaws.com/');
  assert.equal(seen.init.method, 'POST');
  assert.deepEqual(JSON.parse(seen.init.body), { SecretId: arn });
  assert.equal(seen.init.headers['content-type'], 'application/x-amz-json-1.1');
  assert.equal(seen.init.headers['x-amz-target'], 'secretsmanager.GetSecretValue');
  assert.equal(seen.init.headers['x-amz-security-token'], 'ST');
  assert.match(seen.init.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKID\/\d{8}\/eu-west-2\/secretsmanager\/aws4_request, /);
  // Errors never include the response body.
  await assert.rejects(fetchSecret({ arn, env, fetchImpl: async () => ({ ok: false, status: 403, text: async () => 'leak' }) }), (e) => /403/.test(e.message) && !/leak/.test(e.message));
});

test('createRelay /list reports retention_days', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-'));
  try {
    const store = folderStore({ dir, baseUrl: 'http://127.0.0.1:1' });
    const auth = { authorization: `Bearer ${ADMIN}` };
    const def = createRelay({ store, secret: SECRET, adminToken: ADMIN });
    const r1 = await def({ method: 'GET', path: '/list', query: { study: 's1' }, headers: auth });
    assert.equal(r1.status, 200);
    assert.deepEqual(JSON.parse(r1.body), { objects: [], retention_days: 1 });
    const week = createRelay({ store, secret: SECRET, adminToken: ADMIN, retentionDays: 7 });
    assert.equal(JSON.parse((await week({ method: 'GET', path: '/list', query: { study: 's1' }, headers: auth })).body).retention_days, 7);
    assert.throws(() => createRelay({ store, secret: SECRET, adminToken: ADMIN, retentionDays: 8 }), /1 to 7/);
    assert.throws(() => parseRetentionDays('0'), /1 to 7/);
    assert.throws(() => parseRetentionDays('1.5'), /1 to 7/);
    assert.equal(parseRetentionDays('3'), 3);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('local relay sweep honours retention days', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-'));
  try {
    const now = Date.now();
    const day = 86400000;
    const mk = (name, ageDays) => { const f = path.join(dir, 's1', 'P1', name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'x'); const t = new Date(now - ageDays * day); fs.utimesSync(f, t, t); return f; };
    const fresh = mk('meta.json', 0.5);
    const twoDays = mk('events-0001.json', 2);
    const sixDays = mk('answers.json', 6);
    const eightDays = mk('done.json', 8);
    // 7-day retention: only the 8-day-old file goes.
    assert.deepEqual(sweepOld(dir, 7, now).map((p) => path.basename(p)), ['done.json']);
    assert.ok(fs.existsSync(sixDays) && fs.existsSync(twoDays) && fs.existsSync(fresh));
    assert.ok(!fs.existsSync(eightDays));
    // Default 1-day retention: everything older than a day goes.
    sweepOld(dir, 1, now);
    assert.ok(fs.existsSync(fresh));
    assert.ok(!fs.existsSync(twoDays) && !fs.existsSync(sixDays));
    assert.throws(() => sweepOld(dir, 30, now), /1 to 7/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
