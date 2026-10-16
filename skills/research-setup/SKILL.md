---
name: research-setup
description: Set up the Proofloop Research Copilot in this project - research folder, privacy safeguards, local transcription, and the short relay for unmoderated tests. Use before the first study, or when a tool says the research folder is not set up.
---

# Research setup

You are setting up a research workspace for a product team in a regulated organisation. Be careful and plain-spoken. Never guess a yes on the user's behalf.

## Steps

1. Run `setup_check` and summarise what is present and missing in plain words.
2. Ask the user, one question at a time, only what you can't see:
   - Where should recordings live: a folder on this **laptop**, or a company **drive** folder (OneDrive, Google Drive, SharePoint) synced to it? Default: `./research` on the laptop.
   - Is this a **company-managed device with full-disk encryption**? If they say no or don't know, stop: customer recordings must not be stored here. Internal-only pilots can continue only if their security team agrees; say so.
   - Will they run **unmoderated** tests? If yes, they need the short relay (see below) and a place to host the participant page.
   - Their name (recorded on decisions).
   - Which **approved model account** they are using: Claude Enterprise or Team plan in Claude Code, the Claude API through Bedrock, Vertex or Anthropic, or Cursor with an approved Claude model under the organisation's data terms. If they aren't sure their account is approved for research data, tell them to check with their security team before analysing customer sessions.
3. Call `setup_init` with `confirm_managed_device: true` only after the user confirmed it, and pass `model_account`. New studies record it in `study.yaml`.
4. If the research folder is inside a git repository, check that `research/.gitignore` exists (setup_init writes it) and tell the user recordings, consent records and raw transcripts are excluded from git.
5. **Local transcription (optional).** If they want to transcribe recordings on the laptop, help them install whisper.cpp (`brew install whisper-cpp` on macOS, or build from github.com/ggml-org/whisper.cpp) and download a model such as `ggml-large-v3-turbo.bin`. Pass the model path as `whisper_model`. Without it, they can import transcripts from Zoom, Meet or Teams.
6. **Short relay (unmoderated only).** Explain in two sentences: participants' browsers upload to a company-owned bucket that deletes everything after 24 hours; the plugin pulls sessions into this folder and deletes them from the bucket. Then:
   - The first `setup_init` wrote the relay secrets outside the project folder (path in its result). Never print them in chat.
   - Whoever deploys it runs `sam deploy --guided` in the plugin's `relay/` folder (AWS), passing RelaySecret and AdminToken from that file and the origin that will host the participant page. The stack keeps the two values in AWS Secrets Manager, not in the function's settings. `RetentionDays` is 1 by default; ask the user whether participants might take longer than a day between opening the link and finishing, and only then raise it (at most 7). Longer retention means more data held in the cloud, so record the choice in the privacy notes. For a quick internal pilot, `node relay/local.mjs` runs it on an internal server instead (`--retention-days` sets the same limit).
   - Re-run `setup_init` with `relay_url` (the stack output, https) and `runner_base_url`. This pins the relay: the admin token is only ever sent to that address, and `runner_build` refuses a study.yaml that points elsewhere.
7. Finish with a short checklist of what is ready and what is not.

## Rules

- Recordings never go into git, chat, or any service other than the relay.
- Do not suggest weakening security settings or device controls.
- Facial expression and emotion analysis are out of scope; if asked, say the team decided against it for accuracy, legal and trust reasons.
