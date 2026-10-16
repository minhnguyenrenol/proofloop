---
name: import-sessions
description: Bring sessions into the study folder - pull finished unmoderated sessions (and moderated click data) from the short relay, or import a Zoom, Meet or Teams recording and transcript. Use after sessions happen, and at least daily while an unmoderated test is live.
---

# Import sessions

## From the relay (unmoderated, and moderated click data)

1. `relay_import`. It downloads finished sessions, joins the recording pieces, checks sizes and durations, writes the click data and answers, turns the participant's consent tick into a consent record, then deletes the relay copy.
2. Report what arrived per participant, and every warning, including sessions that ended early because the page was reloaded, and uploads that arrived after a session was already imported (ignored) (missing pieces, duration mismatch, sessions still in progress). Sessions not finished well before the relay's limit (`retention_hours` in the result, 24 by default) will be lost; offer `include_incomplete: true` to keep what arrived. If the result lists `lost` sessions, tell the user plainly which participants' uploads expired before import; they can't be recovered.

Other skills run `relay_import` first by themselves while a study with a relay is live, so sessions are not lost to the time limit. Run it here when the user asks, or daily while a test is live.

## From a call tool (moderated)

1. Ask for the recording file and the transcript file the call tool produced (Zoom: `.vtt` from cloud recording; Teams: `.vtt` or `.docx`; Meet: the transcript document saved as `.docx` or `.txt`).
2. Check consent is on file (`consent_record` if the user confirms it was given).
3. `session_import` with the paths. Report the speakers it found and which were recognised as moderators. If a moderator was not recognised, fix `spec.moderators` in `study.yaml` to match the transcript names, and import again; otherwise moderator speech could be mistaken for participant evidence. Names match loosely (case, "(she/her)" or "(Host)" suffixes, "Jane" or "Jane D" for "Jane Doe"). If the result has `role_warnings`, those speakers are marked unknown and their words can't be evidence: a note-taker on the call is fine to leave unknown, but if the participant is listed, fix the moderator names and import again.
4. No transcript? Use `session_transcribe` (local whisper.cpp; audio stays on the laptop). Studio recordings have separate tracks, so speakers are known. A single mixed call file can't tell speakers apart; prefer the call tool's transcript then.

## From the current testing tool (fallback)

Use when a study was run in the existing testing tool and the user exports its results.

1. Ask for the results CSV (one row per participant) and, if there are videos, the folder they downloaded them into. Ask the user to confirm the participants agreed, in that tool, to their sessions being used for this research, and which consent text that was.
2. Read only the CSV's first line to see the column names. Never read or quote the rows: they can hold names, emails and answers.
3. Match columns to the study: the participant id column, and for each task in `study.yaml` its result column, and its time (seconds) and SEQ (1 to 7) columns if present; the 10 SUS item columns in order; the video file name column. Confirm the mapping with the user.
4. `results_import`. If warnings say a result value isn't known (for example "Partial"), ask the user whether it means success or failure and import again with `success_values` or `failure_values`; sessions already imported are skipped, so delete those sessions first if they need redoing (`cleanup` with `participant`).
5. Report participants, tasks and videos imported, and every warning. The testing tool's ids stay in a private mapping file; refer to participants only as P1, P2….
6. Imported videos have no click data or transcript. Transcribe them with `session_transcribe` before analysis if there is speech.

## Rules

- Never copy recordings anywhere outside the research folder.
- Never open or read raw media or `transcript.json` yourself; analysis works from `analysis-input.json`.
