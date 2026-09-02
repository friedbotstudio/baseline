# Pin every machine gate's reader to the format its writer actually emits

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

The baseline's machine gates read artifacts that other parts of the baseline write, and nothing checks that the reader and the writer agree. When they disagree, the gate reports something other than the truth, and the report looks exactly like a real finding.

The concrete case. An `epic-child` workflow pins its slice as `docs/specs/<epic>.md#slice-B1`. Two modules resolve that slice section, and they resolve it differently:

- `.claude/hooks/lib/pinned-spec.mjs:87-110` accepts a heading that carries a title after the slice id, and reads the slice's ACs from a bold-labelled line with or without a leading bullet.
- `.claude/skills/spec-lint/lint.mjs:247` (`SLICE_SECTION_RE`) requires the heading to end at the slice id, and scrapes every `AC-\d+` appearing anywhere in the section body.

Measured at `02f3c68`: `checkEpicSliceAssignment` and `checkEpicStateConsistency` both return FAIL against all three live epic specs — `docs/specs/erp-portables.md`, `docs/specs/mvp-sprint-parallel-cycles.md`, `docs/specs/codebugger-explanation-trace.md`. Each reports every AC in the spec as "assigned to no slice". Every epic spec in `docs/specs/` and every archived epic spec writes a titled heading, so these two checks have never passed on a real epic in this repository's history.

The same divergence in the drift check shipped to consumers as 0.26.5 and was fixed in 0.26.6. A consumer's `epic-child` tick scored its whole epic — 31 of 37 criteria reported unresolved, every one owned by a slice that had not been built. The `spec-lint` half is the same defect, one phase earlier, and it is still live.

Three things make this a class rather than one bug.

**The format was never published.** `docs/init/seed.md:1000` and `.claude/skills/spec/SKILL.md:46` require only "one `## Slice <id>` section per future child, each naming the slice's behavior, its ACs, and its write surface". No heading grammar. No AC-label form. `.claude/skills/spec/template.md` ships no slice section at all. An author who follows the governing documents exactly still fails the parser, so the real contract is a regex nobody can read.

**The same shape reaches a JSON state file.** `.claude/state/epic/*.json → slices[].acs` is written two incompatible ways: AC ids in `erp-portables` and `system-spec-delta`, whole criterion sentences in `mvp-sprint-parallel-cycles`, `codebugger-explanation-trace`, `living-system-model` and `baseline-mcp`. `sliceOwnershipInState` (`lint.mjs:265`) reads it as ids, so a prose entry surfaces as a missing AC. `triage/SKILL.md` documents the field as `{id, title, acs, risk}` without saying what `acs` holds.

**Nothing catches any of it here.** 32 files under `.claude/hooks/` and `.claude/skills/` parse markdown artifact structure with private regexes. No `audit-baseline` check, no spec-review checker and no test asserts that two readers of one artifact agree. The class already sits on the backlog in three recorded shapes:

- *Vacuous red* — the reader's grammar is narrower than what authors write: `census-gate-literal-pattern-matches-no-real-site`.
- *Vacuous green* — the reader matches nothing and reports clean: `anchor-digest-is-vacuous-for-exportless-files-3f7c`, `coverage-alarm-fixture-derives-zero-elements-9a3c`, `claude-skills-lib-tests-is-executed-by-nothing`, `spec-lint-fixture-omits-system-delta-3f7a`, `nothing-catches-a-surface-that-shipped-without-being-promised`.
- *Prose against parser* — an SOP tells the author one format and the code reads another: `archive-sop-prose-contradicts-touched-parser-c31a`, `archive-leaks-the-swarm-jsonl-overlay-9e52`, `roadmap-sync-skill-md-documents-an-audit-mode-the-cli-does-not-expose`, `seven-skill-sops-under-describe-their-cli-2f7d`.

The landmine `spec-lint-and-guard-section-regexes-are-not-line-anchored` is still true, and measurement narrowed it. `lint.mjs:95` and `lint.mjs:246` are the only two unanchored section extractors left in the baseline; `.claude/hooks/lib/design-calls.mjs:13` and every spec-review checker already anchor. Against a spec whose Non-goals bullet contains the literal text `` `## Acceptance criteria` ``, the two unanchored readers return zero AC ids while `spec-diagram-review/oracle.mjs:108` and `spec-traceability-review/oracle.mjs` both return the real table's ids. The recorded mitigation is author-side prose advice.

