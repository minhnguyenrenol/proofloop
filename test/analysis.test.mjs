// Analysis fixes: context changes, board ops and agreement, task metrics,
// report structure (PRD H.5, H.6, FR-SYN-001, FR-PLG-019/021).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseContext, validateChanges, applyChanges } from '../src/lib/context.mjs';
import { createBoard, applyOp, groupStats, draftAgreement } from '../src/lib/board.mjs';
import { geoMeanCi90, median, confidence } from '../src/lib/stats.mjs';
import { taskMetrics, renderReport } from '../src/lib/report.mjs';

const CTX = `# Product context: Savings

## Product vision {#ctx-vision}

_Not provided._

## Target users and personas {#ctx-personas}

### First-home buyer {#ctx-persona-1}
- Wants to know borrowing power {#ctx-persona-1-goal-1} [src: entered:Minh:2026-10-16] [status: assumption]
- Compares rates across banks {#ctx-persona-1-goal-2} [src: entered:Minh:2026-10-16] [status: contradicted]
`;

test('context changes: ctx_id must be a bullet, and ids are unique within a change set', () => {
  const doc = parseContext(CTX);
  const ok = new Set(['ins-1']);
  const errs = (changes) => validateChanges({ changes }, doc, ok).join('\n');
  assert.match(errs([{ id: 'c1', action: 'set_status', ctx_id: 'ctx-persona-1', status: 'validated', insight_ids: ['ins-1'] }]), /is a heading/);
  assert.equal(errs([{ id: 'c1', action: 'add', parent: 'ctx-persona-1', new_id: 'ctx-persona-1-goal-3', after: 'x', insight_ids: ['ins-1'] }]), '', 'heading may be a parent of an add');
  assert.equal(errs([{ id: 'c1', action: 'add', parent: 'ctx-vision', new_id: 'ctx-vision-1', after: 'x', insight_ids: ['ins-1'] }]), '', 'section may be a parent of an add');
  assert.match(errs([
    { id: 'c1', action: 'modify', ctx_id: 'ctx-persona-1-goal-1', after: 'x', insight_ids: ['ins-1'] },
    { id: 'c2', action: 'remove', ctx_id: 'ctx-persona-1-goal-1', insight_ids: ['ins-1'] },
  ]), /also changed by change c1/);
  assert.match(errs([
    { id: 'c1', action: 'add', parent: 'ctx-vision', new_id: 'ctx-vision-1', after: 'x', insight_ids: ['ins-1'] },
    { id: 'c2', action: 'add', parent: 'ctx-vision', new_id: 'ctx-vision-1', after: 'y', insight_ids: ['ins-1'] },
  ]), /also added by change c1/);
  assert.match(errs([{ id: 'c1', action: 'modify', ctx_id: 'ctx-persona-1-goal-1', after: 'x', status: 'sure', insight_ids: ['ins-1'] }]), /status must be/);
  assert.throws(() => applyChanges(CTX, { changes: [{ id: 'c1', decision: 'accepted', action: 'set_status', ctx_id: 'ctx-persona-1', status: 'validated', insight_ids: ['ins-1'] }] }, 's'), /not a bullet item/);
});

