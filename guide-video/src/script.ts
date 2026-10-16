// Narration for both videos, one line per scene. scripts/voice.mjs turns each
// line into public/vo/<id>.mp3 and writes the real lengths to vo-durations.json;
// until then, lengths are estimated from the word count.
import durations from "./vo-durations.json";

export const EXPLAINER = [
  {
    id: "e1",
    text: "You ran the user tests. Now you've got hours of recordings.",
  },
  {
    id: "e2",
    text: "Days of rewatching. Quotes copied out of context. Findings nobody can check.",
  },
  {
    id: "e3",
    text: "Meet ProofLoop: a research copilot that works inside Claude Code and Cursor.",
  },
  {
    id: "e4",
    text: "Plan the study. Run it, on a call or on a link. ProofLoop analyses every session, and helps you make sense of what you saw.",
  },
  {
    id: "e5",
    text: "Every quote is checked against the transcript, word for word. Invented quotes never make it through.",
  },
  {
    id: "e6",
    text: "And every count, like four out of five people, is computed in code. Not guessed by the AI.",
  },
  {
    id: "e7",
    text: "Recordings stay on your laptop. Names and emails are removed before the AI reads a single word.",
  },
  {
    id: "e8",
    text: "You finish the map. You approve every finding. Then the evidence flows back into your personas, your journeys and your next prototype.",
  },
  { id: "e9", text: "Test. Learn. Loop. ProofLoop." },
] as const;

export const HOWTO = [
  { id: "h1", text: "Here's how to run your first study with ProofLoop." },
  {
    id: "h2",
    text: "In Claude Code, add the plugin from GitHub with two commands.",
  },
  {
    id: "h3",
    text: "Then just ask: set up ProofLoop for this project. It creates a private research folder, and keeps participant data out of git.",
  },
  {
    id: "h4",
    text: "Drop in your product docs. ProofLoop turns them into one sourced page: your vision, personas and journeys.",
  },
  {
    id: "h5",
    text: "Give it your prototype link and your goal. You get the tasks, the consent text and a discussion guide.",
  },
  {
    id: "h6",
    text: "On a call, the Studio records Zoom, Meet or Teams. For unmoderated tests, each person gets their own link.",
  },
  {
    id: "h7",
    text: "Import the sessions and ask for analysis. Every observation points back to a quote, a click or a screenshot.",
  },
  {
    id: "h8",
    text: "ProofLoop drafts the affinity map. You finish it on the board, then mark it done.",
  },
  {
    id: "h9",
    text: "Review each insight, and your report is ready: findings, task success, and what changed.",
  },
  { id: "h10", text: "That's your first study. The full guide is on GitHub." },
] as const;

export type Line = { readonly id: string; readonly text: string };

// Seconds of narration for a line: measured if the audio exists, otherwise estimated.
export const voSeconds = (l: Line): number =>
  (durations as Record<string, number>)[l.id] ??
  l.text.split(/\s+/).length / 2.6;

export const hasVoice = (l: Line): boolean =>
  (durations as Record<string, number>)[l.id] !== undefined;
