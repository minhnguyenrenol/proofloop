// Report: only human-accepted insights appear (FR-PLG-005). Numbers are
// computed here, from the folder, never taken from model text.

import fs from 'node:fs';
import path from 'node:path';
import { studyDir, listSessions, readJson, writeText } from './folder.mjs';
import { adjustedWald, susScore, meanCi90, geoMeanCi90, median } from './stats.mjs';
import { groupStats, draftAgreement } from './board.mjs';
import { parseContext } from './context.mjs';
import { esc, mdToHtml } from './markdown.mjs';

export function computeInsightStats(board, insight) {
  const s = groupStats(board, { note_ids: insight.note_ids }, { counterNoteIds: insight.counter_note_ids ?? [] });
  // A finding seen in only one of two independent runs can't be high (H.5).
  if (insight.stable === false && s.confidence === 'high') s.confidence = 'medium';
  return s;
}

// Task results (FR-SYN-001). Criteria-based success and self-reported
// completion are kept apart:
//  - criteria task (reachNode / urlMatches): success when the runner saw the
//    target (task_end.reached, a success_reached event, or outcome
//    'completed', which the runner only sends for these tasks once reached);
//  - self-report task (selfReport, or no criteria at all): the participant
//    saying they finished is a self-reported completion, not a success.
// A task_start with no task_end (session closed or interrupted) is an
// attempt without success, counted as abandoned. Times are for successful
// (or, on self-report tasks, self-reported) attempts only.
const OUTCOMES = ['completed', 'completed_unverified', 'gave_up', 'timeout', 'abandoned'];

export function taskMetrics(root, slug, study) {
  const tasks = study.spec.blocks.filter((b) => b.type === 'task');
  const sessions = listSessions(root, slug);
  const rows = tasks.map((t) => {
    const selfReport = !t.success || t.success.selfReport === true;
    let n = 0; let ok = 0; const seq = []; const secs = [];
    const outcomes = Object.fromEntries(OUTCOMES.map((o) => [o, 0]));
    for (const p of sessions) {
      const ev = readJson(path.join(studyDir(root, slug), 'sessions', p, 'events.json'), { events: [] }).events;
      const end = ev.find((e) => e.type === 'task_end' && e.task_id === t.id);
      const start = ev.find((e) => e.type === 'task_start' && e.task_id === t.id);
      if (!end && !start) continue;
      n++;
      const outcome = end ? (OUTCOMES.includes(end.outcome) ? end.outcome : 'completed_unverified') : 'abandoned';
      outcomes[outcome]++;
      const reached = !!end && (end.reached === true || ev.some((e) => e.type === 'success_reached' && e.task_id === t.id));
      const success = selfReport ? outcome === 'completed' : reached || outcome === 'completed';
      if (success) { ok++; if (start && end && !end.no_time) secs.push((end.t_ms - start.t_ms) / 1000); }
      const a = readJson(path.join(studyDir(root, slug), 'sessions', p, 'answers.json'), null);
      const seqQ = (t.followUps ?? []).find((f) => f.type === 'seq');
      if (seqQ && Number.isFinite(a?.answers?.[seqQ.id])) seq.push(a.answers[seqQ.id]);
    }
    const rate = n ? adjustedWald(ok, n) : null;
    return {
      id: t.id,
      instruction: t.instruction,
      n,
      self_report: selfReport,
      success: selfReport ? null : rate,
      self_reported: selfReport ? rate : null,
      outcomes,
      seq: meanCi90(seq, { min: 1, max: 7 }),
      time_s: geoMeanCi90(secs),
      median_s: median(secs),
    };
  });
  const sus = [];
  const susBlock = study.spec.blocks.find((b) => b.type === 'question' && b.questionType === 'sus');
  if (susBlock) for (const p of sessions) {
    const a = readJson(path.join(studyDir(root, slug), 'sessions', p, 'answers.json'), null);
    if (Array.isArray(a?.answers?.[susBlock.id])) { try { sus.push(susScore(a.answers[susBlock.id])); } catch { /* incomplete */ } }
  }
  return { tasks: rows, sus: sus.length ? meanCi90(sus, { min: 0, max: 100 }) : null };
}

const pct = (x) => `${Math.round(x * 100)}%`;
const fmtT = (ms) => new Date(ms).toISOString().slice(11, 19);

