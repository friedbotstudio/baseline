# Gate taxonomy (C6) — a deliberately-coarse "safe vs ask-a-human" classifier

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
Primary input: docs/brief/gate-taxonomy.md (brainstorm brief).
-->

## Problem

The baseline's "act autonomously vs ask the human" boundary exists today only as
**scattered, non-mechanical prose plus independently hard-coded enforcement**. The
judgment of what must be asked lives in Article XI.12's four-category list in the
annex (consent-adjacent scope, irreversible/destructive ops, policy flips,
contradictory requirements). The *enforcement* of that judgment lives in separate,
hand-written places: the consent gates (`approve-spec`, `approve-swarm`,
`grant-commit`, `grant-push`) and the guard hard-blocks (`git_commit_guard`'s
`FORBIDDEN_RE`, `destructive_cmd_guard`). Nothing ties the two together, and there
is **no single reusable classifier** a caller can consult to ask "is this operation
safe to just do, or must a human decide?".

Concretely: when the v1 thought-compiler adds any autonomy (signal → diagnose → fix
→ act), the orchestrator about to take an action has **no principled place** to
decide act-vs-ask. The vision (§2.4) is explicit that this classification "is itself
the judgment that can't be fully delegated" and mandates building the gate taxonomy
**before** the autonomy — otherwise the first autonomous path re-invents (or skips)
the boundary ad hoc.

## Goal

Give the baseline one reusable, deliberately-coarse classifier that labels an
operation "safe, just do it" or "critical, ask a human" — grounded in the existing
XI.12 categories — so that when autonomy arrives it consults a single principled
decision point instead of scattered prose.

## Non-goals

- **Not building the autonomy itself.** C6 precedes it; nothing autonomous calls it yet.
- **Not changing or replacing the existing consent gates or guard hard-blocks.** They
  stay structurally enforcing exactly as today; this slice is **advisory-only**.
- **Not the AI-native debugging skill** (the successor half of vision piece 8).
- **Not v2 signal-driven actions** (deploy, data migration, external publish) — the
  input domain is a **closed set**, no generic open abstraction (YAGNI).
- **Not fine-grained per-operation policy** — deliberately coarse; fragment when closer.

## Success metrics

- Category coverage — all **4** XI.12 categories are exercised by at least one
  closed-set operation. baseline: 0 (no classifier), target: 4/4, measured via: the classifier test suite.
- Consent-point mapping — every existing live consent point resolves to a taxonomy
  category via the advisory map. baseline: 0 mapped, target: all live points mapped, measured via: an asserted mapping test.
- Zero enforcement drift — existing consent-gate and guard behavior is unchanged.
  baseline: N/A, target: existing hook/guard test suites pass byte-unchanged, measured via: the full test run at `/integrate`.

## Stakeholders

- **Requester**: project owner (repo maintainer, `razieldecarte`).
- **Reviewer**: project owner at gate A (`/approve-spec`) — this is Class-A governance work.
- **Operator** (who runs it in prod): the baseline harness / repo maintainer; the classifier is a baseline-owned, manifest-hashed module.

## Constraints

- **Advisory-only this slice.** The classifier and its map SHALL NOT alter the
  structural enforcement of any Article IV/VII consent gate or guard. Mirrors how the
  mutation oracle (piece 3) shipped advisory-first (floorless, never writes a verdict).
- **Closed input set only** — git ops, destructive bash, consent-token writes,
  phase-skips / exception-adds, spec write-set widenings. Unknown kind → `ask` (fail-safe).
- **Article II** — the classifier is a pure main-context module; no subagent decides anything.
- **Baseline-owned artifacts** — new skill/lib files declare `owner: baseline`; the
  manifest (`.claude/manifest.json`) must be regenerated (`scripts/build-template.sh`).
- **Deliberately coarse** — fragment into finer taxonomy only when a concrete v2 caller forces it.

## Acceptance criteria

1. Given an operation from the closed set (git op / destructive bash / consent-token
   write / phase-skip / spec write-set widening), when classified, then the classifier
   returns `{verdict, category, reason}` where `verdict ∈ {safe, ask}` and, on `ask`,
   `category` is exactly one of the four XI.12 categories.
2. Given an operation kind **not** in the closed set, when classified, then `verdict`
   is `ask` (fail-safe default) with a reason naming the unknown kind.
3. Given a `safe` verdict, then no XI.12 category is attached (safe ⇔ none of the four apply).
4. Given the four XI.12 categories, then each is reachable by at least one closed-set
   operation (the taxonomy is fully exercised, no dead category).
5. Given each existing live consent point (`approve-spec`, `approve-swarm`,
   `grant-commit`, `grant-push`, `git_commit_guard` hard-blocks, `destructive_cmd_guard`),
   then the advisory map resolves it to exactly one taxonomy category, proven by a test.
6. Given the classifier and advisory map land, then every existing consent-gate and
   guard test passes unchanged (no enforcement behavior drift).

## Open questions

- None blocking. Both scope forks (v1 reach into the consent machinery; input-domain
  coarseness) were settled in the brainstorm (`docs/brief/gate-taxonomy.md`): **foundation +
  advisory map**, **closed input set**. The exact category→verdict mapping and the
  operation-descriptor shape are routine engineering decisions to be recorded in the
  spec's `## Decisions` section (`owner: engineer`) and reviewed at gate A — not
  human's-call probes.
