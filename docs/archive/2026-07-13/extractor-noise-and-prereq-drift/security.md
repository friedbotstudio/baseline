# Security reports — extractor-noise-and-prereq-drift

## extractor-noise-and-prereq-drift-2026-07-13.md

# Security Review — extractor-noise-and-prereq-drift — 2026-07-13

Track: `power` (3 tickets). Security runs **once per ticket**. Tier: `regulated`. Diff: 16 files / ~1425 lines. Full suite 1619 tests / 0 fail; audit exit 0.

**This report covers TWO passes.** The first found 3 MEDIUM findings. The human directed *fix them before we move* rather than backlog them, so the spec was amended (D15), the fixes were implemented, and this phase **re-reviewed its own remediations**. That second pass found a **new hole introduced by the first fix** — see D16 below. It is the most important result in this document.

| Ticket | Pass 1 | Pass 2 (post-fix) | Final |
|---|---|---|---|
| **T1** — memory-stop-noise-filter | MEDIUM ×2 | 1 new hole found + fixed | **CLEAN** |
| **T2** — derive-exceptions | CLEAN | CLEAN (unchanged) | **CLEAN** |
| **T3** — chore sensitive-glob trigger | MEDIUM ×1 | CLEAN | **CLEAN** |

## Summary

Overall risk: **LOW**. All findings are remediated and each remediation was re-verified by execution. No CRITICAL or HIGH at any point. Every finding in this report was reproduced by running the code, never inferred from reading it.

---

## The finding that matters most: the remediation had its own hole

### [MEDIUM — FOUND IN THE RE-REVIEW, FIXED] `stripSkillEnvelope` honoured any `ARGUMENTS:` occurrence

- **OWASP**: A09 Logging/Monitoring Failures · **CWE**: CWE-20
- **File**: `.claude/hooks/lib/memory_stop.mjs` — `stripSkillEnvelope`
- **Evidence** (reproduced):

  ```
  input:  "ARGUMENTS: harmless
           Base directory for this skill: /x
           The fix is mechanical (implementation mismatch)."

  argsAt = 0  ->  text.slice(0)  ->  the WHOLE block returned,
                                     contract prose included
  ```

