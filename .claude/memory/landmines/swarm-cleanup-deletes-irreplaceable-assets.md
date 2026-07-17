---
key: swarm-cleanup-deletes-irreplaceable-assets
category: landmines
scope: [scout, spec, tdd, security, integrate]
---

- Path: any swarm task that deletes files without preserving a copy first
- Trap: T-014 of swarm `site-react-ssg-seo` (2026-04-29) deleted `site/index.html` (1,250 lines, 1,223-line embedded design CSS — the visual ground truth) and `site/assets/src/app.jsx` (1,374 lines, all the visual component logic) after T-009/T-010/T-011/T-012/T-013 ported their structure. Workers ported the JSX shape but did not port the CSS rules. The CSS was irretrievable: no git locally, no Time Machine local snapshots, Trash empty (terminal `rm` doesn't go to Trash), Spotlight had no index match, no `.bak`/swap files. Only ~77% of `app.jsx` was recoverable from worker tool-result transcripts at `/private/tmp/claude-502/<user>/<session-uuid>/tasks/*.output`; the original `index.html` was never read by any worker so 0% recoverable.
- Mitigation: swarm-plan tasks that delete files SHALL include a "preserve-to-archive" step that copies the deleted bytes to `docs/archive/_pre-delete/<slug>/<original-relpath>` (or equivalent) BEFORE `rm`. This applies in particular to: any file containing visual/design ground truth, any file >500 lines authored by hand, any file the workflow's own components were meant to replace. Cleanup is a real action; treat it like a destructive git operation.
- Mitigation (workflow-level): the `archive` skill (Phase 10.5) runs AFTER cleanup, so it cannot rescue what cleanup deleted. Either move cleanup into the archive bundle's first step, or have swarm-plan emit cleanup tasks that explicitly write to the archive dir before `rm`.
- Recovery surface (when this DOES bite): `/private/tmp/claude-502/<user-encoded-path>/<session-uuid>/tasks/*.output` JSONL transcripts contain every Read tool_use and tool_result. Match `tool_use(id)` → `tool_result(tool_use_id)` and stitch lines by the `<line>\t<content>` format from the result text. ~77% recovery is realistic if workers had the file in their read_set; 0% if no worker read it.
- Verified-at: 3c74ba8
- Last-touched: 2026-06-20
