---
name: plan-study
description: Plan a moderated or unmoderated usability study for a prototype (Figma, GitHub or any URL) - goal, research questions, tasks, questions, consent and discussion guide - as study.yaml, then check it. Use when the user wants to test a prototype or design.
---

# Plan a study

Work as a senior UX researcher. A good plan is short, neutral and tied to a decision.

## Inputs to gather (ask only for what is missing)

- The **prototype link**: a Figma prototype URL (`figma.com/proto/...`), a hosted code prototype URL, or a GitHub repo with build instructions.
- The **decision** this study informs, and what the team already believes. If a product context pack exists (`context/context.md`), read it: its assumptions are what tasks should test.
- **Moderated or unmoderated.** Recommend unmoderated for "can people do X" with clear success criteria; moderated for "why", early concepts, or sensitive topics.
- **Who**: internal staff, customers, or both, and how many. Recommend 5–8 per distinct user group for finding problems.

## Steps

1. `study_create` with a slug (lowercase, dashes), name and mode. Use `from_study` when this follows an earlier study, so the latest accepted product context carries over.
2. Edit `study.yaml`:
   - `goal`: one sentence naming the decision.
   - `researchQuestions`: 2–5, each answerable by watching people.
   - Tasks: a realistic `scenario` plus an `instruction` that states the goal in the participant's words. **Never name the UI** ("click", "menu", "button"). One goal per task. Link each task to research questions with `answers: [index]` and to context assumptions with `tests: [ctx-…]`.
   - Unmoderated tasks need `success`: `reachNode` (Figma node id of the success screen), `urlMatches` (code prototypes), or `selfReport: true`.
   - Follow each task with an SEQ and one optional open question. Neutral wording only: "What, if anything, was unclear?", never "How easy was that?".
   - Add an `instructions` block asking people to think aloud. End with SUS for unmoderated studies of complete flows.
   - `moderators`: names exactly as they appear in call transcripts (moderated).
   - Quote any YAML text containing commas or colons.
3. Edit `consent/consent.md` so it matches what is recorded, who sees it, the retention days, and that an approved AI tool helps summarise with names removed. Keep it plain and short. Bump `consent.version` when it changes.
4. Moderated: write `guide.md` with `##` sections (each becomes a Studio marker): welcome and recording notice, warm-up, one section per task with neutral probes ("What did you expect?", "What would you do next?"), wrap-up.
5. Run `study_validate`. Fix every error. Explain each warning to the user and fix or justify it. Show the final plan as a short summary, not the YAML.
6. Ask the user to approve the plan before any participant link is created.

## Quality bar

- Each research question has at least one task.
- No leading, double-barrelled or UI-naming wording.
- Session fits the target time (the linter estimates it).
- Customer studies: consent text, storage location and retention are right before launch.
