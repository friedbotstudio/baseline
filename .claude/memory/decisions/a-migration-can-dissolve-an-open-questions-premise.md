---
key: a-migration-can-dissolve-an-open-questions-premise
category: decisions
scope: [memory-sync]
governs: .claude/memory/pending-questions/**
source: assistant-deferral
verified-at: c53a121
last-touched: 2026-08-13
---

- Decision: Q-002 was closed MOOT on 2026-08-13, not decided. It asked whether `.claude/memory/landmarks.md`'s `size-cap: 700` should be ratified or reverted to 500. The 2026-07-20 shard migration replaced flat `landmarks.md` with `.claude/memory/landmarks/` (121 shards), and `.claude/memory/README.md` states the sharded shape has no per-file cap. Verified 2026-08-13: the flat file does not exist and `size-cap: 700` appears nowhere in the live corpus.
- Generalisable: a question can stop being a question without being answered. The migration dissolved the premise while the question sat open for 24 days, and nothing connected the two. When a migration retires a shape, sweep the open questions asked about that shape.
- Why this is recorded here and not on pending-questions: `sweep.mjs --mode auto-close` DELETES a block the moment a valid `resolved-at:` is present. A closure rationale written into the question is destroyed by the very stamp that closes it. Closure reasoning belongs in a durable category; the question file is a queue, not a record.
- Two archived artifacts still name Q-002 as open and deferred: `docs/archive/2026-07-17/memory-decision-point-redesign/scout.md:55` and `docs/archive/2026-07-20/shard-migration-repair/spec.md:25`. This entry is what answers them.
