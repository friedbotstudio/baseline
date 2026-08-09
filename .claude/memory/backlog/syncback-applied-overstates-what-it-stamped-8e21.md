---
key: syncback-applied-overstates-what-it-stamped-8e21
category: backlog
scope: [archive]
status: open
raised-on: 2026-08-06
raised-in-context: central-system-spec (`/archive` Step 5, first real execution)
source: assistant-deferral
estimated-effort: small (partition the return value + a test on a glob-anchored element)
verified-at: d4e6216
last-touched: 2026-08-06
---

> `syncBack` reported 8 elements applied. Only 3 of them actually carry a digest.

**The defect.** `contribute.syncBack` pushes an element into `applied[]` whenever `stampElement` returns anything other than `dangling`. Glob-anchored elements are never digested — a glob names a family, so there is no single interface to hash — yet they still come back non-dangling and still get counted.

**Measured on this workflow.** 8 reported applied. Three carry a real digest: `spec-diagram-presence-guard`, `write-set-profile`, `memory-index-resolve`. Five are glob-anchored and carry none: `workspace-corpus`, `audit-baseline-helpers`, `memory-sync-helpers`, `memory-hook-libs`, `memory-index-helpers`.

**Why it matters.** `applied[]` is the receipt an operator reads to decide whether the fold-back did its job. A count inflated by ~2.7x makes an under-performing sync look complete. It also masks the real question a glob-anchored element raises, which is that nothing witnesses it at all.

**Second half of the same problem.** `syncBack` returns `{applied:[],proposed:[]}` both when nothing matched and when the caller passed no paths. Those are opposite situations with identical output, and the ambiguity already caused one silent no-op — see [[zsh-does-not-word-split-so-node-e-argv-arrives-as-one-argument]]. Partition the return value (`stamped`, `skippedGlob`, and an explicit signal for an empty input) rather than adding a count.

**Related.** [[anchor-digest-is-vacuous-for-exportless-files-3f7c]] is the other half of the witness-honesty problem: this entry is about elements that report a stamp they did not get, that one is about elements that get a stamp that means nothing.
