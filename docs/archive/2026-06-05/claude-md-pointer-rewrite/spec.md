# Spec — Restore CLAUDE.md headroom via hybrid relocation to the annex

<!--
Technical spec. Produced by the `spec` skill.
Approval is a token written by /approve-spec — never add "Status: Approved".
-->

## Context

| Input | Path |
|---|---|
| Intake | `docs/intake/claude-md-pointer-rewrite.md` |
| Scout | `docs/scout/claude-md-pointer-rewrite.md` |
| Research | `docs/research/claude-md-pointer-rewrite.md` |
| Brief | `docs/brief/claude-md-pointer-rewrite.md` |

## Goal

CLAUDE.md drops from 38,479 to ≤ 34,000 chars by relocating the elaborative bulk of Articles X, IV, and VIII into new annex subsections — every binding rule, marker literal, and Article heading preserved verbatim, all mirrors and audits still green.

## Non-goals

- Changing the precedence chain (seed.md > CLAUDE.md > implementation, Art I.4).
- Changing the 22-hook → Article enforcement mapping (Art VIII); no enforcement weakens.
- Downgrading any rule to advisory by moving its elaboration to the annex.
- Adding quick-reference cards (deferred to a follow-up; out of scope here).
- Touching the already-terse Articles I, II, VI (YAGNI — negligible chars).

## Decisions

> Captured from the maintainer via AskUserQuestion during `/spec` (codesign_mode off; recorded here for traceability).

| # | Decision point | Chosen | Rationale |
|---|---|---|---|
| D1 | Relocation strategy | **C — hybrid** | Effort follows the chars: Article X is 26% of the file. Convert heavy Articles (X, IV/VIII prose) to terse-clause + annex pointer; leave terse Articles alone. Avoids the whole-file blast radius of strategy A. |
| D2 | Enforced headroom target | **≤ 34,000 (~6k)** | 4× today's 1,521 margin; reachable with strategy C without strategy-A risk. Lower `CLAUDE_TARGET_MAX` (single site); 40,000 hard cap unchanged. |
| D3 | Quick-reference cards | **Deferred** | Cards live in the uncapped annex and don't affect CLAUDE.md headroom — orthogonal to this goal. File as a separate backlog item. |

## Design

Diagrams are the contract. Prose is only for what a diagram cannot say.

### Write set

- `docs/init/seed.md` — amend §14 cap prose to describe the new target/relocation (seed-first, Art I.4).
- `src/seed.template.md` — mirror the seed §14 + §17 edits (pre-§16 + §17-tail byte parity).
- `CLAUDE.md` — relocate elaboration out of Articles X, IV, VIII; keep binding clauses + markers + pointers.
- `src/CLAUDE.template.md` — byte-equal mirror of CLAUDE.md.
- `.claude/CONSTITUTION.md` — new subsections receiving the relocated Article detail.
- `tests/code-browser-primary-navigation.test.mjs` — lower `CLAUDE_TARGET_MAX` 38500 → 34000.
- `tests/governance-no-python3-runtime.test.mjs` — bump `ALLOWED_LINES` line numbers IFF seed.md line insertions shift them.

No file in the write set matches `project.json → tdd.ui_globs` — there is no UI surface.

### C4 — System context

Who interacts with the governance system and which external systems enforce it.

```plantuml
@startuml
!include <C4/C4_Context>
title System Context — in-session constitution
Person(claude, "Claude in-session", "reads CLAUDE.md every session")
Person(maint, "Maintainer", "amends the constitution over time")
System(constitution, "Constitution", "CLAUDE.md (always-loaded) + .claude/CONSTITUTION.md (on-demand annex)")
System_Ext(genesis, "seed.md genesis", "governing spec; precedence root")
System_Ext(ci, "audit-baseline + test suite", "enforces cap, citations, mirrors")
Rel(claude, constitution, "loads binding rules")
Rel(maint, constitution, "amends")
Rel(constitution, genesis, "conforms to (Art I.4)")
Rel(ci, constitution, "verifies cap/citations/mirror")
@enduml
```

### C4 — Container

Deployable document units inside the constitution boundary and their mirrors.

