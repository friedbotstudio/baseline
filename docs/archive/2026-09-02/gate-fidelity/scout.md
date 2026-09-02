# Codebase Scout Report — gate-fidelity

Scope fixed by the approved intake: the planning spec, the epic state file, and the memory entry. The intake document is out.

**Corpus reconcile** (`memory.workspace.enabled: true`, 128 elements): `mode: reconcile`, delta `changed: [pinned-spec-lib, skill-probe-lib, spec-lint-checks, spec-review-helpers, surfacing-path-signal]`, `unreferenced: []`. Five elements, not a re-derivation — the corpus is healthy and names the right slice.

**Annotations** (`memory.annotations.enabled: true`): 0 resolved, 0 dangling.

Every divergence below was executed at `02f3c68`, not inferred from reading.

---

## Headline for the spec

The harvest does not produce what the intake assumed, and the direct measurement produces more than it assumed. Of the ten backlog entries, **three** yield an adversarial document shape. The other seven split into two groups that are not fixture rows at all — and one of those groups is a **second mechanism** the intake never named. Meanwhile direct measurement of the readers found **seven** live divergences, five of them previously unrecorded.

The fixture is therefore built from measurement first and harvest second, which is the inverse of the plan.

---

## Primary touchpoints

### Reader census — planning spec

Nine sections, eighteen reader sites, no shared grammar anywhere.

| Section | Readers | Agree? |
|---|---|---|
| `## Slice <id>` | `hooks/lib/pinned-spec.mjs:91` (widened), `spec-lint/lint.mjs:247` (narrow), `tdd/drift_check.mjs:367` (presence probe) | **No — 2 of 3 disagree** |
| `## Acceptance criteria` | `spec-lint/lint.mjs:95`, `spec-lint/lint.mjs:246`, `spec-diagram-review/oracle.mjs:108`, `spec-traceability-review/oracle.mjs:16`, `:52` | **No — 2 unanchored, 3 anchored** |
| AC table row | `tdd/drift_check.mjs:86` (anchored), `spec-lint/lint.mjs:252` (unanchored), `spec-lint/lint.mjs:99`, `spec-diagram-review/oracle.mjs:110`, `spec-rollout-enforceability-review/oracle.mjs:56`, `:78` | **No** |
| `## Design calls` | `hooks/lib/design-calls.mjs:13` (`\s+` between words), `tdd/drift_check.mjs:95` (literal single space) | **No** |
| `### Behavior #N` | `spec-lint/lint.mjs:108` (`\b` guard), `spec-diagram-review/oracle.mjs:107` (no guard) | **No** |
| `## System delta` | `spec-lint/lint.mjs:182` (presence), `workspace/delta.mjs:31` (body) | Yes |
| `## Contracts` | `tdd/drift_check.mjs:233` (accepts `##` or `###`) | single reader |
| `## Rollout` | `spec-rollout-enforceability-review/oracle.mjs:23` (line scan) | single reader |
| `## Candidate X:` | `spec/decision-finder.mjs:6` | single reader |

**Five demonstrated spec divergences.** Each line below is a fixture row.

1. **Titled slice heading.** `## Slice B1 — ports` → `pinned-spec` resolves it, `spec-lint:247` returns `[]`, `drift_check:367` sees it. Two of three readers disagree. The known bug.
2. **Bullet-less AC label.** `**Acceptance criteria**: AC-001` versus `- **ACs**: AC-001` → `pinned-spec:109` takes both; `spec-lint:259` scrapes the whole section body instead, so it also picks up an AC mentioned in the slice's prose.
3. **Heading string quoted in prose.** A Non-goals bullet containing `` `## Acceptance criteria` `` → `lint.mjs:95` and `:246` return **zero** AC ids; `spec-diagram-review` and `spec-traceability-review` return the real table's ids. The recorded landmine, now measured across all four readers.
4. **AC id alone in a later table column.** `| AC-001 | a | AC-014 |` → `drift_check:86` yields `[AC-001]`; `lint.mjs:252` yields `[AC-001, AC-014]`. A "supersedes" or "blocked-by" column silently inflates one reader's AC set.
5. **Two spaces in a Design-calls heading.** `## Design  calls` → `design-calls.mjs:13` matches, `drift_check.mjs:95` does not. The hook enforces a Design-calls contract the drift check then cannot see.
6. **Suffixed Behavior heading.** `### Behavior #12b — retry` → `lint.mjs:108` yields nothing, `spec-diagram-review:107` yields `12`. Traceability and diagram review disagree about which behaviors exist.

