---
name: synthesise-study
description: Synthesise a study with NN/g affinity mapping - group verified notes bottom-up into groups and themes, have the researcher finish the map on the board, then write pain points and opportunities and compare them with the product context. Use after analyse-sessions.
---

# Synthesise with affinity mapping

Work as a senior researcher running an affinity mapping session (NN/g method). The AI drafts; the researcher decides.

## Before you start

If `study.yaml` has `spec.relay`, run `relay_import` first and tell the user in one line what arrived and any warnings or lost sessions. Uploads expire on the relay, so every run is a chance to save them.

## Quality policy

Claude Opus 5.5 at **xhigh** effort. Same model rule as analyse-sessions.

## 1. Draft groups, bottom-up

1. Read every session's `observations.json` (these are the notes). **Do not read `context/` yet.** Do not start from tasks, research questions, or any categories you expect; let groups come from what the notes have in common in meaning.
2. Group notes that express the same underlying idea. A group needs notes from at least two participants unless it is a single severe problem (a give-up, a broken prototype).
3. Label each group with a **sentence in participants' terms** that says what they experienced: "People can't tell whether the fee is monthly or yearly", not "Fees". The board rejects one- and two-word labels.
4. Leave notes that don't fit in Unsorted. Do not force them.
5. Roll related groups into **themes**: higher-level statements of what is going on across groups.
6. `board_create` with your groups and themes. Report counts to the user.

## 2. Researcher review on the board

7. `board_open` and give the user the link. Explain: drag notes (or select a note and press M), merge, split by creating a new group, rename, assign groups to themes, then **Mark board done**. Colours show participants, so a group of one colour is one person's view.
8. Wait. Do not continue until the user says they are done; `insights_submit` refuses while the board is open. Then `board_summary` with notes.

## 3. Insights

9. Now read `context/context.md`.
10. For each theme (and any important group), write insights:
    - **pain_point**: what got in people's way, with **severity**: `critical` (blocks the task or causes a serious error), `major` (big delay or wrong path, most recover), `minor` (small hesitation), `cosmetic`. Base severity on observed impact and how many people it affected, not on how strongly someone spoke.
    - **opportunity**: an unmet need or something people valued, with a `hmw` "How might we…?" that is neither too broad nor a disguised solution.
    - `statement`: what we saw and why it matters, separating observation from interpretation.
    - `group_ids` (and `note_ids` if only part of a group applies), up to 3 `quotes` copied exactly from those notes.
    - `context_relation`: `confirms` / `contradicts` / `extends` with the `ctx-` ids, or `new` when the pack says nothing about it. Be strict: "extends" adds detail to a statement; "contradicts" means the evidence goes against it.
    - `recommendation` (optional): a concrete, testable change.
    - Note divergent views: if some participants did the opposite, say so in the statement and list those notes in `counter_note_ids`. Don't leave counter-evidence out to make an insight look stronger; the tool lowers confidence when it is strong (at least 2 participants and half as many as the supporting ones).
11. Write up to 10 `open_questions`: what this study could not answer and why (nobody reached a step, participants split, a research question no task covered). Cite `group_ids` where they apply. These become "Questions for further research" and feed `plan-retest`.
12. `insights_submit` (run 1) with the insights and open questions. The tool computes "n of N" and confidence from the board; never state counts yourself.
13. **Independent second run.** Start a fresh subagent (Claude Code) or a new chat (Cursor) given only the board summary with notes and the context pack that writes insights without seeing run 1. Submit as `run: 2`. Insights found in both runs are marked stable; the rest can't be rated high confidence.
14. Show the user the insights grouped as: contradictions, new, extends, confirms. Then hand over to `review-findings`.

Log with `usage_log` (skill `synthesise-study`).
