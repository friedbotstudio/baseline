# Pattern Research — skill-character-doctrine

No third-party library is involved in any candidate below. Every API cited is a module in this repository, read at its current state on disk, so the current-docs mandate (VI.5) is satisfied by direct source reading rather than by `context7`. No candidate adds a dependency.

## Prior art (retrieved)

`retrieve.mjs` scanned 219 sources and returned **210 hits, all `via: terms`, 0 `via: source_spec`, 0 `structuralUnresolved`**. A 96% hit rate is a non-result: the term set (`build`, `manifest`, `rule`, `skill`, `oracle`) appears in nearly every archived spec in this repo, so the ranking carries no signal. Recorded rather than dressed up — the term lane did not narrow anything here.

The structural lane's 0 is informative and not a failure: `structuralUnresolved` is empty, so no element governing the touched paths carries a `source_spec:` at all. The corpus routes these modules but does not name the spec that authored them.

One archived source is genuinely load-bearing, and `/scout` found it by reading rather than by retrieval:

- `docs/archive/2026-08-09/harness-batch-fixes/spec.md:40` (`via: terms`, score 10) — decision **D-6**, which rejected a mechanical what-comment detector. Intake decision D-5 upholds it for individual comments and overturns it only for an aggregate ratio. Already resolved upstream; nothing to re-derive.

Everything below is new derivation.

## The AC-21 measurement

Binding output of this phase. Measured over 370 files (`.mjs`, `.js`, `.sh` under `.claude/`, `scripts/`, `src/`, excluding `node_modules`, `obj/`, memory and state trees, and files under 10 substantive lines). The comment predicate is copied verbatim from `code-structure/oracle.mjs:21` — a line whose trimmed form starts with `//`, `#`, `*`, or `/*` — so the threshold is expressed in the units the oracle will actually measure.

**Aggregate: 13,340 comment lines to 71,788 substantive lines — a ratio of 0.186.**

| Percentile | All comment lines | Excluding the leading module header |
|---|---|---|
| p50 | 0.244 | **0.098** |
| p75 | 0.414 | **0.211** |
| p90 | 0.636 | **0.378** |
| p95 | 0.922 | **0.452** |
| p99 | 1.243 | **0.784** |
| max | 1.733 | 1.242 |

**The module header is the corpus's comment mass, and excluding it changes the answer completely.** The median file more than halves, 0.244 → 0.098. The worst offenders are small modules whose header is most of the file: `.claude/skills/workspace/witness.mjs` is 26 comment lines over 15 substantive, and 20 of those 26 are the header. `.claude/hooks/lib/slug.mjs` is 25 over 22, with 17 in the header.

The module header is a **sanctioned carve-out** — `tests/code-structure-comment-policy.test.mjs:27` names it alongside the why-comment and the `lazy:` marker. A ratio counting header lines therefore penalises files for obeying a convention the repository mandates, and would fire hardest on the smallest, most disciplined modules. Any ratio check must exclude the leading header block.

How many files a threshold would flag:

| Threshold | All comment lines | Body only (header excluded) |
|---|---|---|
| 0.25 | 175 (47.3%) | 76 (20.5%) |
| 0.40 | 95 (25.7%) | 31 (8.4%) |
| **0.50** | 63 (17.0%) | **11 (3.0%)** |
| 0.60 | 44 (11.9%) | 8 (2.2%) |
| 1.00 | 13 (3.5%) | 2 (0.5%) |

**Derived threshold: 0.50 on the body-only ratio.** It sits between p95 (0.452) and p99 (0.784), flags 11 of 370 files, and is a punch list rather than a flood. It is derived from the distribution, not chosen: it is the round number nearest the point where the curve turns from "the top of normal" into "an outlier".

One live example worth naming now: `scripts/build-template.sh` measures 167 comment lines over 142 substantive with a 1-line header — the largest body-comment mass in the repository, and a file Candidate 2A must edit.

## Candidate 1A: JSON doctrine, rendered at stamp time

