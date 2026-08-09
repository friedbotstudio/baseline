# Security reports — read-front-door-sweep

## read-front-door-sweep-2026-08-09.md

# Security Review — main (read-front-door-sweep) — 2026-08-09

## Summary

Overall risk: **MEDIUM**. One real path-traversal defect (T6) where a new verb forwards caller-supplied `--spec-dir` into a directory read without the `assertNoTraversal` guard its sibling dispatcher applies to the identical flag. No injection, no secrets, no crypto, no new dependencies. Diff is 15 tracked files (+610/−215) plus 18 new files — under the 2000-line stop threshold.

Reviewed **7 of 7 tickets** on the `power` track. Per-ticket verdicts below; no ticket was skipped.

## Per-ticket verdicts

| Ticket | Write surface | Verdict |
|---|---|---|
| T7 | `spec-lint/lint.mjs`, `workspace/coverage.mjs` | CLEAN |
| T1 | `roadmap/parse.mjs`, `roadmap/cli.mjs`, `standup/gather.mjs` | LOW (F-2) |
| T2 | `memory-sync/{cli,sweep}`, `document/{cli,document-gate}`, `harness/{cli,rightsize-gate}` | CLEAN |
| T3 | `audit-baseline/{cli,audit}.mjs` | CLEAN |
| T4 | `spec/cli.mjs`, `harness/checker-fanout.mjs`, `harness/checkers/spec-{lint,shippability}.mjs` | LOW (F-3) |
| T5 | `harness/cli.mjs` state verb | CLEAN |
| T6 | `memory-index/cli.mjs` query verb | **MEDIUM (F-1)** |

## Findings

### [MEDIUM] `query` forwards `--spec-dir` into a directory read with no traversal guard

- **OWASP**: A01 – Broken Access Control | **CWE**: CWE-22 (Path Traversal)
- **File**: `.claude/skills/memory-index/cli.mjs:73`
- **Evidence**:
  ```js
  const entries = resolveLookup(kind, needle, { rootDir: ctx.root, specDir: ctx.flags['spec-dir'] });
  ```
  `resolveLookup` → `conceptLayer(specDir, rootDir)` → `readConcepts(specDir)` + `readAll(specDir)`, both of which read the directory verbatim. `memory-index/cli.mjs` does not import `assertNoTraversal`.

  The sibling dispatcher guards the same flag, and its comment predicts this exact defect (`memory-sync/cli.mjs:19-27`):
  ```js
  // --spec-dir is caller input and reaches a path join, so it is validated the same
  // way the workspace dispatcher validates it. Two dispatchers accepting the flag
  // with only one checking it is how a traversal survives a review.
  ```
- **Reproduced**:
  ```
  memory-sync   stale-elements --spec-dir ../../../etc  -> exit 1, "unsafe path traversal (REJECT, never normalize)"
  memory-index  query --kind by_concept --needle memory-model --spec-dir ../../../etc  -> exit 0
  ```
