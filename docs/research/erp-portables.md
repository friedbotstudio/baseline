# Pattern Research — erp-portables

Ten slices, one strategic question: how faithfully to copy the `../erp` reference implementation versus re-deriving from the extracted doctrine. Plus three slice-level decisions the intake left open.

**Library note (VI.5 / context7).** No third-party npm library is touched by any slice: the port is node-stdlib `.mjs` helpers, SKILL.md prose, JSON schema/config, and shell. The only runtime dependency is `@clack/prompts@1.4.0` (CLI, untouched); slice J invokes the `gitleaks` and `gh` **binaries** (external CLIs, not libraries — behavior verified against their exit codes in tests, per erp's shape). Context7 has nothing to resolve for this workflow; if `/tdd` later pulls in a library, VI.5 applies at that point.

## Candidate A: Faithful file port

- **Summary**: Copy erp's changed files (branch_guard.mjs + tests, common.mjs additions, probe-loop diff, triage/brainstorm SKILL.md sections, schema predicate, CI scripts), then mechanically substitute names/counts.
- **API references (current)**: none required (stdlib only; see library note).
- **Fits**: Partially — erp files compose the same `common.mjs` primitives and test conventions this repo uses (scout: "Patterns in use"), so mechanical pieces drop in. But erp's prose carries ERP citations (ADR-0017/0025/0028, XI.9, U-invariants, "27 hooks" inconsistency, gradle CI contexts) that would leak; and erp's CLAUDE.md numbering (XI.12) collides with baseline's differently-shaped Article XI.
- **Tests it enables**: erp ships ready tests for `decide()`, `isAutonomousFeatureLanding()`, materializer predicates, `require-gitleaks` — direct adaptation, no internal mocks needed.
- **Tradeoffs**: Fastest for code; highest citation-leak risk for constitution text; slice J would import gradle-shaped check contexts that are wrong here.

## Candidate B: Clean-room from doctrine

- **Summary**: Treat the three extraction reports as the spec and re-author everything fresh; consult erp only to settle ambiguity.
- **API references (current)**: none required.
- **Fits**: Yes for constitution/annex text (baseline voice, correct counts, correct article numbering). Wasteful for mechanics: re-deriving `branch_guard`'s fail-open matrix or the predicate wiring invites drift from a proven implementation and re-introduces bugs erp already fixed.
- **Tests it enables**: same kinds, but written from scratch.
- **Tradeoffs**: Cleanest text; slowest; discards erp's tested edge-case coverage (detached HEAD, linked worktree, existing-file edit).

## Candidate C: Hybrid — port mechanics, re-author doctrine, greenfield J (recommended)

- **Summary**: Port code + tests near-verbatim where erp is generic (branch_guard, common.mjs predicates, probe-cap/defaults diffs, schema predicate + materializer, traceability-oracle deferral check, runner file_globs guard); re-author all seed/CLAUDE.md/annex text from the extraction reports in baseline voice with re-derived counts; build slice J fresh against this repo's actual CI (release.yml: precheck + files-diff + smoke-tarball, provenance verification, SHA-pinned actions) using erp only for the pre-commit/classifier *shape*.
- **API references (current)**: none required.
- **Fits**: Yes — matches scout's landmines directly (don't copy erp counts; don't leak gradle contexts; hand-merge seed vs template).
- **Tests it enables**: adapted erp unit tests for every ported helper; fresh structural tests for constitution counts (existing `audit-*`/mirror tests already enforce); greenfield `require-gitleaks` + classifier NEVER-list tests.
- **Tradeoffs**: Requires judgment per slice about which side of the line each artifact falls on — the sliced spec must name the porting mode per slice so `/tdd` doesn't re-litigate.

## Slice-level open decisions (for the spec author / gate-A reviewer)

### E — `skip_brainstorm` read-time default flip vs legacy workflows
- **(i) erp behavior**: `workflow-defaults.mjs` absent → `true` (skip). In-flight legacy workflows silently lose brainstorm. Simplest; matches "erp defaults adopted".
- **(ii) explicit-write-only**: keep absent → `false`; `/triage` always writes the flag going forward. New workflows get erp behavior; legacy in-flight keep today's. Two sources of truth during transition.
- **Lean**: (i), consistent with the user's defaults choice — the blast radius is only workflows created before this port and not yet at an entry phase, which in this repo is zero (only `erp-portables` itself, already past intake).

### J — check contexts + consumer shipping
- Branch-protection config-as-code should pin **this repo's** live contexts (from `release.yml`; exact names re-derived at implementation, not copied from erp's gradle set). Keep all of slice J **repo-local** (`.githooks/`, `scripts/ci/`, `.github/`): NOT shipped into `obj/template` this epic — shipping consumer-facing git hooks changes consumer behavior and deserves its own intake (record as backlog entry at commit).
- **Free-tier caveat** (from erp ADR-0022): required-status rulesets on private repos need a paid plan; expect the same codified-but-inert split unless this repo is public — verify at implementation.

### I — skill overlap
- `commit-planner` plans a *split* of a dirty tree into single-concern commits (pre-consent, read-only); the `commit` skill executes Phase 11 for the current workflow. Disjoint jobs — keep both, cross-reference in frontmatter descriptions so triage doesn't confuse them.
- `retrospective` pairs with `standup` (recap → lessons); its erp version graduates landmines up the enforcement funnel — that loop maps cleanly onto baseline's memory system (landmines.md → advisory hook → hard gate). Generalize triggers; drop erp roadmap references.

## Recommendation

**Candidate C.** Flip conditions: if the spec review finds erp's mechanical files less generic than scout observed (hidden ERP references in helpers), fall back toward B for those files; if constitution headroom (4.5k chars) proves too tight for re-authored amendments, relocate more aggressively to the annex rather than compressing rule text.

## Open questions

- (E) Confirm option (i) — absent → skip — at gate A (it inverts read-time semantics for any legacy `workflow.json` without the flag).
- (J) Is this repo public on GitHub (determines whether the required-CI ruleset is live or codified-but-inert)?
- (I) Final `owner: baseline` skill count and Appendix B placement: 46 → 48 assumes both skills land; if the reviewer drops one at gate A, counts change everywhere (seed §4.3, CLAUDE.md, annex, manifest).
- (C) `gh` CLI availability is assumed for the autonomous push+PR step (erp shape); the spec must define the fail-safe when `gh` is absent (yield to gate C as today).
