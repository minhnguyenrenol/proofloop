// Media helpers. FFmpeg and whisper.cpp are external programs the
// research-setup skill checks for; nothing here uploads media anywhere.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  if (r.error) throw new Error(`${cmd} not available: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} failed: ${(r.stderr || '').split('\n').slice(-5).join(' ')}`);
  return r.stdout;
}

// Recordings can come from participants' browsers, so check the file is
// really a media container before FFmpeg sees it (FFmpeg guesses formats
// from content, and a playlist disguised as .webm could read local files).
export function assertMediaFile(file) {
  const fd = fs.openSync(file, 'r');
  const b = Buffer.alloc(12);
  fs.readSync(fd, b, 0, 12, 0);
  fs.closeSync(fd);
  const ok = b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) // WebM / Matroska
    || b.subarray(4, 8).toString('latin1') === 'ftyp' // MP4, M4A, MOV
    || (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WAVE')
    || b.subarray(0, 4).toString('latin1') === 'OggS'
    || b.subarray(0, 3).toString('latin1') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
  if (!ok) throw new Error(`${path.basename(file)} is not a recognised audio or video file`);
}
// Input options for every FFmpeg call: local files only, no network or playlists.
const input = (file) => { assertMediaFile(file); return ['-protocol_whitelist', 'file', '-i', file]; };

export function which(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split('\n')[0].trim() : null;
}

export function probe(file) {
  assertMediaFile(file);
  const out = run('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file', '-show_entries', 'format=duration,size:stream=index,codec_type,codec_name,width,height', '-of', 'json', file]);
  const j = JSON.parse(out);
  return {
    duration_s: Number(j.format?.duration ?? 0),
    size_bytes: Number(j.format?.size ?? 0),
    streams: (j.streams ?? []).map((s) => ({ index: s.index, type: s.codec_type, codec: s.codec_name, width: s.width, height: s.height })),
  };
}

// WebM pieces from one MediaRecorder run join byte-for-byte; FFmpeg then
// remuxes them so the result has a correct duration and seek index.
export function assembleChunks(chunkFiles, outFile) {
  const joined = `${outFile}.joined.webm`;
  const fd = fs.openSync(joined, 'w');
  for (const c of chunkFiles) fs.writeSync(fd, fs.readFileSync(c));
  fs.closeSync(fd);
  run('ffmpeg', ['-y', '-v', 'error', '-f', 'matroska', ...input(joined), '-c', 'copy', outFile]);
  fs.rmSync(joined);
  return outFile;
}

export function extractFrame(video, tMs, outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  run('ffmpeg', ['-y', '-v', 'error', '-ss', (tMs / 1000).toFixed(3), ...input(video), '-frames:v', '1', '-vf', 'scale=1280:-2', outFile]);
  return outFile;
}

export function extractAudio16k(inputFile, outWav, { channel } = {}) {
  const args = ['-y', '-v', 'error', ...input(inputFile), '-vn', '-ac', '1', '-ar', '16000'];
  if (channel != null) args.push('-af', `pan=mono|c0=c${Number(channel)}`);
  run('ffmpeg', [...args, outWav]);
  return outWav;
}

// Local transcription with whisper.cpp (whisper-cli). Returns utterances
// with millisecond times; speaker comes from which track the audio was on.
export function transcribeLocal(wav, { modelPath, language = 'en', speaker = 'unknown', bin = which('whisper-cli') ?? which('whisper-cpp') }) {
  if (!bin) throw new Error('whisper.cpp (whisper-cli) is not installed. See docs/setup.md, or import a transcript from the call tool.');
  if (!modelPath || !fs.existsSync(modelPath)) throw new Error(`Whisper model not found at ${modelPath}`);
  const base = wav.replace(/\.wav$/, '');
  run(bin, ['-m', modelPath, '-f', wav, '-l', language, '-oj', '-of', base]);
  const j = JSON.parse(fs.readFileSync(`${base}.json`, 'utf8'));
  return (j.transcription ?? []).map((seg) => ({
    speaker,
    start_ms: seg.offsets?.from ?? 0,
    end_ms: seg.offsets?.to ?? 0,
    text: String(seg.text ?? '').trim(),
  })).filter((u) => u.text);
}

// Interleave per-track transcripts (moderator mic, participant system
// audio) into one transcript ordered by time.
export function mergeTracks(...tracks) {
  return tracks.flat().sort((a, b) => a.start_ms - b.start_ms);
}
