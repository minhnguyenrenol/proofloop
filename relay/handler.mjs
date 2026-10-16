// Short relay (FR-PLG-008). A waiting room, not storage: participants'
// browsers upload pieces here, the researcher's plugin pulls them into the
// laptop study folder and deletes them. The bucket's lifecycle rule
// removes anything left after the retention period (24 hours by default,
// at most 7 days when research-setup asks for longer, FR-PLG-009).
//
// Deploy as an AWS Lambda function URL (relay/template.yaml) or run
// locally with relay/local.mjs for internal pilots and tests.
//
// Environment:
//   SECRET_ARN     Secrets Manager secret holding JSON
//                  {"relay_secret": ..., "admin_token": ...} (production)
//   RELAY_SECRET   HMAC key that signs participant links (local/dev fallback;
//   ADMIN_TOKEN    bearer token for list/fetch/delete    used when both are set)
//   RETENTION_DAYS 1-7, how long the bucket keeps objects (reported by /list)
//   BUCKET, AWS_REGION                 S3 store (Lambda provides credentials)
//   ALLOWED_ORIGINS                    comma-separated runner origins for CORS

import crypto from 'node:crypto';
import { signRequest } from './sigv4.mjs';

const NAME_RE = /^(chunk-screen-\d{6}\.webm|chunk-mic-\d{6}\.webm|events-\d{4}\.json|answers\.json|meta\.json|done\.json)$/;
const MAX_BYTES = 25 * 1024 * 1024; // per piece
const MAX_PIECES = 4000; // per track

export function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function signToken(payload, secret) {
  const body = b64url(JSON.stringify(payload));
  const mac = b64url(crypto.createHmac('sha256', secret).update(body).digest());
  return `${body}.${mac}`;
}

export function verifyToken(token, secret, now = Date.now()) {
  const [body, mac] = String(token ?? '').split('.');
  if (!body || !mac) return { error: 'malformed token' };
  const expect = b64url(crypto.createHmac('sha256', secret).update(body).digest());
  const a = Buffer.from(mac);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { error: 'bad signature' };
  let p;
  try { p = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch { return { error: 'malformed token' }; }
  if (!/^[a-z0-9-]+$/.test(p.study ?? '') || !/^P\d{1,3}$/.test(p.p ?? '')) return { error: 'bad claims' };
  if (!(p.exp > now)) return { error: 'link expired' };
  return { claims: p };
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function parseRetentionDays(v, fallback = 1) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 7) throw new Error('retention days must be a whole number from 1 to 7');
  return n;
}

