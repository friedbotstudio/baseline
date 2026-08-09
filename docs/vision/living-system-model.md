# Living system model — durable architecture memory + decision graph

Status: vision note, not a spec. Captured 2026-08-04 from a design conversation.
This is forward-looking direction for the memory model and the workflow that feeds it;
it is NOT yet triaged. When work begins it goes through a real `/triage` → intake → spec
→ approve cycle. Nothing here is approved scope.

Provenance discipline follows `.claude/skills/faithful-capture/SKILL.md` (written during
this same conversation): Part 1 is the project owner's framing, Part 2 is Claude's
contribution marked as such, Part 3 is what neither of us has settled. Where a list item
arrived under an example marker it is recorded as illustrative, not committed.

---

## Part 1 — Direction (as framed by the project owner)

### 1.1 The origin question

The subject is the **memory system**. The goal is a *map of memory with indices*, such
that prior work can be referred back to without losing track. The load-bearing piece is
**how the indices are built**. Everything below hangs off that; decisions, ADRs and
diagrams are payloads passing through an indexing structure.

### 1.2 What is wrong today

> "each spec work, rewrite everything and has to scout whole codebase to understand the system"

Every workflow cycle re-derives the system model from scratch, uses it once, and archives
it with the spec. Durable knowledge is being stored in transient, per-slug containers.

### 1.3 Terminology: "protocol" = today's specs

The specs that exist today are what this conversation calls **protocol**. They are spec
only. Protocol is baked into code but does not survive as a decision trail — reading the
code does not recover the chain that justifies it.

### 1.4 The proposed model

What the new memory model stores is today's spec **broken into pieces** that persist:

- high-level software C4 diagrams
- module-level diagrams
- an algorithm's flow-charts *(if needed)*
- a BPMN diagram *(if needed)*
- other UML diagrams

These **evolve**, are **highly linked**, and are **indexed**, with associated write-ups.

### 1.5 Specs become contributions, not rewrites

Each spec cycle **contributes** to the core diagrams — add, remove, or update diagrams
and their write-ups, then update the indices. Knowledge stays central. With each cycle
building the application gets easier, because the system matures into a highly abstract
knowledge graph expressed in UML, with **no specification loss**.

### 1.6 Capture path

The existing `_pending` capture mechanism, **after some modification**, can capture notes
on the fly during ordinary work. A later **workflow node** expands those into a
well-linked knowledge graph of ADRs and updates the indices. The shape and placement of
that workflow node is deliberately not specified yet.

Note on existing behavior: `/memory-sync` **segregates** candidates and discards noise —
it is not a plain reset. The segregation step is the part that matters here.

**Known constraint on the current capture leg** (verified 2026-08-04 during a flush):
`memory_stop.mjs` reads only the session transcript and `_pending.md`. It never reads the
canonical files, and there is no discard ledger — so it cannot know that a candidate was
promoted or rejected at a previous flush, and re-derives the same candidates every turn.
Today this is cosmetic. For a decision-extraction node it is not: without idempotence, an
already-rejected ADR gets re-proposed every session. Whatever "after some modification"
turns out to mean in §1.6 has to cover this.

### 1.7 Tracking comments in code

Introduce tracking comments in code that link back to ADR / research / constraint,
**particularly where they help when the code is scouted in future** — to attach context a
diagram is at the wrong altitude to carry, such as a peculiar edge case or a business rule.

### 1.8 Why this matters — the maintenance risks

Code maintainability was tested and is *not* the concern: after production code existed,
five new features and four updates were straightforward. The real risks are:

1. **Not knowing why code exists in its current form** — leads to misdiagnosed issues and
   reintroduction of bugs during maintenance.
2. **Re-architecting to fix what could have been a one-line change** — not catastrophic,
   but wasteful.

Both reduce to a **missing decision trail**.

### 1.9 Constraint model

A prototype gives a proof of concept but can miss architectural constraints of the
existing codebase (example: no SSO support, discoverable only once code-scout runs). This
needs a **constraint model graph**, updated after production code is written — as a
before-commit step.

### 1.10 Decision linkage and state

