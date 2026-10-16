---
name: run-session
description: Run a moderated session with the Studio - record consent, open the Studio to record the Zoom, Meet or Teams call into the study folder, and give the participant a prototype link that captures their clicks. Use when the user is about to moderate a session.
---

# Run a moderated session

## Before the call

1. Check the study is moderated and valid (`study_validate`), and `guide.md` has `##` sections.
2. Pick the participant id (next free `P<n>`).
3. Consent. Ask how consent was given: a signed form (`written`), an online form (`form`), or spoken at the start of the recorded call (`verbal-recorded`). Call `consent_record` only after the user confirms it was given. Ask for the participant's name only so it can be removed from transcripts; it is never sent to the model. Without consent the Studio will not record.
4. Click capture (optional, recommended): if the study has a relay and a hosted runner, create a link with `runner_links` for this participant (it is saved to a private file; tell the user where). The page shows the prototype and records clicks only, no screen, camera or voice. Otherwise the participant uses the prototype link directly and only the call recording is analysed.

## During the call

5. `studio_open` and give the user the URL to open in Chrome or Edge on this laptop. Walk them through:
   - Choose the call window (or the browser tab running the call) and tick **Share audio**. The participant's voice comes from the call audio; on macOS this needs macOS 14.2+ and Chrome 141+, otherwise run the call in a Chrome tab and share that tab.
   - Turn on the microphone. Both level meters should move.
   - Press **Start recording**, then read the recording notice aloud.
   - Select guide sections as they go; type notes with tags (Alt+1–4).
   - The Studio warns if the participant track is silent for 10 seconds.
6. After **Stop and save**, the files are in `sessions/<P#>/media/`, with `notes.md` and markers.

## After the call

7. Offer to run `import-sessions` (to bring in the click data and, if they prefer, the call tool's transcript) and then `analyse-sessions`.
8. Remind them the laptop copy is the only copy: keep the folder backed up as their organisation requires.

If the Studio can't capture audio on this machine, record in the call tool instead and use `import-sessions` with its recording and transcript.
