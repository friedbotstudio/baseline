# Change Order — Research retrieves from the archive before it derives

> **Pickup instructions.** Self-contained requirement brief. No brainstorming needed. Needs design
> (the retrieval mechanism), so run via `/triage` → **spec-entry**, `skip_brainstorm: true`. Authored
> from the ERP consumer session 2026-07-08. Goal is **research quality / reuse, not calendar** — set
> expectations accordingly (research is ~1% of product tokens and is often skipped on spec-derived work).

---

## Problem

The `research` phase (Phase 3) re-derives solution approaches **from a blank page every run**. The archive
(`docs/archive/**/research.md`) and the decision corpus (ADRs / `decisions.md` memory) are a goldmine of
prior, already-reasoned findings — and the current skill reworks ground it has already covered. This wastes
effort and risks contradicting earlier conclusions.

## Desired outcome

Research **retrieves first, derives second**: before generating candidate approaches, it surfaces the
relevant prior research + decisions from the archive/memory, and then only researches the **genuine delta**
— the part not already answered.

## Design direction (from the ERP session — preserve, refine in `/spec`)

- **Archive-RAG.** Retrieval over `docs/archive/**/research.md`, `docs/archive/**/spec.md`, the ADR/decisions
  corpus, and `libraries.md` memory, keyed to the current request (slug + intake topics + touched modules).
- **Delta-only derivation.** Present what was reused (with citations to the source archive/ADR) vs what is
  newly researched. The reviewer can see the provenance of every claim.
- **Grounding, not just approaches.** Current-docs grounding for third-party APIs still applies — see the
  sibling `context7-outcome-mandate.md` change (verify against current docs; context7 is the default). The
  archive retrieval covers *prior internal reasoning*; the current-docs check covers *external API truth*.
  Keep them distinct.
- Interplay with **scout**: research should also consume scout's output (what the codebase already has), so
  it derives grounded in real terrain, not generically. (The order scout→research is already correct; the
  gap is that research doesn't *use* scout's findings — fix the wiring here too.)

## Acceptance criteria

1. The `research` phase surfaces relevant prior research/ADRs/decisions **before** proposing new approaches,
   with citations to the source archive/ADR path.
2. Newly-researched content is limited to the delta not already covered; the output distinguishes reused vs new.
3. Research consumes the scout report (when present) so its candidates are grounded in the actual codebase.
4. No regression: on a genuinely novel surface with an empty archive, research behaves as today (derives fresh).
5. The retrieval is deterministic/inspectable enough that a reviewer can see *why* a prior finding was pulled.

## Rationale to preserve

ERP diagnosis: research is cheap in tokens but its output was generic and re-derived known ground. The prize
is **quality + reuse + non-contradiction with prior decisions**, not speed. This is the retrieval half of the
"institutional memory" the Decision Ledger (Vision V2) is meant to provide — research should *read the ledger
of past reasoning* before writing new reasoning.

## Constraints / governance

- Baseline-owned, manifest-hashed: the `research` skill (`.claude/skills/research/SKILL.md` + any helpers).
  Regenerate the manifest (`bash scripts/build-template.sh`) after editing. If a new retrieval helper script
  is added, it's a new baseline file — record ownership + hash it.
- Keep it dependency-light (U6): retrieval should not introduce an irreplaceable third-party vector-DB
  dependency. Prefer a local, inspectable index over the archive/memory (grep/embedding-light or a small
  local store), consistent with the baseline's no-irreplaceable-dependency stance.

## Cross-references

- ERP backlog `research-retrieve-first-from-archive-before-deriving-e677` (the same intent, ERP-side capture).
- `docs/handoff/context7-outcome-mandate.md` — the external-API-grounding sibling.
- `office/docs/vision/baseline-v2-deliberation-system.md` — the Decision Ledger as institutional memory.