```plantuml
@startuml
!include <C4/C4_Container>
title Container — constitution documents
System_Boundary(c, "Constitution") {
  Container(claudemd, "CLAUDE.md", "markdown, ≤40k cap", "always-loaded binding rules")
  Container(annex, "CONSTITUTION.md", "markdown, no cap", "on-demand narration + relocated detail")
  Container(claudetmpl, "src/CLAUDE.template.md", "markdown", "byte-equal mirror of CLAUDE.md")
}
System_Boundary(g, "Genesis") {
  Container(seed, "docs/init/seed.md", "markdown", "genesis spec")
  Container(seedtmpl, "src/seed.template.md", "markdown", "seed mirror (≠§16)")
}
ContainerDb(tests, "test suite + audit.mjs", "node:test", "cap/citation/mirror guards")
Rel(claudemd, annex, "points to relocated detail")
Rel(claudemd, claudetmpl, "byte-equal")
Rel(seed, seedtmpl, "parity (pre-§16 + §17)")
Rel(tests, claudemd, "asserts ≤34k + markers")
Rel(tests, annex, "asserts Appendix A row present")
@enduml
```

### C4 — Component (changed container: CLAUDE.md)

CLAUDE.md internals: heavy Articles convert to terse-clause + annex pointer; terse Articles untouched.

```plantuml
@startuml
!include <C4/C4_Component>
title Component — CLAUDE.md Articles after relocation
Container_Boundary(claudemd, "CLAUDE.md") {
  Component(terse, "Articles I, II, VI", "binding", "unchanged — already terse")
  Component(artX, "Article X (changed)", "binding clause + pointer", "X.1-X.5 rows keep clause; tables move to annex")
  Component(artIV, "Article IV (changed)", "binding clause + pointer", "phase table kept; track prose trimmed")
  Component(artVIII, "Article VIII (changed)", "binding clause + pointer", "22-row table kept; per-hook prose trimmed")
  Component(others, "Articles III, V, VII, IX, XI", "binding", "light trims only")
}
Container_Boundary(annex, "CONSTITUTION.md") {
  Component(annexX, "§5 Article X detail (new)", "narration", "relocated X tables/examples")
  Component(annexIVVIII, "§6 Article IV/VIII detail (new)", "narration", "relocated behavior prose")
}
Rel(artX, annexX, "full detail in")
Rel(artIV, annexIVVIII, "full detail in")
Rel(artVIII, annexIVVIII, "full detail in")
@enduml
```

### Data model — class diagram

Document-structure model. `<<changed>>` = Article losing elaboration to the annex; `<<new>>` = annex subsection created.

```plantuml
@startuml
title Data model — constitution document structure
class Constitution {
  +charCount: int
  +hardCap: int = 40000
  +softTarget: int = 34000
}
class Article {
  +id: string
  +bindingClauses: text
  +markerLiterals: list
}
class HeavyArticle <<changed>> {
  +id: string
  +bindingClause: text
  +annexPointer: ref
}
class AnnexSubsection <<new>> {
  +id: string
  +relocatedDetail: text
}
class Mirror {
  +path: string
  +byteEqualTo: ref
}
Constitution "1" *-- "many" Article
Article <|-- HeavyArticle
HeavyArticle "1" --> "1" AnnexSubsection : points to
Constitution "1" --> "1" Mirror : byte-equal
@enduml
```

#### Migration DDL

```sql
-- No database in scope. This is a documentation/governance restructure.
-- "Migration" = the ordered edit sequence in §Rollout (seed first, then CLAUDE.md + mirror, then annex, then test constant).
```

### Behavior — sequence per AC

#### §Behavior #1 — relocate heavy-Article detail, then measure ≤ 34,000

```plantuml
@startuml
title Behavior #1 — relocate + measure target
actor Maintainer
participant "CLAUDE.md" as C
participant "CONSTITUTION.md" as A
participant "test suite" as T
Maintainer -> A : append §5/§6 with relocated X/IV/VIII detail
Maintainer -> C : replace moved blocks with terse clause + pointer
Maintainer -> T : lower CLAUDE_TARGET_MAX to 34000
T -> C : Buffer.byteLength(CLAUDE.md)
alt <= 34000
  T --> Maintainer : PASS (>= 6000 headroom)
else > 34000
  T --> Maintainer : FAIL — relocate more
end
@enduml
```

#### §Behavior #2 — binding-rule + marker survival

