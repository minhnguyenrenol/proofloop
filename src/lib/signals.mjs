// Deterministic behaviour signals (PRD Appendix H.1). These come from
// events, never from the model, and become candidate moments that the
// analysis step looks at first.

export function detectSignals(events, { speech = [] } = {}) {
  const ev = [...(events?.events ?? [])].sort((a, b) => a.t_ms - b.t_ms);
  const out = [];
  let n = 0;
  const add = (type, e, extra = {}) => out.push({ id: `s${String(++n).padStart(3, '0')}`, type, t_ms: e.t_ms, task_id: e.task_id ?? null, event_ids: extra.event_ids ?? [e.id], ...extra });

  // misclick_burst: >= 3 unhandled clicks within 10 s on the same frame/route.
  const mis = ev.filter((e) => e.type === 'click' && e.handled === false);
  for (let i = 0; i + 2 < mis.length; i++) {
    const w = mis.slice(i, i + 3);
    const sameScreen = w.every((e) => (e.frame ?? e.route) === (w[0].frame ?? w[0].route));
    if (sameScreen && w[2].t_ms - w[0].t_ms <= 10000) {
      add('misclick_burst', w[0], { event_ids: w.map((e) => e.id) });
      i += 2;
    }
  }

  // rage_click: >= 3 clicks within 700 ms within a 30 px radius.
  const clicks = ev.filter((e) => e.type === 'click' && Number.isFinite(e.x));
  for (let i = 0; i + 2 < clicks.length; i++) {
    const w = clicks.slice(i, i + 3);
    const close = w.every((e) => Math.hypot(e.x - w[0].x, e.y - w[0].y) <= 30);
    if (close && w[2].t_ms - w[0].t_ms <= 700) { add('rage_click', w[0], { event_ids: w.map((e) => e.id) }); i += 2; }
  }

  // backtrack_loop: returning to an already visited screen >= 2 times within a task.
  const byTask = new Map();
  for (const e of ev.filter((x) => x.type === 'navigate')) {
    const k = e.task_id ?? '_';
    if (!byTask.has(k)) byTask.set(k, []);
    byTask.get(k).push(e);
  }
  for (const navs of byTask.values()) {
    const visits = new Map();
    let returns = 0;
    for (const e of navs) {
      const key = e.frame ?? e.route;
      if (visits.has(key)) { returns++; if (returns === 2) add('backtrack_loop', e); }
      visits.set(key, (visits.get(key) || 0) + 1);
    }
  }

  // idle_on_task: no event for >= 20 s during a task and no speech for >= 10 s of it.
  let current = null;
  let last = null;
  for (const e of ev) {
    if (e.type === 'task_start') { current = e.task_id; last = e; continue; }
    if (current && last && e.t_ms - last.t_ms >= 20000) {
      const gapStart = last.t_ms;
      const gapEnd = e.t_ms;
      const spoke = speech.filter((s) => s.end_ms > gapStart && s.start_ms < gapEnd).reduce((a, s) => a + (Math.min(s.end_ms, gapEnd) - Math.max(s.start_ms, gapStart)), 0);
      if (gapEnd - gapStart - spoke >= 10000) add('idle_on_task', last, { duration_ms: gapEnd - gapStart, event_ids: [last.id, e.id] });
    }
    if (e.type === 'task_end') current = null;
    last = e;
  }

  // give_up / timeout from task outcomes.
  for (const e of ev.filter((x) => x.type === 'task_end' && ['gave_up', 'timeout'].includes(x.outcome))) add(e.outcome === 'gave_up' ? 'give_up' : 'timeout', e);
  for (const e of ev.filter((x) => x.type === 'js_error')) add('js_error', e);

  return out.sort((a, b) => a.t_ms - b.t_ms);
}

export function taskResults(events) {
  const res = {};
  for (const e of events?.events ?? []) {
    if (e.type === 'task_start') res[e.task_id] = { task_id: e.task_id, start_ms: e.t_ms };
    if (e.type === 'task_end' && res[e.task_id]) Object.assign(res[e.task_id], { end_ms: e.t_ms, outcome: e.outcome, duration_ms: e.t_ms - res[e.task_id].start_ms });
  }
  return Object.values(res);
}
