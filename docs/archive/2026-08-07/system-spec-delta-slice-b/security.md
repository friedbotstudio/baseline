# Security reports — system-spec-delta-slice-b

## system-spec-delta-slice-b-2026-08-07.md

# Security Review — main (system-spec-delta-slice-b) — 2026-08-07

## Summary

Overall risk: **MEDIUM**. The slice adds one filesystem writer, one Foundation write primitive, and one read-only report over the `docs/system/` corpus. No secrets, no network, no auth surface, no new dependency. Two MEDIUM findings, both in code this slice introduces: a demonstrated argument-injection through the shard `label`, and a report whose blanket `catch` makes a failed run indistinguishable from a clean corpus. One LOW: the new write primitive lacks the traversal guard its read-side sibling already carries.

What was checked: every line of the branch diff (89 changed lines across 10 tracked files, plus 3 new files); the tainted-input paths into `writeDiagramShard` (`elementId`, `kind`, `label`, `witnessTest`, `specDir`, `rootDir`); the path construction in `writeWorkspaceFile`; the error and flag paths in `runReconcile`; `npm audit` for both production and dev trees; and a grep of the diff for hardcoded credentials.

## Disposition

All three findings were routed back through the TDD path in the same workflow rather than deferred; two red tests were written first (`test_when_label_or_kind_carries_a_quote_then_rejected`, `test_when_write_workspace_file_gets_a_traversal_then_rejected`) and drove the fixes.

| # | Finding | Disposition |
|---|---|---|
| 1 | `label` quote injection | **Fixed** — `quotedArgument` guard in `shards.mjs`; reproduction now throws |
| 2 | `runReconcile` ambiguity | **Partially fixed** — stderr trace added; the return-shape discriminator needs AC-008 amended and is scoped to slice C |
| 3 | `writeWorkspaceFile` traversal | **Fixed** — `assertNoTraversal` on `kind` and `name` |

The findings below are recorded as they were found, before the fixes.

## Findings

### [MEDIUM] `label` escapes its quoted argument and forges extra C4 macro arguments

- **OWASP**: A08 — Software & Data Integrity Failures | **CWE**: CWE-1236 (improper neutralization of formula/argument delimiters)
- **File**: `.claude/skills/workspace/shards.mjs:64` (the `Component(...)` line in `shardText`)
- **Evidence**:

  ```
  lines.push(`Component(${section}, "${label}", "${kind}")`, '!endsub');
  ```

  `assertSafeFieldValue` rejects `\r` and `\n` only — a double quote passes. Reproduced against a tmpdir corpus:

  ```
  writeDiagramShard(specDir, 'probe-el',
    { kind: 'c4_component', label: 'ok", "FORGED_TECH", "FORGED_DESC', rootDir })

  → Component(probe_el, "ok", "FORGED_TECH", "FORGED_DESC", "c4_component")
  ```

  Three arguments became five. The declared technology and description are now attacker-chosen, and the real `kind` has been pushed into a positional slot the C4 macro does not read.