The Acceptance-criteria section alone has four readers across three implementations — two regexes in `lint.mjs`, an anchored regex in `spec-diagram-review`, and a hand-rolled line scan in `spec-traceability-review`. Measured against every epic spec in `docs/specs/`, all four agree. They agree because those specs happen to contain none of the shapes that separate them.

Three backlog entries carry the same user feedback verbatim: *"fyi, these issues are reported from user installed baseline; so note accordingly"* (`integrate-prereq-rejects-an-excepted-simplify`, `no-track-declares-a-review-node`, `shipped-sensitive-globs-never-covered-hooks-or-commands`). That is who experiences this: someone running an installed baseline, on their own epic, with no way to tell a format mismatch from real drift.

## Goal

A machine gate in this baseline reports on the artifacts people actually write, and a reader that stops agreeing with its writer fails here rather than in a consumer's install.

## Non-goals

- **Not migrating the 32 parsers to a shared markdown parser or AST.** The unit of work is one declared grammar per artifact section that has two or more readers — the `.claude/skills/lib/epic-heading.mjs` shape, not a parsing framework.
- **Not changing the format any epic spec on disk uses.** Readers widen to what authors already write. No spec in `docs/specs/`, in `docs/archive/`, or in any consumer install may be invalidated by this work.
- **Not adding a hook.** The conformance mechanism runs in `audit-baseline` and the test suite. It does not gate the write boundary, and the hook count stays at 27.
- **Not fixing every backlog entry that shares this class.** Which of them this workflow absorbs is the open question below; entries outside the chosen boundary stay open and untouched.
- **Not weakening any check to make it pass.** A reader that currently reports a real defect keeps reporting it.

## Success metrics

- `spec-lint`'s `epic_slice_assignment` and `epic_state_consistency` against the epic specs in `docs/specs/` — baseline: 0 of 3 pass, target: 3 of 3 pass, measured via `node .claude/skills/spec-lint/lint.mjs` with `track_id: epic`.
- Readers of the `## Slice <id>` section that declare their own grammar — baseline: 2 (`pinned-spec.mjs`, `spec-lint/lint.mjs`), target: 1 declaration site consumed by both, measured via a grep for the heading pattern outside the declaring module.
- `slices[].acs` shapes accepted without a named error — baseline: 2 undeclared shapes across 6 epic state files, target: 1 declared shape plus a named failure for anything else, measured via the epic state files on disk.
- Artifact sections with two or more baseline readers and no agreement assertion — baseline: all of them, target: 0 for the sections the conformance fixture covers, measured via the new check.
- The conformance check against `02f3c68` (the commit before this work) — baseline: does not exist, target: fails, naming both disagreeing readers.

## Stakeholders

- **Requester**: Tushar Srivastava, repo owner, who reproduced the 0.26.5 drift-check case on a live `epic-child` and asked for the class rather than the instance.
- **Reviewer**: Tushar Srivastava — this is a solo-maintained repository, so gate A and gate C are the same person.
- **Operator**: whoever runs an installed baseline on an epic. They are the ones the three backlog entries above quote, and they cannot read this repository's parsers to diagnose a mismatch.

## Constraints

- **Shipped guard changes must be additive.** Widening a reader is a fix; narrowing one silently breaks installs that were passing. Every change here widens or reports, and none narrows.
- **`seed.md` governs (CLAUDE.md Article I.4).** Publishing the slice grammar means amending `docs/init/seed.md` §18.9 first, then `src/seed.template.md` as its byte-equal mirror, then `spec/SKILL.md` and `spec/template.md`.
- **Article XII manifest discipline.** A new module under `.claude/skills/lib/` is baseline-owned, needs `owner: baseline` provenance where frontmatter applies, and must land in `obj/template/.claude/manifest.json` with its hash, or `audit-baseline` fails and the consumer never receives the file.
- **`spec-shippability-review` binds the new module.** A shipped skill may not import a path under `src/`, `tests/`, `scripts/` or `obj/`, and a new shipped helper must be `.mjs`/`.js`/`.sh`.
- **The mechanism must not be able to report a vacuous green itself.** A conformance check whose fixture matches nothing and reports clean reproduces the defect it exists to catch. It has to fail when it is measuring nothing.
- **The fixture must be adversarial, not representative.** Measured at `02f3c68`: run every reader of the Acceptance-criteria section against the real specs in `docs/specs/` and all four agree, while both live bugs go undetected. A conformance check built on real artifacts would have passed throughout. The fixture SHALL be composed of documents written to carry the shapes that separate readers — a titled slice heading, a bullet-less AC label, a heading string mentioned in prose, a slice id that prefixes another — and every landmine of this class recorded in `.claude/memory/` is a candidate row.
- **CLAUDE.md is capped at 40,000 characters** and mirrors `src/CLAUDE.template.md` byte-for-byte, so any constitutional text this work adds competes for that budget.