test('context changes: modify keeps the existing status; add defaults to validated', () => {
  const out = applyChanges(CTX, { changes: [
    { id: 'c1', decision: 'accepted', action: 'modify', ctx_id: 'ctx-persona-1-goal-2', after: 'Compares rates only within one bank', insight_ids: ['ins-1'] },
    { id: 'c2', decision: 'accepted', action: 'modify', ctx_id: 'ctx-persona-1-goal-1', after: 'Wants borrowing power first', status: 'validated', insight_ids: ['ins-1'] },
    { id: 'c3', decision: 'accepted', action: 'add', parent: 'ctx-vision', new_id: 'ctx-vision-1', after: 'Clear rates', insight_ids: ['ins-1'] },
  ] }, 'savings-v1');
  assert.match(out, /Compares rates only within one bank \{#ctx-persona-1-goal-2\} \[src: entered:Minh:2026-10-16; study:savings-v1\] \[status: contradicted\]/);
  assert.match(out, /Wants borrowing power first \{#ctx-persona-1-goal-1\} .*\[status: validated\]/);
  assert.match(out, /Clear rates \{#ctx-vision-1\} \[src: study:savings-v1\] \[status: validated\]/);
  assert.ok(!/Not provided/.test(out.split('## Target')[0]), 'vision is no longer "not provided"');
});

function makeBoard(groupCount = 10, perGroup = 3) {
  const notes = [];
  const groups = [];
  for (let g = 0; g < groupCount; g++) {
    const ids = [];
    for (let k = 0; k < perGroup; k++) {
      const id = `o${g}-${k}`;
      ids.push(id);
      notes.push({ id, participant: `P${k + 1}`, type: 'quote', text: 't', evidence: [{ kind: 'quote', quote: 'q' }] });
    }
    groups.push({ id: `g${g}`, label: `People said thing number ${g}`, note_ids: ids });
  }
  const { board, errors } = createBoard({ study: 's', notes, draft: { groups }, nIncluded: 3 });
  assert.ok(board, errors?.join('\n'));
  return board;
}

test('board: merging a group into itself is refused and keeps its notes', () => {
  const board = makeBoard(2, 2);
  assert.throws(() => applyOp(board, { op: 'merge_groups', into: 'g0', from: 'g0' }), /two different groups/);
  assert.deepEqual(board.groups.find((g) => g.id === 'g0').note_ids, ['o0-0', 'o0-1']);
  applyOp(board, { op: 'merge_groups', into: 'g0', from: 'g1' });
  assert.equal(board.groups.length, 1);
  assert.equal(board.groups[0].note_ids.length, 4);
});

test('H.5 has_behaviour: behaviour notes or event evidence, not frames on a quote', () => {
  const board = { n_included: 3, notes: [
    { id: 'a', participant: 'P1', type: 'quote', evidence: [{ kind: 'quote' }, { kind: 'frame', frame: '2:10' }] },
    { id: 'b', participant: 'P2', type: 'behaviour', evidence: [{ kind: 'frame', frame: '2:10' }] },
    { id: 'c', participant: 'P3', type: 'expectation', evidence: [{ kind: 'event', event_id: 'e1' }] },
  ] };
  assert.equal(groupStats(board, { note_ids: ['a'] }).has_behaviour, false);
  assert.equal(groupStats(board, { note_ids: ['a', 'b'] }).has_behaviour, true);
  assert.equal(groupStats(board, { note_ids: ['c'] }).has_behaviour, true);
});

test('draft agreement: dissolving 3 of 10 groups moves 30% of notes', () => {
  const board = makeBoard();
  const same = draftAgreement(board);
  assert.equal(same.rand_index, 1);
  assert.equal(same.adjusted_rand_index, 1);
  assert.equal(same.notes_moved_share, 0);
  for (const g of ['g7', 'g8', 'g9']) applyOp(board, { op: 'delete_group', group_id: g });
  const a = draftAgreement(board);
  assert.ok(a.rand_index > 0.95, `rand index stays misleadingly high (${a.rand_index})`);
  assert.equal(a.notes_moved, 9);
  assert.ok(Math.abs(a.notes_moved_share - 0.3) < 1e-9);
  assert.ok(a.adjusted_rand_index < 0.9 && a.adjusted_rand_index > 0);
});

test('draft agreement: a group rebuilt under a new id is matched, not counted as moved', () => {
  const board = makeBoard(3, 3);
  applyOp(board, { op: 'create_group', id: 'gx', label: 'People said the same again' });
  for (const n of ['o2-0', 'o2-1', 'o2-2']) applyOp(board, { op: 'move_note', note_id: n, to: 'gx' });
  applyOp(board, { op: 'delete_group', group_id: 'g2' });
  const a = draftAgreement(board);
  assert.equal(a.notes_moved_share, 0);
  assert.equal(a.adjusted_rand_index, 1);
  // Moving one note to another group is one move.
  applyOp(board, { op: 'move_note', note_id: 'o0-0', to: 'g1' });
  assert.equal(draftAgreement(board).notes_moved, 1);
});

test('H.6 stats: median of even counts, geometric mean with CI on log times', () => {
  assert.equal(median([10, 20]), 15);
  assert.equal(median([30, 10, 20]), 20);
  assert.equal(median([]), null);
  const g = geoMeanCi90([10, 40]);
  assert.ok(Math.abs(g.geo_mean - 20) < 1e-9);
  assert.ok(g.low < 20 && g.high > 20 && g.low > 0);
  assert.ok(Math.abs(Math.log(g.high) - Math.log(20) - (Math.log(20) - Math.log(g.low))) < 1e-9, 'symmetric on the log scale');
  assert.equal(geoMeanCi90([12]).low, null);
  assert.equal(geoMeanCi90([]), null);
  // Low is checked before high: 1 session of 3 is low even with behaviour and quote.
  assert.equal(confidence({ sessions: 1, nIncluded: 3, hasBehaviour: true, hasVerbal: true }), 'low');
});

function writeJson(f, x) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(x)); }

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-analysis-'));
  const dir = path.join(root, 'st');
  const study = {
    metadata: { name: 'Savings' },
    spec: {
      mode: 'unmoderated', goal: 'Find the rate', participants: { type: 'customers' }, model: { research: 'model-x', economyMode: false },
      blocks: [
        { type: 'task', id: 't1', instruction: 'Find the rate.', success: { reachNode: '2:20' }, followUps: [] },
        { type: 'task', id: 't2', instruction: 'Pick an account you like.', success: { selfReport: true }, followUps: [] },
      ],
    },
  };
  const ev = {
    P1: [
      { type: 'task_start', task_id: 't1', t_ms: 0 }, { type: 'success_reached', task_id: 't1', t_ms: 5000 }, { type: 'task_end', task_id: 't1', t_ms: 10000, outcome: 'completed_unverified', reached: false },
      { type: 'task_start', task_id: 't2', t_ms: 20000 }, { type: 'task_end', task_id: 't2', t_ms: 30000, outcome: 'completed' },
    ],
    P2: [
      { type: 'task_start', task_id: 't1', t_ms: 0 }, { type: 'task_end', task_id: 't1', t_ms: 20000, outcome: 'completed', reached: true },
      { type: 'task_start', task_id: 't2', t_ms: 25000 }, { type: 'task_end', task_id: 't2', t_ms: 30000, outcome: 'gave_up' },
    ],
    P3: [
      { type: 'task_start', task_id: 't1', t_ms: 0 }, { type: 'task_end', task_id: 't1', t_ms: 9000, outcome: 'completed_unverified', reached: false },
    ],
    P4: [{ type: 'task_start', task_id: 't1', t_ms: 0 }],
  };
  for (const [p, events] of Object.entries(ev)) writeJson(path.join(dir, 'sessions', p, 'events.json'), { events });
  return { root, dir, study };
}

test('FR-SYN-001 task metrics: criteria success, self-report apart, abandoned counted', () => {
  const { root, study } = fixture();
  const [t1, t2] = taskMetrics(root, 'st', study).tasks;
  assert.equal(t1.n, 4, 'started-but-unfinished counts as an attempt');
  assert.equal(t1.outcomes.abandoned, 1);
  assert.equal(t1.success.rate, 0.5, 'P1 via success_reached, P2 via reached; P3 unverified and P4 abandoned are not');
  assert.equal(t1.self_reported, null);
  assert.equal(t1.median_s, 15, 'times for successes only: 10 s and 20 s');
  assert.ok(Math.abs(t1.time_s.geo_mean - Math.sqrt(200)) < 1e-9);
  assert.equal(t2.self_report, true);
  assert.equal(t2.success, null, 'self-report is never shown as criteria success');
  assert.equal(t2.self_reported.rate, 0.5);
  assert.equal(t2.median_s, 10);
});

test('report: every section survives in HTML in Markdown order; a11y structure', () => {
  const { root, dir, study } = fixture();
  const notes = [
    { id: 'n1', participant: 'P1', type: 'behaviour', text: 'x', evidence: [{ kind: 'event', event_id: 'e1' }] },
    { id: 'n2', participant: 'P2', type: 'quote', text: 'y', evidence: [{ kind: 'quote', quote: 'Where is it' }] },
  ];
  const groups = [{ id: 'g1', label: 'People could not find it', note_ids: ['n1', 'n2'] }];
  writeJson(path.join(dir, 'affinity', 'board.json'), { status: 'done', n_included: 4, notes, groups, themes: [{ id: 't1', label: 'Finding', group_ids: ['g1'] }], unsorted: [], ai_draft: { groups, themes: [], unsorted: [] } });
  writeJson(path.join(dir, 'insights.json'), {
    insights: [
      { id: 'ins-a', kind: 'pain_point', severity: 'major', title: 'Rate is hidden', statement: 'S', note_ids: ['n1', 'n2'], context_relation: { type: 'contradicts', ctx_ids: ['ctx-persona-1-goal-1'] } },
      { id: 'ins-b', kind: 'opportunity', title: 'Show the rate', statement: 'S', note_ids: ['n2'], context_relation: { type: 'new' } },
    ],
    open_questions: [{ question: 'Does it change who applies?', why: 'Unclear.' }],
  });
  writeJson(path.join(dir, 'review.json'), { decisions: { 'ins-a': { decision: 'accepted' }, 'ins-b': { decision: 'accepted' } } });
  fs.mkdirSync(path.join(dir, 'context'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'context', 'context.md'), CTX);
  writeJson(path.join(dir, 'context-changes.json'), { changes: [{ id: 'c1', decision: 'accepted', action: 'modify', ctx_id: 'ctx-persona-1-goal-1', after: 'Wants the rate first', insight_ids: ['ins-a'] }] });
  renderReport({ root, slug: 'st', study });
  const md = fs.readFileSync(path.join(dir, 'report.md'), 'utf8');
  const html = fs.readFileSync(path.join(dir, 'report.html'), 'utf8');
  const mdSections = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  const htmlSections = [...html.matchAll(/<h2>(.+?)<\/h2>/g)].map((m) => m[1]);
  assert.deepEqual(htmlSections, mdSections);
  assert.ok(mdSections.includes('Questions for further research') && mdSections.includes('What changed after testing'));
  assert.match(html, /<body><main>[\s\S]*<\/main><\/body>/);
  assert.match(html, /<h3>Before<\/h3><p>Wants to know borrowing power<\/p>/);
  assert.match(html, /<h3>After<\/h3><p><mark>Wants the rate first<\/mark><\/p>/);
  assert.ok(!html.includes('<h4>'));
  assert.match(html, /\.ba h3\{/);
  assert.match(html, /<table><caption>[^<]+<\/caption>/);
  assert.match(html, /<h3 id="ins-a">Pain point: Rate is hidden/);
  assert.match(html, /<h3 id="ins-b">Opportunity: Show the rate/);
  assert.match(md, /\| Find the rate\. \| 4 \| 50% \(/);
  assert.match(md, /\| Pick an account you like\. \| 2 \| 50% \([^)]+\) self-reported/);
  assert.match(md, /1 abandoned/);
  assert.match(md, /0% of notes were moved to a different group by the researcher/);
});

test('H.6 re-test comparison: Newcombe interval for a difference of proportions', async () => {
  const { newcombeDiff, wilson } = await import('../src/lib/compare.mjs');
  // Newcombe (1998) example 1 at 95%: 56/70 vs 48/80 gives 0.2 (0.0524, 0.3339).
  const d = newcombeDiff(48, 80, 56, 70, 0.95);
  assert.ok(Math.abs(d.diff - 0.2) < 1e-9);
  assert.ok(Math.abs(d.low - 0.0524) < 0.0006 && Math.abs(d.high - 0.3339) < 0.0006, `${d.low} ${d.high}`);
  const w = wilson(0, 5);
  assert.equal(w.low, 0);
  assert.ok(w.high > 0.3 && w.high < 0.4);
});