### Reader census — epic state file

`.claude/state/epic/<slug>.json → slices[].acs` has **one reader and two writers**, and the writers disagree with each other.

- Reader: `spec-lint/lint.mjs:265` `sliceOwnershipInState` — treats every element as an AC id.
- Writer 1: `triage/retriage.mjs:55` — `acs: acs ?? []`, no shape validation.
- Writer 2: `/triage` SKILL.md's epic materialization, which Claude executes **by hand** from prose describing the field as `{id, title, acs, risk}` and never saying what `acs` holds.

On disk, confirmed: `erp-portables` (12 slices) and `system-spec-delta` (6) hold AC ids. `baseline-mcp` (5), `codebugger-explanation-trace` (3), `living-system-model` (6) and `mvp-sprint-parallel-cycles` (5) hold whole criterion sentences. Two of six against four of six.

This is the purest instance of the class in the repository: the writer is a paragraph of English, the reader is a regex, and nothing between them.

Other epic-state consumers read `slices[].id` only and are unaffected: `commit/epic_close.mjs:79`, `:130`, `:190`, and `hooks/track_guard.mjs:46`.

### Reader census — memory entry

**The answer to the intake's open question: memory is smaller than feared and worse than feared.**

Smaller: `.claude/hooks/lib/frontmatter-parser.mjs` is the shared reader, 45 lines, imported by `memory-index/lift-fields.mjs`, `memory-index/migrate.mjs`, `memory-index/build-index.mjs`, `memory-index/resolve.mjs`, `hooks/lib/scoped-memory.mjs`, `hooks/lib/memory_session_start.mjs`, `memory-sync/sweep.mjs`. `hooks/lib/memory-entries.mjs` sits above it for heading and shard concerns. The two modules I flagged pre-scout as holdouts — `migrate.mjs` and `lift-fields.mjs` — **both import the shared parser**. That earlier reading was wrong; their high pattern counts are body-field parsing, not a second frontmatter grammar.

Worse: **three modules parse memory frontmatter without it**, and all three disagree with it.

7. **CRLF line endings.** `frontmatter-parser.mjs:34` anchors on `/^---\n([\s\S]*?)\n---\n?/` — LF only. A CRLF entry returns `{frontmatter: {}, body: <whole file>}` **silently**, no error. `harness/checkers/backlog-deferral.mjs:14` and `harness/proposal.mjs` both use `\r?\n` and parse it fine. Measured: shared reader `{}`, own reader `{key, status}`.
8. **Colon with no space.** `status:open` → shared reader `{}` (it requires the two-character `': '` separator at `frontmatter-parser.mjs:24`); `backlog-deferral.mjs` `{key, status}`.
9. **The closure stamp quoted in an entry's body.** `hooks/lib/closure-check.mjs:10` never extracts the frontmatter block at all — it runs `/^status:\s*picked-up\s*$/m` and `/^superseded-at:\s*\S/m` against the **whole file**. Measured: an entry whose frontmatter reads `status: open` and whose body quotes those two lines satisfies the stamp check.

Row 9 is the most serious finding in this report. `git_commit_guard` hard-blocks a closing commit whose staged backlog lacks that stamp (CLAUDE.md Art. VIII), so this reader sits on the commit path, and it is satisfiable by prose.

---

## The precedent to copy

`.claude/skills/lib/epic-heading.mjs`, 67 lines, from `unify-epic-heading-grammar`. Shape to reuse verbatim:

- **One grammar source, two compiled anchors.** `EPIC_BODY_SOURCE` is a raw string; `LINE_RE` compiles it with `^##\s+`, `TEXT_RE` without. Deliberately not one entry point with an optional prefix — the file's own comment says an optional prefix would let a body line matching the bare grammar be picked up by `sync.mjs`, which scans every line.
- **Non-global regex for predicates, factory for scanners.** `STATUS_EMOJI` is non-global; `statusEmojiScanner()` returns a fresh global regex per call. Landmine `a-global-regex-with-test-fails-open-on-alternate-calls`: `.test()` on a `/g` regex advances `lastIndex` and returns false on every second call, which made `assertInert` accept a forged title half the time.
- **`assertInert(value, field)`** rejects a newline or a status emoji in interpolated text before it can forge a heading (CWE-74, security review 2026-08-15).
- Pinned by `tests/epic-heading-grammar.test.mjs` at the repo root — deliberately not in `.claude/skills/lib/tests/`, which nothing executes.

