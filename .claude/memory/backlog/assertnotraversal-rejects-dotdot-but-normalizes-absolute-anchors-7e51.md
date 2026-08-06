---
key: assertnotraversal-rejects-dotdot-but-normalizes-absolute-anchors-7e51
category: backlog
scope: [security, tdd]
status: picked-up
raised-on: 2026-08-06
raised-in-context: workspace-corpus-backfill (`/security` LOW finding, OWASP A04 / CWE-22)
source: assistant-deferral
estimated-effort: small (one guard clause in tree.mjs + a test; no consumer changes)
verified-at: 571b6a3
last-touched: 2026-08-06
caveat: this is a CONSISTENCY fix, not an exposure fix. Probed 2026-08-06: an anchor of `/etc/passwd` under rootDir `.` resolves to `etc/passwd` and returns `state: "dangling"` — nothing reads outside the tree today. Do not let the low severity turn into "wontfix"; the value is that the stated rule becomes true.
superseded-at: 2026-08-06
---

- Intent: `assertNoTraversal` (now `.claude/skills/workspace/tree.mjs`) rejects a `..` segment but says nothing about a leading `/`. Node's `join('.', '/etc/passwd')` yields `etc/passwd`, so an absolute anchor is silently rewritten into a different path than the author wrote.
- Why it matters: the module's own comment states the principle it half-enforces — "REJECT, never normalize — silently rewriting the path would read a different file than the author named." A `..` escape is loudly refused while `/`, the same intent expressed differently, is quietly reinterpreted. A rule enforced on one spelling of an input and not the other trains readers to trust it further than it holds.
- Fix: extend the guard to reject a leading separator and a Windows drive prefix in the same error register, e.g. `if (/^([\\/]|[A-Za-z]:)/.test(text)) throw ...`. Anchors are contracted to be repo-relative, so no legitimate anchor is affected. Add the case to `tests/workspace-digest.test.mjs` beside the existing `..` test.
- Full analysis: `docs/archive/2026-08-06/workspace-corpus-backfill/security.md`.
