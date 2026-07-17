---
key: internal-phases-declared-resolved-at-runtime-2026-07-13
category: decisions
scope: [spec]
source: user-instruction (the Q3 policy call at spec review: chore gains a sensitive-glob security trigger) + `/scenario`'s discovery of the D11 contradiction.
verified-at: 1414f27
last-touched: 2026-07-13
---

- Decision: `.claude/workflows.jsonl` tracks may declare **`internal_phases[]`** — the phases a track's own skill may run WITHOUT a DAG node (chore: `verify`, `simplify`, `security`, `integrate`, `document`). `/triage`'s `deriveExceptions` **subtracts them at derivation time** (it cannot pre-judge a conditional: at triage the diff does not exist yet), and the track's skill **resolves each one at runtime** into `completed` (it ran) or `exceptions` (its trigger did not fire), recording an `auto_skipped[]` row.
- Why: nothing on disk previously declared what a track could run internally, so `/triage`'s SOP and `chore/SKILL.md` each **guessed, and contradicted each other**. That is the root cause of the whole prereq-drift class: `integrate` demanded `security` in `completed|exceptions`, but the chore DAG has no security node, so security landed in NEITHER set and the prereq was structurally unsatisfiable. Same shape blocked a `power` workflow's `/spec` write on a missing `research` node.
- The trap that nearly shipped: forbidding an internal phase from EVER being excepted (the first cut) **broke the very defect it was fixing** — on a chore with no sensitive-glob diff, `security` never runs, so it is in neither set and `integrate` still fails. And it fails only on the COMMON case; a chore touching `.claude/hooks/**` runs security, lands it in `completed`, and passes. Caught by `/scenario` before a line of implementation.
- Governance: the chore skill writing to `exceptions` is **recording a sanctioned decision, not a new bypass power** — Article IV already sanctions chore's conditional routing ("conditionally routes through verify/simplify/integrate/document by what the diff touches"). What changed is that the skip became auditable instead of living in a prose summary. No Article IV amendment. If a future reader disagrees, the remedy is an amendment naming the chore skill as a third mechanism, not a silent revert.
- Also landed: `deriveExceptions` carries a hard **CONSENT_DENY_LIST** (`approve-spec`, `approve-swarm`, `grant-commit`, `commit`), fail-closed. Nothing in `workflows.jsonl` REQUIRES an `approve-spec` node, so a naive derivation would auto-except **gate A** and `track_guard` would then permit `tdd` writes with no approval token. Attacked directly in `/security` (injecting all four gates via the caller-supplied `authored` array) and it held.
- verbatim (user, 2026-07-13):
  > "fix them before we move"

---
