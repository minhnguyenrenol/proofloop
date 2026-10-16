// Affinity board (FR-PLG-019): notes → groups → themes, NN/g style.
// The model proposes groups; the researcher edits them on the board.
// Every edit is an operation recorded in history, and the AI's first
// draft is kept so its grouping can be compared with the final one.

import { adjustedWald, confidence } from './stats.mjs';

export function notesFromObservations(sessions) {
  // sessions: [{ participant, observations: [...] }]
  const notes = [];
  for (const s of sessions) {
    for (const o of s.observations) {
      notes.push({ id: o.id, participant: s.participant, task_id: o.task_id ?? null, type: o.type, text: o.text, evidence: o.evidence });
    }
  }
  return notes;
}

export function validateDraft(board) {
  const errors = [];
  const noteIds = new Set(board.notes.map((n) => n.id));
  const placed = new Map();
  const gids = new Set();
  for (const g of board.groups) {
    if (!g.id || gids.has(g.id)) errors.push(`group id missing or duplicate: ${g.id}`);
    gids.add(g.id);
    if (!g.label || g.label.trim().split(/\s+/).length < 3) errors.push(`group ${g.id}: label must be a sentence in participants' terms, not a topic word`);
    for (const n of g.note_ids ?? []) {
      if (!noteIds.has(n)) errors.push(`group ${g.id}: unknown note ${n}`);
      if (placed.has(n)) errors.push(`note ${n} is in both ${placed.get(n)} and ${g.id}`);
      placed.set(n, g.id);
    }
  }
  for (const t of board.themes ?? []) for (const g of t.group_ids ?? []) if (!gids.has(g)) errors.push(`theme ${t.id}: unknown group ${g}`);
  for (const n of board.unsorted ?? []) if (placed.has(n)) errors.push(`note ${n} is both grouped and unsorted`);
  // Notes not placed anywhere go to Unsorted rather than being forced in.
  const unsorted = [...new Set([...(board.unsorted ?? []), ...[...noteIds].filter((n) => !placed.has(n))])].filter((n) => !placed.has(n));
  return { errors, unsorted };
}

export function createBoard({ study, notes, draft, nIncluded }) {
  const board = { study, n_included: nIncluded, status: 'draft', notes, groups: draft.groups, themes: draft.themes ?? [], unsorted: [], history: [] };
  const { errors, unsorted } = validateDraft(board);
  if (errors.length) return { errors };
  board.unsorted = unsorted;
  board.ai_draft = { groups: structuredClone(board.groups), themes: structuredClone(board.themes), unsorted: [...unsorted] };
  board.history.push({ at: new Date().toISOString(), by: 'ai', op: 'draft', detail: { groups: board.groups.length, themes: board.themes.length } });
  return { board };
}

function removeNote(board, noteId) {
  for (const g of board.groups) g.note_ids = g.note_ids.filter((n) => n !== noteId);
  board.unsorted = board.unsorted.filter((n) => n !== noteId);
}

