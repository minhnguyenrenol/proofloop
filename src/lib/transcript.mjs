// Transcript parsers: WebVTT (Zoom, Teams, Meet exports), SRT, plain text
// ("Speaker: text" lines, optionally with [hh:mm:ss] stamps) and DOCX
// (Teams/Meet transcript documents). Output is the study-folder
// transcript.json shape:
//   { source, utterances: [{ id, speaker, start_ms, end_ms, text }] }

import { unzipSync, strFromU8 } from 'fflate';

export function parseTimestamp(ts) {
  // 00:01:02.345, 01:02.345, 00:01:02,345, 1:02:03
  const m = String(ts).trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/);
  if (!m) return null;
  const [, h, mnt, s, frac] = m;
  const ms = frac ? Number(frac.padEnd(3, '0')) : 0;
  return ((Number(h || 0) * 60 + Number(mnt)) * 60 + Number(s)) * 1000 + ms;
}

// Speaker names: Unicode letters, digits, spaces, apostrophes, dots,
// hyphens, slashes and brackets ("Jane Doe (she/her)"). Must start with a
// letter, so "10:30" and similar never parse as a speaker.
const NAME = "[\\p{L}][\\p{L}\\p{N} .'’()\\/-]{0,60}";
const SPEAKER_RE = new RegExp(`^(${NAME}):\\s+([\\s\\S]+)$`, 'u');
const NAME_STAMP_RE = new RegExp(`^(${NAME}?)\\s*\\((\\d{1,2}:\\d{2}(?::\\d{2})?)\\)\\s*:?\\s*(.*)$`, 'u');
const DOCX_HEAD_RE = new RegExp(`^(${NAME}?)\\s+(\\d{1,2}:\\d{2}(?::\\d{2})?)$`, 'u');

function splitSpeaker(text) {
  // "<v Jane Doe>Hello" (VTT voice tag) or "Jane Doe: Hello"
  const v = text.match(/^<v(?:\.[^ >]+)?\s+([^>]+)>([\s\S]*?)(?:<\/v>)?$/);
  if (v) return { speaker: v[1].trim(), text: v[2].trim() };
  const c = text.match(SPEAKER_RE);
  if (c) return { speaker: c[1].trim(), text: c[2].trim() };
  return { speaker: null, text: text.trim() };
}

function cueBlocks(raw) {
  return raw.replace(/\r/g, '').replace(/^﻿/, '').split(/\n{2,}/).map((b) => b.split('\n'));
}

function finish(utterances, source) {
  // Merge consecutive cues from the same speaker that touch (< 1.5 s gap),
  // which is how Zoom splits long turns. Ids are assigned after merging.
  const merged = [];
  for (const u of utterances) {
    if (!u.text) continue;
    const prev = merged[merged.length - 1];
    if (prev && prev.speaker === u.speaker && u.start_ms - prev.end_ms < 1500 && prev.text.length < 600) {
      prev.text = `${prev.text} ${u.text}`;
      prev.end_ms = Math.max(prev.end_ms, u.end_ms);
    } else merged.push({ ...u });
  }
  return {
    source,
    utterances: merged.map((u, i) => ({ id: `u${String(i + 1).padStart(4, '0')}`, ...u })),
  };
}

export function parseVtt(raw, source = 'vtt') {
  const out = [];
  let lastSpeaker = null;
  for (const lines of cueBlocks(raw)) {
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const [a, b] = lines[i].split('-->').map((x) => x.trim().split(/\s+/)[0]);
    const start = parseTimestamp(a);
    const end = parseTimestamp(b);
    if (start == null || end == null) continue;
    const body = lines.slice(i + 1).join(' ').trim();
    // A cue can hold several <v> voices; split it evenly between them.
    const parts = body.split(/(?=<v[\s.])/).map((p) => p.trim()).filter(Boolean);
    const step = (end - start) / (parts.length || 1);
    parts.forEach((p, k) => {
      const sp = splitSpeaker(p);
      const speaker = sp.speaker ?? lastSpeaker ?? 'unknown';
      lastSpeaker = speaker;
      out.push({ speaker, start_ms: Math.round(start + k * step), end_ms: Math.round(start + (k + 1) * step), text: sp.text.replace(/<[^>]+>/g, '').trim() });
    });
  }
  return finish(out, source);
}

export const parseSrt = (raw) => parseVtt(raw, 'srt');