- **Impact**: a caller can point the corpus reader at any directory the process can read, inside or outside the repository. Disclosure is bounded by what the corpus reader parses (Markdown frontmatter of `concepts/` and `elements/`), and the process already runs with the invoking user's privileges, so no privilege boundary is crossed. That bound is why this is MEDIUM and not HIGH — but the repository's own policy treats path guards as fail-closed and mandatory (`docs/security/durable-plan-slug-guard-2026-07-12.md`; CLAUDE.md's REJECT-never-normalize rule), so by house convention this is a policy violation with a one-line fix.
- **Recommendation**: import `assertNoTraversal` from `../workspace/tree.mjs` and resolve `--spec-dir` through the same `corpusDir()` shape `memory-sync/cli.mjs` already uses — absolute passes through, relative is traversal-checked then joined to root. Do **not** normalize the path; reject it. Note `scope-narrow`, the other verb T-009 added, does not take `--spec-dir` and is unaffected.

### [LOW] `roadmap.path` from `project.json` is joined without a traversal check

- **OWASP**: A05 – Security Misconfiguration | **CWE**: CWE-22
- **File**: `.claude/skills/roadmap/parse.mjs:31-43`
- **Evidence**:
  ```js
  const declared = cfg && cfg.roadmap && cfg.roadmap.path;
  if (typeof declared === 'string' && declared.trim()) return declared.trim();
  ```
  The returned value is later `join(rootDir, ...)`-ed and read.
- **Impact**: a `project.json` declaring `roadmap.path: "../../../etc/passwd"` makes the parser read that file. The input is owner-controlled trusted configuration, and anyone who can write `project.json` can already write the skills themselves — so this is a hardening gap, not an exploitable boundary.
- **Recommendation**: none required for this landing. **Pre-existing, not introduced**: `standup/gather.mjs` resolved the same key the same way before this batch, and T1 preserved that behaviour deliberately for recap parity (AC-002). If hardened later, harden both readers at once — they now share one parser, so it is a single edit.

### [LOW] Two checker adapters import a skill that is pruned from consumer installs

- **OWASP**: A08 – Software & Data Integrity Failures | **CWE**: CWE-1104
- **File**: `.claude/skills/harness/checkers/spec-shippability.mjs:15`
- **Evidence**:
  ```js
  import { collectMarkdownCode, runDevTreeAndUnshippedChecks } from '../../spec-shippability-review/analyzer.mjs';
  ```
  `scripts/build-template.sh` reports: `build: pruning dev-only skill spec-shippability-review (no owner: baseline)`.
- **Impact**: on a consumer install the module is absent, so this is a **top-level import failure at module load**. The adapter's internal `try/catch` cannot catch it, and because `checker-fanout.mjs` imports the adapter at its own top level, the whole fan-out would fail to load — degrading the spec-review boundary rather than failing open. This repository is unaffected (the skill is present in the dev tree).
- **Recommendation**: either gate the adapter behind a dynamic `import()` inside its `run`, so absence degrades to `{findings: []}` like every other fail-open path in that file; or give `spec-shippability-review` `owner: baseline` so it ships. The first is the smaller change and matches the registry's existing fail-open posture. Flagged for `/integrate`.

## Dependencies

No new packages. `package.json` is unchanged in this diff; the baseline remains zero-runtime-dependency. Nothing to CVE-check.

## What was checked and found clean

- **Injection (A03)** — no SQL, no shell interpolation, no `eval`/`new Function`. The one `execFileSync` addition path (`rightsize-gate` via `runRightsize`) passes an argv array, never a shell string.
- **ReDoS** — the two new regexes in `roadmap/parse.mjs:28-29` are anchored, use bounded character classes, and contain no nested quantifiers. Linear time.
- **Secrets** — no tokens, keys, or `.env` reads introduced. `env_guard` untouched.
- **Crypto / AuthN / AuthZ** — none of the changed code performs any. No consent-path writes were added; the four consent guards are untouched.
- **The new exit-code affordance** (`lib/argv.mjs:126-135`) — `result.exitCode ?? EXIT_OK` reads a value the handler itself produced, not caller input. It cannot be influenced by argv, and `exitCode` is not emitted into the JSON body. No new trust boundary.
- **`--slug`** on `spec/cli.mjs review` — guarded by `assertSafeSlug`, verified rejecting `../etc/passwd` with exit 1.
- **`--needle`** on `query` — never reaches a path constructor; `resolveConcept`/`resolveTouchedPath` do equality and glob matching against in-memory records.
- **`--epic` / `--status` / `--mode`** — all validated against closed sets, rejecting with a named `UsageError`.
- **T5 `state` verb** — reads two fixed relative paths under `ctx.root`; adds no caller-controlled path segment.

## Out of scope / Noted

- **Correctness defect, not security — `query --kind by_concept` reports "(no entries)" while resolving 18.** `resolveLookup` returns an **array** for `by_constraint`, `by_element` and the default glob branch, but an **object** `{concepts, elements}` for `by_concept` and `by_path`. `memory-index/cli.mjs:76` does `entries.length ? … : '(no entries)'`, and an object has no `.length`, so the human-readable path prints "(no entries)" while `--json` emits a differently-shaped `entries` field. Verified: `--kind by_concept --needle memory-model` resolves 1 concept and 18 elements yet prints "(no entries)". This weakens AC-009 for two of the four kinds and gives the future GUI a polymorphic contract. Recommend a follow-up ticket; it is a behaviour fix, not a cleanup.
- `swarm.exempt_path_prefixes` contains `.claude/`, so `swarm_boundary_guard` enforced write-set discipline on almost none of this batch. Already recorded in the swarm plan's `plan_notes`; belongs in the backlog, not here.

