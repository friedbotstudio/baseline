---
key: sprint-pool-broker-transport-2026-06-23
category: decisions
scope: [spec]
verified-at: ca592c2
last-touched: 2026-06-23
---

> verbatim (user, this session): "Full broker transport now" (AskUserQuestion) + "there will be risks later trust me.. when we have multiple sessions running ... clone the repo and then each peer session manages its own branch ... and lead merges them into main. Once we are there we no longer have 1 and 2 true"

- Decision: the PROJECT-LOCAL sprint-pool coordination transport was transposed from files-as-bus + a 750ms poll-watch loop to an in-process BROKER over a Unix-domain socket (`.claude/mcp/sprint-broker/`: codec / sock-path / atomic-store / broker / client). The lead session hosts the broker (sole writer of tasks/yields/peers); peers are NDJSON clients over `$SPRINT_BROKER_SOCK` (a short path OUTSIDE any clone, default under XDG runtime dir / TMPDIR; `launch.sh` sets it). Event-native push replaces the watch loop — the monotonic seen-dedup bug class is gone; the yield-resolution fix is preserved inside `releaseTask`.
- Motivation: the clone-per-peer target topology (each peer in its own repo clone on its own branch, lead merges to main) breaks the per-`PROJECT_DIR` `channelRoot` shared-file assumption (`sprint-pool/server.mjs` anchored state to each session's working tree) — separate clones never shared `tasks.json`. The narrow watcher-dedup fix (`sprint-pool-redispatch-fix`) was SUPERSEDED (archived `docs/archive/2026-06-23/sprint-pool-redispatch-fix-superseded/`).
- Ownership boundary (load-bearing): `.claude/mcp/sprint-channel/**` is BASELINE-OWNED (6 files in `obj/template/.claude/manifest.json`) — frozen, imported READ-ONLY. `.claude/mcp/sprint-pool/**` + new `.claude/mcp/sprint-broker/**` are PROJECT-LOCAL (not shipped, not in manifest). Editing a sprint-channel file → manifest drift + audit FAIL + rebuild tax.
- Codesign: wire message schema left EMERGENT (engineer chose "let it emerge") → component graph is a chain → Phase 6 built SOLO not swarm. Transport UDS (TCP/cross-machine is a documented non-goal); durability write-temp-then-rename atomic snapshot.
- Source: user-instruction (codesign). Spec/security/timing archived `docs/archive/2026-06-23/sprint-pool-broker-transport/`. Connects to [[sprint-mode-mcp-channel-architecture-pivot-2026-06-23]] (the substrate) and the v1 epic `-9d4c`.
