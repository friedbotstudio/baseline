# Codebase Scout Report — session-start-stale-cache

This run reconciled against the workspace corpus rather than rediscovering the slice. `reconcile --touched` returned `mode: "reconcile"` with a delta of four changed elements — `memory-hook-libs`, `memory-session-start`, `memory-sync-helpers`, `staleness-predicate` — and no unreferenced elements. Four elements for four touched paths is a genuine delta, not a re-derivation.

## Primary touchpoints

- `.claude/hooks/lib/memory_session_start.mjs:168` — `changedSince(root, stamp)`. Spawns `git diff --name-only <stamp>..HEAD` and returns the path list, or `null` when git exits non-zero. This is the call the work is about.
- `.claude/hooks/lib/memory_session_start.mjs:216` — `isStale(block, name, head, root)`. Calls `changedSince` once per entry, unconditionally, whenever the stamp is usable. The per-entry call site.
- `.claude/hooks/lib/memory_session_start.mjs:232` — `readShardedCategory(dir, name, head, root)`. Loops the shards in one category and calls `isStale` per file. Every canonical category in the live store is sharded, so this is the loop that multiplies the git calls.
- `.claude/hooks/lib/memory_session_start.mjs:340` — `buildIndex({memDir, projectRoot, sessionSource})`. The exported entry point. Measured at 61,487ms of the hook's 62.19s.
- `.claude/hooks/lib/memory_session_start.mjs:155` — `gitHead(root)`. One `git rev-parse --short HEAD` per run. This is the cache key the work needs and it is already computed.
- `.claude/hooks/lib/staleness.mjs:77` — `isStaleFromFields`. The predicate itself. It consumes `changedPaths` and never calls git. Nothing here needs to change.
- `.claude/hooks/lib/staleness.mjs:32` — `usableStamp`. The `/^[0-9a-f]{7,40}$/` gate every stamp passes before it reaches a git argv.
- **`.claude/skills/memory-sync/sweep.mjs:221`** — a second, independent `changedSince` with the same body, called per entry at line 260. The sweep carries the identical cost. Whatever fixes the hook either lives somewhere both can import, or the sweep keeps paying.

## Entry points that reach this code

- **`SessionStart` hook** — `.claude/settings.json` wires exactly one command, `node $CLAUDE_PROJECT_DIR/.claude/hooks/memory_session_start.mjs`. That thin wrapper imports `buildIndex` from `lib/` (line 23) and prints the index. Every new session in every install runs this.
- **`/memory-sync` Step 0c** — `node .claude/skills/memory-sync/sweep.mjs --mode stale-sweep`. Interactive and occasional, not per-session.

## Existing tests

Sixteen test files import `buildIndex` or `lib/memory_session_start`. The ones that pin behavior this work must not break:

- `tests/sweep-staleness-parity.test.mjs` — asserts the sweep and the hook report the same stale set, entry by entry, over the live corpus. Its header records why: at `1b2b0c7` the two disagreed 287 to 248. Passing. This is the single most important test for this change, because a cache applied to one caller and not the other reintroduces exactly the drift it guards.
- `tests/memory-staleness-witness.test.mjs` — twelve cases over the predicate. Includes `test_when_changed_paths_unavailable_then_falls_back_to_date_leg` (the `null` tri-state), `test_when_verified_at_is_an_option_then_it_never_reaches_git` (the injection gate), and `test_when_governs_glob_is_refused_then_the_predicate_falls_back_rather_than_throwing`. Passing.
- `tests/memory-build-index.test.mjs` — direct coverage of `buildIndex`. Passing.
- `tests/memory-session-start-head-decay.test.mjs`, `tests/memory-session-start-supersession-decay.test.mjs`, `tests/memory-readers-sharded.test.mjs` — decay and sharded-read behavior. Passing.

No skipped or flaky tests in this slice. The full suite is 3440 pass / 0 fail / 16 skipped, and none of the 16 skips are here.

`tests/helpers/memory-git-fixtures.mjs` already exists and builds real git repositories for the witness tests. New tests should use it rather than mocking git.

## Constraints and co-changes

- **Manifest hash.** All four touchpoints are baseline-owned files. Editing one invalidates its sha256 in `obj/template/.claude/manifest.json`, and `audit-baseline` fails with `hash mismatch` until `node scripts/manifest-refresh.mjs` re-stamps it. This happened in this session's prior chore. `obj/` is gitignored, so nothing is committed for it — but the audit is part of `test.cmd`, so a forgotten refresh reads as a red suite.
- **Additive only.** Memory entry `shipped-hook-changes-must-be-additive`: this hook is installed in consumer projects. Widening or preserving what it reports is a fix; narrowing it breaks installs silently.
- **`.claude/state/` is gitignored** (`.gitignore:5`). A cache file there is disposable by construction, which is what the work wants.
- **Zero runtime dependencies** (`constraints/zero-runtime-dependencies`, governs `.claude/hooks/**`). No new package.
- **Two callers, one predicate.** `decisions/staleness-is-witnessed-not-counted-2026-08-24` records that the predicate lives in one module precisely because the copies drifted before. The `changedSince` helper is currently duplicated in both callers and is *not* in that module — which is why both pay the cost, and why a shared home for it would be consistent with the decision already on record.

## Patterns in use here

The hook is written defensively and fails open everywhere. `gitHead` swallows exceptions and returns `''`. `changedSince` returns `null` on a non-zero exit, and the predicate treats `null` as "could not tell" and falls through to the date leg — deliberately distinct from an empty array, which means "nothing moved". The module header at `staleness.mjs:53` spells out that collapsing the two would report an entry fresh at any age on the strength of a comparison that never ran.

Helpers are small, pure, and exported one per concern. Tests are named `test_when_<condition>_then_<outcome>`.

## Risks / landmines

- **Argument injection through a frontmatter value.** `landmines/a-frontmatter-value-in-a-git-argv-is-an-option-injection-sink` — re-verified this run: `usableStamp` is at `staleness.mjs:32` and the `GIT_SHA` regex at line 30, both present. A stamp of `--output=<path>` once made `git diff` write an arbitrary file and exit 0, silently, on every session. Any new code path that builds a git argv from stored data inherits this. **A cache file is stored data**: whatever is read back from `.claude/state/` and interpolated into a git command needs the same gate as the frontmatter it came from, not the trust that it was validated on the way in.
- **The three-state answer is load-bearing.** moved / did not move / could not tell. A cache miss, a corrupt cache, or a failed read must land on `null`, never on `[]`. `[]` reports every entry fresh forever.
- **The sweep will diverge if only the hook is fixed.** `tests/sweep-staleness-parity.test.mjs` catches the stale-set divergence, but it does not catch the sweep staying slow. That is a scope decision the spec has to make explicitly.
- **The superset prefilter is not equal to the exact diff.** Named in the intake's open questions and unresolved here. `git log --name-only A..HEAD` includes files changed and later reverted, so it clears safely but flags unsafely. Scout confirms nothing in the current code does this today — there is no precedent to copy.
