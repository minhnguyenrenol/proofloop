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

export const UNMOD = [
  { id: "u1", text: "Here's how to run an unmoderated test with ProofLoop." },
  {
    id: "u2",
    text: "First, set up the short relay, once. It's a small upload service in your company's cloud, and it deletes everything after a day.",
  },
  {
    id: "u3",
    text: "Ask Claude to plan an unmoderated test of your prototype. You get the tasks, what counts as success, and the consent text.",
  },
  {
    id: "u4",
    text: "Then build the participant page, host it on your company site, and create a private link for each person.",
  },
  {
    id: "u5",
    text: "Each link works on one device, and expires after a week.",
  },
  {
    id: "u6",
    text: "Participants agree to take part, share their screen and microphone, then try the tasks on your prototype.",
  },
  {
    id: "u7",
    text: "After each task they rate how easy it was, and at the end they answer the usability questions.",
  },
  {
    id: "u8",
    text: "Their session uploads in small pieces as they go, so a dropped connection loses nothing.",
  },
  {
    id: "u9",
    text: "Then ask Claude to import. Sessions land in your study folder, and are deleted from the relay.",
  },
  {
    id: "u10",
    text: "From there, analyse and synthesise as usual. Your unmoderated test is done.",
  },
] as const;

export const SYNTH = [
  {
    id: "s1",
    text: "Here's how ProofLoop turns sessions into insights you can trust.",
  },
  {
    id: "s2",
    text: "First, each session is prepared. Personal details are redacted, and key moments are saved as screenshots.",
  },
  {
    id: "s3",
    text: "Claude writes observations, one idea each. Every quote must match the transcript, and every behaviour must point to a click or a screenshot.",
  },
  {
    id: "s4",
    text: "Anything that doesn't check out is dropped, not patched up.",
  },
  {
    id: "s5",
    text: "Next, the affinity map is drafted bottom up: notes grouped by meaning, not by task, and not by your assumptions.",
  },
  {
    id: "s6",
    text: "You finish it on the board. Move notes, merge and rename groups, then mark it done.",
  },
  {
    id: "s7",
    text: "Only then are insights written: pain points with a severity, and opportunities framed as how might we.",
  },
  {
    id: "s8",
    text: "Counts and confidence are computed in code, and a second, independent run shows which insights are stable.",
  },
  {
    id: "s9",
    text: "Each insight is compared with your product context. Does it confirm it, contradict it, extend it, or is it new?",
  },
  {
    id: "s10",
    text: "You review every insight. Accepted ones become the report, and update your personas and journeys.",
  },
  {
    id: "s11",
    text: "Evidence you can check, decisions you make. That's synthesis with ProofLoop.",
  },
] as const;

export type Line = { readonly id: string; readonly text: string };

// Seconds of narration for a line: measured if the audio exists, otherwise estimated.
export const voSeconds = (l: Line): number =>
  (durations as Record<string, number>)[l.id] ??
  l.text.split(/\s+/).length / 2.6;

export const hasVoice = (l: Line): boolean =>
  (durations as Record<string, number>)[l.id] !== undefined;
