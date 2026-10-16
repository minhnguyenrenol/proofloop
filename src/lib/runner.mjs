// Builds the static participant page for a study (FR-PLG-007) and signs
// participant links (FR-PLG-008).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { mdToHtml } from './markdown.mjs';
import { signToken } from '../../relay/handler.mjs';
import { WEB } from './web-assets.mjs';

export function publicStudy(study, consentMd) {
  const s = study.spec;
  const tasks = s.blocks.filter((b) => b.type === 'task');
  let prototypeOrigin = null;
  if (s.prototype.url) prototypeOrigin = new URL(s.prototype.url).origin;
  // Only what the participant page needs. No moderator names, research
  // questions, context ids or storage paths are published.
  return {
    name: study.metadata.name,
    slug: study.metadata.slug,
    mode: s.mode,
    targetMinutes: s.targetMinutes,
    recording: s.recording,
    relay: s.relay?.url?.replace(/\/$/, '') ?? null,
    prototype: { figma: s.prototype.figma, url: s.prototype.url, figmaClientId: s.prototype.figmaClientId },
    prototypeOrigin,
    consentVersion: s.consent.version,
    consentHtml: mdToHtml(consentMd),
    tasks: tasks.map((t) => ({ id: t.id, success: t.success ?? null })),
    blocks: s.blocks.map((b) => {
      if (b.type === 'task') return { type: 'task', id: b.id, instruction: b.instruction, scenario: b.scenario, maxSeconds: b.maxSeconds, success: b.success ?? null, followUps: b.followUps };
      if (b.type === 'question') return { type: 'question', id: b.id, questionType: b.questionType, text: b.text, options: b.options };
      return { type: 'instructions', id: b.id, text: b.text };
    }),
  };
}

export function buildRunner(study, consentMd, outDir, { uploadOrigins = [] } = {}) {
  const pub = publicStudy(study, consentMd);
  fs.mkdirSync(outDir, { recursive: true });
  const relayOrigin = pub.relay ? new URL(pub.relay).origin : '';
  const s3 = study.spec.relay?.url ? 'https://*.amazonaws.com' : '';
  const html = WEB['runner/index.html']
    .replace('__PROTOTYPE_ORIGIN__', pub.prototypeOrigin ?? '')
    .replace('__RELAY_ORIGIN__', relayOrigin)
    .replace('__UPLOAD_ORIGINS__', [s3, ...uploadOrigins].filter(Boolean).join(' '));
  const files = {
    'index.html': html,
    'runner.js': WEB['runner/runner.js'],
    'runner.css': WEB['runner/runner.css'],
    'proofloop-recorder.js': WEB['runner/proofloop-recorder.js'],
    'study.js': `window.PROOFLOOP_STUDY = ${JSON.stringify(pub).replace(/</g, '\\u003c')};\n`,
  };
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(outDir, name), content);
  return { files: Object.keys(files).map((f) => path.join(outDir, f)), public: pub };
}

export function makeLinks({ baseUrl, study, participants, secret, days = 7, mode }) {
  const exp = Date.now() + days * 86400000;
  return participants.map((p) => {
    const token = signToken({ study, p, exp, n: crypto.randomBytes(6).toString('hex') }, secret);
    const u = new URL(baseUrl);
    u.searchParams.set('t', token);
    if (mode === 'moderated') u.searchParams.set('mode', 'moderated');
    return { participant: p, url: u.toString(), expires: new Date(exp).toISOString() };
  });
}
