---
name: update-context
description: Propose before/after changes to the product vision, problem statement, personas and user journeys from accepted insights, let the researcher decide each one, and save a new version of the context pack. Use after review-findings.
---

# Update the product context (before → after)

1. Read `context/context.md`, `insights.json` and `review.json`. Only **accepted** or **edited** insights count.
2. For each accepted insight, decide whether it changes the pack:
   - `contradicts` → usually `modify` the statement it contradicts, or `set_status: contradicted` if the team should keep the original wording visible.
   - `extends` → `modify` to add the detail, or `add` a child bullet (e.g. a new pain point on a journey stage, a persona goal or frustration).
   - `confirms` → `set_status: validated`.
   - `new` → `add` it where it belongs (persona, journey stage, assumptions, or problem statement).
   Keep changes small and specific. Never rewrite text that no insight speaks to. New ids follow the existing pattern and are never reused.
3. `context_changes_submit` with each change's `rationale` and `insight_ids`. It writes `context-changes.md`.
4. Walk the user through each change as **Before / After / Why / Evidence**. Ask accept, edit (their wording) or reject. `context_change_decide` for each.
5. `context_apply`. It writes `context/versions/vN/context.md` and `.html`; the original stays untouched.
6. `report_render` again so the report's "What changed after testing" section shows the accepted before/after.
7. Tell the user which assumptions are now validated, contradicted, or still untested; the untested ones are candidates for the next study.
