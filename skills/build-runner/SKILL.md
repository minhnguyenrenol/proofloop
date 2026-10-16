---
name: build-runner
description: Build the participant page for an unmoderated test (or click capture for a moderated one), help host it, and create signed participant links. Use when the user wants to launch or send out an unmoderated test.
---

# Launch an unmoderated test

## Before you start

- `study_validate` must show no errors, and the user must have approved the plan.
- The study needs `spec.relay.url`. If missing, run `research-setup` for the relay first.
- Figma prototypes: the prototype must be shared so participants can view it ("Anyone with the link" or your organisation, depending on who takes part). For click, screen and misclick data, the team needs a Figma app client id (Figma developer settings, Embed API) with the participant page's origin allowed, set as `prototype.figmaClientId`. Without it the prototype still shows, but click data may be missing; say so.
- Code prototypes: ask the team to add `proofloop-recorder.js` (from `runner/`) to their prototype with `data-parent` set to the page origin, or only screen and voice are captured.

## Steps

1. `runner_build`. It writes `runner/` with only public study fields.
2. Hosting. Ask where to host it. Recommend a company static web host. Private GitHub Pages works when the organisation can restrict Pages to members; the user was unsure whether theirs can, so do **not** use public Pages for unreleased or customer-facing designs. Ask before publishing anything, and never publish without a yes.
3. Pilot first: create one link with a spare id such as `P99` for an internal colleague and ask them to try it on Chrome or Edge. Check with `relay_import` that it arrived and plays. Then remove the pilot with `cleanup` (`participant: P99`) so it is never analysed.
4. `runner_links` for the participants. The links are written to a private file outside the project (its path is in the result); they are not shown in chat because they work as upload passwords. Tell the user to open that file and send each link only to that person, never in shared channels. Each link is signed and expires (default 7 days).
5. Explain what participants will see: consent, a microphone and tab-sharing check, tasks beside the prototype, short questions, then an upload screen. Mobile devices record voice and clicks but not the screen.
6. Remind the user that the relay keeps uploads only for its retention period (24 hours unless it was deployed with more, at most 7 days), so run `import-sessions` at least daily while the test is live. Other skills import automatically when they run.
