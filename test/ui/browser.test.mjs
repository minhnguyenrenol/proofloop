// Browser tests: a real Chromium runs the participant page end to end
// (consent, device check with fake mic and tab capture, a task on a code
// prototype, SEQ, SUS, upload) and the affinity board's keyboard move.
// Run with: npm run test:ui   (uses the preinstalled Chromium)
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'proofloop-ui-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'project');
fs.mkdirSync(home, { recursive: true });
fs.mkdirSync(project, { recursive: true });
const port = () => 19000 + Math.floor(Math.random() * 1000);
const RELAY_PORT = port();
let client; let relay; let browser; const servers = [];
let linksForLater; let runnerForLater;

const readLinks = (r) => fs.readFileSync(r.links_file, 'utf8').trim().split('\n').slice(1).map((l) => { const [participant, expires, url] = l.split(','); return { participant, expires, url }; }).filter((l) => r.participants.includes(l.participant));
async function call(name, args) {
  const r = await client.callTool({ name, arguments: args });
  if (r.isError) throw new Error(`${name}: ${r.content[0].text}`);
  return JSON.parse(r.content[0].text);
}
function serve(dir, p, extra = {}) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const s = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (extra[u.pathname]) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(extra[u.pathname]); }
    const f = path.join(dir, path.normalize(u.pathname === '/' ? '/index.html' : u.pathname));
    if (!f.startsWith(dir) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  servers.push(s);
  return new Promise((r) => s.listen(p, '127.0.0.1', () => r(`http://127.0.0.1:${p}`)));
}

