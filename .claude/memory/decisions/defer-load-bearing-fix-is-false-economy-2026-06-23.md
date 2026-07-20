---
key: defer-load-bearing-fix-is-false-economy-2026-06-23
category: decisions
scope: [spec]
verified-at: ca592c2
last-touched: 2026-06-23
source: user-feedback. Connects to the velocity-levers backlog `-v0lv` and [[sprint-pool-broker-transport-2026-06-23]].
---

> verbatim (user, 2026-06-23): "We are avoiding a fix (just by assuming it is more work) and TBH this 'more work' logic is leading to more token consumption and worse 'time waste'"

- Decision (working principle): when a deferred fix is LOAD-BEARING for the known target architecture, confront it now rather than scoping it down as "more work." Deferring such a fix costs MORE total tokens + wall-clock (fix-the-symptom-now → rip-it-out → redo) than transposing once.
- How to apply: at triage / scope decisions, distinguish a genuinely-optional polish (safe to backlog) from a fix the target topology will force anyway (do now). The reflex to minimize THIS change can maximize total work. The verbatim is canonical; this interpretation is Claude's.
- Origin: surfaced when the narrow watcher-dedup fix was about to ship, then was superseded by the broker transport — the dedup fix would have been thrown away.
