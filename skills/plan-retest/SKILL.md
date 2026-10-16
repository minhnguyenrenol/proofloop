---
name: plan-retest
description: Plan the next study version to check whether the changes made from findings actually fixed the problems, targeting the changed screens and the context assumptions still untested. Use after apply-findings.
---

# Plan a re-test

1. Read `changes-applied.md`, the accepted insights, the "Questions for further research" in `report.md`, and the latest context version's untested assumptions.
2. `study_create` with a new slug (e.g. `<slug>-v2`) and `from_study: <slug>` so it starts from the latest accepted product context.
3. Keep the original tasks that touch changed screens **word for word**, so before/after task success and SEQ compare like with like. Add tasks only for untested assumptions and open questions.
4. Set `metadata.previousVersion` to the earlier slug and `version` to the next number.
5. `study_validate`, then summarise for the user: what is being re-tested, which insight each task checks, and the success measure.
6. After the re-test is synthesised, run `compare_studies` with the earlier and later slugs. Report each task's before and after counts, the difference and its 90% range, and the tool's verdict, in plain words and exactly as given. Never compute differences yourself. Small samples rarely prove a difference: say "better in this sample" unless the verdict says improved.