export function renderReport({ root, slug, study }) {
  const dir = studyDir(root, slug);
  const board = readJson(path.join(dir, 'affinity', 'board.json'));
  if (board.status !== 'done') throw new Error('The affinity board is not marked done yet. Finish it on the board first.');
  const insDoc = readJson(path.join(dir, 'insights.json'));
  if (insDoc.stale) throw new Error(`Insights are out of date (${insDoc.stale}). Re-run synthesis first.`);
  const insights = insDoc.insights;
  const review = readJson(path.join(dir, 'review.json'), { decisions: {} }).decisions;
  const accepted = insights.filter((i) => ['accepted', 'edited'].includes(review[i.id]?.decision)).map((i) => ({ ...i, ...(review[i.id]?.decision === 'edited' ? review[i.id].edited : {}) }));
  const pending = insights.filter((i) => !review[i.id]).length;
  if (!accepted.length) throw new Error(`No accepted insights yet (${pending} waiting for review). Run review-findings first.`);
  const order = { contradicts: 0, new: 1, extends: 2, confirms: 3 };
  const sevOrder = { critical: 0, major: 1, minor: 2, cosmetic: 3 };
  accepted.sort((a, b) => (order[a.context_relation.type] - order[b.context_relation.type]) || ((sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9)));
  const metrics = taskMetrics(root, slug, study);
  const ctxFile = path.join(dir, 'context', 'context.md');
  const ctx = fs.existsSync(ctxFile) ? parseContext(fs.readFileSync(ctxFile, 'utf8')) : null;
  const changes = readJson(path.join(dir, 'context-changes.json'), null);
  const log = fs.existsSync(path.join(dir, 'log.jsonl')) ? fs.readFileSync(path.join(dir, 'log.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const rejectedCitations = log.filter((l) => l.step === 'observations_submit').reduce((a, l) => a + (l.rejected ?? 0), 0);
  const economy = study.spec.model.economyMode;
  const agreement = draftAgreement(board);
  const noteById = new Map(board.notes.map((n) => [n.id, n]));
  const utt = (p, id) => readJson(path.join(dir, 'sessions', p, 'transcript.redacted.json'), { utterances: [] }).utterances.find((u) => u.id === id);

  const md = [];
  md.push(`# ${study.metadata.name}: findings`, '');
  md.push(`${study.spec.mode === 'moderated' ? 'Moderated' : 'Unmoderated'} study · ${board.n_included} participants · report generated ${new Date().toISOString().slice(0, 10)}${economy ? ' · **Economy mode: lower-quality model used**' : ''}`, '');
  md.push(`**Goal:** ${study.spec.goal}`, '');
  md.push('AI drafted the notes, groups and insights from verified evidence; a researcher reviewed the affinity board and accepted every insight below. Counts and confidence are computed from the evidence, not written by the AI.', '');
  const stats = new Map(accepted.map((i) => [i.id, computeInsightStats(board, i)]));
  const top = [...accepted].sort((a, b) => ((sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9)) || (stats.get(b.id).sessions - stats.get(a.id).sessions)).slice(0, 3);
  md.push('## Summary', '');
  for (const i of top) md.push(`- **${i.title}** (${stats.get(i.id).n_of_N} participants, ${stats.get(i.id).confidence} confidence${i.severity ? `, ${i.severity}` : ''})`);
  md.push('');
  md.push('## Insights', '');
  const rel = { contradicts: 'Contradicts product context', new: 'New: not in product context', extends: 'Extends product context', confirms: 'Confirms product context' };
  for (const i of accepted) {
    const s = stats.get(i.id);
    md.push(`### ${i.kind === 'pain_point' ? 'Pain point' : 'Opportunity'}: ${i.title}`, '');
    md.push(`${i.kind === 'pain_point' ? `**Severity:** ${i.severity} · ` : ''}**Seen in:** ${s.n_of_N} participants · **Confidence:** ${s.confidence} · **${rel[i.context_relation.type]}**${i.context_relation.ctx_ids?.length ? ` (${i.context_relation.ctx_ids.join(', ')})` : ''}`, '');
    md.push(i.statement, '');
    if (i.hmw) md.push(`**${i.hmw}**`, '');
    const quotes = i.note_ids.map((n) => noteById.get(n)).filter(Boolean).flatMap((n) => (n.evidence ?? []).filter((e) => e.kind === 'quote').map((e) => ({ p: n.participant, e }))).slice(0, 4);
    for (const q of quotes) { const u = utt(q.p, q.e.utterance_ids?.[0] ?? q.e.utterance_id); md.push(`> "${q.e.quote}" (${q.p}${u ? `, ${fmtT(u.start_ms)}` : ''})`, ''); }
    const counter = (i.counter_note_ids ?? []).map((n) => noteById.get(n)).filter(Boolean);
    if (counter.length) {
      md.push(`**Counter-evidence:** ${s.counter_sessions} participant${s.counter_sessions === 1 ? '' : 's'} did or said the opposite.`, '');
      for (const n of counter.slice(0, 2)) md.push(`- ${n.text} (${n.participant})`);
      md.push('');
    }
    if (i.recommendation) md.push(`**Recommendation:** ${i.recommendation}`, '');
  }
  md.push('## Task results', '');
  const fmtS = (x) => `${x < 10 ? x.toFixed(1) : Math.round(x)} s`;
  const outcomeLabel = { completed_unverified: 'said done, target not reached', gave_up: 'gave up', timeout: 'timed out', abandoned: 'abandoned (session ended mid-task)' };
  md.push('| Task | Attempts | Success (90% CI) | Time, successful attempts: geometric mean (90% CI) · median | Ease, SEQ 1–7 (90% CI) | Not completed |', '|---|---|---|---|---|---|');
  for (const t of metrics.tasks) {
    const r = t.success ?? t.self_reported;
    const sc = r ? `${pct(r.rate)} (${pct(r.low)}–${pct(r.high)})${t.self_report ? ' self-reported' : ''}${r.small_sample ? ' · small sample' : ''}` : 'n/a';
    const tm = t.time_s ? `${fmtS(t.time_s.geo_mean)}${t.time_s.low != null ? ` (${fmtS(t.time_s.low)}–${fmtS(t.time_s.high)})` : ''} · median ${fmtS(t.median_s)}${t.time_s.small_sample ? ' · small sample' : ''}` : 'n/a';
    const seq = t.seq ? `${t.seq.mean.toFixed(1)}${t.seq.low != null ? ` (${t.seq.low.toFixed(1)}–${t.seq.high.toFixed(1)})` : ''}${t.seq.n < 5 ? ' · small sample' : ''}` : 'n/a';
    const nc = Object.entries(outcomeLabel).filter(([o]) => t.outcomes[o]).map(([o, l]) => `${t.outcomes[o]} ${l}`).join(', ') || 'none';
    md.push(`| ${t.instruction} | ${t.n} | ${sc} | ${tm} | ${seq} | ${nc} |`);
  }
  md.push('');
  md.push('Success is criteria-based: the prototype recorded the participant reaching the target. Tasks marked "self-reported" have no target to check, so their rate is people saying they finished and is not comparable with criteria-based success.', '');
  if (metrics.sus) md.push(`**SUS:** ${metrics.sus.mean.toFixed(1)}${metrics.sus.low != null ? ` (90% CI ${metrics.sus.low.toFixed(1)}–${metrics.sus.high.toFixed(1)})` : ''}, n = ${metrics.sus.n}${metrics.sus.small_sample ? ' (fewer than 10 people: treat as indicative only)' : ''}`, '');
  md.push('## Affinity map', '');
  for (const t of board.themes) {
    md.push(`### Theme: ${t.label}`, '');
    for (const gid of t.group_ids) { const g = board.groups.find((x) => x.id === gid); if (g) md.push(`- ${g.label} (${groupStats(board, g).n_of_N})`); }
    md.push('');
  }
  if (changes?.changes?.length && ctx) {
    md.push('## What changed after testing', '');
    const decided = changes.changes.filter((c) => ['accepted', 'edited'].includes(c.decision));
    for (const c of decided) {
      const it = ctx.items.find((x) => x.id === (c.ctx_id ?? c.parent));
      const after = c.decision === 'edited' && c.edited_after ? c.edited_after : c.after;
      md.push(`- **${c.action === 'add' ? 'Added' : c.action === 'remove' ? 'Removed' : c.action === 'set_status' ? `Marked ${c.status}` : 'Changed'}** ${c.ctx_id ?? c.new_id}${it ? ` (${it.title ?? it.text})` : ''}`);
      if (c.action === 'modify' || c.action === 'remove') md.push(`  - Before: ${it?.text ?? c.before}`);
      if (after) md.push(`  - After: ${after}`);
      md.push(`  - Because of: ${c.insight_ids.join(', ')}`);
    }
    md.push('');
  }
  const lowConf = accepted.filter((i) => stats.get(i.id).confidence === 'low');
  const openQ = insDoc.open_questions ?? [];
  if (openQ.length || lowConf.length) {
    md.push('## Questions for further research', '');
    for (const q of openQ) md.push(`- ${q.question} ${q.why}`);
    for (const i of lowConf) md.push(`- Needs more evidence: "${i.title}" was seen in ${stats.get(i.id).n_of_N} participants. Check it in the next round before acting on it alone.`);
    md.push('');
  }
  md.push('## Method and limits', '');
  md.push(`- Participants: ${board.n_included} (${study.spec.participants.type}). Small samples find problems well but don't measure how common they are; the ranges above show the uncertainty.`);
  md.push(`- AI: ${study.spec.model.research}${economy ? ' (economy mode)' : ''}${study.spec.model.account ? `, through the approved ${study.spec.model.account} account` : ''}. ${rejectedCitations} AI observations were rejected for citations that did not match the evidence.`);
  md.push(`- Researcher changes to the AI's grouping: ${pct(agreement.notes_moved_share)} of notes were moved to a different group by the researcher (adjusted Rand index ${agreement.adjusted_rand_index.toFixed(2)} between the AI draft and the final board).`);
  md.push('- Results are not split by user segment: with fewer than 5 people per segment, differences between groups can\'t be told apart from chance.');
  md.push('- No facial expression or emotion analysis was used. Feelings are reported only in participants\' own words.');
  if (pending) md.push(`- ${pending} insight(s) were not reviewed and are not shown.`);
  const mdText = md.join('\n');
  writeText(path.join(dir, 'report.md'), `${mdText}\n`);

  // HTML version: every Markdown section in the same order, with the
  // "What changed" section shown side by side instead of as a list.
  const changesHtml = () => '<section><h2>What changed after testing</h2>' + changes.changes.filter((c) => ['accepted', 'edited'].includes(c.decision)).map((c) => {
    const it = ctx.items.find((x) => x.id === (c.ctx_id ?? c.parent));
    const after = c.decision === 'edited' && c.edited_after ? c.edited_after : c.after;
    const before = c.action === 'add' ? '<em>Not in the product context</em>' : esc(it?.text ?? c.before ?? '');
    const aft = c.action === 'remove' ? '<em>Removed</em>' : c.action === 'set_status' ? `${esc(it?.text ?? '')} <strong>(${esc(c.status)})</strong>` : `<mark>${esc(after)}</mark>`;
    return `<div class="change"><div class="ba"><div><h3>Before</h3><p>${before}</p></div><div><h3>After</h3><p>${aft}</p></div></div><p class="why">${esc(c.ctx_id ?? c.new_id)} · because of ${c.insight_ids.map((x) => `<a href="#${esc(x)}">${esc(x)}</a>`).join(', ')}</p></div>`;
  }).join('') + '</section>';
  const ids = accepted.map((i) => i.id);
  let k = 0;
  const parts = mdText.split(/\n(?=## )/);
  const bodyWithIds = parts.map((part) => {
    const heading = part.match(/^## (.+)$/m)?.[1];
    if (heading === 'What changed after testing' && changes?.changes?.length && ctx) return changesHtml();
    let h = mdToHtml(part).replace(/<h3>(Pain point|Opportunity):/g, (m) => `<h3 id="${esc(ids[k++] ?? '')}">${m.slice(4)}`);
    if (heading === 'Task results') h = h.replace('<table>', '<div class="scroll"><table><caption>Task success, time on task and ease, with 90% confidence intervals</caption>').replace('</table>', '</table></div>');
    return h;
  }).join('\n');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(study.metadata.name)}: findings</title><style>
:root{--bg:#fff;--text:#1d1d1b;--muted:#55554f;--line:#d9d9d3;--mark:#fff1b8;--accent:#0b57d0}
@media (prefers-color-scheme:dark){:root{--bg:#151514;--text:#ecece8;--muted:#b5b5ad;--line:#3a3a36;--mark:#5a4a00;--accent:#8ab4f8}}
body{font:16px/1.55 system-ui,sans-serif;max-width:900px;margin:32px auto;padding:0 16px;background:var(--bg);color:var(--text)}
h1{font-size:28px}h2{margin-top:40px;border-bottom:1px solid var(--line);padding-bottom:4px}h3{margin-top:28px}
blockquote{color:var(--muted);border-left:3px solid var(--line);margin:8px 0;padding:2px 12px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}.scroll{overflow-x:auto}caption{text-align:left;font-size:13px;color:var(--muted);padding:0 0 6px}
.ba{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ba>div{border:1px solid var(--line);border-radius:8px;padding:8px 12px}.ba h3{margin:0 0 4px;font-size:13px;color:var(--muted)}
.change{margin:16px 0}.why{font-size:13px;color:var(--muted)}mark{background:var(--mark);color:inherit}a{color:var(--accent)}
@media (max-width:640px){.ba{grid-template-columns:1fr}}
</style></head><body><main>${bodyWithIds}</main></body></html>`;
  writeText(path.join(dir, 'report.html'), html);
  return { files: ['report.md', 'report.html'], insights: accepted.length, pending_review: pending };
}