- **Summary**: `.claude/character.json` holds `{ "<slug>": {soul, motivation, mantra} }`. The stamper renders each entry into a fixed Markdown block; the drift check re-renders and compares bytes.
- **API references (current)**: `.claude/workflows.jsonl` — the repo's existing precedent for machine-read declarative config under `.claude/`, shipped by Stage 1's rsync. `.claude/skills/audit-baseline/checks/context.mjs` — `buildContext` already supplies `root`, so a new check reads the file with no new plumbing.
- **Fits**: yes. Config that a script must parse is JSON here (`project.json`, `workflows.jsonl`, `manifest.json`); prose that a human reads is Markdown. This splits the difference by making JSON canonical and Markdown derived.
- **Tests it enables**: render-is-deterministic; a hand-edited stamped block fails the drift check; a doctrine entry with a missing key fails the audit; a doctrine entry for an absent skill emits nothing (AC-7).
- **Tradeoffs**: three paragraphs of prose inside JSON string values are unpleasant to hand-edit, and the human edits these often at gate A. No multi-line strings, so every entry is one long line. Against that, byte-comparison is trivial because exactly one renderer exists.

## Candidate 1B: Markdown doctrine, extracted at stamp time

- **Summary**: `.claude/character.md` holds one `### <slug>` section per skill with three bolded bullets. The stamper copies the section body verbatim into the `SKILL.md`; the drift check compares the two spans.
- **API references (current)**: `.claude/memory/README.md` and the memory shard format — the repo's precedent for structured Markdown that helpers parse (`memory-index/`, `sweep.mjs`).
- **Fits**: partially. Human-editable, which matters because gate A is where these words get rewritten. But it makes the parser the source of truth for what a "block" is, and a heading typo silently drops a skill from the target set rather than failing loudly.
- **Tests it enables**: the same set, plus a parser-robustness suite the JSON candidate does not need.
- **Tradeoffs**: the failure mode is the wrong shape. A malformed JSON file throws; a malformed Markdown heading yields a smaller target set that passes. AC-1 makes the doctrine the definition of the target set, so a silent-shrink failure mode is the one to avoid.

## Candidate 2A: a new Stage 0c in `build-template.sh`

- **Summary**: a `node` stamper runs against `$PKG_ROOT/.claude/skills/*/SKILL.md` before Stage 1's rsync, then Stage 1 copies the already-stamped files verbatim.
- **API references (current)**: `scripts/build-template.sh:59` Stage 0a already seeds memory placeholders **in the dev repo**; `:80` Stage 0b already syncs vendored mirrors **into the dev tree**. A build stage that mutates `$PKG_ROOT` is established practice here, not a new precedent.
- **Fits**: yes, and the constraint forces it. `scripts/build-manifest.mjs:138,145` hashes files under `$TEMPLATE_DIR`, while `audit-baseline` re-hashes the same relative paths under `PKG_ROOT` (`checks/skill-ownership.mjs:32`). Stamping after Stage 1 would leave the dev tree unstamped and every shipped target failing `hash mismatch`.
- **Tests it enables**: idempotence (a second run changes nothing); dev and template bytes identical after a full build; the manifest hash matches dev-tree bytes; the audit passes end to end.
- **Tradeoffs**: `npm run build` now edits tracked source files, so a build on a dirty tree produces a diff the maintainer did not type. Mitigated by idempotence — the diff is empty once the blocks are current — but the first build after any doctrine edit will surprise someone.

## Candidate 2B: a standalone stamper the maintainer runs

- **Summary**: `npm run character:stamp` writes the blocks; the build only verifies. Divergence is an audit FAIL telling the maintainer to run it.
- **Fits**: partially. It keeps `npm run build` read-only over tracked source, which is the tidier contract.
- **Tests it enables**: the same verification tests; no idempotence-under-build test needed.
- **Tradeoffs**: it makes drift the normal state between a doctrine edit and the next manual run, and AC-5 is written as "given the build script, when it completes". Choosing this means amending AC-5, which re-opens gate A.

