# Architecture

```text
 Claude Code / Cursor
 ├─ skills/            research method, step by step (the thinking)
 ├─ agents/            evidence-checker (independent, read-only)
 ├─ hooks/, cursor/    guard: blocks media, raw transcripts, consent, git add
 └─ MCP server (dist/server.mjs, stdio)    deterministic tools only
     ├─ study, context, consent, runner, links
     ├─ import (relay, call recordings), transcribe, prepare (redact, align, signals, frames)
     ├─ verify observations and insights against evidence
     ├─ affinity board, stats, report, context before/after
     └─ local web server 127.0.0.1: Studio + Board

 Participant browser ── static runner page ──► short relay (S3, 24 h) ──► relay_import ──► study folder
```

The model does the research reasoning in the skills. Everything that must be exact (counts, intervals, citations, file safety) is code in the MCP server and is tested.

## Decisions

### ADR-1: Plugin first (R0), platform later
A plugin for Claude Code and Cursor reaches researchers where the prototypes are built, needs no new infrastructure beyond the relay, and keeps recordings on managed laptops. A hosted platform with a built-in video call is R1.

### ADR-2: Short relay for unmoderated uploads
A static page can't write to a laptop. The relay holds uploads for at most 24 hours, encrypted and private; imports delete them. Participant links carry HMAC-signed, expiring tokens bound to one study and one participant id. Alternatives rejected: direct upload to a company drive (needs participant sign-in), keeping media in the cloud (against the R0 storage decision).

### ADR-3: Evidence lock
Every observation must cite evidence the code can check: verbatim quotes from participant speech (after typographic normalisation only), or event and frame ids. Moderator speech is never evidence. Unverifiable observations are rejected and counted in the report. This trades some recall for trust.

### ADR-4: Bottom-up affinity mapping with the context withheld
Following NN/g, notes are grouped by meaning first. The product context pack is read only after the researcher marks the board done, so existing assumptions don't seed the groups. Insights are then labelled confirms, contradicts, extends or new.

### ADR-5: Two independent synthesis runs
A second run, without seeing the first, writes insights from the same board. Insights that match one-to-one (Jaccard ≥ 0.5 on notes, same kind) are stable; others can't be rated high confidence. Both runs work from the researcher's finished board, so stability measures the interpretation of the groups, not the grouping itself; the researcher's board edits are the check on grouping.

### ADR-6: Statistics in code
Task success uses the adjusted Wald interval at 90%; SEQ and SUS use t-intervals clamped to the scale. Confidence follows spec rule H.5. The model never writes a count.

### ADR-7: No emotion recognition
Facial-expression and emotion inference is excluded for accuracy, legal and trust reasons. Feelings are reported only in participants' words.

### ADR-8: Reload during an unmoderated test ends the session
A new browser recording can't be joined onto the old one, and asking again for screen sharing mid-task changes the test. After a reload the page sends what was recorded and marks the session interrupted. Moderated mode records clicks only, so it continues where it was.

### ADR-9: Bundled server committed to git
`dist/server.mjs` is a single esbuild bundle with no runtime dependencies, so installing the plugin needs no `npm install`. CI checks the bundle matches the source.
