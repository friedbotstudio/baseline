# graph.mjs — I/O contract & tasks JSON schema

The helper is the deterministic core of Step 8 (order/cycles) and Step 10 (compaction). You build the
`tasks.json` from your Steps 1–7 output; the script judges it.

## tasks.json

```json
{
  "buckets": ["platform", "solution", "web", "app"],
  "tasks": [
    {
      "id": "E3-P5",
      "epic": "E3",
      "bucket": "platform",
      "category": "Interface",
      "title": "Metadata REST read edge",
      "deps": [],
      "order": 41
    },
    {
      "id": "E3-P6",
      "epic": "E3",
      "bucket": "platform",
      "category": "Interface",
      "title": "Published API contract (OpenAPI 3.0)",
      "deps": ["E3-P5"],
      "order": 42
    },
    {
      "id": "E3-W1",
      "epic": "E3",
      "bucket": "web",
      "category": "Interface",
      "title": "Generate web client SDK + render product form",
      "deps": ["E3-P6", "E3-S1"],
      "seamDeps": ["E16-observability-seam"],
      "order": 44
    }
  ]
}
```

### Fields

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Stable, unique task id. Convention: `<epic>-<bucketLetter><n>` (e.g. `E3-P6`, `E3-W1`). |
| `epic` | yes | Epic id the task belongs to (Step 5). |
| `bucket` | yes | One of `buckets` (platform/solution/web/app). Ties in ordering break by bucket rank (array order). |
| `category` | yes | `Infrastructure` \| `Business Logic` \| `Interface` (Step 6). Used by compaction grouping. |
| `title` | yes | One-line task title. |
| `deps` | yes (may be `[]`) | HARD dependency ids. Edge `dep -> task` = dep ships first. Consumer cannot function without producer. |
| `seamDeps` | optional (default `[]`) | SOFT/seam ids — cross-cutting inherited defaults that SHOULD precede this task (e.g. security/audit/tenancy/observability). Edge `seam -> task`. Floats the seam early; relaxed (not errored) if a hard edge forbids it. |
| `order` | optional | The task's position in an EXISTING roadmap. Supply it to validate that roadmap; omit when deriving fresh. |
| `functionalValue` | optional | Business-value lens (product-owned). WSJF numerator part. Default 0 when scoring active. |
| `nonFunctionalValue` | optional | Engineering-value lens — maintainability/diagnosability/security-posture (**architecture-owned**). Default 0 when scoring active. |
| `effort` | optional | Job size (WSJF denominator). Default 1; must be `> 0` (else exit 1). |
| `scoreOverride` | optional | Human judgment call — replaces the computed score for this task. Requires `overrideReason` (else exit 1). |
| `overrideReason` | required with `scoreOverride` | Non-empty rationale (a human-directed call); shown in `order` output. |

Top-level `weights: {functional, nonFunctional}` (default `{1, 1}` = 50/50) weights the two lenses; must sum to `> 0` (else exit 1).

## Semantics

- **Hard edge (`deps`):** `deps: ["X"]` on task `T` means `X` is the **prerequisite/producer** and must
  ship **before** `T` (the consumer). `X -> T` in graph terms. Hard edges alone drive cycle detection.
- **Soft/seam edge (`seamDeps`):** `seamDeps: ["S"]` on task `T` means `S` is a cross-cutting inherited
  default that **should** precede `T` (`S -> T`). Ordering runs over the **combined** graph (hard +
  admitted soft), so a seam floats as early as its hard constraints allow.
- **Relaxation (soft edges never gridlock):** a seam edge is admitted only if the consumer cannot reach
  the seam in the graph built **so far** (hard + already-admitted seams — an incremental check, so a
  mutual soft cycle `S↔T` admits one and relaxes the other). A seam edge that would close a cycle is
  **relaxed** (dropped) and reported as an **advisory** line; the exit code is unchanged.
- **`analyze`** — reports hard cycles (with the path), relaxed seam edges (advisory, when seams present),
  and — when `order` is present — ordering violations: `producer-after-consumer` (a `dep` whose `order` ≥
  the task's `order`) and `seam-after-consumer` (an **admitted** seam whose `order` ≥ its consumer's
  `order`; relaxed seams are skipped). Both violation classes are blockers.
- **`order`** — one valid dependency-respecting order over the combined graph (seams float early); ties
  broken by **WSJF score DESC** (when scoring is active) then bucket rank, epic, id. This is the Step-9
  order. Each line is annotated `score=<n>` (and `override:<reason>`) when scoring is active.
- **Priority scoring (`order` only, advisory).** When ≥1 task carries a score field (or a
  top-level `weights` is present), `order` ranks the *topologically-ready set* by
  `weightedAverage(functionalValue, nonFunctionalValue; weights) / effort`; `scoreOverride` replaces the
  computed value. The score is a **tiebreak within the ready set** — it **never crosses a hard `deps`/
  `seamDeps` edge** (a high-score consumer still ships after its producer) and **never affects `analyze`**
  (correctness is edge-only). Low-value/high-effort tasks defer as late as their dependents allow. Score
  input is validated at load (all commands, exit `1`): `scoreOverride` without `overrideReason`,
  `effort ≤ 0`, or `weights` summing to `≤ 0`.
- **`compact`** — two candidate kinds: `chain` (`A -> B`, B's sole dep is A, same epic+bucket, A has no
  other dependent → collapsible) and `parallel` (same epic+bucket+category + identical deps + mutually
  independent → mergeable into one slice). A pair joined by a seam edge (admitted or relaxed) is **never**
  a merge candidate.
- A `dep` **or** `seamDeps` id not present among tasks is a **dangling dependency** → exit `1`.

### Exit codes

| Exit | Meaning |
|---|---|
| `0` | clean — acyclic, no ordering violations |
| `1` | dangling dependency (a `deps` or `seamDeps` id is not among the tasks) |
| `2` | hard cycle in `deps` (soft edges never contribute) |
| `3` | ordering violation — `producer-after-consumer` or `seam-after-consumer` |

**Backward compatibility:** a `tasks.json` with no `seamDeps` **and no score fields** on any task
produces byte-identical `analyze`/`order`/`compact` output to the pre-seam / pre-scoring tool. The
`score=` annotation and the WSJF tiebreak appear only when scoring is active. Seam-only output (advisory relaxations,
seam-after-consumer rows, the `relaxations` summary key) appears only when `seamDeps` is present.

## How to use it in the method

1. After Step 7, serialize every task to `tasks.json` — **without** `order` for a fresh derivation, or
   **with** `order` (its line position in the current roadmap) to validate the existing roadmap.
2. `analyze` to find cycles + violations. Break cycles (Step 8) by splitting both tasks and adding a
   shared-prerequisite task; re-run until exit ≠ 2.
3. `order` to get the derived Step-9 sequence.
4. `compact` to get Step-10 merge candidates; apply judgment, then stop.

The script never mutates your files — it reads `tasks.json` and prints. Keep `tasks.json` in the
workspace so re-runs after edits are cheap.
