// study.yaml: schema (strict) and research-quality linter (FR-STU).

import { z } from 'zod';
import YAML from 'yaml';

const followUp = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  type: z.enum(['seq', 'open_text', 'single_choice', 'rating']),
  text: z.string().optional(),
  options: z.array(z.string()).optional(),
  required: z.boolean().default(false),
}).strict();

const success = z.object({
  reachNode: z.string().optional(),
  urlMatches: z.string().optional(),
  selfReport: z.boolean().optional(),
}).strict();

const block = z.discriminatedUnion('type', [
  z.object({ id: z.string(), type: z.literal('instructions'), text: z.string().min(1) }).strict(),
  z.object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    type: z.literal('task'),
    instruction: z.string().min(5),
    scenario: z.string().optional(),
    start: z.object({ figmaNode: z.string().optional(), path: z.string().optional() }).strict().optional(),
    success: success.optional(),
    maxSeconds: z.number().int().min(30).max(1800).default(300),
    answers: z.array(z.number().int().min(0)).default([]),
    tests: z.array(z.string().regex(/^ctx-[a-z0-9-]+$/)).default([]),
    followUps: z.array(followUp).default([]),
  }).strict(),
  z.object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    type: z.literal('question'),
    questionType: z.enum(['sus', 'open_text', 'single_choice', 'rating']),
    text: z.string().optional(),
    options: z.array(z.string()).optional(),
  }).strict(),
]);

export const StudySchema = z.object({
  apiVersion: z.literal('proofloop/v1'),
  kind: z.literal('Study'),
  metadata: z.object({
    name: z.string().min(3),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    product: z.string().optional(),
    version: z.number().int().min(1).default(1),
    previousVersion: z.string().optional(),
  }).strict(),
  spec: z.object({
    mode: z.enum(['moderated', 'unmoderated']),
    goal: z.string().min(10),
    researchQuestions: z.array(z.string().min(5)).min(1),
    targetMinutes: z.number().int().min(5).max(90),
    participants: z.object({
      type: z.enum(['internal', 'customer', 'mixed']),
      target: z.number().int().min(1).max(50),
    }).strict(),
    moderators: z.array(z.string()).default([]),
    prototype: z.object({
      figma: z.string().url().optional(),
      url: z.string().url().optional(),
      github: z.string().optional(),
      figmaClientId: z.string().optional(),
    }).strict().refine((p) => p.figma || p.url || p.github, 'prototype needs figma, url or github'),
    recording: z.object({
      screen: z.boolean().default(true),
      microphone: z.boolean().default(true),
      camera: z.boolean().default(false),
    }).strict().default({}),
    consent: z.object({ version: z.string(), file: z.string().regex(/^consent\/[A-Za-z0-9_-]+\.md$/, 'must be consent/<name>.md').default('consent/consent.md') }).strict(),
    storage: z.object({
      location: z.enum(['laptop', 'drive']),
      path: z.string(),
    }).strict(),
    retention: z.object({ mediaDays: z.number().int().min(1).max(365).default(90) }).strict().default({}),
    relay: z.object({ url: z.string().url() }).strict().optional(),
    model: z.object({
      research: z.string().default('claude-opus-5-5'),
      economyMode: z.boolean().default(false),
      // FR-PLG-013: which approved model account runs the research steps.
      account: z.enum(['claude-enterprise', 'claude-team', 'api-bedrock', 'api-vertex', 'api-anthropic', 'cursor']).optional(),
    }).strict().default({}),
    blocks: z.array(block).min(1),
  }).strict(),
}).strict();

export function parseStudy(text) {
  const doc = YAML.parseDocument(text, { prettyErrors: true });
  if (doc.errors.length) return { errors: doc.errors.map((e) => `line ${e.linePos?.[0]?.line ?? '?'}: ${e.message}`) };
  const res = StudySchema.safeParse(doc.toJS());
  if (!res.success) {
    return {
      errors: res.error.issues.map((i) => {
        const node = doc.getIn(i.path, true);
        const line = node?.range ? lineOf(text, node.range[0]) : null;
        return `${line ? `line ${line}: ` : ''}${i.path.join('.')}: ${i.message}`;
      }),
    };
  }
  const study = res.data;
  const ids = new Set();
  const errors = [];
  for (const b of study.spec.blocks) {
    if (ids.has(b.id)) errors.push(`duplicate block id ${b.id}`);
    ids.add(b.id);
    for (const f of b.followUps ?? []) { if (ids.has(f.id)) errors.push(`duplicate id ${f.id}`); ids.add(f.id); }
    for (const a of b.answers ?? []) if (a >= study.spec.researchQuestions.length) errors.push(`${b.id}.answers: research question ${a} does not exist`);
  }
  return errors.length ? { errors } : { study };
}

