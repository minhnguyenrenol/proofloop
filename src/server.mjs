#!/usr/bin/env node
// Proofloop Research Copilot: local MCP server (stdio).
// Deterministic tools only: files, checks, counts and local pages. The
// research thinking happens in the skills, in Claude Code or Cursor.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { findResearchRoot, loadConfig, saveConfig, studyDir, sessionDir, readJson, writeJson, writeText, listSessions, hasConsent, appendLog, GITIGNORE, SEARCH_IGNORE, mergeIgnore, isInside } from './lib/folder.mjs';
import { parseStudy, lintStudy } from './lib/study.mjs';
import { validateContext, parseContext, contextTemplate, validateChanges, applyChanges } from './lib/context.mjs';
import { verifyObservations, verifyInsights } from './lib/verify.mjs';
import { notesFromObservations, createBoard, boardSummary, groupStats } from './lib/board.mjs';
import { buildRunner, makeLinks } from './lib/runner.mjs';
import { importFromRelay, newSecret } from './lib/relay-client.mjs';
import { importModerated, transcribeSession, prepareSession } from './lib/session.mjs';
import { renderReport } from './lib/report.mjs';
import { compareStudies } from './lib/compare.mjs';
import { importResultsCsv } from './lib/csv-import.mjs';
import { exportStudy } from './lib/export.mjs';
import { startLocalServer } from './lib/local-server.mjs';
import { which } from './lib/media.mjs';
import { mdToHtml, esc } from './lib/markdown.mjs';
import { REDACTION_VERSION } from './lib/redact.mjs';
import { TEMPLATES } from './lib/templates.mjs';

const VERSION = '0.2.4';
const server = new McpServer({ name: 'proofloop', version: VERSION });

// ---------- helpers ----------
const ok = (data) => ({ content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });
const fail = (msg) => ({ isError: true, content: [{ type: 'text', text: msg }] });
function tool(name, description, schema, fn) {
  server.registerTool(name, { description, inputSchema: schema }, async (args) => {
    try { return ok(await fn(args)); } catch (e) { return fail(e.message); }
  });
}
function root(folder) {
  const r = folder ? path.resolve(folder) : findResearchRoot(process.cwd());
  if (!r || !fs.existsSync(path.join(r, '.proofloop', 'config.json'))) throw new Error('No research folder found. Run the research-setup skill (setup_init) first.');
  return r;
}
function loadStudy(r, slug) {
  const f = path.join(studyDir(r, slug), 'study.yaml');
  if (!fs.existsSync(f)) throw new Error(`Study "${slug}" not found at ${f}`);
  const res = parseStudy(fs.readFileSync(f, 'utf8'));
  if (res.errors) throw new Error(`study.yaml has errors:\n${res.errors.join('\n')}`);
  return res.study;
}
// Keyed on the folder's real path, so the same folder reached through a
// symlink (macOS /var -> /private/var, cloud drive links) finds its secrets.
// Files keyed on the unresolved path by earlier versions are still found.
function secretsPath(r) {
  const key = (p) => path.join(os.homedir(), '.config', 'proofloop', `${crypto.createHash('sha256').update(p).digest('hex').slice(0, 16)}.json`);
  const abs = path.resolve(r);
  let real = abs;
  try { real = fs.realpathSync(abs); } catch { /* not created yet */ }
  const f = key(real);
  if (real !== abs && !fs.existsSync(f) && fs.existsSync(key(abs))) return key(abs);
  return f;
}
// The relay URL is pinned next to the admin token when the secrets are
// created, so an edited study.yaml can't send the token somewhere else.
function relayOrigin(u) {
  const x = new URL(u);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(x.hostname);
  if (x.protocol !== 'https:' && !(local && x.protocol === 'http:')) throw new Error(`The relay must use https (got ${x.origin}).`);
  return x.origin;
}
function pinnedRelay(r) {
  const s = readSecrets(r);
  if (!s.relay_url) throw new Error('The relay URL is not pinned yet. Re-run setup_init with relay_url.');
  return s.relay_url;
}
function readSecrets(r) {
  const f = secretsPath(r);
  if (!fs.existsSync(f)) throw new Error('No relay secrets for this research folder. Run setup_init with relay_url.');
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}
let local = null;
async function localServer(r) {
  if (local && local.root === r) return local;
  if (local) await local.close();
  local = { ...(await startLocalServer({ root: r })), root: r };
  return local;
}
const slugArg = z.string().regex(/^[a-z0-9-]+$/).describe('Study folder name, e.g. savings-onboarding-v1');
const pArg = z.string().regex(/^P\d{1,3}$/).describe('Participant id, e.g. P1');
const folderArg = z.string().optional().describe('Research folder path; defaults to ./research found from the working directory');

// After an upgrade: analysis inputs prepared with older redaction, and
// research files git already tracks (adding ignore lines doesn't untrack them).
function upgradeChecks(r) {
  const out = {};
  const stale = [];
  for (const slug of fs.readdirSync(r).filter((d) => /^[a-z0-9-]+$/.test(d) && fs.existsSync(path.join(r, d, 'study.yaml')))) {
    for (const p of listSessions(r, slug)) {
      const f = path.join(sessionDir(r, slug, p), 'analysis-input.json');
      if (fs.existsSync(f) && (readJson(f, {}).redaction_version ?? 1) < REDACTION_VERSION) stale.push(`${slug}/${p}`);
    }
  }
  if (stale.length) out.stale_analysis_input = `Prepared before typed answers and addresses were redacted: ${stale.join(', ')}. Run session_prepare again for these before any more analysis.`;
  const git = spawnSync('git', ['ls-files', '-ci', '--exclude-standard'], { cwd: r, encoding: 'utf8' });
  const tracked = git.status === 0 ? git.stdout.trim().split('\n').filter(Boolean) : [];
  if (tracked.length) out.tracked_research_files = `${tracked.length} research file(s) are already in git although they should be ignored, e.g. ${tracked.slice(0, 3).join(', ')}. Untrack them with \`git rm -r --cached <file>\` from the research folder (this keeps them on disk), then commit. They stay in git history; ask your admin if that history must be purged.`;
  return out;
}

