// Product context pack (FR-PLG-017, FR-PLG-021).
//
// context.md is plain Markdown with a light convention so people can edit
// it by hand and code can still check it:
//
//   ## Personas {#ctx-personas}
//   ### First-home buyer {#ctx-persona-1}
//   - Wants to know borrowing power before applying {#ctx-persona-1-goal-1} [src: doc:personas.pdf#p3] [status: assumption]
//
// Every bullet needs an id and a source. Sections with nothing in them
// say "_Not provided._" so gaps are visible and never invented.

export const SECTIONS = [
  ['ctx-vision', 'Product vision'],
  ['ctx-problem', 'Problem statement'],
  ['ctx-personas', 'Target users and personas'],
  ['ctx-journeys', 'User journeys'],
  ['ctx-goals', 'Goals and success measures'],
  ['ctx-assumptions', 'Assumptions and open questions'],
  ['ctx-constraints', 'Constraints'],
];

const STATUSES = ['assumption', 'validated', 'contradicted', 'untested'];
const ID_RE = /\{#([a-z0-9-]+)\}/;
const SRC_RE = /\[src:\s*([^\]]+)\]/;
const STATUS_RE = /\[status:\s*([a-z]+)\]/;
const EVID_RE = /\[evidence:\s*([^\]]+)\]/;

