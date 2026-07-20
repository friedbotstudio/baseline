---
key: .claude/skills/whatsnew/route-resolver.mjs:1
category: landmarks
scope: [scout]
verified-at: 8e6f904
last-touched: 2026-06-23
---

- Role: Foundation. Exports `resolveRouteWorkflow(project)` -> `project.whatsnew?.route_workflow ?? null`; throws naming `whatsnew.route_workflow` on a non-string non-null value. Only resolves/returns the name; does NOT invoke it (a future routing-workflow consumer must allow-list the value before any dispatch).
