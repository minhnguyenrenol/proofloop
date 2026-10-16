// Minimal AWS Signature Version 4 query-string presigning for S3.
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
