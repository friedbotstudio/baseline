# Security reports — durable-plan-slug-guard

## durable-plan-slug-guard-2026-07-12.md

# Security Review — durable-plan-slug-guard — 2026-07-12

## Summary

Overall risk: **LOW**. The diff closes both findings it targeted — the MEDIUM (CWE-22, unvalidated slug into durable-plan paths) and the LOW (fail-open durable-plan mirror in the live gate-A verdict path). I attacked the guard with 29 hostile inputs and 28 were rejected; the single acceptance is a missing length cap, which is a robustness nit rather than a traversal. Critically, the try/catch added around the plan mirror does **not** trade a LOW for a CRITICAL: `spec_approval_guard` reads the checker-fanout **projection**, not the plan, and the projection is written *before* and *independently of* the mirror.

## Findings

No CRITICAL, HIGH, or MEDIUM findings in this diff.

### [LOW] `assertSafeSlug` has no length bound

- **OWASP**: A04 Insecure Design | **CWE**: CWE-1284 (Improper Validation of Specified Quantity in Input)
- **File**: `.claude/skills/harness/plan-store.mjs:20-27`
- **Evidence**:
  ```js
  const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
  export function assertSafeSlug(slug) {
    if (typeof slug !== 'string' || !SLUG_RE.test(slug)) { throw new Error(...); }
    return slug;
  }
  ```
- **Impact**: `'a'.repeat(5000)` is accepted (verified). It cannot escape `.claude/state/plan/`, so this is not a traversal — the write simply fails later with an unhandled `ENAMETOOLONG` from `writeFileSync`, surfacing as a confusing low-level error instead of a clean rejection. No attacker benefit beyond an ugly crash, and the slug is developer-controlled today.
- **Recommendation**: bound the quantifier — `/^[a-z0-9][a-z0-9-]{0,63}$/` — so an over-long slug is rejected by the same clean, named error as every other malformed slug. One character of regex; no behavior change for any real slug (the longest in-repo is 27 chars).

### [LOW] `evidence-ledger`'s `ledgerPath` is written unvalidated

- **OWASP**: A03 Injection | **CWE**: CWE-22 (Path Traversal)
- **File**: `.claude/skills/harness/evidence-ledger.mjs:20-24`, reached via `:35-36`
- **Evidence**:
  ```js
  export function recordRoundTripOnPlan({ slug, rootDir, ledgerPath, roundTrip }) {
    appendRoundTrip(ledgerPath, roundTrip);   // ledgerPath written directly, unguarded
    const plan = readPlan(slug, rootDir);     // slug IS now guarded (this diff)
  ```
- **Impact**: the `slug` half of this function is now guarded transitively by `readPlan`, but `ledgerPath` is a caller-supplied path written straight to `writeFileSync` with no validation — an arbitrary-write primitive *if* a caller ever passes untrusted input. It is not exploitable today: a repo-wide grep finds **zero callers** of `recordRoundTripOnPlan` outside its own module and tests, so the path is only ever the module's own constant in practice.
- **Recommendation**: out of scope for this diff (the finding, and the write set, are about the *slug*). `ledgerPath` is in the same category as `rootDir` — caller-supplied machine state, not user input. Worth a containment decision when the v1 RALPH loop (`-4c43`) actually starts calling it: either derive `ledgerPath` from the guarded slug rather than accepting it, or assert it resolves under `rootDir`.

## Answers to the review questions

**(a) Is `/^[a-z0-9][a-z0-9-]*$/` sufficient? — Yes, with one gap (the length cap above).** I ran 29 hostile inputs through the live guard. Rejected: `../../evil`, `a/b`, `a\b` (Windows separator), `/abs`, `c:evil` (drive letter), `file:stream` (NTFS ADS), `..`, `.`, `''`, `UPPER`, `has space`, `-lead`, `%2e%2e%2f`, embedded and trailing newlines, an embedded **null byte**, U+2044 fraction slash, U+FF0F fullwidth solidus, fullwidth homoglyphs, and accented Latin. Two results are worth calling out because they are the classic bypasses:

- **Trailing newline (`"ok\n"`) is rejected.** In JavaScript, `$` without the `m` flag matches only at end-of-input — unlike Python, where `$` also matches before a trailing newline and `re.match(r'^[a-z0-9-]+$', 'ok\n')` *succeeds*. The regex is correct **because it is in JS**. If this validator is ever ported to Python, it must switch to `\Z` or the newline bypass reopens.
- **The `toString` coercion attack is rejected.** `{ toString: () => '../../pwned' }` never reaches the regex, because `typeof slug !== 'string'` short-circuits first. Had the check been `!SLUG_RE.test(slug)` alone, `.test()` would have coerced the object and the traversal would have sailed through. The ordering of that `||` is load-bearing.

