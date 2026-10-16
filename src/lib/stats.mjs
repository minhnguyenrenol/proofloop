// Statistics computed in code, never by the model (PRD Appendix H.5, H.6).

const Z = { 0.9: 1.6448536269514722, 0.95: 1.959963984540054 };

// Adjusted Wald (Agresti–Coull) interval for a proportion.
export function adjustedWald(successes, n, level = 0.9) {
  if (!Number.isInteger(successes) || !Number.isInteger(n) || n <= 0 || successes < 0 || successes > n) {
    throw new Error('adjustedWald needs integers 0 <= successes <= n, n > 0');
  }
  const z = Z[level];
  if (!z) throw new Error('level must be 0.9 or 0.95');
  const nAdj = n + z * z;
  const p = (successes + (z * z) / 2) / nAdj;
  const half = z * Math.sqrt((p * (1 - p)) / nAdj);
  return { rate: successes / n, low: Math.max(0, p - half), high: Math.min(1, p + half), level, n, small_sample: n < 5 };
}

// System Usability Scale: 10 items scored 1–5.
export function susScore(items) {
  if (!Array.isArray(items) || items.length !== 10 || items.some((v) => !Number.isInteger(v) || v < 1 || v > 5)) {
    throw new Error('SUS needs 10 integer answers from 1 to 5');
  }
  const sum = items.reduce((acc, v, i) => acc + (i % 2 === 0 ? v - 1 : 5 - v), 0);
  return sum * 2.5;
}

function tQuantile90(df) {
  // Two-sided 90% critical values; enough precision for small studies.
  const t = { 1: 6.314, 2: 2.92, 3: 2.353, 4: 2.132, 5: 2.015, 6: 1.943, 7: 1.895, 8: 1.86, 9: 1.833, 10: 1.812, 15: 1.753, 20: 1.725, 30: 1.697 };
  if (t[df]) return t[df];
  const keys = Object.keys(t).map(Number).sort((a, b) => a - b);
  // Between table rows use the smaller df (wider, conservative interval).
  const k = keys.filter((x) => x <= df).pop();
  return df > 30 ? 1.645 + 1.6 / df : t[k];
}

export function meanCi90(values, { min = -Infinity, max = Infinity } = {}) {
  const n = values.length;
  if (n === 0) return null;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (n === 1) return { mean, low: null, high: null, n, small_sample: true };
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));
  const half = tQuantile90(n - 1) * (sd / Math.sqrt(n));
  // Clamp to the scale's possible range (a 1–7 rating can't average 13).
  return { mean, low: Math.max(min, mean - half), high: Math.min(max, mean + half), n, small_sample: n < 10 };
}

// Time on task (H.6): geometric mean with a 90% t-interval computed on
// log times, then transformed back. Times must be positive; anything else
// is ignored rather than breaking the log.
export function geoMeanCi90(values) {
  const logs = (values ?? []).filter((v) => Number.isFinite(v) && v > 0).map((v) => Math.log(v));
  const ci = meanCi90(logs);
  if (!ci) return null;
  return { geo_mean: Math.exp(ci.mean), low: ci.low == null ? null : Math.exp(ci.low), high: ci.high == null ? null : Math.exp(ci.high), n: ci.n, small_sample: ci.n < 5 };
}

export function median(values) {
  const v = (values ?? []).filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// Confidence rule, exactly as PRD H.5.
export function confidence({ sessions, nIncluded, hasBehaviour, hasVerbal, counterSessions = 0, stable = true }) {
  const share = nIncluded > 0 ? sessions / nIncluded : 0;
  const strongCounter = counterSessions >= Math.max(2, 0.5 * sessions);
  // Low is checked before high on purpose: one session is low even when it
  // is 30%+ of a tiny study (1 of 3) and has both behaviour and a quote.
  if (sessions === 1 || (!hasBehaviour && share < 0.3) || strongCounter) return 'low';
  if ((sessions >= 3 || share >= 0.3) && hasBehaviour && hasVerbal && !strongCounter && stable) return 'high';
  return 'medium';
}