Every decision affects future decisions, and sometimes past ones (scope amendments). This
needs ADRs linked to each other with an index — a knowledge graph. Decisions carry a
current state; illustrative examples given, not a committed schema: retired (with link to
the superseding ADR), rejected (with reason or link to material — code, research doc,
constraint), living-spec.

### 1.11 Recallability

> "unless the memory is recallable, it is useless"

Originally raised by Claude (§2.8) and adopted here as a premise. What is worth capturing
is architecture, design decisions, protocols, and conventions — and the value is entirely
in making them easy to recall.

### 1.12 Explicitly not doing

**No new workflow track.** Once the model is framed in terms of decisions and decision
trails, prototype→promotion becomes a direct logical approach, and the bulk of spec
writing may dissolve — or remain only for production-code planning purposes. Adding a
track ahead of that would build on a shape that is about to change.

---

## Part 2 — Claude's contributions (marked as such)

Offered during the conversation, not owner-originated. Recorded so the reasoning survives;
none of it is settled.

### 2.1 Three layers, and why the set is complete

Each layer holds exactly what the layer above abstracts away:

| Layer | Holds | Why the others can't |
|---|---|---|
| Structure — C4, module, optional flowchart/BPMN | What the system *is* | — |
| Justification — ADRs | Why it is that, and not the alternative | UML has no notation for a rejected branch |
| Local exception — tracking comments | Edge cases, business rules | No diagram is at the right altitude |

The owner arrived at all three separately, before the covering relationship was visible.

### 2.2 Scout inverts rather than disappears

Scout exists as a phase *because* the system model is not durable. Under this direction it
changes from **discovery** (walk the codebase, build a map that dies with the workflow) to
**reconciliation** (take the durable model, check it against the slice being touched,
repair divergence). Cheaper per cycle, and it is the same mechanism as the before-commit
constraint update in §1.9.

### 2.3 The honesty hazard — top risk

An archived spec can never be *wrong*, only historical. A durable model **can** be wrong,
and a wrong model is worse than none, because scout will trust it and stop looking.
Evidence already in-repo: 26 of 30 `decisions.md` entries read stale in a store whose
record format is good. Structural knowledge rots faster than decisions do, because code
moves under it continuously. Whatever keeps the model honest must be load-bearing in the
pipeline, not a discipline anyone can skip.

### 2.4 Constraints and decisions need separate lifecycles

A decision is a historical fact — true forever, superseded but never false. A constraint
is a claim about the world and **can become false**. The valuable consequence: when a
constraint flips, every decision whose rationale cited it becomes suspect. That is
invalidation propagation, not documentation, and it only works if constraints are
first-class mutable nodes rather than prose inside an ADR body.

### 2.5 ADR bodies immutable; amendment is an edge

Never edit a superseded ADR. Add the edge, flip the status, leave the body verbatim. The
value of the record includes knowing what was believed at the time — including wrong
beliefs. Editing the body preserves "what is true" but destroys "why did they think that,"
which is the question that causes misdiagnosis.

### 2.6 The existing decision format is already right; delivery is not

`.claude/memory/decisions/` entries already carry Decision / Rationale / Rejected
alternatives. Three delivery failures:

1. **Not code-addressable.** `landmines.md` keys are `path:line`; decisions are slugs. No
   reverse index from file → decisions governing it.
2. **Wrong surfacing moment.** `scope: [spec]` fires when writing a *new* spec. The moment
   it is needed is at diagnosis, cursor on the line. Maintenance is not a workflow phase,
   so it cannot be a scope value.
3. **Wrong expiry model.** Age-based staleness was designed for landmarks (`path:line`
   drifts) and libraries (versions move). A decision does not rot with age — it is
   superseded or it stands. Expiry should be on supersession.

### 2.7 Missing field — load-bearing vs incidental

Nothing in the current record distinguishes "this shape is forced by constraint Z" from
"this shape is arbitrary, restructure freely." Without it a maintainer must assume
everything is incidental, which is how a one-line fix becomes a rewrite (§1.8 risk 2).
Also a candidate gate for *where* a tracking comment (§1.7) is warranted.

### 2.8 Recallability