Three consumers: `roadmap/parse.mjs`, `roadmap-sync/sync.mjs`, and the append path. Zero divergences measured in this census. The pattern holds.

---

## Where the mechanism plugs in

**`audit-baseline`.** `audit.mjs` imports `run` from each module in `checks/` (21 modules) and calls them in order with a context from `checks/context.mjs`. A check returns rows of `[name, status, detail]` where status is `PASS` / `FAIL` / `WARN`; any `FAIL` exits 1. Adding a check is one module plus one import line. `--file=<path>` narrows the run to a scope list at `audit.mjs:109-117`, which currently allows `.claude/**`, `CLAUDE.md`, `README.md`, `docs/init/seed.md`, the `src/` templates and `obj/template/**` — a new check's inputs must fall inside that list or the scoped run skips it. Full audit measured at **0.31s**.

**`tests/`.** 470 files at the repo root, discovered by `node --test tests/*.test.mjs`. Eight are env-gated behind `PUBLISH_TESTS` / `PLANTUML_TESTS`, which is how `spec-lint-fixture-omits-system-delta-3f7a` stayed red unnoticed. **A new conformance test must not be env-gated.**

**Shipping.** `.claude/skills/lib/` already ships — seven manifest entries including `epic-heading.mjs`. `scripts/build-template.sh` copies it and `scripts/build-manifest.mjs` hashes it into `obj/template/.claude/manifest.json` (556 files). A new module there reaches consumers with no build change. Note `.claude/skills/lib/tests/probe.test.mjs` also ships and is executed by nothing.

**`spec-shippability-review`.** The new module must be `.mjs`/`.js`/`.sh`, may not reference `src/`, `tests/`, `scripts/` or `obj/` paths as runtime invocations, and may not import anything absent from the manifest. The fixture files it reads must therefore live under `.claude/`, not `tests/` — otherwise the shipped caller cannot reach them.

---

## The harvest — what the ten entries actually yield

Three yield a document shape. The rest do not, and the report is worth reading for why.

**Fixture rows (3).**

- `census-gate-literal-pattern-matches-no-real-site` — `literalPattern` is `(SYMBOL\s*=\s*)(\d+)`; none of the repository's three real census-site shapes match it. Rows: one site per real shape.
- `spec-lint-fixture-omits-system-delta-3f7a` — a spec carrying no `## System delta` section. A document shape, and already a live red test.
- `archive-sop-prose-contradicts-touched-parser-c31a` — `--touched` given as a JSON array versus a comma-separated string; `queries.mjs → touchedPaths` splits on `,`. Rows: both forms.

**Anti-vacuity requirements on the mechanism, not rows (3).** These describe a check that measures nothing and reports clean. They are what AC-12 must prevent, and each is a test the mechanism owes about itself.

- `anchor-digest-is-vacuous-for-exportless-files-3f7c` — 25 of 60 elements digest to sha256 of the empty string.
- `coverage-alarm-fixture-derives-zero-elements-9a3c` — the fixture returns `{elements: 0}` while the live corpus returns 16 gaps.
- `claude-skills-lib-tests-is-executed-by-nothing` — three stranded test directories no glob reaches.

**A second mechanism, out of this fixture's dimension (4).** These compare an SOP's prose to a **code surface** — CLI verbs, exported names, a move table — not two readers of one document. No document shape expresses them.

- `seven-skill-sops-under-describe-their-cli-2f7d` — seven SKILL.md files enumerate fewer verbs than their dispatchers expose.
- `roadmap-sync-skill-md-documents-an-audit-mode-the-cli-does-not-expose` — `auditRoadmap` is implemented, documented, and unreachable from `cli.mjs`.
- `archive-leaks-the-swarm-jsonl-overlay-9e52` — `swarm-plan/SKILL.md` says `/archive` deletes the `.jsonl` overlay; `archive.sh`'s move table has no `.jsonl` row.
- `nothing-catches-a-surface-that-shipped-without-being-promised` — an export with no Contracts row is invisible to every gate.

That fourth group is a coherent check — *does the SOP describe what the code actually does?* — and it is not the check this workflow is building.

