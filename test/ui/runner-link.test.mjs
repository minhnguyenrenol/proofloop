// Browser test: a participant whose link is refused by the relay (expired or
// not valid) is told so, instead of seeing "Connection problem" forever.
// Microphone and tab capture are replaced with generated media, so it runs
// on any machine. Run with: npm run test:ui
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startLocalRelay } from '../../relay/local.mjs';

const SERVER = path.resolve(process.env.PROOFLOOP_SERVER ?? 'src/server.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'proofloop-link-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'project');
fs.mkdirSync(home, { recursive: true });
fs.mkdirSync(project, { recursive: true });
const port = () => 20000 + Math.floor(Math.random() * 1000);
let client; let relay; let browser; const servers = [];

async function call(name, args) {
  const r = await client.callTool({ name, arguments: args });
  if (r.isError) throw new Error(`${name}: ${r.content[0].text}`);
  return JSON.parse(r.content[0].text);
}
function serve(dir, p) {
  const s = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/proto.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>Proto</title><button>See rates</button>'); }
    const f = path.join(dir, path.normalize(u.pathname === '/' ? '/index.html' : u.pathname));
    if (!f.startsWith(dir) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(f)] ?? 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  servers.push(s);
  return new Promise((r) => s.listen(p, '127.0.0.1', () => r(`http://127.0.0.1:${p}`)));
}
function fakeMedia() {
  const tone = () => { const ac = new AudioContext(); const o = ac.createOscillator(); const d = ac.createMediaStreamDestination(); o.connect(d); o.start(); return d.stream; };
  navigator.mediaDevices.getUserMedia = async () => tone();
  navigator.mediaDevices.getDisplayMedia = async () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 180;
    const g = c.getContext('2d'); let i = 0;
    setInterval(() => { g.fillStyle = i++ % 2 ? '#336' : '#663'; g.fillRect(0, 0, 320, 180); }, 100);
    return new MediaStream([...c.captureStream(15).getVideoTracks(), ...tone().getAudioTracks()]);
  };
}

let runnerBase;
// The participant page URL for a fresh link (token) for participant p.
async function linkFor(p) {
  const r = await call('runner_links', { slug: 'link-v1', participants: [p], base_url: 'http://127.0.0.1/' });
  const u = fs.readFileSync(r.links_file, 'utf8').trim().split('\n').slice(1).map((l) => l.split(',')).find((l) => l[0] === p)[2];
  return `${runnerBase}/index.html?t=${encodeURIComponent(new URL(u).searchParams.get('t'))}`;
}

before(async () => {
  client = new Client({ name: 'link-ui', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], cwd: project, env: { ...process.env, HOME: home } }));
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
  const relayPort = port();
  const relayUrl = `http://127.0.0.1:${relayPort}`;
  const setup = await call('setup_init', { path: path.join(project, 'research'), location: 'laptop', confirm_managed_device: true, relay_url: relayUrl, user_name: 'UI Test' });
  const secrets = JSON.parse(fs.readFileSync(setup.relay_secrets.stored_at, 'utf8'));
  relay = await startLocalRelay({ dir: path.join(tmp, 'relay-data'), port: relayPort, secret: secrets.relay_secret, adminToken: secrets.admin_token });
  await call('study_create', { slug: 'link-v1', name: 'Link check', mode: 'unmoderated' });
  const sdir = path.join(project, 'research', 'link-v1');
  const protoPort = port();
  const y = fs.readFileSync(path.join(sdir, 'study.yaml'), 'utf8')
    .replace(/figma: https:\/\/www\.figma\.com\/proto\/FILE_KEY\/Name.*/, `url: http://127.0.0.1:${protoPort}/proto.html`)
    .replace('Describe the goal in the participant\'s words, without naming buttons or menus.', 'Find out what interest you would earn.')
    .replace('Describe a realistic situation that gives the task a reason.', 'You have $5,000 to put away for a year.');
  fs.writeFileSync(path.join(sdir, 'study.yaml'), y);
  await call('runner_build', { slug: 'link-v1' });
  runnerBase = await serve(path.join(sdir, 'runner'), protoPort);
});
after(async () => { await browser?.close(); await client?.close(); await relay?.close(); for (const s of servers) s.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('a refused link tells the participant to contact the researcher', async () => {
  const good = new URL(await linkFor('P1')).searchParams.get('t');
  const forged = `${good.split('.')[0]}.${'A'.repeat(43)}`; // valid shape, wrong signature: the relay answers 401
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(fakeMedia);
  await page.goto(`${runnerBase}/index.html?t=${encodeURIComponent(forged)}`);
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('checkbox', { name: /agree to take part/ }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Turn on microphone' }).click();
  await page.getByText('On', { exact: true }).waitFor();
  const share = page.getByRole('button', { name: 'Share this tab' });
  if (await share.count()) await share.click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start task' }).click();
  await page.getByText(/link has expired or is no longer valid/).first().waitFor({ timeout: 30000 });
  assert.equal(await page.getByText(/Connection problem/).count(), 0, 'not shown as a connection problem');
  assert.deepEqual(errors, []);
  await page.context().close();
});

async function consentOn(page, url, { name, keep }) {
  await page.addInitScript(fakeMedia);
  await page.goto(url);
  await page.getByRole('button', { name: 'Get started' }).click();
  if (name) await page.getByRole('textbox', { name: 'Your name (optional)' }).fill(name);
  if (keep) await page.getByRole('checkbox', { name: /You may keep my name/ }).check();
  await page.getByRole('checkbox', { name: /agree to take part/ }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
}
const relayFile = async (p, name) => {
  const f = path.join(tmp, 'relay-data', 'link-v1', p, name);
  for (let i = 0; i < 50 && !fs.existsSync(f); i++) await new Promise((r) => setTimeout(r, 200));
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
};

test('the participant name is sent only when they allow it, and a link works on one device', async () => {
  const p2 = await linkFor('P2');
  const a = await (await browser.newContext()).newPage();
  await consentOn(a, p2, { name: 'Priya Sharma', keep: true });
  const meta = JSON.parse(await relayFile('P2', 'meta.json'));
  assert.equal(meta.consent.name, 'Priya Sharma');
  assert.equal(meta.consent.name_kept, true);
  assert.ok(fs.readdirSync(path.join(tmp, 'relay-data', 'link-v1', 'P2')).some((f) => /^claim-.+\.json$/.test(f)), 'the link is claimed');

  // Same link on a second device (a fresh browser profile).
  const b = await (await browser.newContext()).newPage();
  await consentOn(b, p2, {});
  await b.getByText(/already being used on another device/).first().waitFor({ timeout: 20000 });
  await b.context().close();
  await a.context().close();
  // The researcher lets the participant switch device.
  const rel = await call('runner_links', { slug: 'link-v1', participants: ['P2'], base_url: 'http://127.0.0.1/', release_device: true });
  assert.deepEqual(rel.released_from_device, ['P2']);
  assert.ok(!fs.readdirSync(path.join(tmp, 'relay-data', 'link-v1', 'P2')).some((f) => f.startsWith('claim-')));

  const c = await (await browser.newContext()).newPage();
  await consentOn(c, await linkFor('P3'), { name: 'Sam Lee', keep: false });
  const meta3 = await relayFile('P3', 'meta.json');
  assert.ok(meta3 && !meta3.includes('Sam Lee'), 'the name is not sent without permission');
  assert.equal(JSON.parse(meta3).consent.name_kept, false);
  await c.context().close();
});
