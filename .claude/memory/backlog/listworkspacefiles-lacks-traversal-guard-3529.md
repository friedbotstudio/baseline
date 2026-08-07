---
key: listworkspacefiles-lacks-traversal-guard-3529
category: backlog
scope: [security, implement, simplify]
governs: .claude/skills/workspace/store.mjs
status: open
raised-on: 2026-08-07
raised-in-context: readme-count-gate (Phase 8 security review)
source: assistant-deferral
estimated-effort: tiny (one line plus a rejection test)
verified-at: 1db3b6c
last-touched: 2026-08-07
---

> Call the existing guard at the sink rather than relying on the caller's regex — `assertNoTraversal(kind)` as the first line of `listWorkspaceFiles`, matching what `writeWorkspaceFile` already does two functions below it. That is one line, fixes both callers and every future one, and follows the repo's stated REJECT-never-normalize doctrine. Deferring is defensible given zero reachability; if deferred, it belongs in the backlog rather than nowhere.

**`store.listWorkspaceFiles` is the one corpus primitive that joins a caller-supplied segment without `assertNoTraversal`.** Its siblings both guard: `readSourceText` (`tree.mjs:32-34`) and `writeWorkspaceFile` (`store.mjs:59-61`, two functions below it). `listWorkspaceFiles` does `join(specDir, kind)` bare.

**Why it became worth filing now.** Until this workflow, both callers passed a literal — `shards.mjs:131` passes `'diagrams'`. `readme-gate.storedCount` is the first caller to pass a value derived from **file content**: a directory name captured out of the `docs/system/README.md` table by `COUNT_ROW`.

**Not currently reachable, and the reason is the whole point.** The capture class `[a-z0-9_-]+` admits no `.`, `/`, `\` or `:`, so it can produce neither a `..` segment nor an absolute prefix, and both of `assertNoTraversal`'s rejection rules are unreachable by construction. The safety therefore lives in a **regex in the caller**, not in a guard at the sink. Widening that class to something entirely natural — `[\w.-]+`, to accept a dotted directory name — makes `..` reachable with nothing behind it, and **no test would fail**. Severity is low on its own terms even then: the operation is a directory listing that returns filenames, reads no content, writes nothing, and the taint source is a version-controlled file whose editor already has repo write.

**Fix.** `assertNoTraversal(kind)` as the first statement of `listWorkspaceFiles`, plus a test that a `..` segment throws rather than lists. REJECT, never normalize — do not "repair" the segment, which would mask the traversal instead of surfacing it.

**Evidence.** `docs/archive/2026-08-07/readme-count-gate/security.md`, the LOW finding (OWASP A01, CWE-22). Same doctrine as the plan-store slug guard, which chose REJECT for exactly this reason.

**Related.** [[a-check-that-measured-nothing-reports-success]] — a guard that cannot fire is the same shape of problem as a check that measures nothing, one layer over.
