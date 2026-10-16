// Original sound effects, synthesised in code: node scripts/sfx.mjs
// Writes public/sfx/{whoosh,pop,click,type,impact,chime}.wav (mono, 44.1 kHz).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44100;
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public/sfx");
fs.mkdirSync(dir, { recursive: true });
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

function write(name, seconds, fn) {
  const n = Math.ceil(seconds * SR);
  const data = new Float32Array(n);
  const state = {};
  for (let i = 0; i < n; i++) data[i] = fn(i / SR, state, seconds);
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  const g = 0.89 / (peak || 1);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  data.forEach((v, i) => buf.writeInt16LE(Math.round(Math.tanh(v * g) * 32000), 44 + i * 2));
  fs.writeFileSync(path.join(dir, `${name}.wav`), buf);
}

// Whoosh: band-passed noise sweeping up then down, swelling and fading.
write("whoosh", 0.7, (t, s, d) => {
  const x = t / d;
  const f = 0.04 + 0.35 * Math.sin(Math.PI * x);
  s.lp = (s.lp ?? 0) + f * (rnd() - (s.lp ?? 0));
  s.lp2 = (s.lp2 ?? 0) + f * (s.lp - (s.lp2 ?? 0));
  return (s.lp - s.lp2) * Math.sin(Math.PI * x) ** 1.5;
});
// Pop: a quick pitched blip with a fast pitch drop.
write("pop", 0.18, (t, s) => {
  s.p = (s.p ?? 0) + (2 * Math.PI * (420 + 900 * Math.exp(-t * 60))) / SR;
  return Math.sin(s.p) * Math.exp(-t * 30);
});
// Click: a short, bright tick for UI presses.
write("click", 0.05, (t) => rnd() * Math.exp(-t * 300) * 0.6 + Math.sin(2 * Math.PI * 2400 * t) * Math.exp(-t * 200));
// Type: a softer key tap.
write("type", 0.04, (t) => rnd() * Math.exp(-t * 400) * 0.5 + Math.sin(2 * Math.PI * 1500 * t) * Math.exp(-t * 300) * 0.4);
// Impact: deep thump with a noise transient, for reveals.
write("impact", 1.4, (t, s) => {
  s.p = (s.p ?? 0) + (2 * Math.PI * (40 + 80 * Math.exp(-t * 9))) / SR;
  return Math.sin(s.p) * Math.exp(-t * 2.6) + rnd() * Math.exp(-t * 40) * 0.4;
});
// Chime: soft bell partials, for a positive confirmation.
write("chime", 1.0, (t) => (Math.sin(2 * Math.PI * 1318.5 * t) + 0.6 * Math.sin(2 * Math.PI * 1975.5 * t) + 0.3 * Math.sin(2 * Math.PI * 2637 * t)) * Math.exp(-t * 4.5) * Math.min(1, t * 400));
console.log(`sfx written to ${dir}`);