**DECIDED 2026-09-03 — OUT of this workflow.** The user's words: *"very well then let us keep it out for now"*. `/research` SHALL NOT re-open it. The reasoning, recorded so the follow-up inherits it:

- There is no cheap honest implementation. Comparing two code readers of one document compares two computed values. Comparing prose to a code surface has no computed left-hand side.
- The cheap approximate version would be a reader with a private grammar and no writer pinned to it — the vacuous-red / vacuous-green failure this workflow exists to close, reproduced inside the mechanism meant to close it.
- The honest version requires a declared-claims format written into ~59 SKILL.md files. That is a separate epic, unsized.
- It would widen the approved direction past the intake's stated non-goal ("not fixing every backlog entry that shares this class"), which would properly require a return through gate A.

`/memory-sync` (Phase 10.7) SHALL file one backlog entry parking this as a follow-up, cross-referencing `seven-skill-sops-under-describe-their-cli-2f7d`, `roadmap-sync-skill-md-documents-an-audit-mode-the-cli-does-not-expose`, `archive-leaks-the-swarm-jsonl-overlay-9e52` and `nothing-catches-a-surface-that-shipped-without-being-promised` as the four entries it would close.

**Landmine, harvested as row 3 above:** `spec-lint-and-guard-section-regexes-are-not-line-anchored`. Its recorded mitigation is author-side prose advice; measurement now shows exactly two code sites, `lint.mjs:95` and `:246`.

---

## Existing tests

- `tests/epic-heading-grammar.test.mjs` — pins the precedent's grammar, the non-global-regex discipline (AC-006, AC-007) and `assertInert`. Passing. The model for the new tests.
- `tests/drift-check-slice-scoping.test.mjs` — 14 cases covering the 0.26.6 fix: titled heading, bare heading, `B1` against `B10`, three AC-label forms, and the four `scoping` states. Passing. Its trap list is a ready-made fixture seed.
- `tests/spec-lint-design-calls.test.mjs` — two cases **red** behind `PLANTUML_TESTS=1`, per `spec-lint-fixture-omits-system-delta-3f7a`.
- `tests/reentry.test.mjs` — greps the tree for a second writer of a field. The precedent for a test that asserts "exactly one declaration site".
- `.claude/skills/lib/tests/probe.test.mjs` — ships, runs nowhere.

## Constraints and co-changes

- **Publication order is binding (Art. I.4).** `docs/init/seed.md:1000` first, then its mirror `src/seed.template.md:924`. `scripts/sync-constitution-mirror.mjs:27` reconciles the pair by splice and `audit-baseline/checks/src-templates-a.mjs:48-54` verifies the §16 marker stays pristine. `scripts/build-template.sh:256` copies the template over `docs/init/seed.md` in the shipped tree.
- **`spec/template.md` ships no `## Slice` section** — confirmed, 14 sections, none of them Slice. Publishing the grammar means adding one.
- **`triage/SKILL.md`'s epic materialization step** documents `slices[]` without saying what `acs` holds. It is a writer, so it changes with the schema.
- **Additive only.** Every measured divergence resolves by widening the narrower reader. Narrowing the wider one would invalidate specs already on disk and in consumer installs.
- **No new hook.** Count stays 27.
- **Article XII.** A new `.claude/skills/lib/` module is baseline-owned and must land in the manifest with its hash.

## Risks / landmines

- **Row 9 is a security-adjacent finding, not a tidiness one.** `closure-check.mjs` gates a commit and is satisfiable by body prose. It belongs in `/security`'s scope even though this workflow found it in a parse census.
- **The Design-calls divergence is directional.** The hook enforces the section; the drift check reads it. Widening `drift_check.mjs:95` to `\s+` is safe. Narrowing `design-calls.mjs` is not.
- **`spec-lint:259` scrapes AC ids from the whole slice body.** Any fix that unifies the slice readers changes which ACs it claims — that is a behavior change on a live check and needs its own test before the unification lands.
- **The fixture cannot live under `tests/`.** The shipped audit caller cannot read that path. This constrains the design more than it looks.
- **`--file=` scoping may hide the new check.** If the fixture lives somewhere outside `audit.mjs:109-117`'s allow-list, the scoped runs that `test.cmd` fires on every `src/` edit will silently skip it — the same vacuous-green shape this workflow exists to close.