// ---------- setup ----------
tool('setup_check', 'Check prerequisites for the Research Copilot: FFmpeg, local transcription (whisper.cpp), research folder location, git safety, and configuration. Run before the first study.', { folder: folderArg }, ({ folder }) => {
  const r = folder ? path.resolve(folder) : findResearchRoot(process.cwd());
  const cfg = r && fs.existsSync(path.join(r, '.proofloop', 'config.json')) ? loadConfig(r) : null;
  const checks = {
    node: process.version,
    ffmpeg: which('ffmpeg') ? 'found' : 'missing: needed to assemble recordings and take key screenshots',
    ffprobe: which('ffprobe') ? 'found' : 'missing (comes with FFmpeg)',
    whisper_cpp: which('whisper-cli') || which('whisper-cpp') ? 'found' : 'missing: needed only to transcribe recordings yourself; call-tool transcripts work without it',
    whisper_model: cfg?.whisper_model ? (fs.existsSync(cfg.whisper_model) ? 'found' : `not found at ${cfg.whisper_model}`) : 'not configured',
    research_folder: r ?? 'not set up',
    config: cfg,
    relay_secrets: r && fs.existsSync(secretsPath(r)) ? 'present (stored outside the project folder)' : 'none',
  };
  if (r) {
    const gi = path.join(r, '.gitignore');
    const { missing } = mergeIgnore(fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '', GITIGNORE);
    checks.gitignore = missing.length ? `MISSING lines (participant data could be committed; run setup_init to add them): ${missing.join(', ')}` : 'protects recordings and participant data';
    Object.assign(checks, upgradeChecks(r));
  }
  return checks;
});

tool('setup_init', 'Create and configure the research folder. Recordings stay in this folder on a company-managed laptop or a company drive folder. Asks the user to confirm the device is company-managed with disk encryption.', {
  path: z.string().describe('Where to create the research folder, e.g. ./research or a OneDrive/Google Drive folder'),
  location: z.enum(['laptop', 'drive']),
  confirm_managed_device: z.literal(true).describe('The user confirmed this is a company-managed device with full-disk encryption'),
  product_name: z.string().optional(),
  relay_url: z.string().url().optional().describe('Short relay URL for unmoderated tests (relay/template.yaml output)'),
  runner_base_url: z.string().url().optional().describe('Where participant pages are hosted, e.g. https://research.example.com/'),
  whisper_model: z.string().optional().describe('Path to a whisper.cpp model file, e.g. ~/models/ggml-large-v3-turbo.bin'),
  user_name: z.string().describe('Name of the researcher, recorded in logs and decisions'),
  model_account: z.enum(['claude-enterprise', 'claude-team', 'api-bedrock', 'api-vertex', 'api-anthropic', 'cursor']).optional().describe('The organisation\'s approved model account in use: Claude Enterprise or Team plan, Claude API via Bedrock, Vertex or Anthropic, or Cursor with an approved Claude model'),
}, (a) => {
  const r = path.resolve(a.path);
  fs.mkdirSync(path.join(r, '.proofloop'), { recursive: true });
  const prev = fs.existsSync(path.join(r, '.proofloop', 'config.json')) ? loadConfig(r) : {};
  const cfg = { ...prev, version: 1, location: a.location, product_name: a.product_name ?? prev.product_name ?? null, relay_url: a.relay_url ?? prev.relay_url ?? null, runner_base_url: a.runner_base_url ?? prev.runner_base_url ?? null, whisper_model: a.whisper_model ? a.whisper_model.replace(/^~/, os.homedir()) : prev.whisper_model ?? null, model_account: a.model_account ?? prev.model_account ?? null, managed_device_confirmed_by: a.user_name, managed_device_confirmed_at: new Date().toISOString(), created_by: prev.created_by ?? a.user_name };
  saveConfig(r, cfg);
  // Existing ignore files keep the user's own lines; missing Proofloop lines are appended.
  for (const [f, want] of [['.gitignore', GITIGNORE], ['.ignore', SEARCH_IGNORE]]) {
    const p = path.join(r, f);
    writeText(p, mergeIgnore(fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '', want).text);
  }
  // ripgrep (the agents' search tool) honours .ignore even outside git repos.
  const out = { folder: r, config: cfg, ...upgradeChecks(r) };
  // Secrets are created on the first setup, because deploying the relay
  // needs them before its URL exists. The URL is pinned when it is known.
  if (a.relay_url || !fs.existsSync(secretsPath(r))) {
    const pinned = a.relay_url ? relayOrigin(a.relay_url) : null;
    if (!fs.existsSync(secretsPath(r))) {
      const s = { relay_secret: newSecret(), admin_token: newSecret(), relay_url: pinned, created_at: new Date().toISOString() };
      fs.mkdirSync(path.dirname(secretsPath(r)), { recursive: true, mode: 0o700 });
      fs.writeFileSync(secretsPath(r), JSON.stringify(s, null, 2), { mode: 0o600 });
      out.relay_secrets = { stored_at: secretsPath(r), note: 'Give RELAY_SECRET and ADMIN_TOKEN from this file to whoever deploys relay/template.yaml. Never commit or paste them in chat.' };
    } else {
      const s = readSecrets(r);
      if (pinned && s.relay_url !== pinned) { s.relay_url = pinned; fs.writeFileSync(secretsPath(r), JSON.stringify(s, null, 2), { mode: 0o600 }); out.relay_pinned = pinned; }
    }
  }
  return out;
});

// ---------- studies ----------
tool('study_create', 'Create a study folder from templates: study.yaml, guide.md (moderated), consent text and an empty product context pack. Fill them in with the plan-study skill.', {
  folder: folderArg, slug: slugArg, name: z.string(), mode: z.enum(['moderated', 'unmoderated']),
  from_study: z.string().optional().describe('Copy the latest accepted product context from this earlier study'),
}, ({ folder, slug, name, mode, from_study }) => {
  const r = root(folder);
  const cfg = loadConfig(r);
  const d = studyDir(r, slug);
  if (fs.existsSync(path.join(d, 'study.yaml'))) throw new Error(`Study ${slug} already exists`);
  // Values go in as quoted YAML strings (JSON is valid YAML), and through a
  // function so "$&" in a name isn't treated as a replacement pattern.
  const q = (v) => JSON.stringify(String(v));
  const fill = (tpl, vals) => tpl.replace(/__([A-Z]+)__/g, (m, k) => (k in vals ? vals[k] : m));
  const study = fill(TEMPLATES.study, { NAME: q(name), SLUG: slug, MODE: mode, LOCATION: cfg.location, PATH: q(r), RELAY: cfg.relay_url ? `\n  relay:\n    url: ${q(cfg.relay_url)}` : '', ACCOUNT: cfg.model_account ? `\n    account: ${cfg.model_account}` : '' });
  writeText(path.join(d, 'study.yaml'), study);
  writeText(path.join(d, 'consent', 'consent.md'), fill(TEMPLATES.consent, { NAME: name }));
  if (mode === 'moderated') writeText(path.join(d, 'guide.md'), fill(TEMPLATES.guide, { NAME: name }));
  fs.mkdirSync(path.join(d, 'context', 'sources'), { recursive: true });
  let ctxNote = 'empty template';
  if (from_study) {
    const prevDir = path.join(studyDir(r, from_study), 'context');
    const versions = fs.existsSync(path.join(prevDir, 'versions')) ? fs.readdirSync(path.join(prevDir, 'versions')).filter((v) => /^v\d+$/.test(v)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))) : [];
    const src = versions.length ? path.join(prevDir, 'versions', versions.at(-1), 'context.md') : path.join(prevDir, 'context.md');
    fs.copyFileSync(src, path.join(d, 'context', 'context.md'));
    ctxNote = `copied from ${from_study} (${versions.at(-1) ?? 'original'})`;
  } else writeText(path.join(d, 'context', 'context.md'), contextTemplate(cfg.product_name ?? name));
  appendLog(r, slug, { skill: 'plan-study', event: 'study_created', mode, context: ctxNote });
  return { folder: d, files: ['study.yaml', 'consent/consent.md', ...(mode === 'moderated' ? ['guide.md'] : []), 'context/context.md'], context: ctxNote };
});

