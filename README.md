# ProofLoop Research Copilot

Plan, run and synthesise **moderated and unmoderated prototype tests** from inside Claude Code or Cursor. Prototypes can be Figma links, GitHub-hosted builds or any HTTPS page. Findings come back as evidence-checked pain points and opportunities, mapped against your product vision, personas and journeys, with a before/after view of what testing changed.

> Version 0.2 (R0 in the spec). Built for internal staff and consented customers. Recordings stay on a company-managed laptop or company drive. They never go to git, chat or any third party.

## What it does

| Step | Skill | What happens |
|---|---|---|
| Set up | `research-setup` | Research folder, `.gitignore` for recordings, privacy checks, optional local transcription, short relay for unmoderated tests |
| Product context | `add-context` | Turns your docs folder, or what you type, into `context.md` + HTML: vision, problem, personas, journeys, goals, assumptions. Every line is sourced; gaps say "Not provided" |
| Plan | `plan-study` | Writes `study.yaml`, consent and discussion guide; lints tasks for leading wording and UI giveaways |
| Unmoderated | `build-runner` | Builds a static participant page (consent, mic and tab check, tasks on the prototype, SEQ, SUS) and signed links |
| Moderated | `run-session` | Opens the local **Studio** to record your Zoom, Meet or Teams call with separate moderator and participant tracks, markers and notes |
| Import | `import-sessions` | Pulls unmoderated sessions from the relay into the study folder (then deletes them there), or imports call recordings and transcripts. Fallback: results CSV and videos exported from your current testing tool |
| Analyse | `analyse-sessions` | Per-session observations. Every quote must match the transcript word for word; every behaviour must cite an event or frame. Moderator speech is never evidence |
| Synthesise | `synthesise-study` | NN/g affinity mapping, bottom-up. AI drafts groups, you finish them on the drag-and-drop **board**, then insights are compared with the product context |
| Review | `review-findings` | You accept, edit or reject each insight. Only accepted ones reach the report |
| Feed back | `update-context`, `apply-findings` | Proposed before/after changes to personas, journeys and problem statements, and to the prototype itself, each linked to its evidence |
| Re-test | `plan-retest` | Next study version with the same tasks word for word, then a before/after comparison of task success with 90% intervals |
| Retention | `cleanup` | Deletes media after 90 days, or erases one participant completely |
| Export | `export-study` | Packages a study for the ProofLoop platform with every id unchanged; media left out unless you ask |

Counts ("3 of 5 participants"), confidence, task success with 90% intervals, SEQ and SUS are all **computed in code**, never written by the model.

## Install

Requires Node.js 20 or later. FFmpeg is needed for recordings (`brew install ffmpeg`). whisper.cpp is optional for local transcription.

### Claude Code

```text
/plugin marketplace add minhnguyenrenol/proofloop
/plugin install proofloop@proofloop
```

Then ask: "Set up ProofLoop for this project."

### Cursor

The repository ships a Cursor plugin manifest (`.cursor-plugin/plugin.json`). Add it as a plugin from GitHub (`minhnguyenrenol/proofloop`), or clone it and add the folder as a local plugin. The plugin brings the same skills, the MCP server (`mcp.json`), the privacy rule and the guard hook.

### From source

```bash
git clone https://github.com/minhnguyenrenol/proofloop.git
cd proofloop
npm ci
npm test          # unit + end-to-end over the MCP server
npm run test:ui   # real Chromium: participant page and board
npm run build     # rebuilds dist/server.mjs (committed, so installs need no npm step)
```

## A study at a glance

```text
research/
  savings-v1/
    study.yaml            plan: goal, research questions, tasks, recording, consent
    consent/              consent text and per-participant records (not in git)
    context/              context.md + versions/v1 ... (product context, before/after)
    runner/               static participant page to host
    sessions/P1/          media/, transcript, events, observations (media not in git)
    affinity/board.json   the affinity map with full edit history
    insights.json         AI insights (run 1) + insights.run2.json (independent check)
    review.json           your decisions
    report.md / .html     findings, task results, affinity map, what changed
```

See [examples/savings-demo](examples/savings-demo) for a complete synthetic study plan.

## Privacy by design

- **No emotion recognition.** No facial expression or "emotion" analysis from video. Feelings are reported only in participants' own words.
- **Recordings stay put.** Media lives in the study folder on a managed device. The short relay holds unmoderated uploads for 24 hours by default (at most 7 days) and the plugin deletes them on import.
- **Redaction before AI.** Names, emails, AU phone numbers, street addresses, card numbers (Luhn-checked), BSB, account numbers, Medicare numbers and TFNs are redacted from transcripts, moderator notes and typed survey answers before they reach the model; speakers become roles. Redaction is pattern-based and best-effort: names are caught only when the participant's name is on their consent record, and unusual formats (a lowercase street name, numbers spoken as words) can slip through. Treat redacted text as lower-risk, not anonymous.
- **Guard hook.** Claude Code and Cursor are blocked from reading, writing or editing media, raw transcripts, notes or consent files (wildcards are checked against the real files), and from force-adding research data to git. The hook is a guardrail, not a sandbox: `.gitignore` and the folder's own access controls are the real protection.
- **Consent first.** The Studio won't record without a consent record; the participant page won't start without the checkbox.

More in [docs/privacy.md](docs/privacy.md) and [docs/security.md](docs/security.md).

## Documentation

- [docs/setup.md](docs/setup.md): setup, relay deployment, hosting the participant page, transcription
- [docs/privacy.md](docs/privacy.md): data flows, retention, erasure, DPIA notes
- [docs/security.md](docs/security.md): threat model and controls
- [docs/architecture.md](docs/architecture.md): components and key decisions
- [docs/tools.md](docs/tools.md): MCP tool reference
- Product spec: `requirements/proofloop-prd.md` in the project files (§8.15 for R0)

## Licence

Apache-2.0. See [LICENSE](LICENSE).
