// Minimal AWS Signature Version 4: query-string presigning for S3 and
// header signing for JSON APIs (Secrets Manager).
// No SDK, so the relay has zero dependencies and is easy to audit.

import crypto from 'node:crypto';

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data, 'utf8').digest();
const sha256hex = (data) => crypto.createHash('sha256').update(data, 'utf8').digest('hex');

// RFC 3986 encoding as S3 expects (keep unreserved characters; slash kept in paths).
export function uriEncode(str, keepSlash = false) {
  return encodeURIComponent(str)
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%2F/g, keepSlash ? '/' : '%2F');
}

export function amzDate(d = new Date()) {
  return d.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

// signHeaders: extra headers the request must send with exactly these
// values, e.g. { 'content-length': 1234 } so S3 refuses any other size.
export function presign({ method, host, path: objectPath, query = {}, region, accessKeyId, secretAccessKey, sessionToken, expires = 600, now = new Date(), signHeaders = {} }) {
  const hdrs = { host, ...Object.fromEntries(Object.entries(signHeaders).map(([k, v]) => [k.toLowerCase(), String(v).trim()])) };
  const names = Object.keys(hdrs).sort();
  const datetime = amzDate(now);
  const date = datetime.slice(0, 8);
  const scope = `${date}/${region}/s3/aws4_request`;
  const q = {
    ...query,
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${scope}`,
    'X-Amz-Date': datetime,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': names.join(';'),
  };
  if (sessionToken) q['X-Amz-Security-Token'] = sessionToken;
  const canonicalQuery = Object.keys(q)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(String(q[k]))}`)
    .join('&');
  const canonicalRequest = [method, uriEncode(objectPath, true), canonicalQuery, names.map((n) => `${n}:${hdrs[n]}\n`).join(''), names.join(';'), 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', datetime, scope, sha256hex(canonicalRequest)].join('\n');
  const kDate = hmac(`AWS4${secretAccessKey}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
  return `https://${host}${uriEncode(objectPath, true)}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

// Header signing (Authorization header) for AWS JSON APIs such as Secrets
// Manager. Returns the headers to send: the caller's headers plus host,
// x-amz-date, x-amz-security-token (when a session token is given) and
// authorization. Header names are lower-cased; all given headers are signed.
// Paths are expected to be already-normalised (e.g. "/"); each segment is
// URI-encoded once.
export function signRequest({ method = 'GET', host, path: reqPath = '/', query = {}, region, service, headers = {}, body = '', accessKeyId, secretAccessKey, sessionToken, now = new Date(), contentSha256 = false }) {
  if (!host || !region || !service) throw new Error('host, region and service are required');
  if (!accessKeyId || !secretAccessKey) throw new Error('AWS credentials are required');
  const datetime = amzDate(now);
  const date = datetime.slice(0, 8);
  const payloadHash = sha256hex(body ?? '');
  const hdrs = {};
  for (const [k, v] of Object.entries(headers)) hdrs[k.toLowerCase()] = String(v).trim().replace(/\s+/g, ' ');
  hdrs.host = host;
  hdrs['x-amz-date'] = datetime;
  if (sessionToken) hdrs['x-amz-security-token'] = sessionToken;
  if (contentSha256) hdrs['x-amz-content-sha256'] = payloadHash;
  delete hdrs.authorization;
  const names = Object.keys(hdrs).sort();
  const signedHeaders = names.join(';');
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(String(query[k]))}`)
    .join('&');
  const scope = `${date}/${region}/${service}/aws4_request`;
  const canonicalRequest = [method, uriEncode(reqPath, true), canonicalQuery, names.map((n) => `${n}:${hdrs[n]}\n`).join(''), signedHeaders, payloadHash].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', datetime, scope, sha256hex(canonicalRequest)].join('\n');
  const kDate = hmac(`AWS4${secretAccessKey}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
  return {
    ...hdrs,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