tool('study_validate', 'Validate study.yaml (strict schema with line numbers) and run the research-quality linter: leading wording, UI giveaways in tasks, missing success criteria, research questions without tasks, timing, sample size, consent and privacy.', { folder: folderArg, slug: slugArg }, ({ folder, slug }) => {
  const r = root(folder);
  const text = fs.readFileSync(path.join(studyDir(r, slug), 'study.yaml'), 'utf8');
  const res = parseStudy(text);
  if (res.errors) return { valid: false, errors: res.errors };
  const ctxF = path.join(studyDir(r, slug), 'context', 'context.md');
  const contextIds = fs.existsSync(ctxF) ? parseContext(fs.readFileSync(ctxF, 'utf8')).items.map((i) => i.id).filter(Boolean) : [];
  const lint = lintStudy(res.study, { contextIds });
  const consentF = path.join(studyDir(r, slug), res.study.spec.consent.file);
  if (!fs.existsSync(consentF)) lint.issues.push({ level: 'error', where: 'spec.consent.file', message: 'Consent text file is missing' });
  else if (!fs.readFileSync(consentF, 'utf8').includes(`${res.study.spec.retention.mediaDays} days`)) lint.issues.push({ level: 'error', where: 'spec.retention.mediaDays', message: `The consent text doesn't say recordings are deleted after ${res.study.spec.retention.mediaDays} days. Make the consent text and the retention setting agree.` });
  return { valid: true, ...lint, blocking: lint.issues.filter((i) => i.level === 'error').length };
});

// ---------- context pack ----------
tool('context_validate', 'Check context/context.md: required sections, an id and a source on every line, sources that exist in context/sources/. Also writes context.html for reading.', { folder: folderArg, slug: slugArg }, ({ folder, slug }) => {
  const r = root(folder);
  const d = path.join(studyDir(r, slug), 'context');
  const md = fs.readFileSync(path.join(d, 'context.md'), 'utf8');
  const sources = fs.existsSync(path.join(d, 'sources')) ? fs.readdirSync(path.join(d, 'sources')) : [];
  const res = validateContext(md, { sourceFiles: sources });
  writeText(path.join(d, 'context.html'), pageHtml(res.doc.title ?? 'Product context', mdToHtml(md)));
  return { ok: res.ok, errors: res.errors, warnings: res.warnings, items: res.doc.items.filter((i) => i.kind === 'item').length, sources, html: 'context/context.html' };
});

