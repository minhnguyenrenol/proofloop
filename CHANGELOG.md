# Changelog

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
