# Codebase Scout Report — skill-character-doctrine

Corpus reconciliation, not rediscovery. `memory.workspace.enabled` and `memory.annotations.enabled` are both `true`, so Step 0 ran first.

**Corpus delta** (`workspace/cli.mjs reconcile`, 8 touched paths): `mode: reconcile`. `changed` = `audit-baseline-helpers`, `code-structure-oracle`, `harness-helpers`, `spec-review-helpers`, `tier-dial`. `unreferenced` = none. Five elements out of a 112-element corpus is a genuine delta, not a re-derivation.

**Annotations** (`workspace/cli.mjs annotations`): 0 resolved, 0 dangling. Nothing in this slice carries a tracking annotation.

## Primary touchpoints

### Deliverable 1 — character doctrine

- `.claude/skills/audit-baseline/audit.mjs:60` — the `CHECKS` array. A new check module registers here; the file is a 139-line table-of-contents and holds no check logic.
- `.claude/skills/audit-baseline/checks/skill-ownership.mjs:7-41` — the closest existing analogue. Reads `ctx.diskSkills`, `ctx.readSkillOwner`, `ctx.loadManifest`, `ctx.root`, `ctx.skipHashCheck`; emits `[name, status, detail]` rows. A character-block check needs exactly this context and nothing more.
- `.claude/skills/audit-baseline/derive-counts.mjs:82-83` — the single place `owner: baseline` becomes a count. `owner[1] === 'baseline'` drives the derived skill total.
- `scripts/build-template.sh:124` — Stage 1, bulk-copies `.claude/` dev → `$TEMPLATE_DIR` verbatim.
- `scripts/build-template.sh:206-213` — Stage 1.5, prunes any skill whose `SKILL.md` frontmatter lacks `owner: baseline` **from the shipped tree**.
- `scripts/build-manifest.mjs:138,145` — hashes files under `$TEMPLATE_DIR`, not the dev tree.
- `scripts/build-template.sh:304` — Stage 3 stamps the manifest; `:308-320` Stage 4 runs the audit against `PKG_ROOT` (dev), with `--skip-hash-check`.
- The 14 target `SKILL.md` files, by size: `code-structure` 298, `brainstorm` 113, `tdd` 113, `spec-shippability-review` 111, `simplify` 95, `spec` 91, `security` 87, `spec-diagram-review` 85, `implement` 83, `spec-traceability-review` 81, `integrate` 67, `scenario` 64, `intake` 47, `spec-rollout-enforceability-review` 40.

### Deliverable 2 — deferral tag

- `.claude/memory/README.md:29` — `source: assistant-deferral` is already a declared value, defined as "Claude verbalized a deferred follow-up during conversation (captured by `memory_stop.mjs` intent extraction into `backlog.md`)", and it already **requires** a `verbatim:` blockquote.
- `.claude/memory/README.md:66,70` — the field-to-reader table. `status` is read by `closure-check.mjs` and `sweep.mjs`; `raised-on` by `sweep.mjs → modeBacklogDecay`. A new `deferred:` field belongs in this table.
- `.claude/memory/README.md:88` — backlog key shape: `<8-word-kebab-slug>-<4-char-sha256>`, derived by `memory_stop.mjs` from the intent verbatim.
- `.claude/memory/README.md:208` — `/commit` Step 6 invokes `sweep.mjs --mode stamp-closure`; `sweep.mjs` is the only writer to backlog entries during closure-stamping.
- `.claude/skills/spec-traceability-review/oracle.mjs:38-39` — the precedent, verbatim: `DEFERRAL_REASONS_RE = /deferred:\s*(dependency|risk|cost|human-directed)\b/i` and `DEFERRAL_RE = /\bdeferred\b/i`.
- `.claude/skills/spec-traceability-review/oracle.mjs:57-58,92` — the two-regex idiom (mentions deferral → must carry a reason) and the `suggested_fix` string. Directly reusable in shape.

### Deliverable 3 — comment oracle

- `.claude/skills/code-structure/oracle.mjs:26-45` — `runCodeStructureOracle({changedFiles})`. One check: `file_length` over `LINE_BUDGET = 80`.
- `.claude/skills/code-structure/oracle.mjs:16-24` — `substantiveLineCount` filters lines starting `//`, `#`, `*`, `/*`.
- `.claude/skills/code-structure/oracle.mjs:7` — imports `normalizeFinding` from `spec-diagram-review/oracle.mjs`; every finding goes through it with `{mandatory}`.
- `.claude/hooks/lib/tier-dial.mjs:94-113` — `resolveCheckerThreshold(checker, opts)` returns `{tier, checker, floor, ceiling, mandatory, source}`.
- `.claude/skills/harness/checker-fanout.mjs:63` — `code-structure` is **already registered** at `phase: 'code-review'`, fed `ctx.changedFiles`. No registry change is needed for a new check inside the same oracle.
- `.claude/skills/code-structure/SKILL.md:52-75` — the comment rule: default at :54, why-comment definition at :62, forbidden list at :70, delete test at :75.

## Entry points that reach this code

- `node .claude/skills/audit-baseline/audit.mjs --file={file}` — `project.json → test.cmd`. The binding verify verdict for every workflow in this repo.
- `node .claude/skills/audit-baseline/cli.mjs report` — the CI exit-code contract (exit 1 on FAIL).
- `scripts/build-template.sh` Stage 4 — the build's own audit gate, run with `--skip-hash-check`.
- `node .claude/skills/harness/checker-fanout.mjs run <slug>` — reaches `runCodeStructureOracle` at the code-review phase.
- `sweep.mjs --mode stamp-closure` via `/commit` Step 6 — the only automated writer of backlog entry frontmatter.
- `memory_stop.mjs` (Stop hook) — the only automated **creator** of `source: assistant-deferral` entries.

