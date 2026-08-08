---
key: spec-lint-omits-the-slug-guard-the-diagram-guard-applies-b93f
category: backlog
scope: []
status: open
source: assistant-deferral
raised-on: 2026-08-06
raised-in-context: corpus-recall-reachability
verified-at: d4a1a47
last-touched: 2026-08-06
governs: .claude/skills/spec-lint/lint.mjs
---

> **Recommendation**: have `unresolvedReferences` call `assertSafeSlug` in the same `try`/`catch` shape as the guard. AC-010's stated goal is that the two callers cannot disagree; carrying the same validation is the cheap way to keep that true under future edits.

- **Source.** LOW finding in `docs/archive/2026-08-06/corpus-recall-reachability/security.md` (CWE-20). Deferred deliberately: `/security` reports, it does not fix.
- **The asymmetry.** `spec_diagram_presence_guard` calls `assertSafeSlug(id)` before building `docs/system/elements/<id>.md`; `spec-lint/lint.mjs → unresolvedReferences` goes straight to `existsSync`.
- **Not currently exploitable, and the reason matters.** `elementReferences` bounds ids to `[a-z0-9][a-z0-9-]*`, so no separator or dot reaches the path, and `existsSync` returns `false` rather than throwing on an over-long name (verified at 5,000 chars against `MAX_SLUG_LEN = 200`). Both callers therefore reach the same verdict today.
- **Why fix it anyway.** The protection rests entirely on the shared charset. Widen that regex once and the guard still has its second gate while the preflight silently loses one — which is precisely the guard/preflight divergence [[a-rule-shared-by-a-guard-and-its-preflight-lives-in-one-module]] exists to prevent.