**(b) Is every path-construction site guarded? — Every *slug*-derived one, yes.** Enumerated exhaustively: `plan-store.mjs:31` (`planPath`, guarded at the top; `:35` and `:114` both route through it, so `createPlan`/`readPlan`/`persistPlan`/`setVerdictArtifact`/`recordRevision` are guarded **by construction**, not by each caller remembering); `checker-fanout.mjs:57` (`persistVerdict`'s own join — private, only reachable from `runCheckerFanout`, which now asserts at entry) and `:104-105` (the `docs/specs/` and `docs/intake/` reads — these were the sites the backlog's literal wording would have *missed*, since it named only `persistVerdict`). `plan-frame.mjs`, `plan-diff.mjs`, and `replan.mjs` construct no paths at all (they operate on in-memory plan objects). `plan-wiring.mjs:30,42` reach the disk only through the now-guarded `readPlan`. The one unguarded write is `evidence-ledger`'s `ledgerPath`, filed as LOW above — a *path* parameter, not a slug.

**(c) Does `readPlan` throwing break a caller that relied on the null-return? — No.** The `existsSync` check still happens *after* `planPath`, so a **valid** slug with no plan on disk still returns `null` exactly as before; the throw fires only on an **invalid** slug, which previously would have silently traversed. All four callers (`evidence-ledger.mjs:37`, `plan-wiring.mjs:30`, `plan-wiring.mjs:42`, `checker-fanout.mjs:51`) use the `plan ? … : null` shape and receive their slug from `workflow.json` (i.e. `/triage`-derived kebab-case). No availability or DoS regression. 43/43 tests across every plan-store consumer pass unchanged.

**(d) Does the try/catch swallow an integrity failure and let gate A wave through a BLOCKED spec? — No, and this was the question worth asking.** `spec_approval_guard.mjs:72` builds and reads `.claude/state/checker-fanout/${expectedSlug}.json` — **the projection, not the durable plan**. And in `persistVerdict` the ordering is: write the projection, *then* attempt the mirror inside the try/catch. So a mirror failure cannot leave gate A reading a stale verdict — the authoritative artifact was already written, and the test proves it (real `EACCES`, projection intact, `BLOCKED` still reported). The mirror is genuinely non-authoritative. Had gate A read the *plan*, this try/catch would indeed have converted a LOW into a CRITICAL by silently degrading the gate; it does not.

**(e) Is the stderr warning an information-disclosure risk? — No.** `err.message` from an `EACCES` carries an absolute path (e.g. `/var/folders/.../plan/<slug>.json`). This is a local developer tool: the message goes to the terminal or CI log of the person already running the harness on their own filesystem. There is no cross-tenant boundary to leak across, and the path is exactly the diagnostic value the warning exists to provide. Swallowing it silently would be the worse choice — a persistently broken mirror would then degrade invisibly, which is the failure mode the LOW was about in the first place.

## Dependencies

No new packages. Both changed files are stdlib-only (`node:fs`, `node:path`). `package.json` `dependencies` is untouched (still `@clack/prompts` alone, enforced by `scripts/check-files-diff.mjs`). `obj/template/.claude/manifest.json` was rehashed by `npm run build` as required for baseline-owned files; it is gitignored and not part of the commit.

## Out of scope / Noted

- **`spec_approval_guard.mjs:72` builds its own checker-fanout path from `expectedSlug`**, which is derived via `canonicalSlug` (`common.mjs:149`) — a **normalizer, not a validator**. It strips everything before the last `/`, so a POSIX traversal collapses harmlessly (`../../x` → `x`), but it does **not** strip backslashes: on Windows, a slug like `..\..\x` would survive normalization intact. This is pre-existing, outside this diff's write set, and not reachable today (the hook's slug comes from a user-typed `/approve-spec` argument on a POSIX dev box). Worth a follow-up: have the hook call `assertSafeSlug` rather than `canonicalSlug` for the path-construction step, so the repo has one slug validator instead of a validator and a normalizer that look interchangeable but are not.
- **`SLUG_RE` now has two definitions** (`plan-store.mjs:21` and `consolidate-open-questions.mjs:110`). Flagged by `/simplify`; consolidation deferred to a third use per Art. VI.4.

