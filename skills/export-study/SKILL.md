---
name: export-study
description: Package a finished study for the ProofLoop platform (R1) or for archiving in the research repository, with every id unchanged. Use when the user asks to export, hand over, archive or move a study to the platform.
---

# Export a study

The package keeps the study slug, participant ids, notes, groups, insights, review decisions and context versions exactly as they are, so the platform can keep every link from a finding back to its evidence.

1. Check the study is in a state worth exporting. If `report_render` hasn't run since the last review, offer to run it first. An export can be made at any stage; it is a snapshot.
2. Ask whether to include media (recordings, screenshots, raw transcripts). Default is no. Include them only if the user says the destination is an approved company system that is allowed to hold recordings, and the study's retention period still applies there.
3. `study_export` with `include_media` as agreed.
4. Tell the user the file path, the number of files and participants, and what was left out. Session notes, device details, source documents and participant names are always left out; consent records keep the decision, version and method.
5. The package is in `.proofloop/exports/`, which git ignores. Never attach it to chat, email it, or upload it anywhere yourself; the user moves it to the destination.