before(async () => {
  client = new Client({ name: 'ui', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], cwd: project, env: { ...process.env, HOME: home } }));
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--auto-accept-this-tab-capture', '--autoplay-policy=no-user-gesture-required'] });
});
after(async () => { await browser?.close(); await client?.close(); await relay?.close(); for (const s of servers) s.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('participant completes an unmoderated test in a real browser and the session lands in the folder', async () => {
  const relayUrl = `http://127.0.0.1:${RELAY_PORT}`;
  const protoPort = port();
  const protoOrigin = `http://127.0.0.1:${protoPort}`;
  const setup = await call('setup_init', { path: path.join(project, 'research'), location: 'laptop', confirm_managed_device: true, product_name: 'Savings', relay_url: relayUrl, user_name: 'UI Test' });
  const secrets = JSON.parse(fs.readFileSync(setup.relay_secrets.stored_at, 'utf8'));
  relay = await startLocalRelay({ dir: path.join(tmp, 'relay-data'), port: RELAY_PORT, secret: secrets.relay_secret, adminToken: secrets.admin_token });
  await call('study_create', { slug: 'ui-v1', name: 'Savings UI check', mode: 'unmoderated' });
  const sdir = path.join(project, 'research', 'ui-v1');
  let y = fs.readFileSync(path.join(sdir, 'study.yaml'), 'utf8');
  y = y.replace(/figma: https:\/\/www\.figma\.com\/proto\/FILE_KEY\/Name.*/, `url: ${protoOrigin}/proto.html`)
    .replace('Describe the goal in the participant\'s words, without naming buttons or menus.', 'Find out what interest you would earn.')
    .replace('Describe a realistic situation that gives the task a reason.', 'You have $5,000 to put away for a year.');
  fs.writeFileSync(path.join(sdir, 'study.yaml'), y);
  await call('runner_build', { slug: 'ui-v1' });
  const links = readLinks(await call('runner_links', { slug: 'ui-v1', participants: ['P1'], base_url: 'http://127.0.0.1/' }));
  const t = new URL(links[0].url).searchParams.get('t');
  const runnerBase = await serve(path.join(sdir, 'runner'), port());
  await serve(tmp, protoPort, { '/proto.html': `<!doctype html><title>Proto</title><p>Everyday saver</p><button id="rate">See rates</button><p id="out"></p><script src="${runnerBase}/proofloop-recorder.js" data-parent="${runnerBase}"></script><script>document.getElementById("rate").onclick=()=>{document.getElementById("out").textContent="4.5% p.a.";}</script>` });

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${runnerBase}/index.html?t=${encodeURIComponent(t)}`);
  await page.getByRole('button', { name: 'Get started' }).click();
  // Consent: Continue stays disabled until the box is ticked.
  assert.equal(await page.getByRole('button', { name: 'Continue' }).isDisabled(), true);
  await page.getByRole('checkbox', { name: /agree to take part/ }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  // Device check with Chromium's fake microphone and tab capture.
  await page.getByRole('button', { name: 'Turn on microphone' }).click();
  await page.getByText('On', { exact: true }).waitFor();
  const share = page.getByRole('button', { name: 'Share this tab' });
  const shared = (await share.count()) > 0;
  if (shared) { await share.click(); await page.getByText('Sharing this tab').waitFor(); }
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Before the tasks' }).waitFor();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start task' }).click();
  await page.frameLocator('iframe#proto').getByRole('button', { name: 'See rates' }).click();
  await page.frameLocator('iframe#proto').getByText('4.5% p.a.').waitFor();
  await page.getByRole('button', { name: "I've finished this task" }).click();
  // SEQ is required: submitting without it shows a message.
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('One question still needs an answer.').waitFor();
  assert.equal(await page.getByRole('group', { name: /how difficult or easy/ }).getAttribute('aria-invalid'), 'true');
  await page.getByRole('group', { name: /how difficult or easy/ }).getByRole('radio', { name: '6' }).check();
  await page.getByRole('textbox').first().fill('The rate was easy to find.');
  await page.getByRole('button', { name: 'Continue' }).click();
  const groups = page.getByRole('group');
  await groups.first().waitFor();
  assert.equal(await groups.count(), 10, 'ten SUS statements');
  for (let i = 0; i < 10; i++) await groups.nth(i).getByRole('radio', { name: i % 2 === 0 ? '4' : '2' }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('All done', { exact: false }).waitFor({ timeout: 30000 });
  await page.screenshot({ path: path.join(tmp, 'runner-done.png') });
  await ctx.close();
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);

  const imp = await call('relay_import', { slug: 'ui-v1' });
  assert.deepEqual(imp.imported.map((x) => x.participant), ['P1']);
  assert.equal(imp.imported[0].complete, true);
  const ev = JSON.parse(fs.readFileSync(path.join(sdir, 'sessions', 'P1', 'events.json'), 'utf8')).events.map((e) => e.type);
  for (const k of ['session_start', 'task_start', 'click', 'task_end', 'session_end']) assert.ok(ev.includes(k), `${k} in ${ev}`);
  const ans = JSON.parse(fs.readFileSync(path.join(sdir, 'sessions', 'P1', 'answers.json'), 'utf8'));
  assert.equal(ans.answers.t1_seq, 6);
  assert.equal(ans.answers.sus.length, 10);
  assert.ok(fs.existsSync(path.join(sdir, 'sessions', 'P1', 'media', 'mic.webm')), 'mic recording arrived');
  if (shared) assert.ok(fs.existsSync(path.join(sdir, 'sessions', 'P1', 'media', 'screen.webm')), 'tab recording arrived');
  linksForLater = readLinks(await call('runner_links', { slug: 'ui-v1', participants: ['P2'], base_url: 'http://127.0.0.1/' }));
  runnerForLater = runnerBase;
  assert.ok(fs.existsSync(path.join(sdir, 'consent', 'P1.json')));
});

test('a reload mid-test sends what was recorded and marks the session interrupted', async () => {
  const sdir = path.join(project, 'research', 'ui-v1');
  const t = new URL(linksForLater[0].url).searchParams.get('t');
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${runnerForLater}/index.html?t=${encodeURIComponent(t)}`);
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('checkbox', { name: /agree to take part/ }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Turn on microphone' }).click();
  await page.getByText('On', { exact: true }).waitFor();
  const share = page.getByRole('button', { name: 'Share this tab' });
  if (await share.count()) { await share.click(); await page.getByText('Sharing this tab').waitFor(); }
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start task' }).click();
  await page.waitForTimeout(6000);
  page.on('dialog', (d) => d.accept());
  await page.reload();
  await page.getByRole('heading', { name: 'Your session was interrupted' }).waitFor();
  await page.getByText(/^Sent\. You can close this page/).waitFor({ timeout: 30000 });
  const imp = await call('relay_import', { slug: 'ui-v1' });
  const p2 = imp.imported.find((x) => x.participant === 'P2');
  assert.equal(p2.interrupted, true);
  assert.match(imp.warnings.join(' '), /reloaded mid-test/);
  const ev = JSON.parse(fs.readFileSync(path.join(sdir, 'sessions', 'P2', 'events.json'), 'utf8')).events;
  assert.ok(ev.some((e) => e.type === 'task_start') && ev.some((e) => e.type === 'session_interrupted'), 'events from before and after the reload are kept');
  assert.equal(new Set(ev.map((e) => e.id)).size, ev.length, 'event ids stay unique across the reload');
  await page.context().close();
});

test('board: a note can be moved with the keyboard and the board marked done', async () => {
  const sdir = path.join(project, 'research', 'ui-v1');
  // Synthetic notes, as observations_submit would save them.
  for (const p of ['P1', 'P2']) {
    fs.mkdirSync(path.join(sdir, 'sessions', p), { recursive: true });
    fs.writeFileSync(path.join(sdir, 'sessions', p, 'observations.json'), JSON.stringify({ participant: p, observations: [
      { id: `${p}-o1`, participant: p, type: 'expectation', text: `${p} expected the rate on the first screen`, evidence: [{ kind: 'quote', utterance_ids: ['u0001'], quote: 'first screen' }] },
      { id: `${p}-o2`, participant: p, type: 'behaviour', text: `${p} clicked the summary card`, evidence: [{ kind: 'event', event_id: 'e00001' }] },
    ] }));
  }
  await call('board_create', { slug: 'ui-v1', groups: [
    { id: 'g1', label: 'People expect the rate on the first screen', note_ids: ['P1-o1', 'P2-o1', 'P2-o2'] },
    { id: 'g2', label: 'People click the summary card to find details', note_ids: ['P1-o2'] },
  ] });
  const { url } = await call('board_open', { slug: 'ui-v1' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  const note = page.locator('li', { hasText: 'P2 clicked the summary card' });
  await note.waitFor();
  await note.focus();
  await page.keyboard.press('m');
  const dlg = page.getByRole('dialog', { name: 'Move note to…' });
  await dlg.waitFor();
  await dlg.getByRole('combobox', { name: 'Destination group' }).selectOption({ label: 'People click the summary card to find details' });
  await dlg.getByRole('button', { name: 'Move' }).click();
  await page.getByText('Moved to "People click the summary card to find details".').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.fk), 'note:P2-o2', 'focus stays on the moved note');
  // Esc in the move dialog must not move anything.
  await page.keyboard.press('m');
  await dlg.waitFor();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Mark board done' }).click();
  await page.getByText(/Board marked done/).waitFor();
  const board = JSON.parse(fs.readFileSync(path.join(sdir, 'affinity', 'board.json'), 'utf8'));
  assert.deepEqual(board.groups.find((g) => g.id === 'g2').note_ids.sort(), ['P1-o2', 'P2-o2']);
  assert.equal(board.status, 'done');
  assert.deepEqual(errors, []);
  await page.close();
});