```plantuml
@startuml
title Behavior #2 — markers & headings survive
participant "test suite" as T
participant "CLAUDE.md" as C
T -> C : read()
loop each REQUIRED_ARTICLE_HEADING (I..XI)
  T -> C : includes(heading)?
  alt missing
    C --> T : FAIL — dropped binding heading
  end
end
loop each REQUIRED_BINDING_MARKER (No stubs, YAGNI, Context7, swarm-worker, approve-spec, grant-commit, §17)
  T -> C : includes(marker)?
  alt missing
    C --> T : FAIL — dropped binding marker
  end
end
C --> T : PASS — all present
@enduml
```

#### §Behavior #3 — CLAUDE.md ↔ template byte-equality

```plantuml
@startuml
title Behavior #3 — mirror parity
participant "test suite" as T
participant "CLAUDE.md" as C
participant "src/CLAUDE.template.md" as M
T -> C : read()
T -> M : read()
alt equal
  T --> T : PASS
else diverged
  T --> T : FAIL — apply edit to both
end
@enduml
```

#### §Behavior #4 — audit-baseline citations + counts

```plantuml
@startuml
title Behavior #4 — audit PASS
participant "audit.mjs" as AU
participant "CLAUDE.md" as C
participant "src/seed.template.md" as S
AU -> C : includes("## Article XI") && includes("manifest")?
AU -> S : includes("## §17") && includes("manifest")?
AU -> C : charCount <= 40000?
alt all hold
  AU --> AU : exit 0 PASS
else any fail
  AU --> AU : exit 1 FAIL
end
@enduml
```

#### §Behavior #5 — seed-first amendment + parity + python3 ledger

```plantuml
@startuml
title Behavior #5 — seed-first (Art I.4)
actor Maintainer
participant "seed.md" as SD
participant "src/seed.template.md" as ST
participant "parity test" as PT
participant "python3 ledger test" as PY
Maintainer -> SD : amend §14 cap prose first
Maintainer -> ST : mirror §14 (pre-§16) + §17 tail
PT -> SD : pre-§16 body == template pre-§16?
PT -> ST : §17 tail == seed §17 tail?
alt parity holds
  PT --> Maintainer : PASS
else diverged
  PT --> Maintainer : FAIL
end
PY -> SD : python3 mentions only on ALLOWED_LINES?
alt line numbers shifted
  Maintainer -> PY : bump ALLOWED_LINES set
end
PY --> Maintainer : PASS
@enduml
```

### State — N/A

The system has no non-trivial runtime state machine; the edit order is captured in §Rollout.

### Dependencies — graph

Edit-order dependencies. `A --> B` reads "A must land before/with B".

```plantuml
@startuml
' @kind dependency-graph
title Dependencies — edit order
left to right direction
[seed.md §14] --> [src/seed.template.md]
[CLAUDE.md relocation] --> [seed.md §14]
[src/CLAUDE.template.md] --> [CLAUDE.md relocation]
[CONSTITUTION.md §5/§6] --> [CLAUDE.md relocation]
[CLAUDE_TARGET_MAX=34000] --> [CLAUDE.md relocation]
[ALLOWED_LINES bump] --> [seed.md §14]
@enduml
```

### Contracts

No runtime endpoints. The "contracts" are the invariants CI enforces post-change.

| Kind | Name | Input | Output | Errors | Idempotent |
|---|---|---|---|---|---|
| Test | `code-browser-primary-navigation` | CLAUDE.md bytes | ≤ 34000 + markers present | FAIL if over/missing | yes |
| Test | `seed-template-parity` | seed.md, template | pre-§16 + §17 byte-equal | FAIL on drift | yes |
| Test | `governance-no-python3-runtime` | seed.md lines | python3 only on ALLOWED_LINES | FAIL on unlisted line | yes |
| Audit | `audit-baseline` | repo tree | exit 0 | exit 1 on cap/citation/count fail | yes |

### Libraries and versions

No third-party libraries are involved (documentation/governance restructure). context7 not applicable — no external API to confirm.

| Library@version | Purpose | Key APIs | Confirmed via context7 |
|---|---|---|---|
| *(none)* | — | — | n/a |

### Alternatives considered

| Alt | Summary | Rejected because |
|---|---|---|
| A | Thin pointer per Article (whole-file rewrite) | Whole-file blast radius + high risk of orphaning a marker, for headroom beyond what's needed. |
| B | Narration-only trim, no structural change | Leaves Article X (26% of file) intact; reaches only ~34-35k — thin payoff. |

