---
key: commit-sop-step-2-names-the-wrong-neighbour-3f1a
category: backlog
scope: [archive, integrate, commit]
governs: [".claude/skills/commit/SKILL.md"]
status: open
source: assistant-deferral
deferred: cost
raised-on: 2026-08-14
raised-in-context: sweep-staleness-parity
estimated-effort: low (two prose clauses in one SKILL.md; no code change)
verified-at: 12effd8
last-touched: 2026-08-14
---

> verbatim (assistant, 2026-08-14, deferring mid-workflow rather than widening a quickfix diff):
> "Deferred chore (not yet triaged): `commit/SKILL.md` Step 2 asserts `archive` is the entry immediately before `memory-sync` (`roadmap-sync` sits between), and Step 1 assumes `/archive` created the bundle dir, which is false on `freeform`."

- Two clauses in `.claude/skills/commit/SKILL.md` describe a workflow shape that no longer exists. Both are prose in a SKILL.md, so neither can fail a build.

- **Defect A — Step 2 names the wrong neighbour** (`.claude/skills/commit/SKILL.md:16`). It reads: "memory-sync is the final non-commit entry in `completed`; `archive` is the entry immediately before it". Phase 10.6 `roadmap-sync` was inserted between `archive` (10.5) and `memory-sync` (10.7) and runs on **every committing track except `epic`**, so `archive` is never immediately before `memory-sync` on the common path.
  - **Measured 2026-08-14 at 12effd8**, live on the `sweep-staleness-parity` workflow: `completed` was `["tdd","security","integrate","document","archive","roadmap-sync"]` at the moment Step 2's check would run. The clause is false as written, and proceeding required reading past it.
  - The `epic` track is the only shape where the clause holds, which is the inverse of what a default should be.
  - **The same sentence is wrong twice.** Its first clause, "memory-sync is the final non-commit entry in `completed`", fails whenever `/triage` seeds a post-`memory-sync` node. On this very workflow `cli-copy-review` was seeded after it, so `completed` ended `[... ,"memory-sync","cli-copy-review"]`. Found while executing Step 2 on the workflow that raised this entry.

- **Defect B — Step 1 assumes a bundle that need not exist** (`.claude/skills/commit/SKILL.md:15`). It calls the target "the already-existing archive bundle" and "the one `/archive` created". On the `freeform` track every pre-commit phase is excepted, `archive` included, so `docs/archive/<date>/<slug>/` does not exist and the `workflow.json` move has no destination directory.
  - Hit live in the `character-guard-and-triage` workflow (freeform, landed as `12effd8`), which is what surfaced this.

- **Why it is the same class as [[simplify-prereq-omits-exceptions-escape-7b56]]**: a phase skill states a precondition its own sanctioned tracks cannot satisfy, in prose that no test reads. That entry fixed a missing `OR in exceptions` escape; this is a missing "except when the DAG omits the node" escape one phase later. Commit `e646328` ("three SOPs stop contradicting the parsers they instruct") is the same shape again.

- Fix: Step 2 should assert `memory-sync` is the final non-commit entry and drop the neighbour claim, or name `roadmap-sync` with an `OR archive when roadmap-sync is excepted` escape. Step 1 should create the bundle directory when absent rather than asserting `/archive` made it.

- Prefer deriving both checks from `workflow.json` mechanically over restating the DAG in prose. Restated prose is exactly what drifted here, and it drifted silently because a SKILL.md cannot go red.
