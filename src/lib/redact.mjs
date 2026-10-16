// PII redaction applied to transcript text before any model reads it
// (FR-PLG-012). Deterministic patterns for Australian banking contexts,
// plus names listed in the consent records. Tokens are stable so the
// citation verifier can match quotes against redacted text.

function luhn(digits) {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

function medicare(m) {
  const d = m.replace(/\D/g, '');
  const w = [1, 3, 7, 9, 1, 3, 7, 9];
  return w.reduce((sum, x, i) => sum + x * Number(d[i]), 0) % 10 === Number(d[8]);
}

// Order matters: keyworded rules (TFN, account) run before the bare digit
// patterns so "account 123 456 789" is not half-eaten as a BSB.
const RULES = [
  ['[EMAIL]', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
  // Card numbers: 13–19 digits with optional spaces/dashes, Luhn-checked.
  ['[CARD]', /\b(?:\d[ -]?){12,18}\d\b/g, (m) => luhn(m.replace(/\D/g, ''))],
  // Tax file number: "TFN" or "tax file number" followed by 8–9 digits.
  ['[TFN]', /(\b(?:tfn|tax file number)(?:\s+is)?[:\s#]+)(\d{3}[ -]?\d{3}[ -]?\d{2,3})\b/gi, null, 2],
  // Account numbers following "account", "acct" or "a/c".
  ['[ACCOUNT]', /(\b(?:account|acct|a\/c)(?:\s+(?:number|no\.?|#))?(?:\s+is)?[:\s#]+)(\d(?:[ -]?\d){4,15})\b/gi, null, 2],
  // Medicare: 10 digits (4-5-1), check digit verified.
  ['[MEDICARE]', /\b[2-6]\d{3}[ -]?\d{5}[ -]?\d\b/g, medicare],
  // Australian phone numbers: 04xx xxx xxx, +61 4xx…, (02) xxxx xxxx, 1300/1800, 13 xx xx.
  ['[PHONE]', /(?:\+?61[ -]?|\b0)[2-478](?:[ -]?\d){8}\b|\(0[2-478]\)[ -]?\d(?:[ -]?\d){7}\b|\b1[38]00(?:[ -]?\d){6}\b|\b13[ -]?\d{2}[ -]?\d{2}\b/g],
  // BSB: after the word "BSB", or the strict xxx-xxx form.
  ['[BSB]', /(\bbsb(?:\s+(?:number|no\.?))?(?:\s+is)?[:\s#]*)(\d{3}[- ]?\d{3})\b/gi, null, 2],
  ['[BSB]', /\b\d{3}-\d{3}\b/g],
  // Dates of birth in d/m/y form.
  ['[DATE]', /\b\d{1,2}[/.-]\d{1,2}[/.-](?:19|20)\d{2}\b/g],
];

// Name parts that are also everyday words; redacted only when capitalised
// or next to another part of the same name, so "I will" survives "Will Smith".
const COMMON = new Set('will may june april august grace hope faith joy mark bill rose ivy dawn summer sunny rich frank art guy pat sue max ray jack ben rob chase hunter page lane dean wade bob drew gene sky river amber holly violet cliff glen heath miles norman sandy penny honey crystal'.split(' '));

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function redactText(text, names = []) {
  let out = String(text ?? '');
  const hits = {};
  for (const [token, re, check, group] of RULES) {
    out = out.replace(re, (...args) => {
      const m = args[0];
      if (check && !check(m)) return m;
      hits[token] = (hits[token] || 0) + 1;
      if (group) return `${args[1]}${token}`;
      return token;
    });
  }
  const nameParts = names.map((n) => String(n).split(/\s+/)
    .map((p) => p.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase())
    .filter((p) => p.length >= 2));
  const siblings = new Map();
  for (const ps of nameParts) for (const p of ps) {
    if (!siblings.has(p)) siblings.set(p, new Set());
    for (const q of ps) if (q !== p) siblings.get(p).add(q);
  }
  const parts = [...siblings.keys()].sort((a, b) => b.length - a.length);
  if (!parts.length) return { text: out, hits };
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${parts.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  const src = out;
  out = src.replace(re, (m, at) => {
    const p = m.toLowerCase();
    if (COMMON.has(p) && m[0] === m[0].toLowerCase()) {
      const prev = src.slice(0, at).match(/([\p{L}\p{N}'’-]+)\s+$/u)?.[1]?.toLowerCase();
      const next = src.slice(at + m.length).match(/^\s+([\p{L}\p{N}'’-]+)/u)?.[1]?.toLowerCase();
      const sib = siblings.get(p);
      if (!sib.has(prev) && !sib.has(next)) return m;
    }
    hits['[NAME]'] = (hits['[NAME]'] || 0) + 1;
    return '[NAME]';
  });
  return { text: out, hits };
}

export function redactTranscript(transcript, names = []) {
  const totals = {};
  const utterances = transcript.utterances.map((u) => {
    const { text, hits } = redactText(u.text, names);
    for (const [k, v] of Object.entries(hits)) totals[k] = (totals[k] || 0) + v;
    // Speaker names are replaced by roles; real names never reach the model.
    return { id: u.id, role: u.role ?? 'unknown', start_ms: u.start_ms, end_ms: u.end_ms, text };
  });
  return { transcript: { source: transcript.source, redacted: true, utterances }, totals };
}
