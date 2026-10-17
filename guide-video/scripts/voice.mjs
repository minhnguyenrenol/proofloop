// Narration: one MP3 per script line with Microsoft neural voices (edge-tts),
// then the measured lengths go to src/vo-durations.json so scenes fit the voice.
// Needs: pip install edge-tts. Usage: node scripts/voice.mjs [voice] [rate]
// e.g. node scripts/voice.mjs en-AU-NatashaNeural +4%
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const voice = process.argv[2] ?? "en-AU-NatashaNeural";
const rate = process.argv[3] ?? "+4%";
// The script is TypeScript; pull the id/text pairs out of it without a build step.
const src = fs.readFileSync(path.join(root, "src/script.ts"), "utf8");
const only = (process.env.ONLY ?? "").split(",").filter(Boolean); // e.g. ONLY=u,s regenerates just those prefixes
const lines = [...src.matchAll(/\{\s*id: "([a-z0-9]+)",\s*text:\s*"((?:[^"\\]|\\.)*)",?\s*\}/g)].map((m) => ({ id: m[1], text: m[2].replace(/\\"/g, '"') }))
  .filter((l) => !only.length || only.some((p) => l.id.startsWith(p)));

const outDir = path.join(root, "public/vo");
fs.mkdirSync(outDir, { recursive: true });
const durFile = path.join(root, "src/vo-durations.json");
const durations = fs.existsSync(durFile) ? JSON.parse(fs.readFileSync(durFile, "utf8")) : {};
for (const { id, text } of lines) {
  const out = path.join(outDir, `${id}.mp3`);
  const r = spawnSync(process.env.EDGE_TTS ?? "edge-tts", ["--voice", voice, `--rate=${rate}`, "--text", text, "--write-media", out], { encoding: "utf8" });
  if (r.status !== 0) { console.error(`${id}: edge-tts failed\n${r.stderr}`); process.exit(1); }
  const probe = spawnSync("ffmpeg", ["-hide_banner", "-i", out], { encoding: "utf8" }).stderr;
  const m = probe.match(/Duration: (\d+):(\d+):([\d.]+)/);
  durations[id] = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
  console.log(`${id}  ${durations[id]?.toFixed(2)} s  ${text}`);
}
fs.writeFileSync(path.join(root, "src/vo-durations.json"), JSON.stringify(durations, null, 2) + "\n");
