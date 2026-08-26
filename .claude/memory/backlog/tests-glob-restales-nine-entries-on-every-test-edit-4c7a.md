---
key: tests-glob-restales-nine-entries-on-every-test-edit-4c7a
category: backlog
load_bearing: false
scope: [triage, memory-sync]
governs: .claude/memory/**, .claude/hooks/lib/staleness.mjs
status: open
raised-on: 2026-08-27
raised-in-context: memory-reverify-sweep
source: assistant-deferral
verified-at: 5f52ba2
last-touched: 2026-08-27
---

> verbatim (assistant, 2026-08-27):
> "Exactly 9 entries in the whole store carry `governs: tests/**`, and all 9 are the ones that will flip. A glob that wide means any commit touching any test re-stales all of them, forever. It is the same wide-glob blast radius the repo already has a landmine for on the census side, showing up here as decay churn instead. Narrowing those to the specific test files they actually describe would stop the treadmill."

- Intent: narrow `governs: tests/**` on the nine entries that carry it, so a commit touching an unrelated test stops re-staling all nine.
- **Measured 2026-08-27 at `5f52ba2`.** Nine entries carry the glob: `claude-skills-lib-tests-is-executed-by-nothing`, `a-red-pre-existing-test-may-be-a-contract-conflict`, `a-retrofit-guard-is-proven-by-re-breaking-what-it-guards`, `census-and-budget-are-different-numbers`, `a-check-that-measured-nothing-reports-success`, `a-checker-aimed-one-axis-off-passes-loudly`, `a-cycle-that-adds-a-gate-must-assert-the-consumer-calls-it`, `a-wide-governs-glob-ripples-into-unrelated-literals`, and `grep-reports-no-match-on-utf8-files-it-calls-binary`. The `memory-reverify-sweep` chore edited one test file and put eight of them straight back to stale, hours after each had been read against live code and confirmed accurate.
- Why it matters: the stale queue is supposed to name entries whose subject moved. An entry re-staled by an unrelated test edit did not drift, so the queue stops distinguishing "go and check this" from "a test changed somewhere". That is the same failure mode the commit-distance leg had before `staleness-is-witnessed-not-counted-2026-08-24` replaced it — a signal that fires so often nobody reads it.
- **[[a-wide-governs-glob-ripples-into-unrelated-literals]] is one of the nine**, which is the tell. It documents this blast radius for census literals and is itself scoped widely enough to be a victim of it. Whatever narrowing lands should fix that entry first, as its own proof.
- Not every one of the nine is wrong. Some genuinely describe test-suite-wide conventions and a broad glob is honest for them. The work is deciding which, per entry, and narrowing only the ones that name specific files or specific guards — `grep-reports-no-match-on-utf8-files-it-calls-binary`, for instance, is about grepping repo sources rather than about tests at all.
- Do NOT fix this by widening the stale threshold or exempting a category. That hides genuinely rotten entries along with the churn, which is the trap [[stale-count-is-dominated-by-a-migration-cohort-15a1]] already records for the migration cohort.
- Tooling that exists: `node .claude/skills/memory-index/scope-narrow.mjs report` proposes high-confidence `governs:` narrowings and `applyNarrowing` rewrites frontmatter only, leaving body prose byte-identical. Neither decides — the curator confirms each one (Article II).
