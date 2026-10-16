#!/usr/bin/env node
// Run the relay on your own machine or an internal server, backed by a
// folder. For pilots and tests; production uses relay/template.yaml.
//   RELAY_SECRET=... ADMIN_TOKEN=... ALLOWED_ORIGINS=https://... node relay/local.mjs --dir ./relay-data --port 8787 [--retention-days 1]
//   --retention-days  1-7 (default 1): how long pieces may wait before the sweep deletes them

import http from 'node:http';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createRelay, parseRetentionDays } from './handler.mjs';
import { folderStore } from './stores.mjs';

// Same rule as the S3 lifecycle: delete files older than `days` days.
// Returns the removed paths.
export function sweepOld(dir, days = 1, now = Date.now()) {
  const limit = now - parseRetentionDays(days) * 86400000;
  const removed = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && fs.statSync(p).mtimeMs < limit) { fs.rmSync(p, { force: true }); removed.push(p); }
    }
  };
  walk(dir);
  return removed;
}

export function startLocalRelay({ dir, port = 0, secret, adminToken, allowedOrigins = ['*'], host = '127.0.0.1', retentionDays = 1 }) {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(port, host, () => {
      const baseUrl = `http://${host}:${server.address().port}`;
      const store = folderStore({ dir, baseUrl });
      const relay = createRelay({ store, secret, adminToken, allowedOrigins, retentionDays });
      server.on('request', async (req, res) => {
        const url = new URL(req.url, baseUrl);
        const okOrigin = allowedOrigins.includes('*') || allowedOrigins.includes(req.headers.origin);
        const cors = { 'access-control-allow-origin': okOrigin ? (req.headers.origin ?? 'null') : 'null', 'access-control-allow-methods': 'PUT,GET,OPTIONS', 'access-control-allow-headers': 'content-type' };
        const blob = url.pathname.match(/^\/blob\/([a-f0-9]{32})$/);
        if (blob) {
          if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
          const t = store.redeem(blob[1], req.method);
          if (!t) { res.writeHead(403, cors); return res.end('expired'); }
          const f = t.file;
          if (req.method === 'PUT') {
            // Same rule as the signed S3 URL: the body must be the declared size.
            if (t.size && Number(req.headers['content-length']) !== t.size) { res.writeHead(400, cors); return res.end('size does not match'); }
            fs.mkdirSync(f.slice(0, f.lastIndexOf('/')), { recursive: true });
            const out = fs.createWriteStream(f);
            req.pipe(out);
            out.on('finish', () => { res.writeHead(200, cors); res.end(); });
            return;
          }
          res.writeHead(200, { ...cors, 'content-type': 'application/octet-stream' });
          return fs.createReadStream(f).pipe(res);
        }
        let body = '';
        for await (const c of req) body += c;
        const r = await relay({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers: req.headers, body });
        res.writeHead(r.status, r.headers);
        res.end(r.body);
      });
      resolve({ server, url: baseUrl, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
  if (!process.env.ALLOWED_ORIGINS) { console.error('Set ALLOWED_ORIGINS to the origin that hosts the participant page, e.g. https://research.example.com'); process.exit(1); }
  if (!['127.0.0.1', 'localhost', '::1'].includes(arg('host', '127.0.0.1'))) console.warn('Warning: this relay speaks plain HTTP. Put it behind HTTPS before anyone outside this machine uses it.');
  let retentionDays;
  try { retentionDays = parseRetentionDays(arg('retention-days', '1')); } catch (e) { console.error(`--retention-days: ${e.message}`); process.exit(1); }
  const dir = arg('dir', './relay-data');
  const { url } = await startLocalRelay({
    dir,
    port: Number(arg('port', 8787)),
    host: arg('host', '127.0.0.1'),
    secret: process.env.RELAY_SECRET,
    adminToken: process.env.ADMIN_TOKEN,
    allowedOrigins: process.env.ALLOWED_ORIGINS.split(','),
    retentionDays,
  });
  console.log(`Proofloop relay listening on ${url} (pieces kept at most ${retentionDays} day${retentionDays === 1 ? '' : 's'})`);
  const sweep = () => { try { sweepOld(dir, retentionDays); } catch (e) { console.error(`sweep failed: ${e.message}`); } };
  sweep();
  setInterval(sweep, 3600000).unref();
}