export function createRelay({ store, secret, adminToken, allowedOrigins = [], retentionDays = 1 }) {
  const retention = parseRetentionDays(retentionDays);
  if (!secret || secret.length < 32) throw new Error('RELAY_SECRET must be at least 32 characters');
  if (!adminToken || adminToken.length < 32) throw new Error('ADMIN_TOKEN must be at least 32 characters');

  const cors = (origin) => (allowedOrigins.includes(origin) || allowedOrigins.includes('*')
    ? { 'access-control-allow-origin': origin || '*', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-allow-headers': 'content-type,authorization', vary: 'origin' }
    : {});
  const json = (status, body, origin) => ({ status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(origin) }, body: JSON.stringify(body) });

  return async function handle({ method, path, query = {}, headers = {}, body }) {
    const origin = headers.origin;
    if (method === 'OPTIONS') return { status: 204, headers: cors(origin), body: '' };
    let input = {};
    if (body) { try { input = JSON.parse(body); } catch { return json(400, { error: 'body must be JSON' }, origin); } }

    // --- participant endpoints (token in body) ---
    if (method === 'POST' && path === '/upload-url') {
      const t = verifyToken(input.token, secret);
      if (t.error) return json(401, { error: t.error }, origin);
      const { study, p } = t.claims;
      if (!NAME_RE.test(input.name ?? '')) return json(400, { error: 'name not allowed' }, origin);
      if (!(input.size > 0 && input.size <= MAX_BYTES)) return json(400, { error: 'size missing or too large' }, origin);
      // 4000 five-second pieces is over 5 hours per track; more is abuse, not a session.
      const seq = input.name.match(/^chunk-(?:screen|mic)-(\d{6})\.webm$/);
      if (seq && Number(seq[1]) >= MAX_PIECES) return json(400, { error: 'too many pieces' }, origin);
      if (await store.exists(`${study}/${p}/done.json`)) return json(409, { error: 'session already finished' }, origin);
      // A piece that arrived is never replaced, so a reused link can't overwrite a session.
      if (await store.exists(`${study}/${p}/${input.name}`)) return json(409, { error: 'already received' }, origin);
      const url = await store.putUrl(`${study}/${p}/${input.name}`, { size: input.size });
      return json(200, { url }, origin);
    }

    // --- researcher endpoints (bearer token) ---
    const auth = (headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (!safeEqual(auth, adminToken)) return json(401, { error: 'unauthorised' }, origin);
    const study = query.study;
    if (!/^[a-z0-9-]+$/.test(study ?? '')) return json(400, { error: 'study required' }, origin);
    if (method === 'GET' && path === '/list') return json(200, { objects: await store.list(`${study}/`), retention_days: retention }, origin);
    const key = query.key ?? '';
    if (!key.startsWith(`${study}/`) || key.includes('..')) return json(400, { error: 'bad key' }, origin);
    if (method === 'GET' && path === '/object') return json(200, { url: await store.getUrl(key) }, origin);
    if (method === 'DELETE' && path === '/object') { await store.remove(key); return json(200, { deleted: key }, origin); }
    return json(404, { error: 'not found' }, origin);
  };
}

// Fetch the relay secrets from Secrets Manager with a SigV4-signed call
// (no SDK). Credentials come from the Lambda execution role's environment.
export async function fetchSecret({ arn, env = process.env, fetchImpl = fetch, now = new Date() }) {
  const region = env.AWS_REGION;
  if (!arn || !region) throw new Error('SECRET_ARN and AWS_REGION are required');
  const host = `secretsmanager.${region}.amazonaws.com`;
  const body = JSON.stringify({ SecretId: arn });
  const headers = signRequest({
    method: 'POST', host, path: '/', region, service: 'secretsmanager', body, now,
    headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': 'secretsmanager.GetSecretValue' },
    accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY, sessionToken: env.AWS_SESSION_TOKEN,
  });
  delete headers.host; // fetch sets Host itself
  const r = await fetchImpl(`https://${host}/`, { method: 'POST', headers, body });
  // Never echo the response body: on success it is the secret itself.
  if (!r.ok) throw new Error(`GetSecretValue failed with status ${r.status}`);
  const out = await r.json();
  let v;
  try { v = JSON.parse(out.SecretString ?? ''); } catch { throw new Error('secret is not JSON'); }
  if (typeof v.relay_secret !== 'string' || typeof v.admin_token !== 'string') throw new Error('secret must hold relay_secret and admin_token');
  return { secret: v.relay_secret, adminToken: v.admin_token };
}

// Env vars win when both are set (local/dev); otherwise Secrets Manager.
export async function loadSecrets({ env = process.env, fetchImpl = fetch } = {}) {
  if (env.RELAY_SECRET && env.ADMIN_TOKEN) return { secret: env.RELAY_SECRET, adminToken: env.ADMIN_TOKEN };
  return fetchSecret({ arn: env.SECRET_ARN, env, fetchImpl });
}

// One relay per cold start. A failed load is not cached, so the next
// invocation retries instead of failing until the container is recycled.
let relayPromise;
export function resetRelayCache() { relayPromise = undefined; }

async function buildRelay(env) {
  const { s3Store } = await import('./stores.mjs');
  const { secret, adminToken } = await loadSecrets({ env });
  return createRelay({
    store: s3Store({ bucket: env.BUCKET, region: env.AWS_REGION }),
    secret,
    adminToken,
    retentionDays: parseRetentionDays(env.RETENTION_DAYS),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  });
}

// AWS Lambda function URL adapter.
export async function handler(event) {
  if (!relayPromise) relayPromise = buildRelay(process.env).catch((e) => { relayPromise = undefined; throw e; });
  const relay = await relayPromise;
  const res = await relay({
    method: event.requestContext?.http?.method ?? 'GET',
    path: event.rawPath ?? '/',
    query: event.queryStringParameters ?? {},
    headers: event.headers ?? {},
    body: event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64').toString('utf8') : event.body,
  });
  return { statusCode: res.status, headers: res.headers, body: res.body };
}
