# Setup

The `research-setup` skill walks you through all of this. This page is the reference.

## 1. Prerequisites

| Need | Why | Install |
|---|---|---|
| Node.js 20+ | Runs the plugin's MCP server | nodejs.org, or your company software centre |
| FFmpeg | Joins recording pieces, extracts frames and audio | `brew install ffmpeg`, `winget install ffmpeg` |
| whisper.cpp (optional) | Transcribes recordings on the laptop | `brew install whisper-cpp`, plus a model such as `ggml-large-v3-turbo.bin` |
| A company-managed device with full-disk encryption | Customer recordings may only be stored there | Ask IT |

Ask Claude "Set up ProofLoop", or call `setup_check` yourself.

## 2. Research folder

`setup_init` creates `./research` (or a company drive folder synced to the laptop) with:

- `.gitignore` that excludes media, frames, raw transcripts, answers, consent records, source documents and secrets
- `.proofloop/config.json`: location, relay URL, page host, whisper model, who confirmed the device

The relay secrets go to `~/.config/proofloop/<hash>.json` (mode 0600), **outside** the project, so they can't be committed.

## 3. Moderated tests (no extra setup)

`run-session` opens the **Studio** at `http://127.0.0.1:<port>/studio`. The Studio:

1. Checks there is a consent record for the participant (`consent_record`), and won't record without one.
2. Asks you to share the call window **with its audio**, plus your microphone. They are recorded as separate tracks, so the participant's and moderator's voices stay apart.
3. Shows the consent script to read aloud, the discussion guide with markers, and note-taking with Alt+1–4 tags.
4. Saves pieces into `sessions/P<n>/media/` as it goes, and remuxes them when you stop.

If you'd rather record in Zoom, Meet or Teams, import the recording and its transcript with `import-sessions`.

## 4. Unmoderated tests: the short relay

A static participant page can't save files to your laptop, so uploads go through a **short relay**: a company-owned bucket that deletes everything after 24 hours (configurable up to 7 days). `relay_import` downloads sessions into the study folder and deletes them from the bucket straight away.

### AWS (recommended)

```bash
cd relay
sam deploy --guided \
  --parameter-overrides RelaySecret=<from secrets file> AdminToken=<from secrets file> AllowedOrigins=https://research.example.com \
                        RetentionDays=1
```

The stack creates a KMS-encrypted, private bucket with a lifecycle rule of `RetentionDays` (1 to 7, default 1), TLS-only policy and CORS limited to your page origin, plus a Lambda function URL. The relay secret and admin token are stored in AWS Secrets Manager and read by the function at start-up; they are not in its environment settings. Both values must be printable characters without spaces, quotes or backslashes (the generated ones are).

Keep `RetentionDays` at 1 unless participants need longer to finish. `relay_import` reads the limit from the relay and tells you about any session that expired before it was imported. Re-run `setup_init` with `relay_url` set to the function URL output.

### Internal pilot

```bash
RELAY_SECRET=... ADMIN_TOKEN=... ALLOWED_ORIGINS=https://research.example.com \
  node relay/local.mjs --port 8787 --dir /secure/relay-data --retention-days 1
```

Run it on an internal server behind HTTPS. It sweeps files older than the retention period every hour.

## 5. Hosting the participant page

`runner_build` writes a static site to `research/<slug>/runner/`. Host it on a company web host (for example an internal S3 + CloudFront site) at the `runner_base_url` you gave `setup_init`. GitHub Pages is fine for internal tests only if your organisation restricts the site to staff; for customers, use the company host.

The page's Content Security Policy only allows the prototype's origin, the relay and the upload bucket.

### Figma prototypes

Use a prototype link (`https://www.figma.com/proto/...`). For click and screen-change events, register an embed app with Figma and put its client id in `prototype.figmaClientId`. Without it, the prototype still works; the analysis relies on the recording and the voice.

### Code prototypes (GitHub or any URL)

Add the recorder snippet to the prototype so the study page sees clicks, page changes and errors:

```html
<script src="https://research.example.com/savings-v1/proofloop-recorder.js" data-parent="https://research.example.com"></script>
```

It never sends what people type.

## 6. Local transcription

Pass `whisper_model` to `setup_init`. `session_transcribe` then runs whisper.cpp on each track. For unmoderated sessions the microphone track is the participant. For Studio sessions, the call track is the participant and your mic is the moderator.

## Troubleshooting

| Message | Fix |
|---|---|
| "No research folder" | Run `research-setup` |
| "Consent is not on file for P3" | Record consent first with `consent_record` |
| "not finished yet" on import | The participant is still uploading. Wait, or import with `include_incomplete` after 2 hours |
| "close to the 24-hour relay limit" | Import now with `include_incomplete`, or the pieces will be deleted |
| "the participant's page was reloaded mid-test" | The session ends early; tasks after that point have no result. Invite them again with a new link if needed |

## Importing from the current testing tool

If a study ran in the existing testing tool, export its results CSV and download the session videos to one folder. The `import-sessions` skill maps the CSV columns to the study's tasks with you, then `results_import` creates a session per row. The tool's participant ids stay in `consent/external-ids.json` (not in git, never read by the model). Only import participants who agreed in that tool to this research use.

## Exporting a study for the platform

The `export-study` skill runs `study_export`, which writes a `.tar.gz` to `research/.proofloop/exports/` with a manifest of every file and its SHA-256. Ids are unchanged. Media is left out unless you ask for it.
