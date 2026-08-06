---
key: the-fix-is-one-line-assertnotraversal-named-before-2afb
category: backlog
scope: [security, tdd]
status: open
raised-on: 2026-08-06
raised-in-context: central-system-spec (`/security`, MEDIUM + LOW; both left unfixed pending a human call)
source: assistant-deferral
estimated-effort: small (two guard clauses + two tests; no consumer changes)
verified-at: d4e6216
last-touched: 2026-08-06
---

> The fix is one line — `assertNoTraversal(named)` before the join — plus optionally constraining the witness to `tdd.test_globs` so it must be a test, not merely a file.

Two findings from `docs/archive/2026-08-06/central-system-spec/security.md`, both open, both hardening the same guard family.

**MEDIUM — witness-test path from shard content bypasses the traversal guard.** `.claude/skills/workspace/reconcile.mjs:157-163`. `const named = shard?.witnessTest ?? target;` is parsed out of a shard's `' @witness <path>` comment (file content) and joined to `rootDir` with no `assertNoTraversal`, while the same function asserts every element *anchor* two lines later. Probed: a shard declaring `' @witness ../../../../etc/passwd` reaches `existsSync` unguarded.

Two effects, the second worse. It is a file-existence oracle for arbitrary out-of-tree paths. And a shard naming any file that exists out-of-tree is judged *witnessed*, which under the D8 amendment shipped in the same ticket makes the diagram **citable as evidence** — defeating the falsifiability property ticket C exists to establish.

**LOW — `assertNoTraversal` accepts a NUL byte.** `.claude/skills/workspace/tree.mjs:15-30`. `assertNoTraversal("x\0.mjs")` returns rather than throws. Inert today: `readSourceText` wraps `statSync` in try/catch so the fs rejection surfaces as `null`, and `path.join` keeps the NUL literal, so there is no truncation or escape. It is a **consistency** gap against the module's stated REJECT-never-normalize rule, the same class as the leading-separator gap `-7e51` that this cycle closed.

**Fix both together.** Call `assertNoTraversal(named)` before the join, and add NUL to the rejected set in the same guard clause. Reject, never normalize — see [[slug-path-guards-must-reject-not-normalize-and-three-regex-traps]]. Optionally constrain a witness path to `project.json → tdd.test_globs` so a witness must be a test rather than any file that happens to exist.

**Do not let LOW become wontfix.** The value of the NUL clause is that the module's stated rule becomes true, which is the same argument that carried `-7e51`.
