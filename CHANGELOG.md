# Changelog

## 0.3.0

Closes the remaining R0 spec gaps found when checking 0.2.1 against §8.15.

- **Error codes (Appendix I/M).** Tool errors now come back as `{ ok: false, error: { code, message, hint } }` with stable codes (`NO_RESEARCH_FOLDER`, `CONSENT_REQUIRED`, `FILE_DAMAGED`, `NOT_PREPARED`, `BOARD_NOT_DONE`, `STUDY_NOT_FOUND`, `LINT_BLOCKING`, `RELAY_NOT_SET_UP`, …). Messages are unchanged.
- **Watch for arriving sessions (FR-PLG-009).** `relay_import` takes `watch_minutes` (up to 10) and keeps checking until a session arrives, sending progress while it waits.
- **Backup check (FR-PLG-011).** `setup_init` takes `backup_confirmed`; `setup_check` and `study_create` warn while a laptop research folder isn't confirmed as backed up.
- **One device per link (FR-PLG-008).** A participant link now works on the first device that uses it; a reload on that device carries on, and a second device is told the link is in use. `runner_links` with `release_device: true` lets a participant switch device. Redeploy the relay and rebuild participant pages to turn this on (older pages keep working until someone claims the link).
- `relay_import` refuses to run twice at once for the same study, stops watching when the client cancels, and keeps one-time warnings from every check.
- **Participant name at consent.** The consent step asks for the participant's name (optional) and whether it may be kept. If they allow it, it is kept on their consent record and used to redact their name from what they say. If not, it never leaves their browser and the record gets a made-up name instead.
- **Cursor contract test.** `test/cursor.test.mjs` checks everything Cursor reads (manifest, MCP server start-up, skills, privacy hooks); docs/setup.md has the manual release check.
- The privacy guard refuses Grep globs that name raw research files.

## 0.2.4

Robustness fixes and dependency updates from the ECC review.

- Participant page: when the relay refuses the link (expired or not valid), the participant is told to contact the researcher, instead of seeing "Connection problem" forever. A piece the relay can never accept is skipped instead of blocking the rest. "All done" only shows once everything has really been sent.
- Relay: an uploaded piece is never replaced, so a reused link can't overwrite a session; pieces are capped at 4,000 per track (over 5 hours). The local relay writes uploads atomically, so a dropped upload can be retried. Storage errors are no longer read as "not there".
- CSV import: a blank time cell means "no time", not 0 seconds (it was pulling median times down), and ids like `__proto__` import normally.
- Study names and folder paths containing `:`, `#`, quotes or `$&` no longer break or truncate `study.yaml`.
- Clearer errors: a damaged JSON file is named; submitting observations before `session_prepare` says to run it first.
- Updated `fflate` to 0.8.3 and `yaml` to 2.9.1 (two moderate advisories); `npm audit` is clean.
- Privacy guard: a backslash only counts as a path separator before a name, so regex searches like `consent\|x` aren't blocked.

## 0.2.3

Privacy fixes from the ECC security and code review.