function pageHtml(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>:root{--bg:#fff;--text:#1d1d1b;--line:#d9d9d3}@media (prefers-color-scheme:dark){:root{--bg:#151514;--text:#ecece8;--line:#3a3a36}}body{font:16px/1.55 system-ui,sans-serif;max-width:860px;margin:32px auto;padding:0 16px;background:var(--bg);color:var(--text)}h2{border-bottom:1px solid var(--line);padding-bottom:4px;margin-top:32px}li{margin:4px 0}</style></head><body>${body}</body></html>`;
}

// ---------- participants and consent ----------
tool('consent_record', 'Record a participant\'s consent before any recording or analysis. For moderated sessions the moderator records verbal or written consent. The name is used only to redact it from transcripts and is never sent to the model.', {
  folder: folderArg, slug: slugArg, participant: pArg,
  method: z.enum(['verbal-recorded', 'written', 'form']), consent_version: z.string(),
  recorded_by: z.string(), name: z.string().optional(),
}, ({ folder, slug, participant, method, consent_version, recorded_by, name }) => {
  const r = root(folder);
  const f = path.join(studyDir(r, slug), 'consent', `${participant}.json`);
  writeJson(f, { participant, agreed: true, version: consent_version, method, recorded_by, at: new Date().toISOString(), name: name ?? null });
  appendLog(r, slug, { skill: 'run-session', event: 'consent_recorded', participant, method });
  return { saved: path.relative(r, f) };
});

// ---------- unmoderated runner ----------
tool('runner_build', 'Generate the participant page for an unmoderated (or moderated-mode click capture) study into <study>/runner/. Host the folder on a company web host or private GitHub Pages; ask the user before publishing anywhere public.', { folder: folderArg, slug: slugArg }, ({ folder, slug }) => {
  const r = root(folder);
  const study = loadStudy(r, slug);
  const lint = lintStudy(study);
  if (lint.blocking) throw new Error(`Fix blocking study issues first:\n${lint.issues.filter((i) => i.level === 'error').map((i) => `${i.where}: ${i.message}`).join('\n')}`);
  if (!study.spec.relay?.url) throw new Error('study.yaml has no spec.relay.url, so the page would have nowhere to send results. Deploy the relay and add its URL.');
  if (relayOrigin(study.spec.relay.url) !== pinnedRelay(r)) throw new Error(`study.yaml points at relay ${new URL(study.spec.relay.url).origin}, but this research folder's relay is ${pinnedRelay(r)}. Fix spec.relay.url, or re-run setup_init if the relay really moved.`);
  const consentF = path.resolve(studyDir(r, slug), study.spec.consent.file);
  if (!isInside(studyDir(r, slug), consentF)) throw new Error('consent.file must be inside the study folder');
  const consent = fs.readFileSync(consentF, 'utf8');
  const res = buildRunner(study, consent, path.join(studyDir(r, slug), 'runner'));
  appendLog(r, slug, { skill: 'build-runner', files: res.files.length });
  return { folder: path.join(studyDir(r, slug), 'runner'), files: res.files.map((f) => path.basename(f)), published_fields: Object.keys(res.public), note: 'Only public study fields are in study.js. Moderator names, research questions and storage paths are not published.' };
});

tool('runner_links', 'Create signed, expiring participant links (one per participant id). Share each link only with that participant.', {
  folder: folderArg, slug: slugArg, participants: z.array(pArg).min(1), base_url: z.string().url().optional(), days: z.number().int().min(1).max(14).default(7),
}, ({ folder, slug, participants, base_url, days }) => {
  const r = root(folder);
  const cfg = loadConfig(r);
  const study = loadStudy(r, slug);
  const base = base_url ?? cfg.runner_base_url;
  if (!base) throw new Error('No base_url. Pass where the runner folder is hosted.');
  const links = makeLinks({ baseUrl: base, study: slug, participants, secret: readSecrets(r).relay_secret, days, mode: study.spec.mode });
  appendLog(r, slug, { skill: 'build-runner', event: 'links_created', participants, days });
  // Links are upload credentials: keep them out of the chat transcript.
  const file = path.join(path.dirname(secretsPath(r)), `links-${slug}.csv`);
  const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').slice(1).filter((l) => !participants.includes(l.split(',')[0])) : [];
  fs.writeFileSync(file, ['participant,expires,url', ...prev, ...links.map((l) => `${l.participant},${l.expires ?? ''},${l.url}`)].join('\n') + '\n', { mode: 0o600 });
  return { links_file: file, participants, days, note: 'Open the file yourself and send each link only to its participant. Links are not shown here because they work as upload passwords.' };
});

tool('relay_import', 'Import finished unmoderated sessions (and moderated-mode click data) from the short relay into the laptop study folder, verify them, and delete them from the relay.', {
  folder: folderArg, slug: slugArg, include_incomplete: z.boolean().default(false),
}, async ({ folder, slug, include_incomplete }) => {
  const r = root(folder);
  const cfg = loadConfig(r);
  const study = loadStudy(r, slug);
  void cfg; void study;
  return importFromRelay({ root: r, slug, relayUrl: pinnedRelay(r), adminToken: readSecrets(r).admin_token, includeIncomplete: include_incomplete });
});

tool('results_import', 'Fallback import from the current testing tool: its results CSV (one row per participant) and, optionally, one video file per participant. Rows become sessions P1, P2… The tool\'s participant ids stay in a private mapping file; cell values are never returned. Only use for participants who consented in that tool to this research use.', {
  folder: folderArg, slug: slugArg, csv_path: z.string(), participant_column: z.string().describe('Column with the tool\'s participant or session id'),
  tasks: z.array(z.object({
    task_id: z.string().describe('Task id in study.yaml'), outcome_column: z.string(),
    success_values: z.array(z.string()).optional().describe('Cell values meaning success (default: success, completed, pass, yes, true, 1…)'),
    failure_values: z.array(z.string()).optional().describe('Cell values meaning failure or gave up (default: fail, gave up, abandoned, no, false, 0…)'),
    time_column: z.string().optional().describe('Task time in seconds'), seq_column: z.string().optional().describe('SEQ answer 1 to 7'),
  }).strict()).min(1),
  sus_columns: z.array(z.string()).length(10).optional().describe('The 10 SUS item columns in order, answers 1 to 5'),
  video_column: z.string().optional().describe('Column with each participant\'s video file name'), video_dir: z.string().optional(),
  consent_confirmed: z.literal(true).describe('The researcher confirms these participants consented in the testing tool to this use'),
  consent_version: z.string().describe('Which consent text they agreed to, e.g. the tool\'s standard terms plus our study notice v1'),
}, ({ folder, slug, csv_path, participant_column, tasks, sus_columns, video_column, video_dir, consent_version }) => {
  const r = root(folder);
  return importResultsCsv({ root: r, slug, study: loadStudy(r, slug), csvPath: path.resolve(csv_path), participantColumn: participant_column, tasks, susColumns: sus_columns, videoColumn: video_column, videoDir: video_dir && path.resolve(video_dir), consentVersion: consent_version });
});

// ---------- moderated ----------
tool('studio_open', 'Open the Studio for a moderated session: records the call window (participant audio) and the moderator\'s microphone into the study folder, with guide markers and notes. Requires consent on file.', { folder: folderArg, slug: slugArg, participant: pArg }, async ({ folder, slug, participant }) => {
  const r = root(folder);
  loadStudy(r, slug);
  const s = await localServer(r);
  return { url: `${s.base}/studio#k=${s.key}&study=${slug}&p=${participant}`, consent_on_file: hasConsent(r, slug, participant), note: 'Open this URL in Chrome or Edge on this laptop. It works only while Claude Code or Cursor is running.' };
});

tool('session_import', 'Import a moderated session recorded elsewhere: a call recording and/or the call tool\'s transcript (VTT, SRT, DOCX, TXT). Requires consent on file.', {
  folder: folderArg, slug: slugArg, participant: pArg, recording_path: z.string().optional(), transcript_path: z.string().optional(),
}, ({ folder, slug, participant, recording_path, transcript_path }) => {
  const r = root(folder);
  const study = loadStudy(r, slug);
  return importModerated({ root: r, slug, participant, recording: recording_path, transcript: transcript_path, moderators: study.spec.moderators });
});

tool('session_transcribe', 'Transcribe a session locally with whisper.cpp. Audio never leaves the laptop. Speaker roles come from separate tracks.', { folder: folderArg, slug: slugArg, participant: pArg }, ({ folder, slug, participant }) => {
  const r = root(folder);
  const cfg = loadConfig(r);
  return transcribeSession({ root: r, slug, participant, modelPath: cfg.whisper_model });
});

// ---------- analysis ----------
tool('session_prepare', 'Prepare one session for analysis: redact the transcript, notes and typed answers (pattern-based, best-effort), align click data, detect behaviour signals and extract up to 20 key screenshots. Writes analysis-input.json, the only session file the model should read. The product context is deliberately left out.', { folder: folderArg, slug: slugArg, participant: pArg }, ({ folder, slug, participant }) => {
  const r = root(folder);
  return prepareSession({ root: r, slug, participant, study: loadStudy(r, slug) });
});

const evidence = z.object({
  kind: z.enum(['quote', 'event', 'frame']),
  utterance_ids: z.array(z.string()).optional(), quote: z.string().optional(),
  event_id: z.string().optional(), frame_id: z.string().optional(),
}).strict();
const observation = z.object({
  id: z.string(), type: z.enum(['behaviour', 'quote', 'expectation', 'preference', 'bug', 'positive', 'suggestion']),
  text: z.string(), task_id: z.string().nullable().optional(), evidence: z.array(evidence).min(1),
}).strict();

tool('observations_submit', 'Submit the observations (one idea each, ≤ 40 words) for one session. Every quote is checked word for word against participant utterances; every event and frame id must exist. Rejected items are returned with reasons and are not saved. Fix and resubmit only by re-reading the evidence; never invent.', {
  folder: folderArg, slug: slugArg, participant: pArg, model: z.string().describe('Model that wrote these, e.g. claude-opus-5-5'), observations: z.array(observation),
  replace: z.boolean().default(false).describe('Replace all saved observations for this session instead of merging by id'),
}, ({ folder, slug, participant, model, observations, replace }) => {
  const r = root(folder);
  const study = loadStudy(r, slug);
  const dir = sessionDir(r, slug, participant);
  if (!fs.existsSync(path.join(dir, 'transcript.redacted.json'))) throw new Error(`${participant} hasn't been prepared yet. Run session_prepare for ${participant} first, then read its analysis-input.json.`);
  const session = { transcript: readJson(path.join(dir, 'transcript.redacted.json')), events: readJson(path.join(dir, 'events.json'), { events: [] }), frames: readJson(path.join(dir, 'frames.json'), { frames: [] }) };
  const ids = observations.map((o) => (o.id.startsWith(`${participant}-`) ? o : { ...o, id: `${participant}-${o.id}` }));
  const { accepted, rejected } = verifyObservations({ observations: ids }, session);
  const economy = model !== study.spec.model.research;
  // Resubmitting fixed items merges by id, so earlier accepted ones are kept.
  const prev = replace ? [] : readJson(path.join(dir, 'observations.json'), { observations: [] }).observations;
  const byId = new Map(prev.map((o) => [o.id, o]));
  for (const o of accepted) byId.set(o.id, o);
  writeJson(path.join(dir, 'observations.json'), { participant, model, economy_mode: economy, created_at: new Date().toISOString(), observations: [...byId.values()] });
  appendLog(r, slug, { skill: 'analyse-sessions', step: 'observations_submit', participant, model, accepted: accepted.length, rejected: rejected.length });
  return { saved: accepted.length, total: byId.size, rejected, ...(economy ? { warning: `Model ${model} is not the study's research model (${study.spec.model.research}). Outputs are labelled economy mode.` } : {}) };
});

tool('board_create', 'Create the affinity board from all sessions\' verified observations and your bottom-up draft grouping. Group labels must be sentences in participants\' terms. Notes you do not place go to Unsorted. Do not use the product context for grouping.', {
  folder: folderArg, slug: slugArg,
  groups: z.array(z.object({ id: z.string(), label: z.string(), note_ids: z.array(z.string()) }).strict()).min(1),
  themes: z.array(z.object({ id: z.string(), label: z.string(), group_ids: z.array(z.string()) }).strict()).default([]),
  replace: z.boolean().default(false).describe('Replace an existing board (only if the user asked)'),
}, ({ folder, slug, groups, themes, replace }) => {
  const r = root(folder);
  const f = path.join(studyDir(r, slug), 'affinity', 'board.json');
  if (fs.existsSync(f) && !replace) throw new Error('A board already exists. Open it with board_open, or pass replace: true if the user asked to start over.');
  const sessions = listSessions(r, slug).map((p) => ({ participant: p, observations: readJson(path.join(sessionDir(r, slug, p), 'observations.json'), { observations: [] }).observations })).filter((s) => s.observations.length);
  if (!sessions.length) throw new Error('No verified observations yet. Run analyse-sessions first.');
  const notes = notesFromObservations(sessions);
  // N counts every analysed session, including ones with no accepted notes,
  // so "n of N" isn't inflated by sessions that produced nothing.
  const analysed = listSessions(r, slug).filter((p) => hasConsent(r, slug, p) && fs.existsSync(path.join(sessionDir(r, slug, p), 'analysis-input.json')));
  const res = createBoard({ study: slug, notes, draft: { groups, themes }, nIncluded: Math.max(analysed.length, sessions.length) });
  if (res.errors) throw new Error(`Board draft rejected:\n${res.errors.join('\n')}`);
  writeJson(f, res.board);
  appendLog(r, slug, { skill: 'synthesise-study', step: 'board_create', notes: notes.length, groups: groups.length, themes: themes.length, unsorted: res.board.unsorted.length });
  return { notes: notes.length, ...boardSummary(res.board) };
});

tool('board_open', 'Open the affinity board in the browser so the researcher can move notes, split, merge and rename groups and themes. Nothing moves on until they mark it done.', { folder: folderArg, slug: slugArg }, async ({ folder, slug }) => {
  const r = root(folder);
  if (!fs.existsSync(path.join(studyDir(r, slug), 'affinity', 'board.json'))) throw new Error('No board yet. Create it with board_create.');
  const s = await localServer(r);
  return { url: `${s.base}/board#k=${s.key}&study=${slug}`, note: 'Open in a browser on this laptop.' };
});

tool('board_summary', 'Read the current affinity board with counts (n of N participants, 90% interval, confidence) computed in code.', { folder: folderArg, slug: slugArg, include_notes: z.boolean().default(false) }, ({ folder, slug, include_notes }) => {
  const r = root(folder);
  const board = readJson(path.join(studyDir(r, slug), 'affinity', 'board.json'));
  const s = boardSummary(board);
  if (include_notes) s.board = { themes: board.themes, groups: board.groups, unsorted: board.unsorted, notes: board.notes.map((n) => ({ id: n.id, participant: n.participant, task_id: n.task_id, type: n.type, text: n.text })) };
  return s;
});

// What the researcher reviewed. If a re-run changes an insight, its old decision no longer applies.
const insightHash = (i) => crypto.createHash('sha256').update(JSON.stringify([i.kind, i.title, i.statement, i.severity ?? null, i.hmw ?? null, i.recommendation ?? null, [...(i.note_ids ?? [])].sort(), [...(i.counter_note_ids ?? [])].sort(), i.context_relation])).digest('hex').slice(0, 16);
const insightSchema = z.object({
  id: z.string().regex(/^ins-[a-z0-9-]+$/), kind: z.enum(['pain_point', 'opportunity']), title: z.string().max(120), statement: z.string(),
  severity: z.enum(['critical', 'major', 'minor', 'cosmetic']).optional(), hmw: z.string().optional(), recommendation: z.string().optional(),
  theme_id: z.string().optional(), group_ids: z.array(z.string()).min(1), note_ids: z.array(z.string()).optional(), quotes: z.array(z.string()).optional(),
  counter_note_ids: z.array(z.string()).default([]).describe('Notes where participants did or said the opposite. Strong counter-evidence lowers confidence.'),
  context_relation: z.object({ type: z.enum(['confirms', 'contradicts', 'extends', 'new']), ctx_ids: z.array(z.string()).default([]), explanation: z.string().optional() }).strict(),
}).strict();

tool('insights_submit', 'Submit insights (pain points with severity, opportunities with a "How might we…" prompt) from the reviewed board, each compared with the product context (confirms / contradicts / extends / new). Requires the board to be marked done. run 2 is the independent second run: its overlap with run 1 marks insights stable. Resubmitting fixed insights merges by id, so earlier accepted ones and their review decisions are kept.', {
  folder: folderArg, slug: slugArg, run: z.union([z.literal(1), z.literal(2)]).default(1), model: z.string(), insights: z.array(insightSchema).min(1),
  open_questions: z.array(z.object({ question: z.string().max(240), why: z.string().max(400), group_ids: z.array(z.string()).default([]) }).strict()).max(10).optional(),
  replace: z.boolean().default(false).describe('Replace all saved insights for this run instead of merging by id (only for a deliberate full re-run)'),
}, ({ folder, slug, run, model, insights, open_questions, replace }) => {
  const r = root(folder);
  const d = studyDir(r, slug);
  const board = readJson(path.join(d, 'affinity', 'board.json'));
  if (board.status !== 'done') throw new Error('The researcher has not marked the board done. Ask them to finish it first (board_open).');
  const ctxF = path.join(d, 'context', 'context.md');
  const ctxIds = new Set(fs.existsSync(ctxF) ? parseContext(fs.readFileSync(ctxF, 'utf8')).items.map((i) => i.id) : []);
  const { accepted, rejected } = verifyInsights({ insights }, board);
  for (const i of accepted) for (const c of i.context_relation.ctx_ids ?? []) if (!ctxIds.has(c)) rejected.push({ id: i.id, errors: [`unknown context id ${c}`] });
  const withStats = (i) => ({ ...i, stats: groupStats(board, { note_ids: i.note_ids }, { counterNoteIds: i.counter_note_ids ?? [] }) });
  const good = accepted.filter((i) => !rejected.some((x) => x.id === i.id)).map(withStats);
  if (!good.length) throw new Error(`Every insight was rejected, so nothing was saved:\n${rejected.map((x) => `${x.id}: ${x.errors.join('; ')}`).join('\n')}`);
  const file = path.join(d, run === 1 ? 'insights.json' : 'insights.run2.json');
  const groupIds = new Set(board.groups.map((g) => g.id));
  for (const q of open_questions ?? []) for (const g of q.group_ids) if (!groupIds.has(g)) throw new Error(`Open question cites unknown group ${g}`);
  // Merge by id, like observations_submit: a resubmission of a few fixed
  // insights must not drop the others. After a participant is erased the old
  // file is stale and is never merged; kept insights must still pass the checker
  // against the current board, so ones built on removed notes are dropped.
  const prev = readJson(file, null);
  const prevDoc = replace || prev?.stale ? null : prev;
  if (prev && !prevDoc) for (const f of [file, path.join(d, 'review.json')]) if (fs.existsSync(f)) fs.copyFileSync(f, `${f}.bak`);
  const kept = prevDoc ? verifyInsights({ insights: prevDoc.insights.filter((i) => !good.some((g) => g.id === i.id)) }, board) : { accepted: [], rejected: [] };
  const byId = new Map(kept.accepted.map((i) => [i.id, i]));
  for (const i of good) byId.set(i.id, i);
  const all = [...byId.values()].map(withStats);
  const now = new Date().toISOString();
  const doc = { run, model, created_at: prevDoc?.created_at ?? now, updated_at: now, insights: all, open_questions: open_questions ?? prevDoc?.open_questions ?? [] };
  writeJson(file, doc);
  let reviewReset = [];
  if (run === 1) {
    const rf = path.join(d, 'review.json');
    const rv = readJson(rf, null);
    if (rv) {
      const hashes = new Map(all.map((i) => [i.id, insightHash(i)]));
      reviewReset = Object.keys(rv.decisions).filter((id) => hashes.get(id) !== rv.decisions[id].hash);
      for (const id of reviewReset) delete rv.decisions[id];
      writeJson(rf, rv);
    }
  }
  let stability = null;
  const other = readJson(path.join(d, run === 1 ? 'insights.run2.json' : 'insights.json'), null);
  if (other) {
    // Fresh stats each time, so an insight that becomes stable gets its confidence back.
    const primary = (run === 1 ? all : other.insights).map(withStats);
    const second = run === 1 ? other.insights : all;
    // One-to-one matching between runs: best Jaccard overlap of notes,
    // same kind, at least 0.5 (FR-SYN-026).
    const jac = (x, y) => { const a = new Set(x); const inter = y.filter((n) => a.has(n)).length; return inter / (a.size + y.length - inter); };
    const pairs = [];
    primary.forEach((i, pi) => second.forEach((j, si) => { if (i.kind === j.kind) pairs.push([jac(i.note_ids, j.note_ids), pi, si]); }));
    pairs.sort((a, b) => b[0] - a[0]);
    const usedP = new Set();
    const usedS = new Set();
    for (const [score, pi, si] of pairs) if (score >= 0.5 && !usedP.has(pi) && !usedS.has(si)) { usedP.add(pi); usedS.add(si); }
    primary.forEach((i, pi) => {
      i.stable = usedP.has(pi);
      if (!i.stable && i.stats.confidence === 'high') i.stats.confidence = 'medium';
    });
    writeJson(path.join(d, 'insights.json'), { ...(run === 1 ? doc : other), insights: primary });
    stability = { stable: primary.filter((i) => i.stable).length, unstable: primary.filter((i) => !i.stable).length };
  }
  appendLog(r, slug, { skill: 'synthesise-study', step: 'insights_submit', run, model, accepted: good.length, rejected: rejected.length });
  return { saved: good.length, total: all.length, rejected, stability, ...(kept.rejected.length ? { dropped: kept.rejected.map((x) => ({ id: x.id, errors: x.errors })), dropped_note: 'Earlier insights that no longer match the board were removed.' } : {}), ...(reviewReset.length ? { review_reset: reviewReset, note: 'These insights changed since they were reviewed, so they need reviewing again.' } : {}), insights: good.map((i) => ({ id: i.id, title: i.title, n_of_N: i.stats.n_of_N, confidence: i.stats.confidence, relation: i.context_relation.type })) };
});

tool('review_record', 'Record the researcher\'s decision on one insight: accepted, edited (with the edited fields) or rejected (with a reason). Only accepted and edited insights reach the report. Never record a decision the researcher did not make.', {
  folder: folderArg, slug: slugArg, insight_id: z.string(), decision: z.enum(['accepted', 'edited', 'rejected']), reason: z.string().optional(),
  edited: z.object({ title: z.string().optional(), statement: z.string().optional(), severity: z.enum(['critical', 'major', 'minor', 'cosmetic']).optional(), hmw: z.string().optional(), recommendation: z.string().optional() }).strict().optional(),
  reviewer: z.string(),
}, ({ folder, slug, insight_id, decision, reason, edited, reviewer }) => {
  const r = root(folder);
  const d = studyDir(r, slug);
  const ins = readJson(path.join(d, 'insights.json')).insights;
  if (!ins.some((i) => i.id === insight_id)) throw new Error(`Unknown insight ${insight_id}`);
  if (decision === 'rejected' && !reason) throw new Error('A rejection needs a reason');
  if (decision === 'edited' && !edited) throw new Error('An edit needs the edited fields');
  const f = path.join(d, 'review.json');
  const rv = readJson(f, { decisions: {} });
  rv.decisions[insight_id] = { decision, reason: reason ?? null, edited: edited ?? null, by: reviewer, at: new Date().toISOString(), hash: insightHash(ins.find((i) => i.id === insight_id)) };
  writeJson(f, rv);
  appendLog(r, slug, { skill: 'review-findings', insight_id, decision, by: reviewer });
  return { recorded: insight_id, decision, remaining: ins.filter((i) => !rv.decisions[i.id]).map((i) => i.id) };
});

// ---------- context before/after ----------
const change = z.object({
  id: z.string().regex(/^chg-[a-z0-9-]+$/), action: z.enum(['modify', 'add', 'remove', 'set_status']),
  ctx_id: z.string().optional(), parent: z.string().optional(), new_id: z.string().optional(),
  before: z.string().optional(), after: z.string().optional(), status: z.enum(['assumption', 'validated', 'contradicted', 'untested']).optional(),
  insight_ids: z.array(z.string()).min(1), rationale: z.string(),
}).strict();

tool('context_changes_submit', 'Propose before/after changes to the product context (vision, problem statement, personas, journeys, assumptions) based only on accepted insights. Writes context-changes.md for the researcher to accept, edit or reject each change.', {
  folder: folderArg, slug: slugArg, changes: z.array(change).min(1),
}, ({ folder, slug, changes }) => {
  const r = root(folder);
  const d = studyDir(r, slug);
  const md = fs.readFileSync(path.join(d, 'context', 'context.md'), 'utf8');
  const ctx = parseContext(md);
  const rv = readJson(path.join(d, 'review.json'), { decisions: {} }).decisions;
  const acceptedIds = new Set(Object.entries(rv).filter(([, v]) => ['accepted', 'edited'].includes(v.decision)).map(([k]) => k));
  const errors = validateChanges({ changes }, ctx, acceptedIds);
  if (errors.length) throw new Error(errors.join('\n'));
  const enriched = changes.map((c) => ({ ...c, before: c.action === 'add' ? null : ctx.items.find((i) => i.id === c.ctx_id)?.text ?? null, decision: null }));
  writeJson(path.join(d, 'context-changes.json'), { created_at: new Date().toISOString(), changes: enriched });
  const lines = ['# Proposed changes to the product context', '', 'Accept, edit or reject each change. Nothing changes in context.md until you decide.', ''];
  for (const c of enriched) {
    lines.push(`## ${c.id}: ${c.action} ${c.ctx_id ?? c.new_id}`, '', `- **Before:** ${c.before ?? '(not in the product context)'}`, `- **After:** ${c.action === 'remove' ? '(removed)' : c.action === 'set_status' ? `marked ${c.status}` : c.after}`, `- **Why:** ${c.rationale}`, `- **Evidence:** ${c.insight_ids.join(', ')}`, '');
  }
  writeText(path.join(d, 'context-changes.md'), lines.join('\n'));
  return { proposed: enriched.length, file: 'context-changes.md' };
});

tool('context_change_decide', 'Record the researcher\'s decision on one proposed context change.', {
  folder: folderArg, slug: slugArg, change_id: z.string(), decision: z.enum(['accepted', 'edited', 'rejected']), edited_after: z.string().optional(), reviewer: z.string(),
}, ({ folder, slug, change_id, decision, edited_after, reviewer }) => {
  const r = root(folder);
  const f = path.join(studyDir(r, slug), 'context-changes.json');
  const doc = readJson(f);
  const c = doc.changes.find((x) => x.id === change_id);
  if (!c) throw new Error(`Unknown change ${change_id}`);
  if (decision === 'edited' && !edited_after) throw new Error('An edit needs edited_after');
  Object.assign(c, { decision, edited_after: edited_after ?? null, decided_by: reviewer, decided_at: new Date().toISOString() });
  writeJson(f, doc);
  return { recorded: change_id, remaining: doc.changes.filter((x) => !x.decision).map((x) => x.id) };
});

tool('context_apply', 'Apply accepted context changes as a new version in context/versions/vN/ (the original is never overwritten) and render it as HTML.', { folder: folderArg, slug: slugArg }, ({ folder, slug }) => {
  const r = root(folder);
  const d = path.join(studyDir(r, slug), 'context');
  const doc = readJson(path.join(studyDir(r, slug), 'context-changes.json'));
  const undecided = doc.changes.filter((c) => !c.decision);
  if (undecided.length) throw new Error(`Decide these changes first: ${undecided.map((c) => c.id).join(', ')}`);
  if (doc.applied_as) throw new Error(`These changes were already applied as ${doc.applied_as}.`);
  const vdir = path.join(d, 'versions');
  const versions = fs.existsSync(vdir) ? fs.readdirSync(vdir).filter((v) => /^v\d+$/.test(v)).map((v) => Number(v.slice(1))) : [];
  // Changes were checked against context.md, so they apply to context.md.
  const next = applyChanges(fs.readFileSync(path.join(d, 'context.md'), 'utf8'), doc, slug);
  const vn = `v${(versions.length ? Math.max(...versions) : 0) + 1}`;
  writeText(path.join(vdir, vn, 'context.md'), next);
  writeText(path.join(vdir, vn, 'context.html'), pageHtml(`Product context ${vn}`, mdToHtml(next)));
  const check = validateContext(next);
  writeJson(path.join(studyDir(r, slug), 'context-changes.json'), { ...doc, applied_as: vn, applied_at: new Date().toISOString() });
  appendLog(r, slug, { skill: 'update-context', version: vn, applied: doc.changes.filter((c) => ['accepted', 'edited'].includes(c.decision)).length });
  return { version: vn, file: `context/versions/${vn}/context.md`, valid: check.ok, errors: check.errors };
});

tool('report_render', 'Render report.md and report.html from accepted insights, computed task metrics, the affinity map and the before/after context changes.', { folder: folderArg, slug: slugArg }, ({ folder, slug }) => {
  const r = root(folder);
  return renderReport({ root: r, slug, study: loadStudy(r, slug) });
});

tool('compare_studies', 'Compare task success between an earlier and a later version of a study (re-test). Only tasks worded identically are compared. Returns the difference with a 90% interval and a plain verdict; report it as given, never compute or round differently.', {
  folder: folderArg, before: slugArg, after: slugArg,
}, ({ folder, before, after }) => {
  const r = root(folder);
  return compareStudies({ root: r, before: loadStudy(r, before), after: loadStudy(r, after) });
});

tool('study_export', 'Package a study for import into the ProofLoop platform (R1) with every id unchanged: a .tar.gz with a manifest of files and SHA-256 hashes, saved in .proofloop/exports/ (not in git). Media, frames and raw transcripts are left out unless include_media is true; session notes, device details, source documents and participant names are always left out. Ask the user before including media.', {
  folder: folderArg, slug: slugArg, include_media: z.boolean().default(false),
}, async ({ folder, slug, include_media }) => {
  const r = root(folder);
  return exportStudy({ root: r, slug, study: loadStudy(r, slug), includeMedia: include_media, version: VERSION, outDir: path.join(r, '.proofloop', 'exports') });
});

// ---------- retention ----------
tool('cleanup', 'Apply retention (delete recordings, screenshots and transcripts older than the study\'s mediaDays) or erase one participant completely. Run with dry_run first and show the user what will be deleted.', {
  folder: folderArg, slug: slugArg, participant: pArg.optional(), dry_run: z.boolean().default(true),
}, ({ folder, slug, participant, dry_run }) => {
  const r = root(folder);
  const study = loadStudy(r, slug);
  const d = studyDir(r, slug);
  const del = [];
  if (participant) {
    del.push(sessionDir(r, slug, participant), path.join(d, 'consent', `${participant}.json`));
  } else {
    const limit = Date.now() - study.spec.retention.mediaDays * 86400000;
    for (const p of listSessions(r, slug)) {
      const sd = sessionDir(r, slug, p);
      const rec = readJson(path.join(sd, 'recording.json'), null);
      // Retention counts from when the session was recorded or imported. Folder
      // dates change whenever a session is re-prepared, so they are the last resort.
      const ses = readJson(path.join(sd, 'session.json'), {});
      const when = Date.parse(rec?.ended_at ?? rec?.imported_at ?? ses.imported_at ?? ses.started_at ?? '') || fs.statSync(sd).mtimeMs;
      if (when < limit) for (const x of fs.readdirSync(sd)) if (['media', 'frames', 'transcript.json', 'transcript.redacted.json', 'analysis-input.json', 'answers.json', 'notes.md', 'device.json'].includes(x) || /^markers.*\.json$|^\./.test(x)) del.push(path.join(sd, x));
    }
  }
  // Export packages hold raw answers (and media if included): they go with
  // an erased participant, and once older than the retention period.
  const exportsDir = path.join(r, '.proofloop', 'exports');
  if (fs.existsSync(exportsDir)) {
    const limit = Date.now() - study.spec.retention.mediaDays * 86400000;
    for (const x of fs.readdirSync(exportsDir)) if (new RegExp(`^${slug}-\\d{8}T\\d{6}\\.tar\\.gz$`).test(x) && (participant || fs.statSync(path.join(exportsDir, x)).mtimeMs < limit)) del.push(path.join(exportsDir, x));
  }
  const existing = del.filter((f) => fs.existsSync(f) && isInside(r, f));
  const boardF = path.join(d, 'affinity', 'board.json');
  const board = participant ? readJson(boardF, null) : null;
  const notesToDrop = board ? board.notes.filter((n) => n.participant === participant).map((n) => n.id) : [];
  if (!dry_run) {
    for (const f of existing) fs.rmSync(f, { recursive: true, force: true });
    if (notesToDrop.length) {
      // Erasure covers derived notes too: remove them, then mark insights for re-synthesis.
      const drop = new Set(notesToDrop);
      const theirQuotes = new Set(board.notes.filter((n) => drop.has(n.id)).flatMap((n) => (n.evidence ?? []).filter((e) => e.kind === 'quote').map((e) => e.quote)));
      const touched = new Set();
      board.notes = board.notes.filter((n) => !drop.has(n.id));
      for (const g of board.groups) g.note_ids = g.note_ids.filter((n) => !drop.has(n));
      board.unsorted = (board.unsorted ?? []).filter((n) => !drop.has(n));
      if (board.ai_draft) { for (const g of board.ai_draft.groups) g.note_ids = g.note_ids.filter((n) => !drop.has(n)); board.ai_draft.unsorted = board.ai_draft.unsorted.filter((n) => !drop.has(n)); }
      board.n_included = Math.max(0, board.n_included - 1);
      board.status = 'draft';
      writeJson(boardF, board);
      for (const f of ['insights.json', 'insights.run2.json']) {
        const doc = readJson(path.join(d, f), null);
        if (doc) {
          doc.stale = `participant ${participant} erased ${new Date().toISOString()}`;
          for (const i of doc.insights) {
            if (i.note_ids.some((n) => drop.has(n))) touched.add(i.id);
            i.note_ids = i.note_ids.filter((n) => !drop.has(n));
            i.quotes = (i.quotes ?? []).filter((q) => ![...theirQuotes].some((t) => t.includes(q) || q.includes(t)));
          }
          writeJson(path.join(d, f), doc);
        }
      }
      // Reviews of insights that used their words, and reports that quote them, go too.
      const rf = path.join(d, 'review.json');
      const rv = readJson(rf, null);
      if (rv) { for (const id of touched) delete rv.decisions[id]; writeJson(rf, rv); }
      for (const f of ['report.md', 'report.html']) fs.rmSync(path.join(d, f), { force: true });
    }
    appendLog(r, slug, { skill: 'cleanup', participant: participant ?? null, deleted: existing.map((f) => path.relative(r, f)) });
  }
  return { dry_run, delete: existing.map((f) => path.relative(r, f)), board_notes_removed: notesToDrop.length, note: notesToDrop.length ? 'Board notes and quotes from this participant are removed, the board is reopened, and report.md/report.html are deleted. Insights are marked stale: re-check the board, re-run synthesis (the next insights_submit starts the insights over) and review, then render the report again. Re-send any report copies already shared.' : undefined };
});

tool('usage_log', 'Record time spent and model use for a skill run (feeds the Spike S4 time-saved measure).', {
  folder: folderArg, slug: slugArg, skill: z.string(), model: z.string(), effort: z.string().optional(), minutes_researcher: z.number().optional(), notes: z.string().optional(),
}, ({ folder, slug, ...rest }) => { const r = root(folder); appendLog(r, slug, rest); return { logged: true }; });

const transport = new StdioServerTransport();
await server.connect(transport);