## Existing tests

- `tests/code-structure-comment-policy.test.mjs` — 84 lines, 2 tests, **passing**. Asserts the comment rule's policy TEXT is present in `SKILL.md` with its named exceptions. Header comment states the governing decision (see Risks).
- `tests/audit-skill-count-drift.test.mjs` — guards the derived skill count.
- `tests/audit-baseline-cli.test.mjs`, `tests/audit-baseline-post-amendment.test.mjs`, `tests/audit-consumer-install.test.mjs` — audit surface.
- `tests/build-template.test.mjs`, `tests/build-audit-gate.test.mjs`, `tests/build-audit-rehash-skip.test.mjs`, `tests/build-template-mirror-sync.test.mjs` — build-stage behaviour, including the Stage 3/Stage 4 ordering rationale.
- `tests/checker-fanout.test.mjs`, `tests/checker-fanout-oracles.test.mjs`, `tests/checker-fanout-live-wiring.test.mjs` — fan-out registry and oracle wiring.
- `tests/checker-oracle-traceability.test.mjs` — covers the existing `deferred:` reason list.

None are skipped. Three suite assertions elsewhere in `tests/` are red (`memory-readers-sharded`, `memory-scope-store-invariants` ×2) but sit outside this slice and outside the binding `test.cmd`.

## Constraints and co-changes

- **Dev tree and shipped tree must stay byte-identical for shipped files.** `build-manifest.mjs` hashes `$TEMPLATE_DIR`; `audit-baseline` re-hashes the same relative paths under `PKG_ROOT`. Stage 1 rsyncs dev → template verbatim, so a character block stamped into `$TEMPLATE_DIR` after Stage 1 would make every one of the 13 shipped skills fail `hash mismatch`. **The stamping stage must run against `$PKG_ROOT/.claude/skills/` before Stage 1.**
- `project.json → test.cmd` is `audit.mjs`. A defect in the new check degrades the verify stamp for every subsequent workflow in this repo.
- `--skip-hash-check` (`audit.mjs:98-99`) suppresses only the per-file re-hash, and only for the build-internal Stage 4 call. A new character check must decide explicitly whether it honours that flag.
- `memory-sync` is the only sanctioned promoter into canonical memory files; `sweep.mjs` the only closure writer. A `deferred:` validator reads; it must not write.
- `source: assistant-deferral` already requires `verbatim:`. The new `deferred:` field is a second required field on the same entries, not a first.
- CLAUDE.md ≤ 40,000 chars, byte-equal with `src/CLAUDE.template.md`.
- New shipped helpers must be `.sh` or `.mjs`/`.js`, and every module a shipped `SKILL.md` imports must appear in `obj/template/.claude/manifest.json`.

## Patterns in use here

Checks are single-purpose modules under `checks/`, each exporting `run(ctx)` and returning `[name, status, detail]` rows; `audit.mjs` is a registry that holds no logic. Oracles export one `run*Oracle({...})` returning `{findings}`, push every finding through `normalizeFinding(obj, {mandatory})`, and read their severity from `resolveCheckerThreshold`. Regex-based content rules use a paired-regex idiom — one regex detects the topic, a second detects compliance — so a mention without compliance is the finding. Build stages are numbered, commented with the failure they close, and ordered by data dependency rather than by concern.

## Risks / landmines

- **BLOCKER — AC-6 is not achievable as written.** `spec-shippability-review` is dev-only **by design**. Its `SKILL.md:5-10` carries an explicit `DEV-ONLY SKILL` comment naming Stage 1.5 as the mechanism, and `obj/template/.claude/skills/spec-shippability-review` does not exist. Annotating it `owner: baseline` would ship a dev-only maintainer tool to every consumer install — and the skill reads `obj/template/.claude/manifest.json`, a path no consumer has. Separately, backlog `third-party-owner-value-and-six-unannotated-baseline-skills-9f2c` measures the cost: annotating the six unannotated skills moves the derived total 56 → 62 and turns five passing audit checks red, requiring a `seed.md` §4.3 genesis amendment **first** (Article I.4), then CLAUDE.md ×3 plus its mirror, README ×2, CONSTITUTION Appendix B, the docs site, `_data/baseline.cjs`, and a manifest rebuild. AC-6 must be dropped or re-scoped.
- **BLOCKER — AC-11 reverses a recorded decision.** `docs/archive/2026-08-09/harness-batch-fixes/spec.md:40` records **D-6**: "Does T2 change `code-structure/oracle.mjs`? → No — `SKILL.md` only … `oracle.mjs` runs the code-review phase and has no comment dimension; adding one is out of scope (VI.4)." `tests/code-structure-comment-policy.test.mjs:8-10` restates the same finding harder: "no mechanical what-comment detector. No reliable oracle separates a what-comment from a why-comment, and a high-false-positive gate on every code write is worse than the stated policy." The comment rule is not unenforced by oversight; it was left unenforced deliberately, five days ago. AC-11 may still be right, but it is an overturn and must be argued as one.
- The 14 target files span 40 to 298 lines with no shared section convention. There is no existing anchor (a trailing `## Applies to`, a frontmatter key) present in all 14 for a stamper to key off. The insertion point is a genuine design decision, not a lookup.
- `code-structure/SKILL.md` at 298 lines is by far the largest target and the only one whose own subject matter is the rule being enforced. It already exceeds the 80-line budget its own oracle enforces on source files (the budget applies to code, not docs — noted so the spec does not mistake one for the other).
- `substantiveLineCount` stripping comment lines is load-bearing for the existing `file_length` check. Any comment-ratio measure needs its own counter; reusing this one would divide by a denominator that already excludes the numerator.
