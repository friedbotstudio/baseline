---
key: roadmap-execution-plan-format-contract-stray-emoji-silently-inflates-tallies
category: landmines
scope: [spec]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Path: `docs/roadmap-execution-plan.md` (the artifact) ← parsed by `.claude/skills/standup/gather.mjs` (`parseEpicHeading`, `countTaskStatuses`) and `.claude/skills/roadmap-sync/sync.mjs` (`EPIC_HEADING`, `TASK_LINE`, `auditRoadmap`); path declared at `project.json → roadmap.path`.
- The contract: epic headings are `## Epic N — Title  <emoji>  (tag)` (em-dash, exactly ONE status emoji). Task lines are `- ⬜ A1. Text` — status emoji, task ID, a **period**, then a space (`TASK_LINE = /^\s*-\s+(⬜|🟡|✅)\s+(\S+?)\.\s/u`). Task IDs are **epic-scoped** and may repeat across epics; `workflow.json → roadmap_tasks[]` references them as `E<num>-<taskId>` (e.g. `E1-A1`), which `parseToken` splits on the dash. Non-`## Epic` headings are ignored by the parser, except `## Progress`, which is parsed into bullets.
- Trap: `countTaskStatuses` counts **raw emoji occurrences in an epic's BODY**. A single ⬜/🟡/✅ used decoratively in an epic's prose blurb silently inflates that epic's task tally — no error, no anomaly, just a wrong count in `standup`. Keep epic prose emoji-free. `auditRoadmap`'s only malformed-line signal is two *adjacent* status emojis, so it will NOT catch a stray emoji sitting in a sentence.
- Mitigation: after any edit to the roadmap (including a `prose`/`humanizer` pass over its blurbs), round-trip BOTH parsers before committing — `auditRoadmap` must return zero anomalies AND `standup gather` must return the expected per-epic tallies. A tally change with zero anomalies means an emoji leaked into prose or a task line was reshaped.
- Note: `resolveRoadmapPath(cfg, repoRoot)` takes the raw path **string** from `project.json` as `cfg`, not the repo root — passing an absolute path returns `null` by design (it rejects absolute and repo-escaping paths).

---