export function parseText(raw, source = 'txt') {
  // Lines like "[00:01:02] Jane: text", "Jane (00:01:02): text", or "Jane: text".
  const out = [];
  let t = 0;
  for (const line of raw.replace(/\r/g, '').split('\n')) {
    const l = line.trim();
    if (!l) continue;
    let m = l.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\]?\s+(.+)$/);
    let stamp = null;
    let rest = l;
    if (m) { stamp = parseTimestamp(m[1]); rest = m[2]; }
    m = rest.match(NAME_STAMP_RE);
    if (m) { stamp = parseTimestamp(m[2]); rest = `${m[1]}: ${m[3]}`; }
    const sp = splitSpeaker(rest);
    if (stamp != null) t = stamp;
    if (!sp.speaker && out.length) { out[out.length - 1].text += ` ${sp.text}`; continue; }
    out.push({ speaker: sp.speaker ?? 'unknown', start_ms: t, end_ms: t, text: sp.text });
  }
  // Without end times, each utterance ends where the next one starts.
  for (let i = 0; i < out.length; i++) out[i].end_ms = Math.max(out[i].start_ms, out[i + 1]?.start_ms ?? out[i].start_ms + 5000);
  return finish(out, source);
}

export function docxToText(buf) {
  // Only unpack the document part, and refuse oversized ones (zip bombs).
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => f.name === 'word/document.xml' && f.originalSize < 20e6 });
  const xml = files['word/document.xml'];
  if (!xml) throw new Error('Not a DOCX file: word/document.xml missing');
  return strFromU8(xml)
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

export function parseDocx(buf) {
  // Teams DOCX: "Name   0:03" on one line, text on the next.
  const text = docxToText(buf);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const joined = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(DOCX_HEAD_RE);
    if (m && lines[i + 1]) { joined.push(`[${m[2]}] ${m[1]}: ${lines[i + 1]}`); i++; } else joined.push(lines[i]);
  }
  return parseText(joined.join('\n'), 'docx');
}

export function parseByName(name, content) {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'vtt') return parseVtt(content.toString('utf8'));
  if (ext === 'srt') return parseSrt(content.toString('utf8'));
  if (ext === 'docx') return parseDocx(content);
  if (ext === 'txt' || ext === 'md') return parseText(content.toString('utf8'));
  if (ext === 'json') {
    const j = JSON.parse(content.toString('utf8'));
    if (Array.isArray(j.utterances)) return finish(j.utterances, 'json');
    throw new Error('JSON transcript must have an utterances array');
  }
  throw new Error(`Unsupported transcript format: .${ext} (use VTT, SRT, DOCX, TXT or JSON)`);
}

// Compare speaker names loosely: case-insensitive, bracketed suffixes
// ("(she/her)", "(Host)") ignored, and a shorter name matches a longer one
// word by word, its last word possibly an initial ("Jane D" ~ "Jane Doe").
function nameWords(n) {
  return String(n).toLowerCase().replace(/[(\[][^)\]]*[)\]]/g, ' ').replace(/[.’]/g, (c) => (c === '.' ? ' ' : "'")).split(/\s+/).filter(Boolean);
}

export function sameName(a, b) {
  let [x, y] = [nameWords(a), nameWords(b)];
  if (!x.length || !y.length) return false;
  if (x.length > y.length) [x, y] = [y, x];
  return x.every((w, i) => w === y[i] || (i === x.length - 1 && i > 0 && (y[i].startsWith(w) || w.startsWith(y[i]))));
}

// Map raw speaker names to roles. The moderator name(s) come from
// study.yaml; when exactly one other speaker remains, they are the
// participant. Anyone else stays 'unknown' and is listed in role_warnings.
export function assignRoles(transcript, moderatorNames = []) {
  const mods = moderatorNames.filter(Boolean);
  const speakers = [...new Set(transcript.utterances.map((u) => u.speaker))];
  const isMod = new Map(speakers.map((s) => [s, mods.some((m) => sameName(s, m))]));
  const others = speakers.filter((s) => !isMod.get(s));
  const role = (s) => (isMod.get(s) ? 'moderator' : mods.length && others.length === 1 ? 'participant' : 'unknown');
  for (const u of transcript.utterances) u.role = role(u.speaker);
  transcript.role_warnings = speakers.filter((s) => role(s) === 'unknown');
  return transcript;
}
