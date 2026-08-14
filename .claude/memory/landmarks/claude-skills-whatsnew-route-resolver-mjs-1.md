---
key: .claude/skills/whatsnew/route-resolver.mjs:1
category: landmarks
scope: [scout]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: Foundation. Exports `resolveRouteWorkflow(project)` -> `project.whatsnew?.route_workflow ?? null`; throws naming `whatsnew.route_workflow` on a non-string non-null value. Only resolves/returns the name; does NOT invoke it (a future routing-workflow consumer must allow-list the value before any dispatch).