- **Impact**: a shard is a durable, citable corpus artifact — `witness.bindingFor` decides whether an element may be cited as evidence off it. A caller that passes through an unreviewed label (slice D's 112-shard backfill reads labels out of existing shard bodies) writes a diagram that misstates what a component is and what technology it uses. The blast radius is the integrity of a generated document, not code execution: the `' @kind` reader regex is `[A-Za-z0-9_-]+`, so a forged kind fails to parse on read-back and degrades to `witness: none` rather than fabricating a binding. That containment is why this is MEDIUM and not HIGH.
- **Recommendation**: reject the delimiter at the same boundary that already rejects newlines, in the same REJECT-never-normalize register. Add a shard-local guard rather than widening `assertSafeFieldValue` (whose other callers are frontmatter fields, where a quote is legitimate):

  ```js
  function quotedArgument(name, value) {
    if (String(value).includes('"')) {
      throw new Error(`unsafe field ${name} (REJECT, never normalize): a quote escapes the C4 argument`);
    }
    return assertSafeFieldValue(name, value);
  }
  ```

  Apply to `label` and `kind`. Escaping is the wrong fix here: PlantUML has no portable escape for a quote inside a C4 macro argument, so a normalized value would silently render as something other than what the caller named.

### [MEDIUM] `runReconcile` cannot distinguish a clean corpus from a failed read

- **OWASP**: A04 — Insecure Design | **CWE**: CWE-390 (detection of error condition without action)
- **File**: `.claude/skills/system-reconcile/reconcile-report.mjs:69`
- **Evidence**:

  ```js
  try {
    return collect(specDir, rootDir);
  } catch {
    return emptyReport();
  }
  ```

- **Impact**: seven empty arrays are returned for three different states — the corpus is genuinely healthy, the architecture-map flag is off, or `collect` threw. An operator reading `/archive` Step 5.5's report, or a future automated consumer, reads "all clean" in every case. This is the failure mode the repository already carries a landmine for (`a-check-that-measured-nothing-reports-success`), and it contradicts the slice's own governing rule in the spec's Contracts section: *"every new function distinguishes 'you passed me nothing' from 'nothing matched'. No new function may return one shape for both."* `runReconcile` returns one shape for three.
- **Recommendation**: keep the never-throw contract and add a discriminator — `{ ...checks, reportable: boolean, reason: string|null }`, with `reason` one of `flag-off` / `unreadable` / `null`. This changes the return shape AC-008 fixes at seven arrays, so it needs the spec amended alongside; route it through slice C rather than patching it here. Until then the catch should at minimum write the swallowed error to stderr so a failed run leaves a trace.

### [LOW] The new write primitive omits the traversal guard its read sibling enforces

- **OWASP**: A01 — Broken Access Control | **CWE**: CWE-22
- **File**: `.claude/skills/workspace/store.mjs:47` (`writeWorkspaceFile`)
- **Evidence**:

  ```js
  export function writeWorkspaceFile(specDir, kind, name, text) {
    const dir = join(specDir, kind);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, name);
    writeFileSync(path, text, 'utf8');
  ```

  Its read-side counterpart in the same module family, `tree.readSourceText`, opens with `assertNoTraversal(rel)`. The write path validates neither `kind` nor `name`.

- **Impact**: no reachable exploit today. The only caller is `writeDiagramShard`, which passes the `SHARD_DIR` constant for `kind` and an `assertSafeSlug`-validated id for `name`, so every argument is already bounded before it arrives. The finding is the asymmetry, not a live hole: this is a generic Foundation primitive whose name invites a second caller, and the next one to pass a computed `kind` gets `mkdirSync -r` on an escaped path. `writeRecord` in the same file shares the gap, which is why this is reported rather than treated as a regression.
- **Recommendation**: one line at the top — `assertNoTraversal(kind); assertNoTraversal(name);` — reusing the guard the module already re-exports. Costs nothing at the current call site and closes the class before it has a second caller.

## Dependencies

No package added, removed, or upgraded by this diff. `writeDiagramShard` and `reconcile-report.mjs` are zero-dependency ESM on Node builtins.

- `npm audit --omit=dev` → **0 vulnerabilities**. The shipped surface is clean.
- `npm audit` (including dev) → 17 (1 critical, 8 high, 8 moderate), entirely in the build/site toolchain. Pre-existing, untouched by this slice, and outside the consumer install. Noted below rather than treated as a finding of this review.

## Out of scope / Noted

- **Dev-tree advisories.** The 17 dev-only advisories above deserve their own chore workflow. They do not reach a consumer: the published package ships `.claude/` and `obj/template/`, and `npm audit --omit=dev` is clean.
- **`specDir` and `rootDir` are trusted inputs** across the whole `workspace/` module family — `readShard`, `classify`, `findGaps` and now `writeDiagramShard` all treat them as caller-controlled roots and validate only the relative part beneath them. That posture is consistent and predates this slice; it is worth stating explicitly in the module docblock so a future caller does not mistake the per-argument guards for whole-path validation.
- **The flag gate is the outermost check** in both new entry points, so an opted-out project performs no read, no write, and no `stat` under `docs/system/`. Verified by construction and by the AC-013 tests for both the `false` and absent spellings.
- **`elementId` after `assertSafeSlug`** is `[a-z0-9][a-z0-9-]*` bounded to 200 chars, so `sectionFromElementId` can only produce `[a-z0-9][a-z0-9_]*`. The section name cannot carry a PlantUML metacharacter, and the `!startsub` line is not injectable.