- Typed survey answers and moderator notes are now redacted before the model sees them, like transcripts. Street addresses are redacted too. Redaction is pattern-based and best-effort, and the docs now say so. Very long typed answers (over 20,000 characters) are dropped rather than passed through. Run `session_prepare` again for sessions prepared before this version: `setup_check` lists them.
- `.gitignore` now ignores everything under each study's `sessions/`, plus `.relay-seen.json`. Running `setup_init` again adds missing lines to an existing `.gitignore` and keeps your own. `setup_check` lists research files git already tracks and how to untrack them.
- Study exports leave out moderator notes (`markers.json`) and hidden temporary files, and consent records lose every name field.
- Retention counts from when a session was recorded or imported, not from folder dates, so re-analysing a session no longer keeps its recording forever. Cleanup also removes stray temporary audio files and export packages that hold an erased participant's data, or that are older than the retention period.
- Transcribing a session that has only an imported transcript now refuses instead of replacing it with an empty one.
- Privacy guard: now also covers Write, Edit, MultiEdit and NotebookEdit (and Glob, Write, Edit in Cursor); expands wildcards against the real files (so `s*/P1/…` can't hide a folder name); follows `cd`, `pushd` and `git -C`; is case-insensitive; checks Grep globs, which bypass ignore files; and stops the call if it can't check it, instead of letting it through. It remains a guardrail: `.gitignore` and folder permissions are the real protection.

## 0.2.2

Data-loss fixes from the ECC security and code review.

- Fixed: pressing Stop in the Studio after the call window had stopped sharing never saved the recording. Stop now always finishes and saves.
- Fixed: reloading the Studio page mid-call reopened the recording files and truncated them. The plugin now refuses a second Start while a recording is running, and a reloaded page offers Stop and save. Pieces left by a recording cut off when the plugin restarted are kept beside the new one (`*.partial-<time>.webm`).
- Fixed: Stop with nothing recording reported "Saved". It now says nothing was saved.
- Fixed: resubmitting a few corrected insights deleted the rest and every review decision. `insights_submit` now merges by id, keeps decisions on unchanged insights, re-checks kept insights against the current board, and refuses a batch where everything was rejected. `replace: true` starts over on purpose (with a `.bak` copy). After a participant is erased, the next submission starts over automatically.
- Fixed: one malformed or unreachable participant upload stopped `relay_import` for everyone after it. Each participant now imports on its own; a failed one is reported, stays on the relay, and leaves no partial session or consent record. Relay calls time out instead of hanging.
- The Studio no longer counts a resent piece as failed when the first send got through.

## 0.2.1

- Fixed: `npm test` failed when the repo folder has a space in its path.
- Fixed: relay secrets were not found when the research folder was reached through a symlink (for example macOS temporary folders or cloud drive links).

## 0.2.0

- Fallback import from the current testing tool: `results_import` turns its results CSV and downloaded videos into sessions, with a private id mapping, success/failure value mapping and per-row warnings. Cell values are never returned to the model.
- `study_export` and the `export-study` skill: a `.tar.gz` with a SHA-256 manifest for the R1 platform, ids unchanged. Media, raw transcripts, notes, device details, source documents and participant names are left out by default.
- `compare_studies` for re-tests: task success before and after with a Newcombe 90% interval and a plain verdict.
- Counter-evidence on insights (`counter_note_ids`) lowers confidence as spec rule H.5 requires; open questions carry into the report.
- Model account provenance in `study.yaml` and the report's method section.
- Relay: secrets in AWS Secrets Manager instead of function settings; `RetentionDays` 1 to 7 (default 1) on AWS and `--retention-days` on the local relay. `relay_import` reads the limit and reports sessions that expired before import, once.
- Skills import from the relay automatically before analysis and synthesis.
- 28 tools and 14 skills.

## 0.1.0 (R0, first version)

- Plugin for Claude Code and Cursor from one repository: 13 skills, an evidence-checker agent, a privacy guard hook and a bundled MCP server with 26 tools.
- Moderated tests: local Studio records the call window and the moderator's mic as separate tracks, with consent check, guide markers and tagged notes. Call-tool recordings and VTT, SRT, TXT or DOCX transcripts can be imported instead.
- Unmoderated tests: static participant page (consent, mic and tab check, Figma or code prototype, SEQ, SUS) with signed, expiring links and a 24-hour short relay on AWS. A reload mid-test sends what was recorded and marks the session interrupted.
- Analysis: redaction of Australian personal data before AI, verbatim quote and event checks, behaviour signals and key frames.
- Synthesis: NN/g affinity mapping on a drag-and-drop, keyboard-accessible board; insights compared with the product context pack; two independent runs; researcher review.
- Report: summary, insights with computed n-of-N and confidence, task success with 90% intervals, SEQ, SUS, affinity map, before/after context changes, questions for further research, method and limits.
- Retention and erasure: 90-day media cleanup; erasing a participant also removes their notes, quotes, reviews and reports.