Raised as "a knowledge graph nobody queries manufactures confidence"; the framing was
poor and the objection to it produced `faithful-capture`. The substance was adopted by the
owner as §1.11.

### 2.9 The merge problem

"Each spec contributes" is additive, which is right. But concurrent workflows — the normal
case under swarm and org mode — will both edit the C4 model. PlantUML is text so git
handles the mechanical merge; two slices adding the same component under different names
is a semantic conflict git will commit happily.

### 2.10 Candidate index keys

The reverse lookups that would make the model recallable rather than merely stored:
component → diagrams it appears in; path → component; AC → sequence; decision →
components it governs; constraint → decisions resting on it (the invalidation edge).

### 2.11 Absence is not a decision

Scope never discussed is not scope that was cut. An extraction node reading a prototype
will otherwise manufacture rejections for everything the prototype does not do.

### 2.12 Prior art not yet reviewed

Living architecture models kept as code, and C4 tooling built around an evolving workspace
rather than one-shot diagrams, are an existing field. Worth reviewing current sources
(per Article VI.5, not training recall) before designing the storage layer.

---

## Part 3 — Open

Explicitly unsettled. The owner named recall and indices as still open, and did not close
the list.

### 3.1 Owner's open questions (verbatim)

> who approves/rejects decisions? how many decisions need human decision to unlock agentic
> workflow? how to club a related set of decisions into one super-set with summary that
> gives enough context to human to make a decision and if they can't, a walkable graph to
> read related decisions to gain full context?

Claude proposed that CLAUDE.md Article XI.12 already answers the first — record by default
with an `owner`, batch-review at gate A, only the closed human's-call category surfaces as
a question — and that clustering could start from existing slug/epic structure rather than
a new similarity algorithm. Neither was confirmed.

### 3.2 Terminology not resolved

**Chain-of-proof** was introduced as an alternative to "decision trail." A trail is
breadcrumbs; a proof chain implies each link is justified by the previous one and breaks
if a link is removed. The second is a materially heavier requirement on the graph. Which
was meant is unresolved.

### 3.3 Diagram core vs optional tail

Claude is reading C4 and module diagrams as the maintained core that survives every cycle,
with flowcharts and BPMN as an optional per-domain tail (they arrived marked "if needed").
Not confirmed; may be inverted.

### 3.4 Where "protocol" lives structurally

Three possible shapes, undecided: a category of its own alongside decisions and
conventions; a property tagging entries in existing categories; or a derived view with no
storage, assembled on demand. Each implies a different index.

### 3.5 Index construction

The original question (§1.1) and still the least-developed part. §2.10 is a candidate key
list, not a design.

### 3.6 Honesty mechanism

§2.3 names the hazard. Candidate mechanisms — scout-as-reconciliation, deriving what is
derivable straight from code, verify-on-cite — compose, but none is chosen.

### 3.7 `faithful-capture` open item

Whether R1's quote-check holds when the "speaker" is a transcript rather than a live
person. The extraction leg reading `_pending` has quotes but no surrounding intent. May
need a ninth rule; may already be R8's job. Best answered by a real extraction.

---

## Part 4 — Already shipped from this conversation

`.claude/skills/faithful-capture/SKILL.md` — capture discipline for both the interview leg
and the ADR leg. Eight rules (R1 quote-before-critique as parent, R2–R4 its violation
surfaces, R5 completion is the speaker's to declare, R6 contributing ≠ evaluating, R7
propose anyway, R8 verbatim outranks interpretation), a mechanical pre-output gate, and
two consumer legs. Currently user-owned (no `owner:` frontmatter), so it is outside the
baseline manifest, the skill count, and `audit-baseline` scope. Promotion to
`owner: baseline` is a separate decision.

---

## Sequencing

1. This note is **not triaged**. It is input to `/triage`, not output of it.
2. The open items in Part 3 — index construction especially — are not spec-ready. The
   owner's position is explicit: *"we are not ready to spec it because a lot is riding on
   it"* and *"before we can think of workflows redesign, we need to first understand what
   the workflow should look like."*
3. No new workflow track (§1.12) until the decision model settles.
4. When work begins it goes through a real `/triage` → intake → spec → approve cycle like
   any other change to the baseline.