## Acceptance criteria

1. Given `docs/specs/erp-portables.md`, whose slice headings carry titles, when `spec-lint` runs `epic_slice_assignment` with `track_id: epic`, then it reports PASS with every AC assigned to exactly one slice.
2. Given each of the three epic specs in `docs/specs/`, when `spec-lint` runs `epic_state_consistency` with that epic's state file present, then it reports PASS or a named schema failure — never a per-AC list claiming the spec assigns the AC to no slice.
3. Given any epic spec on disk, when the slice reader in `spec-lint` and the slice reader in `pinned-spec.mjs` are both applied to it, then they return the same set of slice ids and the same AC id set for every slice.
4. Given a slice heading written bare (`## Slice B1`) and the same heading written with a title (`## Slice B1 — ports and the server composition root`), when either reader resolves the section, then both forms yield the same section body.
5. Given an AC label written as `- **ACs**: AC-001, AC-002` and the same list written as `**Acceptance criteria**: AC-001, AC-002`, when either reader parses it, then both forms yield the same AC id set.
6. Given a slice id that prefixes another (`B1` against a spec containing `## Slice B10`), when either reader resolves `B1`, then it returns only the `B1` section.
7. Given an epic state file whose `slices[].acs` holds criterion prose rather than AC ids, when `epic_state_consistency` runs, then it names the schema violation and the offending slice id, rather than reporting each prose string as an AC the spec fails to assign.
8. Given the slice-section grammar published in `docs/init/seed.md` §18.9 and `.claude/skills/spec/SKILL.md`, and the slice section shipped in `.claude/skills/spec/template.md`, when a test parses the template's own slice section with both readers, then both resolve it and agree on its AC ids.
9. Given a spec whose Non-goals section contains the literal text `` `## Acceptance criteria` ``, when a section extractor reads the Acceptance-criteria section, then it returns the real section's table rows and not the prose mention's trailing body.
10. Given the canonical artifact fixture, when two baseline readers of the same artifact section return different results for it, then the conformance check fails and its output names both readers, the section, and how they differ.
11. Given the tree at `02f3c68` — this work's parent commit — when the conformance check runs against it, then it fails and names `spec-lint/lint.mjs` and `pinned-spec.mjs` as the disagreeing readers.
12. Given a conformance fixture that has been emptied, or a reader registration that matches no section in it, when the check runs, then it fails with a "measured nothing" error rather than reporting clean.
13. Given a reader whose grammar is narrowed so it no longer parses the canonical fixture, when `audit-baseline` runs, then it exits non-zero and names that reader.
14. Given a consumer install of the resulting baseline, when it contains an epic spec written in any form this repository's specs already use, then no check introduced or changed by this work reports a failure that `02f3c68` did not already report.
15. Given a reader registered with the conformance engine that no longer agrees with the fixture, when `npm test` runs, then it fails and names that reader — so CI blocks the release before publish.
16. Given a consumer install of the resulting baseline, when the consumer runs `audit-baseline`, then the conformance check executes from the shipped engine with no dependency on any path under `tests/`, `src/`, `scripts/` or `obj/`.
17. Given the conformance engine, when both the test caller and the `audit-baseline` caller run against the same fixture, then they report the same set of disagreements — neither caller carries its own fixture or its own comparison.

## Open questions

