// Storage back ends for the relay: S3 (production) and a local folder
// (internal pilots and tests). Both hand out short-lived URLs so media
// bytes never pass through the relay function itself.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { presign } from './sigv4.mjs';

export function s3Store({ bucket, region, credentials = process.env }) {
  if (!bucket || !region) throw new Error('BUCKET and AWS_REGION are required');
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const sign = (method, key, query = {}, expires = 600, signHeaders = {}) => presign({
    method, host, path: `/${key}`, query, region, signHeaders,
    accessKeyId: credentials.AWS_ACCESS_KEY_ID,
    secretAccessKey: credentials.AWS_SECRET_ACCESS_KEY,
    sessionToken: credentials.AWS_SESSION_TOKEN,
    expires,
  });
  return {
    // Content-Length is signed, so S3 rejects an upload of any other size.
    putUrl: async (key, { size } = {}) => sign('PUT', key, {}, 600, size ? { 'content-length': size } : {}),
    getUrl: async (key) => sign('GET', key),
    // Only a 404 means "not there"; any other failure is an error, not a yes or no.
    async exists(key) { const r = await fetch(sign('HEAD', key, {}, 60), { method: 'HEAD' }); if (r.ok) return true; if (r.status === 404) return false; throw new Error(`storage check failed: ${r.status}`); },
    async remove(key) { const r = await fetch(sign('DELETE', key, {}, 60), { method: 'DELETE' }); if (!r.ok && r.status !== 404) throw new Error(`delete failed ${r.status}`); },
    async list(prefix) {
      const out = [];
      let token;
      do {
        const q = { 'list-type': '2', prefix, ...(token ? { 'continuation-token': token } : {}) };
        const r = await fetch(sign('GET', '', q, 60));
        if (!r.ok) throw new Error(`list failed ${r.status}`);
        const xml = await r.text();
        for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          out.push({ key: m[1].match(/<Key>(.*?)<\/Key>/)[1], size: Number(m[1].match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0), modified: m[1].match(/<LastModified>(.*?)<\/LastModified>/)?.[1] });
        }
        token = xml.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/)?.[1];
      } while (token);
      return out;
    },
  };
}

// Local folder store. URLs point back at the local relay server, carry a
// one-time random ticket, and expire after 10 minutes.
export function folderStore({ dir, baseUrl }) {
  fs.mkdirSync(dir, { recursive: true });
  const tickets = new Map();
  const ticket = (method, key, size) => {
    const id = crypto.randomBytes(16).toString('hex');
    tickets.set(id, { method, key, size, exp: Date.now() + 600000 });
    return `${baseUrl}/blob/${id}`;
  };
  const base = path.resolve(dir);
  const file = (key) => {
    const f = path.join(base, key);
    if (!f.startsWith(base + path.sep)) throw new Error('bad key');
    return f;
  };
  return {
    putUrl: async (key, { size } = {}) => ticket('PUT', key, size),
    getUrl: async (key) => ticket('GET', key),
    exists: async (key) => fs.existsSync(file(key)),
    remove: async (key) => fs.rmSync(file(key), { force: true }),
    async list(prefix) {
      const base = path.join(dir, prefix);
      if (!fs.existsSync(base)) return [];
      const out = [];
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p);
          else if (!e.name.endsWith('.part')) out.push({ key: path.relative(dir, p).split(path.sep).join('/'), size: fs.statSync(p).size, modified: fs.statSync(p).mtime.toISOString() });
        }
      };
      walk(base);
      return out;
    },
    // Used by the local server for /blob/<ticket> requests.
    redeem(id, method) {
      const t = tickets.get(id);
      if (!t || t.exp < Date.now() || t.method !== method) return null;
      tickets.delete(id);
      return { file: file(t.key), size: t.size };
    },
  };
}
