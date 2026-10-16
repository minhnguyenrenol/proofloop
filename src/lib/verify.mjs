// Evidence lock (FR-PLG-005, FR-SYN-007). Every observation must cite
// utterances, events or frames that exist in its session, and every quote
// must appear verbatim (after typographic normalisation) in the cited
// participant utterance. Items that fail are rejected, never repaired.

import { containsInOrder, wordCount } from './text.mjs';

const OBS_TYPES = new Set(['behaviour', 'quote', 'expectation', 'preference', 'bug', 'positive', 'suggestion']);

export function indexSession({ transcript, events, frames }) {
  return {
    utt: new Map((transcript?.utterances ?? []).map((u) => [u.id, u])),
    evt: new Map((events?.events ?? []).map((e) => [e.id, e])),
    frm: new Map((frames?.frames ?? []).map((f) => [f.id, f])),
  };
}

export function verifyEvidence(ev, idx) {
  const errors = [];
  if (ev.kind === 'quote') {
    const ids = ev.utterance_ids ?? (ev.utterance_id ? [ev.utterance_id] : []);
    if (!ids.length) errors.push('quote has no utterance_ids');
    const utts = ids.map((id) => idx.utt.get(id));
    ids.forEach((id, i) => { if (!utts[i]) errors.push(`unknown utterance ${id}`); });
    const found = utts.filter(Boolean);
    for (const u of found) {
      if (u.role === 'moderator') errors.push(`${u.id} is moderator speech, not participant evidence`);
      else if (u.role !== 'participant') errors.push(`${u.id} has role ${u.role ?? 'unknown'}; only participant speech is evidence`);
    }
    const part = found.filter((u) => u.role === 'participant');
    if (!ev.quote || !String(ev.quote).trim()) errors.push('quote text missing');
    else if (part.length && !containsInOrder(part.map((u) => u.text).join(' '), ev.quote)) {
      errors.push(`quote not verbatim in ${ids.join(',')}`);
    }
  } else if (ev.kind === 'event') {
    if (!idx.evt.get(ev.event_id)) errors.push(`unknown event ${ev.event_id}`);
  } else if (ev.kind === 'frame') {
    if (!idx.frm.get(ev.frame_id)) errors.push(`unknown frame ${ev.frame_id}`);
  } else errors.push(`unknown evidence kind ${ev.kind}`);
  return errors;
}

export function verifyObservations(doc, session) {
  const idx = indexSession(session);
  const accepted = [];
  const rejected = [];
  const seen = new Set();
  for (const o of doc.observations ?? []) {
    const errors = [];
    if (!o.id || seen.has(o.id)) errors.push('missing or duplicate id');
    seen.add(o.id);
    if (!OBS_TYPES.has(o.type)) errors.push(`type must be one of ${[...OBS_TYPES].join(', ')}`);
    if (!o.text || wordCount(o.text) > 40) errors.push('text missing or over 40 words');
    if (!Array.isArray(o.evidence) || o.evidence.length === 0) errors.push('no evidence');
    for (const ev of o.evidence ?? []) errors.push(...verifyEvidence(ev, idx));
    if (o.type === 'behaviour' && !(o.evidence ?? []).some((e) => e.kind === 'event' || e.kind === 'frame')) {
      errors.push('behaviour needs an event or frame');
    }
    (errors.length ? rejected : accepted).push(errors.length ? { id: o.id, errors, observation: o } : o);
  }
  return { accepted, rejected };
}

// Insight-level check: each cited note must exist on the reviewed board,
// and each quote the insight repeats must belong to one of its notes.
export function verifyInsights(doc, board) {
  const notes = new Map(board.notes.map((n) => [n.id, n]));
  const groups = new Map(board.groups.map((g) => [g.id, g]));
  const accepted = [];
  const rejected = [];
  const seen = new Set();
  for (const ins of doc.insights ?? []) {
    const errors = [];
    if (ins.id != null && seen.has(ins.id)) errors.push(`duplicate id ${ins.id}`);
    seen.add(ins.id);
    if (!['pain_point', 'opportunity'].includes(ins.kind)) errors.push('kind must be pain_point or opportunity');
    if (!ins.title || !ins.statement) errors.push('title and statement required');
    if (ins.kind === 'opportunity' && !/^how might we/i.test(ins.hmw ?? '')) errors.push('opportunity needs a "How might we…" prompt');
    if (ins.kind === 'pain_point' && !['critical', 'major', 'minor', 'cosmetic'].includes(ins.severity)) errors.push('pain point needs severity critical|major|minor|cosmetic');
    const gids = ins.group_ids ?? [];
    if (!gids.length) errors.push('no group_ids');
    for (const g of gids) if (!groups.has(g)) errors.push(`unknown group ${g}`);
    const nids = ins.note_ids?.length ? ins.note_ids : gids.flatMap((g) => groups.get(g)?.note_ids ?? []);
    for (const n of nids) if (!notes.has(n)) errors.push(`unknown note ${n}`);
    for (const n of ins.counter_note_ids ?? []) {
      if (!notes.has(n)) errors.push(`unknown counter note ${n}`);
      else if (nids.includes(n)) errors.push(`note ${n} can't be both evidence and counter-evidence`);
    }
    for (const q of ins.quotes ?? []) {
      const ok = nids.some((n) => (notes.get(n)?.evidence ?? []).some((e) => e.kind === 'quote' && containsInOrder(e.quote, q)));
      if (!ok) errors.push(`quote "${String(q).slice(0, 40)}" is not from this insight's notes`);
    }
    const rel = ins.context_relation;
    if (!rel || !['confirms', 'contradicts', 'extends', 'new'].includes(rel.type)) errors.push('context_relation.type must be confirms|contradicts|extends|new');
    else if (rel.type !== 'new' && !(rel.ctx_ids ?? []).length) errors.push(`${rel.type} needs ctx_ids`);
    (errors.length ? rejected : accepted).push(errors.length ? { id: ins.id, errors, insight: ins } : { ...ins, note_ids: nids });
  }
  return { accepted, rejected };
}
