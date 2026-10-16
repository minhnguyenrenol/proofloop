// Compare task success between two versions of a study (PRD H.6):
// Newcombe's hybrid score interval for a difference of two proportions.

import { taskMetrics } from './report.mjs';

const Z = { 0.9: 1.6448536269514722, 0.95: 1.959963984540054 };

export function wilson(x, n, level = 0.9) {
  const z = Z[level];
  const p = x / n;
  const den = 1 + (z * z) / n;
  const mid = (p + (z * z) / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return { low: Math.max(0, mid - half), high: Math.min(1, mid + half) };
}

// Difference p2 - p1 (after minus before), Newcombe method 10.
export function newcombeDiff(x1, n1, x2, n2, level = 0.9) {
  if (!(n1 > 0 && n2 > 0)) throw new Error('both versions need at least one attempt');
  const p1 = x1 / n1; const p2 = x2 / n2;
  const a = wilson(x1, n1, level); const b = wilson(x2, n2, level);
  const d = p2 - p1;
  return {
    diff: d,
    low: d - Math.sqrt((p2 - b.low) ** 2 + (a.high - p1) ** 2),
    high: d + Math.sqrt((b.high - p2) ** 2 + (p1 - a.low) ** 2),
    level,
  };
}

export function compareStudies({ root, before, after }) {
  const m1 = taskMetrics(root, before.metadata.slug, before);
  const m2 = taskMetrics(root, after.metadata.slug, after);
  const rows = [];
  for (const t2 of m2.tasks) {
    // Only tasks worded identically compare like with like.
    const t1 = m1.tasks.find((t) => t.instruction.trim() === t2.instruction.trim());
    if (!t1) { rows.push({ task: t2.instruction, compared: false, reason: 'new or reworded task' }); continue; }
    const r1 = t1.success ?? t1.self_reported; const r2 = t2.success ?? t2.self_reported;
    if (!r1 || !r2 || t1.self_report !== t2.self_report) { rows.push({ task: t2.instruction, compared: false, reason: !r1 || !r2 ? 'no attempts in one version' : 'success measured differently' }); continue; }
    const x1 = Math.round(r1.rate * t1.n); const x2 = Math.round(r2.rate * t2.n);
    const d = newcombeDiff(x1, t1.n, x2, t2.n);
    const verdict = d.low > 0 ? 'improved' : d.high < 0 ? 'got worse' : d.diff > 0 ? 'better in this sample, but the range includes no change' : d.diff < 0 ? 'worse in this sample, but the range includes no change' : 'no change in this sample';
    rows.push({ task: t2.instruction, compared: true, self_reported: t2.self_report, before: `${x1} of ${t1.n}`, after: `${x2} of ${t2.n}`, difference_pts: Math.round(d.diff * 100), ci90_pts: [Math.round(d.low * 100), Math.round(d.high * 100)], verdict });
  }
  const sus = m1.sus && m2.sus ? { before: Number(m1.sus.mean.toFixed(1)), after: Number(m2.sus.mean.toFixed(1)), n: [m1.sus.n, m2.sus.n] } : null;
  return { before: before.metadata.slug, after: after.metadata.slug, tasks: rows, sus, note: 'Differences are in percentage points with a 90% Newcombe interval. Small samples rarely show a clear difference; report "better in this sample" unless the verdict says improved.' };
}
