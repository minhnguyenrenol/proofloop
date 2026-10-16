// Short relay (FR-PLG-008). A waiting room, not storage: participants'
// browsers upload pieces here, the researcher's plugin pulls them into the
// laptop study folder and deletes them. The bucket's lifecycle rule
// removes anything left after 24 hours.
//
// Deploy as an AWS Lambda function URL (relay/template.yaml) or run
// locally with relay/local.mjs for internal pilots and tests.
//
// Environment:
//   RELAY_SECRET   HMAC key that signs participant links (shared with the plugin)
//   ADMIN_TOKEN    bearer token the plugin uses to list, fetch and delete
//   BUCKET, AWS_REGION                 S3 store (Lambda provides credentials)
//   ALLOWED_ORIGINS                    comma-separated runner origins for CORS

import crypto from 'node:crypto';

const NAME_RE = /^(chunk-screen-\d{6}\.webm|chunk-mic-\d{6}\.webm|events-\d{4}\.json|answers\.json|meta\.json|done\.json)$/;
const MAX_BYTES = 25 * 1024 * 1024; // per piece

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

export function createRelay({ store, secret, adminToken, allowedOrigins = [] }) {
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
      if (await store.exists(`${study}/${p}/done.json`)) return json(409, { error: 'session already finished' }, origin);
      const url = await store.putUrl(`${study}/${p}/${input.name}`, { size: input.size });
      return json(200, { url }, origin);
    }

    // --- researcher endpoints (bearer token) ---
    const auth = (headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (!safeEqual(auth, adminToken)) return json(401, { error: 'unauthorised' }, origin);
    const study = query.study;
    if (!/^[a-z0-9-]+$/.test(study ?? '')) return json(400, { error: 'study required' }, origin);
    if (method === 'GET' && path === '/list') return json(200, { objects: await store.list(`${study}/`) }, origin);
    const key = query.key ?? '';
    if (!key.startsWith(`${study}/`) || key.includes('..')) return json(400, { error: 'bad key' }, origin);
    if (method === 'GET' && path === '/object') return json(200, { url: await store.getUrl(key) }, origin);
    if (method === 'DELETE' && path === '/object') { await store.remove(key); return json(200, { deleted: key }, origin); }
    return json(404, { error: 'not found' }, origin);
  };
}

// AWS Lambda function URL adapter.
export async function handler(event) {
  const { s3Store } = await import('./stores.mjs');
  const relay = createRelay({
    store: s3Store({ bucket: process.env.BUCKET, region: process.env.AWS_REGION }),
    secret: process.env.RELAY_SECRET,
    adminToken: process.env.ADMIN_TOKEN,
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  });
  const res = await relay({
    method: event.requestContext?.http?.method ?? 'GET',
    path: event.rawPath ?? '/',
    query: event.queryStringParameters ?? {},
    headers: event.headers ?? {},
    body: event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64').toString('utf8') : event.body,
  });
  return { statusCode: res.status, headers: res.headers, body: res.body };
}
