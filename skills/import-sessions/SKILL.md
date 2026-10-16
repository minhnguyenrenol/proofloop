---
name: import-sessions
description: Bring sessions into the study folder - pull finished unmoderated sessions (and moderated click data) from the short relay, or import a Zoom, Meet or Teams recording and transcript. Use after sessions happen, and at least daily while an unmoderated test is live.
---

# Import sessions

## From the relay (unmoderated, and moderated click data)

1. `relay_import`. It downloads finished sessions, joins the recording pieces, checks sizes and durations, writes the click data and answers, turns the participant's consent tick into a consent record, then deletes the relay copy.
2. Report what arrived per participant, and every warning, including sessions that ended early because the page was reloaded, and uploads that arrived after a session was already imported (ignored) (missing pieces, duration mismatch, sessions still in progress). Sessions not finished after 20 hours will be lost at 24 hours; offer `include_incomplete: true` to keep what arrived.

## From a call tool (moderated)

1. Ask for the recording file and the transcript file the call tool produced (Zoom: `.vtt` from cloud recording; Teams: `.vtt` or `.docx`; Meet: the transcript document saved as `.docx` or `.txt`).
2. Check consent is on file (`consent_record` if the user confirms it was given).
3. `session_import` with the paths. Report the speakers it found and which were recognised as moderators. If a moderator was not recognised, fix `spec.moderators` in `study.yaml` to match the transcript names, and import again; otherwise moderator speech could be mistaken for participant evidence. Names match loosely (case, "(she/her)" or "(Host)" suffixes, "Jane" or "Jane D" for "Jane Doe"). If the result has `role_warnings`, those speakers are marked unknown and their words can't be evidence: a note-taker on the call is fine to leave unknown, but if the participant is listed, fix the moderator names and import again.
4. No transcript? Use `session_transcribe` (local whisper.cpp; audio stays on the laptop). Studio recordings have separate tracks, so speakers are known. A single mixed call file can't tell speakers apart; prefer the call tool's transcript then.

## Rules

- Never copy recordings anywhere outside the research folder.
- Never open or read raw media or `transcript.json` yourself; analysis works from `analysis-input.json`.
