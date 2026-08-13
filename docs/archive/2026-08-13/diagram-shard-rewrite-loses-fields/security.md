# Security reports — diagram-shard-rewrite-loses-fields

## diagram-shard-rewrite-loses-fields-2026-08-12.md

# Security Review — main (diagram-shard-rewrite-loses-fields) — 2026-08-12

## Summary

Overall risk: **MEDIUM**. One MEDIUM finding: the repair path interpolates the C4 macro's *section* argument straight from the on-disk shard it is repairing, bypassing the `quotedArgument` guard that every other argument passes through — so a corrupted shard propagates its corruption into a file the repair reports as successfully restored. Two LOW findings (symlink-following write, an unhandled `EISDIR` that contradicts the module's stated never-throws contract). The three attack surfaces the reviewer flagged as most likely — git argv injection, PlantUML directive injection, and `$&` expansion in the replacement — were each tested and are **not** exploitable.

Reviewed: `.claude/skills/workspace/restore-degraded-shards.mjs` (new, 122 lines), `.claude/skills/workspace/shards.mjs`, `.claude/skills/tdd/drift_check.mjs`, and the five touched test files. 20 restored `.puml` files are recovered data and were not reviewed as logic.

## Findings

### [MEDIUM] The repair trusts the section argument of the shard it is repairing

- **OWASP**: A08 — Software and Data Integrity Failures | **CWE**: CWE-20 (Improper Input Validation)
- **File**: `.claude/skills/workspace/restore-degraded-shards.mjs:90-93`, sink at `.claude/skills/workspace/shards.mjs:75`

- **Evidence**:
  ```js
  // restore-degraded-shards.mjs
  const m = THREE_ARG.exec(text);                    // m[1] is the section, read from disk
  line = renderComponentLine(m[1], { label: record.anchor, technology: m[3], description: record.title });

  // shards.mjs — the section is the ONE argument that skips quotedArgument
  export function renderComponentLine(section, { label, technology, description }) {
    const args = [section, `"${quotedArgument('label', label)}"`, `"${quotedArgument('technology', technology)}"`];
  ```

- **Impact**: `THREE_ARG` captures the section as `([^,]+)` — any run of non-comma characters, including `"` and `)`. A shard whose Component line reads

  ```
  Component(x") junk(, "foo", "c4_component")
  ```

  still matches the degraded fingerprint (label equals the element id, techn equals the kind), so it is accepted as a repair candidate. The repair then writes `Component(x") junk(, "<anchor>", "c4_component", "<title>")` and reports the file under `recordRestored` — a success verdict on a file it just made worse. Rendering that shard crashes the PlantUML preprocessor (verified: `plantuml -checkonly` exits 200 on a section containing `") x(`).

  The blast radius is integrity of the repair report plus availability of the composed view, not code execution — newlines cannot reach here (see the Verified-safe section), so no PlantUML directive can be forged.

  Every other argument on this path is guarded. The section is the single unguarded one, and it is the only value read from the untrusted artifact rather than from the element record.

- **Recommendation**: Do not read the section from the file being repaired. The element id is already known at the call site and the id↔section mapping is canonical (`sectionFromElementId`, the inverse of the already-exported `elementIdFromSection`). Export it and derive the section, so the repair's output shape does not depend on the corruption it is repairing. `renderComponentLine` should additionally assert its section matches `[A-Za-z0-9_]+`, since it is a public export and the guard belongs at the sink.

  **Cheap — fix in this workflow.** Two lines plus a scenario.

### [LOW] The restore write follows a symlink

- **OWASP**: A01 — Broken Access Control | **CWE**: CWE-59 (Link Following)
- **File**: `.claude/skills/workspace/restore-degraded-shards.mjs:117`

- **Evidence**:
  ```js
  if (!dryRun) writeFileSync(join(rootDir, shard.path), content, 'utf8');
  ```

- **Impact**: `shard.path` is built from a `readdirSync` entry name, which can never contain a separator or `..`, so path traversal by name is not achievable. A **symlink** named `<id>.puml` in `docs/system/diagrams/` is a different matter: `readFileSync` follows it to classify the target as degraded, and `writeFileSync` follows it again to write. An attacker who can create that symlink can redirect a Component line into the target file.

  Exploitability is low because the target must already contain a line matching the degraded fingerprint for the file to become a candidate — an attacker who controls the target's contents that precisely already owns it. Posture is also unchanged from `store.writeWorkspaceFile`, which guards segments but does not `lstat`.

- **Recommendation**: `lstatSync(path).isSymbolicLink()` → report the file as unrestorable rather than writing through it. A repair that declines to follow a link is strictly correct here: no legitimate shard is a symlink.

### [LOW] An `EISDIR` breaks the documented never-throws contract

- **OWASP**: A04 — Insecure Design | **CWE**: CWE-703 (Improper Check for Exceptional Conditions)
- **File**: `.claude/skills/workspace/restore-degraded-shards.mjs:70`

- **Evidence**:
  ```js
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.puml')) continue;
    const text = readFileSync(join(dir, name), 'utf8');   // throws EISDIR on a directory
  ```

- **Impact**: A directory named `anything.puml` under `docs/system/diagrams/` makes the whole repair throw. The spec's Contracts table states `restoreDegradedShards` "never throws; a git failure degrades to the record path", so this is a contract violation as well as a robustness gap. Availability only, and it needs local write access to the corpus.