export function parseContext(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const doc = { title: null, sections: [], items: [] };
  let section = null;
  let heading = null;
  lines.forEach((line, i) => {
    const ln = i + 1;
    let m;
    if ((m = line.match(/^#\s+(.+)$/))) { doc.title = m[1].trim(); return; }
    if ((m = line.match(/^##\s+(.+?)\s*$/))) {
      const id = (m[1].match(ID_RE) || [])[1] ?? null;
      section = { id, title: m[1].replace(ID_RE, '').trim(), line: ln, headings: [], items: [], notProvided: false };
      heading = null;
      doc.sections.push(section);
      return;
    }
    if ((m = line.match(/^(#{3,4})\s+(.+?)\s*$/)) && section) {
      const id = (m[2].match(ID_RE) || [])[1] ?? null;
      heading = { id, level: m[1].length, title: m[2].replace(ID_RE, '').trim(), line: ln, section: section.id };
      section.headings.push(heading);
      doc.items.push({ kind: 'heading', ...heading });
      return;
    }
    if (/^\s*_?not provided\.?_?\s*$/i.test(line) && section) { section.notProvided = true; return; }
    if ((m = line.match(/^\s*[-*]\s+(.+)$/)) && section) {
      const raw = m[1];
      const item = {
        kind: 'item',
        id: (raw.match(ID_RE) || [])[1] ?? null,
        src: (raw.match(SRC_RE) || [])[1]?.trim() ?? null,
        status: (raw.match(STATUS_RE) || [])[1] ?? null,
        evidence: (raw.match(EVID_RE) || [])[1]?.split(',').map((s) => s.trim()) ?? [],
        text: raw.replace(ID_RE, '').replace(SRC_RE, '').replace(STATUS_RE, '').replace(EVID_RE, '').trim(),
        section: section.id,
        parent: heading?.id ?? section.id,
        line: ln,
      };
      section.items.push(item);
      doc.items.push(item);
    }
  });
  return doc;
}

export function validateContext(md, { sourceFiles = [] } = {}) {
  const doc = parseContext(md);
  const errors = [];
  const warnings = [];
  const ids = new Map();
  for (const [id, title] of SECTIONS) {
    const s = doc.sections.find((x) => x.id === id);
    if (!s) errors.push(`missing section "## ${title} {#${id}}"`);
    else if (!s.items.length && !s.notProvided) errors.push(`line ${s.line}: section ${id} is empty; add items or "_Not provided._"`);
  }
  for (const it of doc.items) {
    if (!it.id) { errors.push(`line ${it.line}: missing {#ctx-...} id`); continue; }
    if (!it.id.startsWith('ctx-')) errors.push(`line ${it.line}: id ${it.id} must start with ctx-`);
    if (ids.has(it.id)) errors.push(`line ${it.line}: duplicate id ${it.id} (also line ${ids.get(it.id)})`);
    ids.set(it.id, it.line);
    if (it.kind !== 'item') continue;
    if (!it.src) errors.push(`line ${it.line}: ${it.id} has no [src: ...]`);
    for (const src of (it.src ?? '').split(';').map((x) => x.trim()).filter(Boolean)) {
      if (src.startsWith('doc:')) {
        const file = src.slice(4).split('#')[0];
        if (sourceFiles.length && !sourceFiles.includes(file)) errors.push(`line ${it.line}: ${it.id} cites ${file}, which is not in context/sources/`);
      } else if (!/^entered:[^:]+:\d{4}-\d{2}-\d{2}$/.test(src) && !/^study:[a-z0-9-]+$/.test(src)) {
        errors.push(`line ${it.line}: source "${src}" must be doc:<file>#<where>, entered:<who>:<YYYY-MM-DD> or study:<slug>`);
      }
    }
    if (!it.status) warnings.push(`line ${it.line}: ${it.id} has no [status: ...]; treated as assumption`);
    else if (!STATUSES.includes(it.status)) errors.push(`line ${it.line}: status must be ${STATUSES.join('|')}`);
  }
  return { ok: errors.length === 0, errors, warnings, ids: [...ids.keys()], doc };
}

// --- before/after (FR-PLG-021) ---------------------------------------

export function validateChanges(changes, ctxDoc, acceptedInsightIds) {
  // Only bullets can be modified, removed or re-statused; headings and
  // sections are structure and may only be the parent of an add.
  const kinds = new Map(ctxDoc.items.map((i) => [i.id, i.kind]));
  const parents = new Set([...kinds.keys(), ...ctxDoc.sections.map((s) => s.id)]);
  const errors = [];
  const touched = new Map();
  const added = new Map();
  for (const c of changes.changes ?? []) {
    const p = `change ${c.id}`;
    if (!['modify', 'add', 'remove', 'set_status'].includes(c.action)) errors.push(`${p}: action must be modify|add|remove|set_status`);
    if (c.action === 'add') {
      if (!parents.has(c.parent)) errors.push(`${p}: parent ${c.parent} not in context`);
      if (!c.new_id || parents.has(c.new_id)) errors.push(`${p}: new_id missing or already used`);
      else if (added.has(c.new_id)) errors.push(`${p}: new_id ${c.new_id} is also added by change ${added.get(c.new_id)}`);
      else added.set(c.new_id, c.id);
    } else if (!kinds.has(c.ctx_id)) errors.push(`${p}: ctx_id ${c.ctx_id} not in context`);
    else if (kinds.get(c.ctx_id) !== 'item') errors.push(`${p}: ctx_id ${c.ctx_id} is a heading; only bullet items can be changed (use add with it as parent instead)`);
    else if (touched.has(c.ctx_id)) errors.push(`${p}: ctx_id ${c.ctx_id} is also changed by change ${touched.get(c.ctx_id)}; combine them into one change`);
    else touched.set(c.ctx_id, c.id);
    if ((c.action === 'set_status' || c.status != null) && !STATUSES.includes(c.status)) errors.push(`${p}: status must be ${STATUSES.join('|')}`);
    if (['modify', 'add'].includes(c.action) && !c.after) errors.push(`${p}: after text required`);
    if (!(c.insight_ids ?? []).length) errors.push(`${p}: must cite insight_ids`);
    for (const i of c.insight_ids ?? []) if (!acceptedInsightIds.has(i)) errors.push(`${p}: insight ${i} is not an accepted insight`);
  }
  return errors;
}

function fmtItem(text, id, src, status, evidence) {
  const ev = evidence?.length ? ` [evidence: ${evidence.join(', ')}]` : '';
  return `- ${text} {#${id}} [src: ${src}] [status: ${status ?? 'assumption'}]${ev}`;
}

// Apply accepted changes to produce the next version of context.md.
// An add is new knowledge from the study, so it defaults to validated; a
// modify rewrites the text but keeps the item's status unless the change
// sets one.
export function applyChanges(md, changes, studySlug) {
  const doc = parseContext(md);
  const lines = md.replace(/\r/g, '').split('\n');
  const accepted = (changes.changes ?? []).filter((c) => c.decision === 'accepted' || c.decision === 'edited');
  const inserts = new Map();
  for (const c of accepted) {
    const after = c.decision === 'edited' && c.edited_after ? c.edited_after : c.after;
    if (c.action === 'add') {
      const parent = doc.items.find((i) => i.id === c.parent) ?? doc.sections.find((s) => s.id === c.parent);
      const siblings = doc.items.filter((i) => i.kind === 'item' && i.parent === c.parent);
      const at = siblings.length ? siblings[siblings.length - 1].line : parent.line;
      if (!inserts.has(at)) inserts.set(at, []);
      inserts.get(at).push(fmtItem(after, c.new_id, `study:${studySlug}`, c.status ?? 'validated', c.insight_ids));
      continue;
    }
    const it = doc.items.find((i) => i.id === c.ctx_id);
    if (!it || it.kind !== 'item') throw new Error(`change ${c.id}: ctx_id ${c.ctx_id} is not a bullet item in this context`);
    const idx = it.line - 1;
    if (c.action === 'remove') lines[idx] = null;
    else if (c.action === 'modify') lines[idx] = fmtItem(after, it.id, `${it.src}; study:${studySlug}`, c.status ?? it.status, [...it.evidence, ...c.insight_ids]);
    else if (c.action === 'set_status') lines[idx] = fmtItem(it.text, it.id, it.src, c.status, [...it.evidence, ...c.insight_ids]);
  }
  const out = [];
  lines.forEach((l, i) => {
    if (l !== null) out.push(l);
    for (const ins of inserts.get(i + 1) ?? []) out.push(ins);
  });
  // A section that gains its first item is no longer "not provided".
  const np = /^\s*_?not provided\.?_?\s*$/i;
  let sectionHasItems = false;
  const result = [];
  const pending = [];
  const flush = () => { if (!sectionHasItems) result.push(...pending); pending.length = 0; };
  for (const l of out) {
    if (/^##\s/.test(l)) { flush(); sectionHasItems = false; result.push(l); continue; }
    if (np.test(l)) { pending.push(l); continue; }
    if (/^\s*[-*]\s+/.test(l)) sectionHasItems = true;
    result.push(l);
  }
  flush();
  return result.join('\n');
}

export function contextTemplate(productName) {
  return [
    `# Product context: ${productName}`,
    '',
    '<!-- Each bullet: text {#ctx-id} [src: doc:<file>#<page|section> | entered:<who>:<YYYY-MM-DD>] [status: assumption|validated] -->',
    '',
    ...SECTIONS.flatMap(([id, title]) => [`## ${title} {#${id}}`, '', '_Not provided._', '']),
  ].join('\n');
}