## Design calls

No write-set file intersects `project.json → tdd.ui_globs`; there is no UI surface.

- *(none)*

## Acceptance criteria

| ID | Criterion (given / when / then) | Upstream AC | Sequence |
|---|---|---|---|
| AC-001 | given the relocation, when `wc -c < CLAUDE.md` is measured, then it is ≤ 34,000 (≥ 6,000 headroom under 40k). | intake AC 1 | §Behavior #1 |
| AC-002 | given the change, when the marker/heading test runs, then every `## Article I..XI` heading and every `REQUIRED_BINDING_MARKER` is present verbatim in CLAUDE.md. | intake AC 2 | §Behavior #2 |
| AC-003 | given a CLAUDE.md edit, when compared, then `src/CLAUDE.template.md` is byte-identical. | intake AC 3 | §Behavior #3 |
| AC-004 | given the change, when `audit-baseline` runs, then it exits 0 — Article XI+manifest in CLAUDE.md, §17+manifest in src/seed.template.md, counts intact. | intake AC 4 | §Behavior #4 |
| AC-005 | given the change, when reviewed, then the precedence chain (Art I.4) and the hook→Article mapping (Art VIII) are unchanged in substance. | intake AC 5 | §Behavior #2 |
| AC-006 | given Art I.4, when this lands, then seed.md §14 + src/seed.template.md are amended (parity held) before CLAUDE.md conforms, and the python3 ALLOWED_LINES ledger is bumped iff line numbers shift. | intake AC 6 | §Behavior #5 |
| AC-007 | given the suite, when run, then all governance tests pass and `CLAUDE_TARGET_MAX` is 34000 at its single site with all cap-asserting sites reconciled. | intake AC 7 | §Behavior #1 |

## Test plan

| Category | Scenario | Expected | Covers |
|---|---|---|---|
| Golden path | run full `npm test` after relocation | all green | AC-001, AC-007 |
| Golden path | run `node .claude/skills/audit-baseline/audit.mjs` | exit 0 PASS | AC-004 |
| Input boundary | CLAUDE.md exactly at 34,000 | PASS (≤ boundary) | AC-001 |
| Input boundary | remove one `REQUIRED_BINDING_MARKER` (mutation) | test FAILs | AC-002 |
| Contract violation | edit CLAUDE.md without mirroring template | byte-equal test FAILs | AC-003 |
| Contract violation | drop `## Article XI` citation | audit FAILs | AC-004 |
| Failure mode | insert seed.md line above an ALLOWED_LINES entry without bumping | python3 test FAILs | AC-006 |
| Regression trap | seed.md pre-§16 / §17 parity with template | unchanged (byte-equal) | AC-006 |
| Regression trap | Appendix A `.claude/hooks/` row stays in annex | unchanged | AC-002 |

## Observability

Not applicable — no runtime component. "Observability" is the CI signal set.

| Signal | Name | Shape | Purpose |
|---|---|---|---|
| CI | `npm test` | pass/fail | governance invariants |
| CI | `audit-baseline` exit code | 0/1 | cap + citations + counts |

## Rollout

- **Feature flag**: none — governance edit, not a runtime feature.
- **Migration order**: 1 seed.md §14 → 2 src/seed.template.md mirror → 3 CONSTITUTION.md §5/§6 (receive detail) → 4 CLAUDE.md relocation → 5 src/CLAUDE.template.md mirror → 6 lower `CLAUDE_TARGET_MAX` to 34000 → 7 bump python3 `ALLOWED_LINES` if shifted.
- **Canary**: run `npm test` + `audit-baseline` locally before `/grant-commit`; both must be green.

## Rollback

- **Kill-switch**: `git revert` the single commit — all edits ship together, so revert restores the prior constitution atomically.
- **Signal to roll back**: any governance test FAIL or `audit-baseline` exit 1 in CI within one run of landing.

## Archive plan

- Defaults *(automatic)*: intake, scout, research, brief, spec, spec-rendered/, spec approval, security report.
- Extras *(list any non-default files)*:
  - *(none)*

## Open questions

- *(none — D1/D2/D3 resolved the prior open questions; relocation row-by-row judgment for Article X happens during `/tdd` within the strategy-C envelope.)*