- **Recommendation**: Wrap the read (or `statSync(...).isFile()` first, matching `tree.readSourceText`'s existing shape) and skip a non-file entry.

## Verified safe — tested, not assumed

Each of these was flagged as a likely vector and each was probed directly.

| Surface | Test | Result |
|---|---|---|
| `git show <sha>:<path>` with a colon in the filename | `git show <sha>:docs/system/diagrams/we:ird.puml` | git splits at the **first** colon; the remainder including further colons is the path. Not a revision-injection vector. |
| An option-shaped filename | `git show <sha>:--upload-pack=x.puml` | Parsed as a path — the `<sha>:` prefix means it can never lead the argv. `git log` uses an explicit `--` separator. `execFileSync` spawns without a shell, so no word-splitting. |
| `!include` inside a quoted C4 argument | `Component(a, "lbl", "techn", "x !include /etc/passwd")` | exit 0, no include performed. The preprocessor does not evaluate directives inside a quoted argument. |
| `)` inside a quoted C4 argument | `Component(a, "lbl", "techn", "des) cr")` | exit 0. A close-paren does not terminate the macro. |
| `$&` / `$1` expansion in the restore | `text.replace(THREE_ARG, () => line)` | Function replacements receive the match as arguments and return the string verbatim; no `$`-sequence substitution occurs. Complete, and the why-comment is accurate. |
| Newline injection from an element record | `parseEntry` assigns `raw.trim()` per frontmatter **line** | A newline cannot survive frontmatter parsing, and `assertSafeFieldValue` rejects one anyway. This is what closes the 2026-08-05 `render.composeView` class of finding on this path. |
| Truncating read smuggling a quote past the guard | `COMPONENT_ARGS` description group is greedy to the final `")` | A stray quote returns **intact** and `quotedArgument` rejects it. A non-greedy group would have truncated silently. Already covered by `test_when_a_preserved_field_contains_a_double_quote_then_the_write_is_rejected`. |

**Exporting `renderComponentLine` improves posture rather than weakening it.** The guards moved from the `writeDiagramShard` call site *into* the function, so the newly public entry point validates label, technology and description itself. Had the export happened without that move, it would have been an unguarded sink. The section argument (the MEDIUM above) is the one value the move did not cover.

**The `drift_check` widening is not a security regression.** `isExcludedDiffPath` matches with `startsWith` against prefixes that all end in `/`, so `docs/rca-notes/` does not match `docs/rca/` — no over-match. Paths reach it from `git ls-files --others` and from git pathspecs, both normalized, so `docs/../docs/rca/` cannot be constructed. The residual risk is process integrity, not security: implementation code placed under an excluded prefix would stop being scored. All seven added directories hold per-workflow prose, and the module now documents which `docs/` subtrees are deliberately still scored.

## Remediation — all three fixed in this workflow, 2026-08-12

| Finding | Fix | Regression test |
|---|---|---|
| MEDIUM — section trusted from the file under repair | `rebuiltFromRecord` derives the section via the newly-exported `sectionFromElementId(elementId)`; `renderComponentLine` now asserts `^[A-Za-z0-9_]+$` at the sink, since the export is public | `test_when_the_degraded_shard_carries_a_malformed_section_then_the_section_is_derived_from_the_id`, `test_when_the_section_is_not_a_bare_identifier_then_the_line_is_rejected` |
| LOW — write follows a symlink | `classifyEntry` lstats each entry; a link is reported `unrestorable` rather than followed | `test_when_a_shard_is_a_symlink_then_it_is_reported_unrestorable_and_the_target_is_untouched` |
| LOW — `EISDIR` breaks the never-throws contract | the same `classifyEntry` skips any non-file entry before it is read | `test_when_a_diagram_entry_is_a_directory_then_it_is_skipped_without_throwing` |

A symlink is **reported**, not silently skipped: a shard that cannot be repaired safely is exactly what `unrestorable` names. A directory is **skipped**, because it is not a damaged shard and belongs in no bucket.

Post-fix: `npm test` 2736 tests, 2720 pass, 0 fail. `npm run build` exit 0.

## Dependencies

No new packages. `package.json` and `package-lock.json` are unchanged in this diff; runtime `dependencies` remains `{"@clack/prompts":"1.4.0"}`. No CVE check required.

## Out of scope / Noted

- **A `Component(` inside a description crashes the renderer.** Verified: `Component(a, "lbl", "techn", "Component(evil, x, y)")` makes `plantuml -checkonly` exit 200 with a `NullPointerException`. This reaches the corpus through any element `title`, so it predates this diff and affects the existing writer equally. Availability only. Worth a `plantuml -checkonly` gate on written shards, as a separate ticket.
- **A corrupt shard now wedges rewrites of its own element.** With preservation in place, an on-disk description carrying a stray quote makes `writeDiagramShard` throw rather than fall back to defaults. This is deliberate (`REJECT, never normalize`) and asserted by an existing test; recorded so the behaviour is not later mistaken for a regression.
- **`rebuiltFromRecord`'s `catch {}` conflates two outcomes.** A record rejected as unsafe and a record that is simply absent both report as `unrestorable`. Nothing is hidden — the file is named in the report — but an operator cannot tell a missing record from a hostile one. A09-adjacent; a distinct report bucket would be clearer.