function lineOf(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

// Research-quality lint. These are warnings a senior researcher would
// raise in a plan review; "error" ones block launch.
const LEADING = [/\bhow (easy|simple|intuitive|clear)\b/i, /\bdon't you\b/i, /\bwouldn't you\b/i, /\bdo you like\b/i, /\bisn't it\b/i];
const UI_GIVEAWAY = /\b(click|tap|press|select the|button|menu|tab|link|scroll)\b/i;

export function lintStudy(study, { contextIds = [] } = {}) {
  const issues = [];
  const add = (level, where, message) => issues.push({ level, where, message });
  const tasks = study.spec.blocks.filter((b) => b.type === 'task');
  const s = study.spec;

  if (!tasks.length) add('error', 'blocks', 'No tasks. A usability study needs at least one task.');
  s.researchQuestions.forEach((q, i) => {
    if (!tasks.some((t) => t.answers.includes(i))) add('warning', `researchQuestions[${i}]`, `No task answers "${q}". Link a task with answers: [${i}].`);
  });
  for (const t of tasks) {
    if (UI_GIVEAWAY.test(t.instruction)) add('warning', t.id, 'Task wording names UI controls ("click", "button", "menu"…). Describe the goal, not the steps, so you test whether people can find the way.');
    if (/\band\b.*\band\b/i.test(t.instruction) || t.instruction.split(/[.?!]/).filter((x) => x.trim()).length > 2) add('info', t.id, 'Task may combine several goals. One goal per task makes success clear.');
    if (s.mode === 'unmoderated' && !t.success) add('error', t.id, 'Unmoderated tasks need success criteria (reachNode, urlMatches or selfReport).');
    if (!t.followUps.some((f) => f.type === 'seq')) add('info', t.id, 'Add a Single Ease Question (SEQ) after the task to compare difficulty across tasks.');
    if (!t.scenario) add('info', t.id, 'Add a realistic scenario so the task has context and motivation.');
    for (const c of t.tests) if (contextIds.length && !contextIds.includes(c)) add('error', t.id, `tests ${c}, which is not in context.md`);
  }
  for (const b of study.spec.blocks) {
    const texts = [b.text, ...(b.followUps ?? []).map((f) => f.text)].filter(Boolean);
    for (const t of texts) {
      if (LEADING.some((re) => re.test(t))) add('warning', b.id, `Leading wording: "${t}". Ask neutrally, e.g. "How was that?"`);
      if (/\?.*\?/.test(t) || /\b(and|or)\b[^.]*\?$/i.test(t)) add('info', b.id, `"${t}" may ask two things at once.`);
    }
  }
  const minutes = tasks.reduce((a, t) => a + t.maxSeconds / 60, 0) * 0.6 + 3;
  if (minutes > s.targetMinutes * 1.25) add('warning', 'spec.targetMinutes', `Tasks likely take about ${Math.round(minutes)} min, more than the ${s.targetMinutes} min target. Cut tasks or raise the target.`);
  if (s.mode === 'unmoderated' && s.participants.target < 5) add('warning', 'spec.participants', 'Fewer than 5 participants: problems seen by 1 in 3 people are likely to be missed.');
  if (s.mode === 'moderated' && !s.moderators.length) add('error', 'spec.moderators', 'List moderator names so their speech is never counted as participant evidence.');
  if (s.participants.type !== 'internal' && s.storage.location === 'laptop') add('info', 'spec.storage', 'Customer recordings on a laptop: confirm the laptop is company-managed with disk encryption, and that the folder is backed up.');
  if (s.recording.camera && s.participants.type !== 'internal') add('warning', 'spec.recording.camera', 'Camera video of customers adds privacy risk and is not analysed (no facial or emotion analysis). Turn it off unless you need it for a highlight reel.');
  if (!s.model.account) add(s.participants.type === 'internal' ? 'warning' : 'error', 'spec.model.account', 'Record which approved model account runs the analysis (claude-enterprise, claude-team, api-bedrock, api-vertex, api-anthropic or cursor). Customer sessions need it.');
  if (s.model.economyMode) add('warning', 'spec.model', 'Economy mode: lower-quality model for research steps. Every output will be labelled.');
  if (!study.spec.blocks.some((b) => b.type === 'instructions' && /think aloud|think out loud|say what you('re| are) thinking/i.test(b.text))) {
    add('info', 'blocks', 'No think-aloud instruction found. Ask people to say what they are thinking as they go.');
  }
  return { issues, blocking: issues.filter((i) => i.level === 'error').length };
}
