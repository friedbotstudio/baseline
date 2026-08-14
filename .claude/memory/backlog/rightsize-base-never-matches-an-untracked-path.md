---
key: rightsize-base-never-matches-an-untracked-path
category: backlog
scope: []
status: picked-up
source: assistant-deferral
raised-on: 2026-08-13
raised-in-context: diagram-shard-rewrite-loses-fields
verified-at: 79e41cb
last-touched: 2026-08-13
governs: .claude/skills/harness/rightsize-gate.mjs
superseded-at: 2026-08-14
---

> `rightsize-gate` measured `docs/audits/swarm-first-production-run-2026-08-09.md` as touched even though that path sits in `workflow.json → rightsize_base[]` precisely so it would be excluded.

- **The defect.** The baseline snapshot stores plain repo-relative paths. An untracked file arrives from the diff as `/dev/null => docs/audits/…`, so a plain string comparison never matches and every pre-existing UNTRACKED path is measured anyway. Tracked paths in the base list exclude correctly; only the untracked half is broken.
- **Blast radius is small and one-directional.** The gate is fail-open and additive-only, so the failure inflates the measured change size and makes it MORE likely to keep `simplify`/`document` rather than skip them. It changed no outcome in the run that found it. It cannot cause a wrongful skip.
- **Shape of the fix.** Strip a leading `/dev/null => ` (and any `a/`|`b/` prefix) before comparing, or normalise both sides through one helper so the base list and the diff rows are compared in the same vocabulary. A test seeding one untracked file into `rightsize_base` and asserting it is excluded is the guard.
- Same family as [[anti-drift-tests-compare-against-the-live-oracle-b4d2]] one layer over: two lists that must agree, compared in different formats, with nothing asserting they share a vocabulary.
