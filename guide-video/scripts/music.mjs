// Original background score, synthesised in code (no samples, no licensing).
// node scripts/music.mjs <out.wav> <seconds> [revealSeconds] [seed]
// Layers: warm detuned pad with a slow filter sweep, sub bass, soft kick,
// off-beat hats, a plucked arpeggio, and a noise riser into the reveal.
import fs from "node:fs";

const [out, secArg, revealArg = "0", seedArg = "1"] = process.argv.slice(2);
const SR = 44100;
const seconds = Number(secArg);
const reveal = Number(revealArg);
const N = Math.ceil(seconds * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);
let s = Number(seedArg) * 9301 + 49297;
const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280) * 2 - 1;

const bpm = 96;
const beat = 60 / bpm;
const bar = 4 * beat;
const midi = (m) => 440 * 2 ** ((m - 69) / 12);
// D minor, lifting: Dm, Bb, F, C (one chord per bar)
const chords = [[50, 53, 57, 62], [46, 50, 53, 58], [53, 57, 60, 65], [48, 52, 55, 60]];
const chordAt = (t) => chords[Math.floor(t / bar) % chords.length];
// Energy: pads only at first, drums enter after the reveal (or 6 s), everything fades at the end.
const drumsFrom = reveal > 0 ? reveal : 6;
const fadeOut = (t) => Math.min(1, Math.max(0, (seconds - t) / 3));
const fadeIn = (t) => Math.min(1, t / 2.5);

const add = (i, l, r) => { if (i >= 0 && i < N) { L[i] += l; R[i] += r; } };

// Pad: three detuned saws per chord note, one-pole low-pass that opens over time.
for (let i = 0, lpL = 0, lpR = 0, l2L = 0, l2R = 0, ph = new Float64Array(24); i < N; i++) {
  const t = i / SR;
  const notes = chordAt(t);
  let vl = 0; let vr = 0;
  notes.forEach((m, k) => {
    for (let d = 0; d < 3; d++) {
      const f = midi(m) * (1 + (d - 1) * 0.004);
      const idx = k * 3 + d;
      ph[idx] = (ph[idx] + f / SR) % 1;
      const saw = ph[idx] * 2 - 1;
      if (d === 0) vl += saw; else if (d === 2) vr += saw; else { vl += saw * 0.5; vr += saw * 0.5; }
    }
  });
  const open = 0.02 + 0.06 * (0.5 + 0.5 * Math.sin(t * 0.35)) + (t > drumsFrom ? 0.03 : 0);
  lpL += open * (vl - lpL); lpR += open * (vr - lpR);
  l2L += open * (lpL - l2L); l2R += open * (lpR - l2R); // second pole: warmer, less fizz
  const env = 0.07 * fadeIn(t) * fadeOut(t);
  L[i] += l2L * env; R[i] += l2R * env;
}

// Sub bass on the chord root, every beat once drums are in.
for (let b = 0; b * beat < seconds; b++) {
  const t0 = b * beat;
  if (t0 < drumsFrom - bar) continue;
  const f = midi(chordAt(t0)[0] - 12);
  for (let j = 0; j < beat * SR; j++) {
    const t = j / SR;
    const v = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 3) * 0.16 * fadeOut(t0 + t);
    add(Math.floor(t0 * SR) + j, v, v);
  }
}

// Kick on every beat and hats on the off-beats, after the reveal.
for (let b = 0; b * beat < seconds; b++) {
  const t0 = b * beat;
  if (t0 < drumsFrom) continue;
  const base = Math.floor(t0 * SR);
  for (let j = 0, p = 0; j < 0.35 * SR; j++) {
    const t = j / SR;
    p += (2 * Math.PI * (45 + 90 * Math.exp(-t * 28))) / SR;
    const v = Math.sin(p) * Math.exp(-t * 9) * 0.32 * fadeOut(t0);
    add(base + j, v, v);
  }
  const hb = Math.floor((t0 + beat / 2) * SR);
  for (let j = 0, hp = 0, prev = 0; j < 0.06 * SR; j++) {
    const n = rnd(); hp = 0.85 * (hp + n - prev); prev = n;
    const v = hp * Math.exp(-(j / SR) * 70) * 0.05 * fadeOut(t0);
    add(hb + j, v * 0.8, v);
  }
}

// Plucked arpeggio in eighths, chord tones up an octave, from the second bar.
for (let e = 0; e * beat / 2 < seconds; e++) {
  const t0 = (e * beat) / 2;
  if (t0 < bar) continue;
  const notes = chordAt(t0);
  const f = midi(notes[[0, 2, 1, 3, 2, 1, 3, 2][e % 8]] + 12);
  const pan = 0.5 + 0.35 * Math.sin(e * 0.9);
  const base = Math.floor(t0 * SR);
  for (let j = 0; j < 0.5 * SR; j++) {
    const t = j / SR;
    const tri = 2 * Math.abs(2 * ((f * t) % 1) - 1) - 1;
    const v = tri * Math.exp(-t * 7) * 0.05 * fadeIn(t0) * fadeOut(t0);
    add(base + j, v * (1 - pan), v * pan);
  }
}

// Riser into the reveal: filtered noise swelling over two bars, then a soft boom.
if (reveal > 0) {
  const start = Math.max(0, reveal - 2 * bar);
  for (let i = Math.floor(start * SR), lp = 0; i < reveal * SR && i < N; i++) {
    const k = (i / SR - start) / (reveal - start);
    lp += (0.01 + 0.12 * k) * (rnd() - lp);
    const v = lp * k * k * k * 0.12;
    add(i, v, v);
  }
  for (let j = 0, p = 0; j < 1.6 * SR; j++) {
    const t = j / SR;
    p += (2 * Math.PI * (38 + 60 * Math.exp(-t * 6))) / SR;
    const v = Math.sin(p) * Math.exp(-t * 2.2) * 0.5;
    add(Math.floor(reveal * SR) + j, v, v);
  }
}

// Normalise, soft-clip and write 16-bit stereo WAV.
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const g = 0.9 / (peak || 1);
const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(Math.tanh(L[i] * g) * 32000), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.tanh(R[i] * g) * 32000), 46 + i * 4);
}
fs.writeFileSync(out, buf);
console.log(`${out}: ${seconds.toFixed(1)} s`);