## Candidate 3A: deferral validator as a `code-review` checker

- **Summary**: a new entry in `DEFAULT_CHECKER_REGISTRY` at `phase: 'code-review'` reading `ctx.changedFiles`. "Touched" is exactly "the entry file appears in `changedFiles`", so enforce-on-touch (AC-12) needs no diff logic of its own.
- **API references (current)**: `.claude/skills/harness/checker-fanout.mjs:47-67` — the registry, with `code-structure` at `:63` already consuming `ctx.changedFiles` in this phase. `.claude/skills/spec-traceability-review/oracle.mjs:38-39` — the paired-regex idiom and the exact reason list to reuse.
- **Fits**: yes. It reuses the registry, adds no hook file (so no hook count cascade), and inherits `normalizeFinding` plus the severity dial.
- **Tests it enables**: untagged touched entry BLOCKs; each of the four valid reasons passes; an invalid value BLOCKs naming the value; an untouched entry with no tag is silent.
- **Tradeoffs**: it fires at code-review, so a bad entry is caught late in the workflow rather than at write time. Acceptable — the entry is still pre-commit, and every alternative that catches it earlier is a hook.

## Candidate 3B: a PreToolUse hook on backlog writes

- **Summary**: block the Write when the frontmatter lacks a valid `deferred:`.
- **Fits**: no. It adds a 27th hook against a roster the constitution enumerates at 26 (Article VIII), forcing a `seed.md` §4.1 amendment. It also fights Article IX.3: `/memory-sync` and `sweep.mjs` are the sanctioned writers, so the hook would be policing the exact paths the constitution already routes.
- **Tradeoffs**: earliest possible catch, at the cost of a constitutional amendment for a check the fan-out can carry for free. Listed for completeness, not recommended.

## Recommendation

**1A, 2A, 3A**, with the ratio measured **body-only at 0.50**.

- **1A over 1B** because AC-1 makes the doctrine file the definition of the target set. A malformed JSON throws; a malformed Markdown heading silently shrinks the set and passes. When a file defines what must be checked, its failure mode must be loud. What flips it: if the human finds editing prose inside JSON strings intolerable in practice at gate A, 1B's ergonomics win and the parser gets a strict-mode test to close the silent-shrink hole.
- **2A over 2B** because the hash constraint is not negotiable and AC-5 is already written as a build outcome. What flips it: a hard objection to `npm run build` touching tracked files — that is a real contract change, and it would need AC-5 amended and gate A re-run.
- **3A over 3B** because 3B costs a constitutional amendment for a check the existing registry carries at zero structural cost. Nothing plausible flips this.
- **Body-only 0.50** because the header exclusion is not a tuning preference but a correctness requirement: the header is a sanctioned carve-out, and counting it inverts the check against the repo's own convention. What flips the number: if the spec decides the ratio should also catch header bloat, the threshold moves to the all-comment column and 0.75 (24 files, 6.5%) is the equivalent point on that curve.

Under D-5 the check lands advisory, so a mis-set threshold costs a note rather than a stopped workflow. That is the safety margin that makes shipping a derived-but-untested number reasonable.

## Notes for the spec author

Two items to record in the spec's `## Decisions` section. Both are routine engineering choices decidable in main context under Article XI.12, so neither is asked.

- **Insertion point.** The stamped block needs one, and the 14 targets share no common anchor (scout: 40 to 298 lines, no shared trailing section). A fixed rule — immediately after the frontmatter's closing `---` — is the only convention that holds for all 14 without hand-editing 14 files first.
- **The build script's own ratio.** `scripts/build-template.sh` measures 1.176 all-comment and is edited by deliverable 2. Whether the workflow's own diff is held to the new threshold follows directly from intake decision D-3: it is grandfathered like the rest of the corpus under enforce-on-touch, and the corpus-repair backlog entry (AC-22) is where that gets recorded.

## Open questions

None. The three raised at intake were resolved at gate A; the two items above are decisions for `/spec`, not questions for the human.
