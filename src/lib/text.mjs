// Text normalisation shared by the citation verifier and parsers.
// Quotes must be verbatim, but transcripts and model output differ in
// typography (curly quotes, dashes, whitespace), so both sides are
// normalised the same way before comparison. Words are never changed.

const MAP = [
  [/[‘’‚‛′]/g, "'"],
  [/[“”„‟″]/g, '"'],
  [/[–—−]/g, '-'],
  [/…/g, '...'],
  [/ /g, ' '],
];

export function normalise(s) {
  let out = String(s ?? '');
  for (const [re, rep] of MAP) out = out.replace(re, rep);
  return out
    .toLowerCase()
    .replace(/[.,!?;:"()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A quote may skip words with "..." (an ellipsis). Each fragment must
// appear in the source, in order.
export function quoteFragments(quote) {
  let q = String(quote ?? '');
  for (const [re, rep] of MAP) q = q.replace(re, rep);
  return q
    .split(/\.\.\.|\[\.\.\.\]/)
    .map(normalise)
    .filter((f) => f.length > 0);
}

// Words an ellipsis may not skip: dropping them would invert the meaning
// ("I would ... use this" from "I would never use this").
const NEGATIONS = new Set(['not', 'never', 'no', 'nor', 'none', 'nothing', 'nobody', 'nowhere', 'neither', 'dont', 'cant', 'wont', 'didnt', 'isnt', 'wasnt', 'couldnt', 'wouldnt', 'shouldnt', 'doesnt', 'arent', 'werent', 'hasnt', 'havent', 'hadnt', 'aint', 'cannot']);
const isNegation = (w) => NEGATIONS.has(w) || /n't$/.test(w);

// Fragments match whole words only, so "like the colours" is not found in
// "I really dislike the colours".
export function containsInOrder(source, quote) {
  const src = ` ${normalise(source)} `;
  const frags = quoteFragments(quote);
  if (frags.length === 0) return false;
  // Try each occurrence, so a negation in one gap does not hide a clean
  // match further on.
  const match = (i, from) => {
    if (i === frags.length) return true;
    const needle = ` ${frags[i]} `;
    for (let at = src.indexOf(needle, from); at >= 0; at = src.indexOf(needle, at + 1)) {
      if (i > 0 && src.slice(from, at).split(' ').some(isNegation)) return false;
      if (match(i + 1, at + needle.length - 1)) return true;
    }
    return false;
  };
  return match(0, 0);
}

export function wordCount(s) {
  return normalise(s).split(' ').filter(Boolean).length;
}