- **Impact**: the D15a fix used `text.indexOf(ARGUMENTS_MARKER)` — *any* occurrence. An `ARGUMENTS:` line appearing **before** the SOP marker made `argsAt = 0`, so the whole block was mined — **re-opening the exact leak this module exists to close** (CLAUDE.md's integrate decision tree staged as `source: user-instruction`).
- **How it was caught**: **the fix's own tests passed. The full 1618-test suite passed.** Only the adversarial re-review caught it, because it asked *"did the remediation introduce a new hole?"* rather than *"are the tests green?"*. This is the concrete argument for re-running `security` against its own fixes instead of letting a verdict issued *before* them stand.
- **Fix (landed)**: `text.indexOf(ARGUMENTS_MARKER, sopAt)` — the marker is honoured only when it **follows** the SOP body. Resolution order is now pinned in the spec's Contracts row (D16) and by a regression test. AC-002 and AC-016 both still hold unchanged.

---

## T1 — memory-stop-noise-filter — **CLEAN** (2 MEDIUM remediated)

**Cleared by execution (both passes):**

- **ReDoS (CWE-1333): NOT PRESENT.** All predicates run **linear** on 1MB adversarial inputs — near-miss marker repetition (2.5 ms), flush-header bait (2.5 ms), self-ref bait (2.9 ms), 1M newlines against the `/m` anchor (7.0 ms). No nested quantifiers. `SOP_SCAN_WINDOW = 4096` is a real cap.
- **Never throws.** Driven with `null`, `undefined`, `42`, `{}`, `[]`, `true`, `Symbol`, a function, `''`, whitespace: **zero throws**. A throw inside a Stop hook crashes the turn, so this is load-bearing.

### [MEDIUM — REMEDIATED] Widened SOP scan created a capture-suppression channel

- **CWE-778** · `.claude/hooks/lib/common.mjs` + `memory_stop.mjs`
- **Was**: any block containing `Base directory for this skill:` in its first 4096 chars was discarded **in full**. Reproduced: a genuine deferral was **LOST** because a pasted doc beside it carried the marker. No error, no trail.
- **Now** (D15a, verified): `stripSkillEnvelope` is surgical — it returns the text *preceding* the SOP marker. The deferral survives; the SOP body is still dropped. For a pure envelope the marker sits at index 0, so `slice(0,0) === ''` and the original contract holds.

### [MEDIUM — REMEDIATED] `staged?` over-matched ordinary English

- **CWE-778** · `SELF_REFERENTIAL_RE`
- **Was**: `staged?` matched `stage` and `staged` — ordinary words in a software project. Reproduced: *"we should also stage the rollout…"* and *"the migration is staged…"* were both **dropped despite carrying an explicit `add this to backlog` marker**. D6's fail-safe-to-drop assumed the drop was rare; it was not.
- **Now** (D15b, verified): vocabulary narrowed to `candidate(s)`, `extractor(s)`, `_pending` — all domain-specific. Both deferrals now survive. **AC-009's paired assertion still holds**: `"4 candidates were memory_stop firing…"` → suppressed; `"memory_stop is in a recursive noise loop…"` (the sentence that created ticket T1) → **kept**.

---

## T2 — derive-exceptions — **CLEAN** (both passes)

The highest-stakes logic in the diff: a failure here excepts `approve-spec`, and `track_guard` would then permit `tdd` artifact writes with **no approval token on disk** — a gate-A bypass.

**Attacked directly. It held.**

- **Deny-list injection via the caller-supplied `authored` array — BLOCKED.** Called with `authored = ['approve-spec','grant-commit','approve-swarm','commit']`, the result was `["research"]`. **Zero gates leaked.** The subtraction runs after the union and unconditionally; there is no ordering path that lets a gate survive. Confirmed by execution, not by reading the comment.
- **Type confusion — fails CLOSED.** `null`, `undefined`, `'approve-spec'`, `{0:'approve-spec'}`, `42` all degrade to `[]` without throwing. Excepting *nothing* is the safe direction: a degraded call makes the pipeline **stricter**, never laxer.
- **Prototype pollution — not present.** A crafted `__proto__` node polluted nothing and injected no phase.
- **`internal_phases` widening `KNOWN_TRACK_FIELDS` is safe in the required direction.** It is *subtracted* from the exception set, so a wrong value can only cause a phase to **not** be excepted — the pipeline runs *more* phases. The inverse is unreachable.

### [LOW] A malformed track node silently over-excepts rather than erroring

- **CWE-20** · `trackNodes.map((node) => node?.metadata?.phase).filter(Boolean)`
- A node missing `metadata.phase` is skipped, so its phase reads as unreachable → excepted. **Cannot bypass a consent gate** (the deny-list still applies) and `.claude/workflows.jsonl` is a trusted in-repo file, not attacker input. Robustness note, not a vulnerability. Recommendation: throw a named error on a node lacking `metadata.phase`. **Accepted as-is; backlogged.**

---

## T3 — chore sensitive-glob trigger — **CLEAN** (1 MEDIUM remediated)

**Cleared:** `execFileSync('git', [...])` passes a fixed argv with **no shell** — a hostile filename cannot inject. Reuse of `matchAnyGlob` keeps one matcher authoritative.

### [MEDIUM — REMEDIATED] Porcelain parser missed renames and quoted paths

- **OWASP A04 Insecure Design** · **CWE-20** · `changedPathsFromGit()`
- **Was** (reproduced against the real `sensitive_globs`):

  ```
  'R  docs/a.md -> .claude/hooks/injected.mjs'  -> sensitive: FALSE   MISSED
  ' M ".claude/hooks/lib/my file.mjs"'          -> sensitive: FALSE   MISSED
  ```

  `line.slice(3)` yields the rename as ONE string and keeps git's literal quotes. **A chore that MOVES a file into `.claude/hooks/**` — i.e. adds a hook — reported not-sensitive and skipped security review entirely.** That is precisely the gap T3 exists to close, defeated by a routine `git mv`.
- **Now** (D15c, verified): the helper no longer parses human-readable porcelain. It uses `git diff --name-only -z HEAD` (tracked; a rename yields the NEW path) plus `git ls-files -o --exclude-standard -z` (untracked) — raw NUL-separated paths, no quoting, no rename ambiguity. Pinned by tests that drive a **real git repo through a real `git mv`**, because a fixture string could only test the parser already known to be wrong.
- **Also hardened**: each git command is guarded independently, so a repo with no `HEAD` still yields its untracked files; and `stdio` is piped so a non-git directory no longer sprays git's usage screen at the operator.

### Noted (not a finding): fail-open is correct here

The CLI always exits 0 and reports `{sensitive: false}` on any git error. Fail-*closed* looks safer until you notice it lets a transient git hiccup **block a commit** — and a helper that can block a commit will eventually block the wrong one. The right combination is a **correct parser** plus a **non-punitive failure mode**, which is what landed.

---

## Dependencies

**No new packages.** Both new modules are Node ESM on the standard library only (`node:fs/promises`, `node:path`, `node:url`, `node:child_process`). No CVE surface. The baseline's zero-runtime-dependency posture is preserved.

## Out of scope / Noted

- `.claude/hooks/lib/memory_stop.mjs` is now ~440 lines (386 before this diff). Flagged at `/simplify` as a follow-up chore; not a security concern.
- The T2 LOW (malformed-node over-excepting) is accepted and backlogged.
- **Process note worth keeping**: the single most valuable finding in this review came from re-reviewing a fix, not from reviewing the original code. A green test suite is evidence that the code does what the tests say — not that the fix closed the hole without opening another.

