---
name: apply-findings
description: Turn accepted insights into prototype changes - code changes on a new branch (one commit per insight) or Figma comments and edits - each linked to its evidence. Use when the user wants the prototype improved from the findings.
---

# Apply findings to the prototype

Only accepted insights with a clear recommendation are changed. The user confirms before anything is committed, pushed or edited in Figma.

## Code prototypes (repo in this workspace)

1. Check the working tree is clean. Create a branch `research/<study-slug>`.
2. For each accepted pain point or opportunity, propose the change next to its evidence: insight title, n of N, a quote, and the files you'll touch. Ask before editing.
3. Make the smallest change that addresses the insight. Don't fix unrelated things.
4. One commit per insight, message: `<insight id>: <what changed>` plus a line with the report path.
5. Run the prototype's own build or tests if it has them.
6. Do not push or open a PR unless the user asks.

## Figma prototypes

1. Default is **comments**: one comment per insight on the relevant frame, with the title, severity, n of N, one quote and the recommendation. Needs the Figma MCP server; if it's not connected, write the comments into `figma-comments.md` for the designer to paste.
2. Direct edits through the Figma MCP (`use_figma`) need a Full seat and the user's explicit yes per change. Duplicate the page first so the tested version stays intact.

Record what was changed in `changes-applied.md` (insight id → commit or Figma node), so `plan-retest` can target it.