- **RESOLVED 2026-09-03 — how wide is the boundary? Option (d): read, harvest, build, park the fixes.** Measurement moved this question before `/scout` rather than after it. The fixture has to be adversarial (see **Constraints**), and the shapes that separate readers are exactly what the vacuous-green and prose-against-parser backlog entries record. So this workflow READS all nine entries, HARVESTS a fixture row from each, and BUILDS the mechanism — but does NOT fix them. They stay `status: open`, and a new backlog entry parks the fix set for the next cycle, cross-referencing the fixture rows that now cover them.

  The user's words: *"we can do 1st for now, read, harvest, build test, and ensure the solution is workable. Then part the fix for next cycle in backlog"*.

  The candidates as originally framed, narrowest first:
  - (a) the slice-section grammar and the `slices[].acs` state schema only;
  - (b) (a) plus publishing the grammar in `seed.md` §18.9, `spec/SKILL.md` and a slice section in `spec/template.md`;
  - (c) (b) plus line-anchoring the two unanchored section extractors in `spec-lint/lint.mjs`;
  - (d) (c) plus the conformance mechanism — a canonical artifact fixture every registered reader is asserted to agree on, enforced by `audit-baseline`;
  - (e) (d) plus a sweep absorbing the vacuous-green and prose-against-parser backlog entries named in **Problem**.

  Chosen: **(d)**. Acceptance criteria 1-9 belong to (a)-(c); 10-13 belong to (d); 14 binds every option. AC-12's "measured nothing" failure now also covers a fixture that carries no trap row for a registered reader.

  Two corrections to the framing that survive into the spec. (c) is two regexes in one file, not three files — everything else already anchors. And (e) was mis-sized as a sweep: reading the nine entries is not optional work this workflow may drop, because the fixture cannot be written without them. What (e) would have added is the fix and the closure stamp, which is what moves to the next cycle.
- **RESOLVED 2026-09-03 — which artifacts does the conformance fixture cover? All three: the planning spec, the epic state file, and the memory entry.** Chosen for release completeness over staging.

  The user's words: *"I am thinking of adding the memory notes as well. My reasoning is that this need to ship, and if we can ship a feature complete solution in one cycle that will be good otherwise we will delay the release"*.

  Measured reader counts (a floor — modules taking artifact text as a parameter rather than opening the path are not counted): planning spec ≥ 12, memory entry ≥ 11, intake ≥ 4, epic state file 3, roadmap 1. The roadmap is 1 because this problem was already solved there by `.claude/skills/lib/epic-heading.mjs`; it is the precedent, not a gap.

  **The Q1 rule bounds the memory-entry work.** Registering the memory-entry readers and writing their fixture rows is bounded. Whatever disagreement the mechanism then finds follows the same harvest-and-park rule: cheap fixes ride along, anything larger becomes a backlog entry for the next cycle. This workflow does not commit to fixing what it finds in memory-entry readers, only to finding it.

  **Unresolved until `/scout`, and it changes only this question's answer.** Whether the ≥ 11 memory-entry readers are many small ones or a few large ones. If the fixture work itself proves large, memory entries drop to a follow-up — a registry entry, not a redesign — and the spec's other two artifacts are unaffected. `/scout` SHALL report that count with sizes.

  The intake document is deliberately excluded despite having ≥ 4 readers: no divergence is demonstrated, and it is the cheapest artifact to add later.
- **RESOLVED 2026-09-03 — where does the check live? Both, over one shared engine.** The premise in the original question was wrong: CI does not run `audit-baseline`. `.github/workflows/release.yml` runs `npm test` before publishing; `audit-baseline` runs from `project.json → test.cmd`, which the `test_runner` hook fires on writes under `src/**`, `scripts/**`, `bin/**`. The two protect different people.

  - `tests/` gates the release and never reaches a consumer — the directory does not ship.
  - `audit-baseline` ships with every install and runs on the developer's write loop. Measured at `02f3c68`: a full audit run completes in 0.31s, so the fixture read is not a meaningful addition to that budget.

  The mechanism is therefore **one shipped engine with two callers** — the same shape as the `epic-heading.mjs` precedent, where one declaration serves three consumers. A test calls it so CI blocks a bad release; `audit-baseline` calls it so a consumer can run it against their own documents, which is the situation that produced this request. Neither caller reimplements the fixture or the comparison.

  If the audit's cost ever becomes material, the test-suite caller stands alone without redesign.
