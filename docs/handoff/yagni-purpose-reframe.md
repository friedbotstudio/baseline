# Change Order — YAGNI purpose reframe (target over-engineering, not feature delivery)

> **PICK THIS NEXT.** Small, self-contained governance amendment (like context7). Run via `/triage` →
> **chore**, `skip_brainstorm: true`. Turnkey exact edits below. Class-A (touches `seed.md` + an Article),
> low Threat-Tier. Authored from the ERP consumer session 2026-07-10.

---

## User instruction (verbatim — this is the source of truth)

> modify YAGNI; it is not about stopping user from building features but about ensuring not to overengineer,
> premature refactoring, and to stop write stub code when not needed

## Problem

YAGNI has been **misread as a brake on feature delivery** — used to defer, thin, or split capability the
approved spec already commits to. On the ERP that misuse "blew 2 days into 20" (memory:
`ceremony-and-yagni-over-deferral`). ADR-0028 already added the *negative* guard (YAGNI never authorizes
deferring spec-committed scope), and VI.4 / §2.4 carry it. What's missing is the **positive purpose
statement**: YAGNI exists to prevent **over-engineering, premature refactoring, and stub/scaffold code
written before it is needed** — it narrows *how* you build, never *whether* you deliver.

Stating the purpose positively closes the misread at the source, instead of relying only on the downstream
`spec-traceability-review` BLOCKER to catch a bad deferral after the fact.

## Exact edit surface (turnkey)

### 1. `CLAUDE.md` VI.4 (line ~142)

**OLD:**
```
### VI.4 YAGNI
- You SHALL NOT add params, flags, or abstractions for hypothetical future use.
- Reuse libraries for what they already do.
- Abstract at the third concrete use case, not before.
- Code without a test exercising it SHALL NOT exist.
- Two-sided faithful scope: YAGNI gates speculation beyond the approved spec; it never authorizes deferring spec-committed scope. A spec AC row deferring committed scope SHALL carry `deferred: dependency|risk|cost|human-directed`; untagged or YAGNI-tagged deferral is a Critical BLOCKER at gate A (`spec-traceability-review`).
```
**NEW:**
```
### VI.4 YAGNI
- **Purpose.** YAGNI exists to prevent **over-engineering, premature refactoring, and stub/scaffold code written before it is needed** — NOT to gate feature delivery. A capability the approved spec commits to is *demand*, not speculation, and SHALL be built in full, in its slice. YAGNI narrows *how* you build; it never decides *whether* you deliver spec-committed scope.
- You SHALL NOT add params, flags, or abstractions for hypothetical future use.
- You SHALL NOT refactor pre-emptively — restructure at the point a concrete third use forces it, not in anticipation of one.
- You SHALL NOT write stub, placeholder, or scaffold code ahead of a concrete need (this is the YAGNI face of VI.1 — no stubs, ever).
- Reuse libraries for what they already do.
- Abstract at the third concrete use case, not before.
- Code without a test exercising it SHALL NOT exist.
- Two-sided faithful scope: YAGNI gates speculation beyond the approved spec; it never authorizes deferring spec-committed scope. A spec AC row deferring committed scope SHALL carry `deferred: dependency|risk|cost|human-directed`; untagged or YAGNI-tagged deferral is a Critical BLOCKER at gate A (`spec-traceability-review`).
```

### 2. `docs/init/seed.md` §2.4 (line ~71)

**OLD:**
```
### §2.4 YAGNI

- Reuse libraries for what already exists. Do not re-implement what a dependency provides.
- No parameters, flags, or configuration options "for future use."
- Do not build abstractions for hypothetical future requirements. Abstract only on the third concrete use case.
- If no test exercises a line of code, that line should not exist.
- Two-sided faithful scope: YAGNI gates speculation beyond the approved spec; it never authorizes deferring spec-committed scope. An AC-table row that defers spec-committed scope carries a reason tag from the closed list `dependency|risk|cost|human-directed` (`deferred: <reason>` in the Criterion cell); `spec-traceability-review` reports an untagged or YAGNI-tagged deferral as a Critical BLOCKER at gate A.
```
**NEW:**
```
### §2.4 YAGNI

- **Purpose.** YAGNI exists to prevent over-engineering, premature refactoring, and stub/scaffold code written before it is needed — not to stop feature delivery. Capability an approved spec commits to is demand, not speculation, and is built in full in its slice. YAGNI constrains *how* you build; it never decides *whether* you deliver spec-committed scope.
- Reuse libraries for what already exists. Do not re-implement what a dependency provides.
- No parameters, flags, or configuration options "for future use."
- Do not build abstractions for hypothetical future requirements. Abstract only on the third concrete use case.
- Do not refactor pre-emptively — restructure when a concrete third use forces it, not in anticipation.
- Do not write stub, placeholder, or scaffold code ahead of a concrete need (the YAGNI face of the no-stubs rule).
- If no test exercises a line of code, that line should not exist.
- Two-sided faithful scope: YAGNI gates speculation beyond the approved spec; it never authorizes deferring spec-committed scope. An AC-table row that defers spec-committed scope carries a reason tag from the closed list `dependency|risk|cost|human-directed` (`deferred: <reason>` in the Criterion cell); `spec-traceability-review` reports an untagged or YAGNI-tagged deferral as a Critical BLOCKER at gate A.
```

### 3. `src/CLAUDE.template.md` + `src/seed.template.md` — byte-equal mirrors (Article XII)

Apply edit 1 to `src/CLAUDE.template.md` and edit 2 to `src/seed.template.md`, character-for-character.

## Manifest / verification

- `CLAUDE.md` / `seed.md` changed → regenerate the manifest: `bash scripts/build-template.sh`.
- `audit-baseline` PASS (mirrors byte-equal; no `hash mismatch`).
- Confirm `CLAUDE.md` stays under the 40,000-char Article I.6 cap after the addition (it grows ~4 lines).
- Grep confirms VI.4 / §2.4 now lead with the positive **Purpose** statement.

## Propagation to consumers

Consumers (e.g. the ERP) inherit via `create-baseline upgrade` → `/upgrade-project`. The ERP's XI.9 + ADR-0028
already carry the negative side, so this positive-purpose addition reconciles cleanly.

## Cross-references

- ADR-0028 (faithful scope is two-sided) — the negative guard this complements.
- VI.1 (no stubs, ever) — the no-premature-stub item is YAGNI's face of it.
- ERP memory `ceremony-and-yagni-over-deferral` — the failure that motivated this.