let seq = 0;
const newId = (p) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`;

// Operations the board UI sends. Each returns the board, mutated.
export function applyOp(board, op, by = 'researcher') {
  if (board.status === 'done' && op.op !== 'reopen') throw new Error('Board is marked done; reopen it to edit');
  const g = (id) => { const x = board.groups.find((y) => y.id === id); if (!x) throw new Error(`unknown group ${id}`); return x; };
  const t = (id) => { const x = board.themes.find((y) => y.id === id); if (!x) throw new Error(`unknown theme ${id}`); return x; };
  switch (op.op) {
    case 'move_note': {
      if (!board.notes.some((n) => n.id === op.note_id)) throw new Error(`unknown note ${op.note_id}`);
      removeNote(board, op.note_id);
      if (op.to === 'unsorted') board.unsorted.push(op.note_id); else g(op.to).note_ids.push(op.note_id);
      break;
    }
    case 'create_group': {
      const id = op.id ?? newId('g');
      board.groups.push({ id, label: op.label ?? 'New group: describe what people experienced', note_ids: [] });
      op.id = id;
      break;
    }
    case 'rename_group': g(op.group_id).label = op.label; break;
    case 'merge_groups': {
      const into = g(op.into);
      const from = g(op.from);
      // Merging a group into itself would delete it and lose its notes.
      if (into === from) throw new Error('Pick two different groups to merge');
      into.note_ids.push(...from.note_ids);
      board.groups = board.groups.filter((x) => x.id !== op.from);
      for (const th of board.themes) th.group_ids = [...new Set(th.group_ids.map((x) => (x === op.from ? op.into : x)))];
      break;
    }
    case 'delete_group': {
      const x = g(op.group_id);
      board.unsorted.push(...x.note_ids);
      board.groups = board.groups.filter((y) => y.id !== op.group_id);
      for (const th of board.themes) th.group_ids = th.group_ids.filter((y) => y !== op.group_id);
      break;
    }
    case 'create_theme': {
      const id = op.id ?? newId('t');
      board.themes.push({ id, label: op.label ?? 'New theme', group_ids: [] });
      op.id = id;
      break;
    }
    case 'rename_theme': t(op.theme_id).label = op.label; break;
    case 'set_group_theme': {
      g(op.group_id);
      for (const th of board.themes) th.group_ids = th.group_ids.filter((y) => y !== op.group_id);
      if (op.theme_id) t(op.theme_id).group_ids.push(op.group_id);
      break;
    }
    case 'delete_theme': board.themes = board.themes.filter((y) => y.id !== op.theme_id); break;
    case 'mark_done': {
      const empty = board.groups.filter((x) => x.note_ids.length === 0).map((x) => x.id);
      if (empty.length) throw new Error(`Remove or fill empty groups first: ${empty.join(', ')}`);
      board.status = 'done';
      break;
    }
    case 'reopen': board.status = 'draft'; break;
    default: throw new Error(`unknown op ${op.op}`);
  }
  board.history.push({ at: new Date().toISOString(), by, op: op.op, detail: op });
  return board;
}

// counterNoteIds: notes where people did or said the opposite (H.5 counter-evidence).
export function groupStats(board, group, { counterNoteIds = [] } = {}) {
  const notes = group.note_ids.map((id) => board.notes.find((n) => n.id === id)).filter(Boolean);
  const counterParticipants = [...new Set(counterNoteIds.map((id) => board.notes.find((n) => n.id === id)?.participant).filter(Boolean))];
  const participants = [...new Set(notes.map((n) => n.participant))];
  // H.5: behaviour means a behaviour observation (verified against events
  // or frames on submit) or any note citing a logged event. A frame alone
  // on, say, a quote is only where it was said, not something people did.
  const hasBehaviour = notes.some((n) => n.type === 'behaviour' || (n.evidence ?? []).some((e) => e.kind === 'event'));
  const hasVerbal = notes.some((n) => (n.evidence ?? []).some((e) => e.kind === 'quote'));
  const N = board.n_included;
  return {
    participants,
    sessions: participants.length,
    n_of_N: `${participants.length} of ${N}`,
    ci90: N > 0 && participants.length <= N ? adjustedWald(participants.length, N) : null,
    has_behaviour: hasBehaviour,
    has_verbal: hasVerbal,
    counter_sessions: counterParticipants.length,
    confidence: confidence({ sessions: participants.length, nIncluded: N, hasBehaviour, hasVerbal, counterSessions: counterParticipants.length }),
  };
}

export function boardSummary(board) {
  const groups = board.groups.map((g) => ({ id: g.id, label: g.label, notes: g.note_ids.length, ...groupStats(board, g) }));
  const themes = board.themes.map((t) => {
    const union = { note_ids: t.group_ids.flatMap((gid) => board.groups.find((g) => g.id === gid)?.note_ids ?? []) };
    return { id: t.id, label: t.label, group_ids: t.group_ids, ...groupStats(board, union) };
  });
  return { status: board.status, n_included: board.n_included, groups, themes, unsorted: board.unsorted.length };
}

// How far the researcher's final grouping moved from the AI draft.
// Clusters are the groups plus Unsorted as one more cluster.
//  - rand_index: share of note pairs whose together/apart relation is the
//    same. Kept for compatibility, but most pairs are apart in both, so it
//    stays near 1 even after big changes.
//  - adjusted_rand_index: Rand corrected for chance (1 = same grouping,
//    about 0 = no better than random).
//  - notes_moved_share: share of notes that ended up in a different group.
//    Draft and final groups are paired by the best one-to-one match on
//    shared notes (Unsorted always pairs with Unsorted), so a group that
//    was deleted and rebuilt under a new id, or merged in either direction,
//    counts only the notes that really changed company.
const UNSORTED = '\u0000unsorted';

function clusters(groups, unsorted, ids) {
  const m = new Map();
  for (const g of groups ?? []) for (const n of g.note_ids ?? []) if (!m.has(n)) m.set(n, g.id);
  for (const n of unsorted ?? []) if (!m.has(n)) m.set(n, UNSORTED);
  for (const n of ids) if (!m.has(n)) m.set(n, UNSORTED);
  return m;
}

const choose2 = (x) => (x * (x - 1)) / 2;

// Maximum-weight one-to-one assignment (Hungarian method, minimising the
// negated weights on a square matrix padded with zeros).
function bestMatch(w) {
  const n = Math.max(w.length, w[0]?.length ?? 0);
  if (!n) return 0;
  const cost = (i, j) => -((w[i - 1] ?? [])[j - 1] ?? 0);
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0);
  const way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost(i0, j) - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  let total = 0;
  for (let j = 1; j <= n; j++) if (p[j]) total += (w[p[j] - 1] ?? [])[j - 1] ?? 0;
  return total;
}

export function draftAgreement(board) {
  const ids = board.notes.map((n) => n.id);
  const a = clusters(board.ai_draft?.groups, board.ai_draft?.unsorted, ids);
  const b = clusters(board.groups, board.unsorted, ids);
  let same = 0;
  let total = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      // Unsorted notes are not "together" for the legacy Rand index.
      const ta = a.get(ids[i]) !== UNSORTED && a.get(ids[i]) === a.get(ids[j]);
      const tb = b.get(ids[i]) !== UNSORTED && b.get(ids[i]) === b.get(ids[j]);
      total++;
      if (ta === tb) same++;
    }
  }
  // Contingency table: draft cluster x final cluster.
  const table = new Map();
  for (const n of ids) {
    const key = `${a.get(n)}\u0001${b.get(n)}`;
    table.set(key, (table.get(key) ?? 0) + 1);
  }
  const rows = new Map();
  const cols = new Map();
  for (const n of ids) { rows.set(a.get(n), (rows.get(a.get(n)) ?? 0) + 1); cols.set(b.get(n), (cols.get(b.get(n)) ?? 0) + 1); }
  const sumIJ = [...table.values()].reduce((s, x) => s + choose2(x), 0);
  const sumA = [...rows.values()].reduce((s, x) => s + choose2(x), 0);
  const sumB = [...cols.values()].reduce((s, x) => s + choose2(x), 0);
  const expected = total ? (sumA * sumB) / total : 0;
  const maxIdx = (sumA + sumB) / 2;
  const ari = maxIdx === expected ? (sumIJ === maxIdx ? 1 : 0) : (sumIJ - expected) / (maxIdx - expected);
  // Notes kept together: Unsorted with Unsorted, plus the best match of
  // the remaining draft groups to the remaining final groups.
  const kept0 = table.get(`${UNSORTED}\u0001${UNSORTED}`) ?? 0;
  const ra = [...rows.keys()].filter((k) => k !== UNSORTED);
  const cb = [...cols.keys()].filter((k) => k !== UNSORTED);
  const w = ra.map((r) => cb.map((c) => table.get(`${r}\u0001${c}`) ?? 0));
  const kept = kept0 + (ra.length && cb.length ? bestMatch(w) : 0);
  return {
    rand_index: total ? same / total : 1,
    adjusted_rand_index: ids.length ? ari : 1,
    notes_moved_share: ids.length ? (ids.length - kept) / ids.length : 0,
    notes_moved: ids.length - kept,
    notes: ids.length,
    pairs: total,
  };
}
