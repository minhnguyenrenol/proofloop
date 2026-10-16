# Privacy

Notes for your privacy team and DPIA. They describe what v0.1 does; your organisation's policy decides whether that is enough for a given study.

## Data collected

| Data | Moderated | Unmoderated | Where it lives |
|---|---|---|---|
| Screen or tab recording | The call window (Studio) | The study tab only | `sessions/P<n>/media/` on the managed device |
| Audio | Call audio and the moderator's mic, as separate tracks | Participant's mic | Same |
| Camera | Off by default; the linter warns if turned on | Off by default | Same |
| Clicks, screen changes, errors | From the prototype embed or recorder | Same | `events.json` |
| Answers (SEQ, SUS, open text) | n/a | From the page | `answers.json` |
| Consent | Researcher-recorded | Checkbox on the page | `consent/P<n>.json` |
| Device | n/a | Browser and screen size | `device.json` |

**Not collected:** facial expressions or emotion inferred from video, keystrokes or form input values in prototypes, location, cookies or trackers.

## Data flows

1. **Moderated:** the call app → Studio on `127.0.0.1` → study folder. Nothing leaves the device.
2. **Unmoderated:** participant's browser → short relay bucket (encrypted, private, deleted after the relay's retention period: 24 hours by default, at most 7 days) → `relay_import` → study folder. The relay copy is deleted as soon as it is imported.
3. **Testing tool fallback:** the tool's CSV export and downloaded videos → `results_import` → study folder. Only the mapped columns are read; the tool's participant ids are kept in a private mapping file.
4. **Export to the platform:** `study_export` → `.proofloop/exports/*.tar.gz` on the laptop. Media, raw transcripts, session notes, device details, source documents and participant names are left out by default; media is added only when you ask. Move the file only to an approved company system.
5. **AI analysis:** only `analysis-input.json` is sent to the model, through Claude Code or Cursor under your company's agreement. It holds the **redacted** transcript with speakers as roles, events, and up to 20 key frames. Media files, raw transcripts and consent records are blocked from the model by the guard hook.

## Redaction

Before analysis, `session_prepare` replaces names from consent records, email addresses, Australian phone numbers, card numbers (Luhn-checked), BSBs, account numbers, TFNs and dates of birth with tags such as `[PHONE]`. Redaction is pattern-based. It reduces exposure; it is not a guarantee. Ask participants to use test data and not to say real details.

## Retention and erasure

- Media, frames, transcripts and answers are kept for `retention.mediaDays` (default **90 days**), then deleted by `cleanup`.
- Notes, insights and the report are kept, because they hold no media and only redacted quotes.
- **Erasure:** `cleanup` with a participant id deletes their session folder and consent record, removes their notes from the affinity board, reopens the board and marks insights for re-synthesis. Reports already shared need to be re-issued.
- Every deletion is written to `log.jsonl`.

## Consent

The consent template explains what is recorded, why, who sees it, where it is stored, the retention period and how to withdraw, in plain words. Change `consent.version` whenever the text changes; each record stores the version agreed to.

## Git

`research/.gitignore` excludes media, frames, raw transcripts, answers, consent records, source documents and secrets. The guard hook also blocks `git add` of those paths, including with `-f`.
