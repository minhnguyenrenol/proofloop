---
name: cleanup
description: Apply retention (delete recordings, screenshots and transcripts past the study's retention period) or erase one participant's data on request. Use when asked, on a regular schedule, or when a participant withdraws.
---

# Retention and erasure

1. Ask whether this is routine retention or a participant's erasure request.
2. Run `cleanup` with `dry_run: true` first and show the user exactly what will be deleted.
3. Only after a clear yes, run it again with `dry_run: false`.
4. Erasure: explain what the tool also does: it removes the participant's notes and quotes from the board and insights, reopens the board, deletes report.md and report.html, and marks insights out of date. Offer to re-check the board, re-run synthesis and review, and render a new report. Remind them to replace any report copies already shared.
5. If the research folder is on a company drive, remind the user that the drive's own recycle bin and version history may keep copies; their admin's retention settings apply there.
