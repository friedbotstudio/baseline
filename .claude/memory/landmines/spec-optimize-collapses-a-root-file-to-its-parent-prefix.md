---
key: spec-optimize-collapses-a-root-file-to-its-parent-prefix
category: landmines
scope: [spec]
governs: .claude/skills/spec/cli.mjs,.claude/hooks/lib/write-set-profile.mjs
verified-at: 8fb72a5
last-touched: 2026-08-15
---

- Path: `.claude/skills/spec/cli.mjs optimize` (the `/spec` Step 6.5 advisory pass), resolving write-set entries through `.claude/hooks/lib/write-set-profile.mjs → directoryPrefix`.
- Trap: `directoryPrefix` maps a file to its **parent directory**, so a single top-level entry in a spec's write set collapses to a prefix that matches most of the corpus. Measured 2026-08-15 on `codebugger-explanation-trace`: `directoryPrefix('.claude/project.json')` returns `.claude/`, and the pass then reported **112 `undeclared` and 117 `reuse` findings against a 119-element corpus** — every element in the repository, from a write set of 21 entries that genuinely touched six.
- Why it reads as real: each row is individually plausible ("write_set touches this element but no System delta row names it"), and the pass prints no total against corpus size, so the signal is not obviously drowned. A curator who trusts the row count would add ~112 System delta rows for elements the change never touches.
- The tell: `corrections` was **0** in the same run. `corrections` is the only one of the three findings that `/spec-lint`'s `system_delta` check also enforces, so `undeclared`/`reuse` in the hundreds beside `corrections: 0` means the prefix collapsed, not that the spec is under-declared. Cross-check against `/spec-lint` before acting on either list.
- Mitigation while it stands: read `undeclared`/`reuse` as advisory only when the write set contains no top-level file under a governed root. `.claude/project.json`, `.claude/workflows.jsonl`, and any `src/<file>` will each sweep their whole root. The pass is advisory by contract (`spec/SKILL.md` Step 6.5: "it never blocks, and it never edits the spec"), so this misreports rather than breaks — which is exactly why it can sit unnoticed.
- Not yet fixed. The candidate fix is to keep a file entry as the file rather than its parent when the entry names a file, reserving `directoryPrefix` for entries that already denote a directory. See [[a-workflows-declared-write-surface-narrows-what-a-phase-surfaces]] for the adjacent surface-narrowing semantics.
