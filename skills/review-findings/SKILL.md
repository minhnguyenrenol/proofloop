---
name: review-findings
description: Walk the researcher through every AI-drafted insight to accept, edit or reject it with a reason, then produce the report. Use after synthesise-study, or when the user wants the report.
---

# Review insights and produce the report

Nothing reaches the report until a person accepts it.

1. Read `insights.json` and `board_summary`.
2. Present insights one at a time, contradictions and new ones first. For each, show: title, kind and severity, "seen in n of N" with confidence (from the tool, not your words), the statement, the quotes with participant ids, and the context relation.
3. Ask: **accept**, **edit** (what to change), or **reject** (why). Do not decide for them. Never batch-accept unless the user explicitly says "accept all", and even then list what was accepted.
4. `review_record` for each decision with the reviewer's name.
5. When every insight is decided, `report_render`. Open `report.html` for the user, or tell them where it is. Summarise in three lines what the report says.
6. Offer next steps: `update-context` (before/after for personas, journeys and problem statement), then `apply-findings` (change the prototype), then `plan-retest`.

The report states its limits (sample size, AI use, rejected citations, and that no facial or emotion analysis was used). Do not remove them.
