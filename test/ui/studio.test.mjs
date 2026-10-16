// Browser test for the moderator Studio. Screen and mic capture are
// replaced with generated media (a canvas and a tone), so it runs the same
// on any machine without OS screen-recording or microphone permission.
// Run with: npm run test:ui
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER = path.resolve(process.env.PROOFLOOP_SERVER ?? 'src/server.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'proofloop-studio-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'project');
fs.mkdirSync(home, { recursive: true });
fs.mkdirSync(project, { recursive: true });
let client; let browser;

async function call(name, args) {
  const r = await client.callTool({ name, arguments: args });
  if (r.isError) throw new Error(`${name}: ${r.content[0].text}`);
  return JSON.parse(r.content[0].text);
}

// Runs in the page before studio.js: fake capture devices, and keep the recorders reachable.
function fakeMedia() {
  const tone = () => { const ac = new AudioContext(); const o = ac.createOscillator(); const d = ac.createMediaStreamDestination(); o.connect(d); o.start(); return d.stream; };
  navigator.mediaDevices.getDisplayMedia = async () => {
    const c = document.createElement('canvas');
    c.width = 320; c.height = 180;
    const g = c.getContext('2d');
    let i = 0;
    setInterval(() => { g.fillStyle = i++ % 2 ? '#336' : '#663'; g.fillRect(0, 0, 320, 180); }, 100);
    return new MediaStream([...c.captureStream(15).getVideoTracks(), ...tone().getAudioTracks()]);
  };
  navigator.mediaDevices.getUserMedia = async () => tone();
  const Real = window.MediaRecorder;
  window.__recs = [];
  window.MediaRecorder = class extends Real { constructor(...a) { super(...a); window.__recs.push(this); } };
}

before(async () => {
  client = new Client({ name: 'studio-ui', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], cwd: project, env: { ...process.env, HOME: home } }));
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
  await call('setup_init', { path: path.join(project, 'research'), location: 'laptop', confirm_managed_device: true, user_name: 'UI Test' });
  await call('study_create', { slug: 'studio-ui', name: 'Studio check', mode: 'moderated' });
});
after(async () => { await browser?.close(); await client?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function openStudio(p) {
  await call('consent_record', { slug: 'studio-ui', participant: p, method: 'written', consent_version: '1.0', recorded_by: 'UI Test' });
  const { url } = await call('studio_open', { slug: 'studio-ui', participant: p });
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(fakeMedia);
  await page.goto(url);
  await page.click('#pick');
  await page.click('#mic');
  await page.waitForFunction(() => !document.getElementById('start').disabled);
  await page.click('#start');
  await page.waitForTimeout(6000); // at least one 5-second piece per track
  return { page, errors };
}

test('Stop still saves when the shared call window closed first', async () => {
  const { page, errors } = await openStudio('P1');
  // Sharing ends: the screen recorder stops on its own before Stop is pressed.
  await page.evaluate(() => new Promise((res) => { const r = window.__recs[0]; r.addEventListener('stop', res, { once: true }); r.stop(); }));
  await page.click('#stop');
  await page.getByText(/^Saved to the study folder/).waitFor({ timeout: 15000 });
  const dir = path.join(project, 'research', 'studio-ui', 'sessions', 'P1');
  const rec = JSON.parse(fs.readFileSync(path.join(dir, 'recording.json'), 'utf8'));
  assert.deepEqual(Object.keys(rec.files).sort(), ['mic', 'screen']);
  assert.ok(rec.files.screen.bytes > 0);
  assert.deepEqual(errors, []);
  await page.context().close();
});

test('a reload mid-call keeps what was recorded and lets the moderator save it', async () => {
  const { page } = await openStudio('P2');
  page.on('dialog', (d) => d.accept());
  await page.reload();
  await page.getByText(/reloaded during the recording/).waitFor();
  assert.equal(await page.locator('#stop').isDisabled(), false);
  await page.click('#stop');
  await page.getByText(/^Saved to the study folder/).waitFor({ timeout: 15000 });
  const dir = path.join(project, 'research', 'studio-ui', 'sessions', 'P2');
  assert.ok(fs.statSync(path.join(dir, 'media', 'screen.webm')).size > 0, 'pieces from before the reload kept');
  await page.context().close();
});
