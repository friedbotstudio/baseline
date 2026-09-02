# Security reports — gate-fidelity

## gate-fidelity-2026-09-02.md

# Security Review — gate-fidelity — 2026-09-02

## Summary

Overall risk: **LOW**. Both findings were fixed in this cycle rather than deferred, following the operator's D5 precedent for `closure-check.mjs`: the mechanism must not ship with a known-inert guard behind it. The diff's headline change is a commit-path fix that removes an accidental authorization bypass, and it holds under every forgery attempt tried. Two findings, both in the new `slice-grammar.mjs` module and both about the same guard: `assertInertSliceId` is exported, documented and tested but **called by nothing in production**, and its character set does not cover the one character that matters at its documented interpolation sites. Neither is a regression — the guard is new in this diff, so the diff adds incomplete protection rather than removing any.

Everything checked is enumerated below, including what came back clean.

## Findings

### [MEDIUM] The CWE-74 slice-id guard has no production call site

- **Resolved**: wired at `pinned-spec.mjs → splitPin`, the one place a slice id enters the system, so every downstream consumer inherits it. Pinned by `tests/slice-grammar.test.mjs → test_when_a_crafted_slice_id_is_pinned_then_resolving_the_spec_refuses`.

- **OWASP**: A04 Insecure Design | **CWE**: CWE-74
- **File**: `.claude/skills/lib/slice-grammar.mjs:73-83` (definition); no caller outside `tests/slice-grammar.test.mjs`
- **Evidence**:
  ```
  $ grep -rn "assertInertSliceId" .claude src tests --include='*.mjs' | grep -v slice-grammar.mjs:
  tests/slice-grammar.test.mjs:21,132,140,149,154,155      # tests only
  ```
  The module's own docstring states the guard exists to "reject a slice id that would forge spec structure once interpolated into a heading or an error message". The two interpolation sites do not call it:
  ```
  .claude/skills/tdd/drift_check.mjs:183
    'section-missing': ({ sliceId }) => `no \`## Slice ${sliceId}\` heading resolves in the spec`,
  .claude/skills/tdd/drift_check.mjs:184
    'acs-missing':     ({ sliceId }) => `the \`## Slice ${sliceId}\` section carries no AC list`,
  ```
- **Impact**: The guard protects nothing it was written to protect. A guard that is exported, tested and never invoked reports clean by construction — it is the vacuous-green shape this workflow exists to close, reproduced inside the workflow's own new module. The precedent it copies (`epic-heading.mjs → assertInert`, security review 2026-08-15, MEDIUM CWE-74) is wired at its writer; this one is not.
- **Recommendation**: Call `assertInertSliceId(sliceId, 'sliceId')` in `pinned-spec.mjs → resolveSpecPath` where `splitPin` produces the id, so every downstream consumer inherits the guard at the one place the value enters the system. Wiring it at `drift_check.mjs` instead would repeat the per-call-site pattern the landmine `security-fixes-are-per-call-site-and-new-modules-inherit-none` records.

### [LOW] The guard's rejected set omits the backtick, which is the character its message use turns on

- **Resolved**: the backtick joins the rejected set. Measured after the fix — a pinned id containing one is refused at `resolveSpecPath`, and `#` and a newline are shown to be unreachable through that path (`splitPin` consumes at the first `#`; `PIN_FRAGMENT_RE` cannot match across a newline), with both still rejected for other callers.

- **OWASP**: A04 Insecure Design | **CWE**: CWE-74
- **File**: `.claude/skills/lib/slice-grammar.mjs:79-82`
- **Evidence**:
  ```
  if (/[\r\n]/.test(text)) throw new Error(`slice-grammar: ${field} must not contain a newline`);
  if (text.includes('#'))  throw new Error(`slice-grammar: ${field} must not contain a heading marker`);
  ```
  Measured — a backtick, `$&` and `|` are all accepted. Rendered through `drift_check.mjs:183`:
  ```
  benign : no `## Slice B1` heading resolves in the spec
  crafted: no `## Slice B1` — **CLEAN**, nothing to see `x` heading resolves in the spec
  ```
- **Impact**: A crafted slice id closes the message's code span and continues in running markdown, so a drift report can be made to display text its generator never wrote — including text that reads as a clean verdict. The value originates in `workflow.json → pinned_artifacts.spec`'s `#slice-<id>` fragment, which is written by `/triage`'s epic-child materialization, so it is operator- and Claude-controlled rather than externally reachable. That is what caps this at LOW; the integrity property it breaks is real.
- **Recommendation**: Add the backtick to the rejected set. The newline and `#` cover the RegExp-interpolation half of the docstring's claim; the backtick covers the error-message half, which is currently unguarded. Keep the guard a **rejecter** — do not strip or escape the character, since a repaired id would silently name a different slice.

## What was checked and came back clean

**`.claude/hooks/lib/closure-check.mjs` — the commit-path authorization decision.** `hasClosureStamp` now parses the frontmatter block instead of matching the whole file. Eight forgery attempts, executed:

| input | stamped? | reading |
|---|---|---|
| body quotes the two stamp lines (the original defect) | no | fixed |
| body embeds a whole second `---` block | no | only the leading block is read |
| stamp inside a fenced code block | no | |
| CRLF forged body | no | |
| leading whitespace before the opener | no | the opener must be at position 0 |
| genuinely stamped frontmatter | yes | correct |
| `key:value` with no space in real frontmatter | yes | the intended widening |
| file OPENS with the stamp, real block second | yes | **not a forgery** — see below |

The last row is not an escalation. Whoever can write the file owns its first `---` block and could always have written `status: picked-up` into it directly; the reader has never asserted more than "the file's author said so". The pre-fix defect was different in kind — an entry that *legitimately discussed* the stamp in prose satisfied the guard by accident, with no intent required. That path is closed. `frontmatterKey` was changed in the same file for the same reason and behaves identically.

**`.claude/hooks/lib/frontmatter-parser.mjs` — the two widenings.** The parser reads only the preamble between the leading `---` and the next `---`; no body line can become a key under either widening, confirmed by the table above. The bare-`:` separator changes which *preamble* lines parse, and the preamble was already wholly author-controlled, so no consumer receives a key from a source it did not previously trust. `Time: 12:30` and `see: https://x` still split at the first colon, as they did under `': '`. 421 live entries parse unchanged — a compatibility result, recorded here as such and not as a security one.

**`.claude/skills/lib/slice-grammar.mjs` — injection and ReDoS.** The metacharacter escape is complete: `.*`, `(a+)+$`, `B1|B2`, `[`, `\`, `$&` and `(?:` each yield a clean non-match, none throws, none alters the pattern's meaning. No catastrophic backtracking — against a 64 KB pathological document (`## Slice ` + 200 chars, 4000 `#`, 60 KB tail) every entry point returns in under 1 ms:

```
sliceSection(evil, huge-id)  0.79 ms      sliceIds(evil)            0.14 ms
sliceSection(evil, missing)  0.24 ms      sliceAcIds(60k, no label) 0.14 ms
sliceAcIds(label + 40k ids)  0.60 ms
```

The lazy `[\s\S]*?` body capture is bounded by a `(?=^##\s|$(?![\s\S]))` lookahead with no nested quantifier, which is why the quadratic shape the landmine `global-word-run-with-required-suffix-regex-is-quadratic-redos` describes does not arise. `sliceIds()` builds a fresh global regex per call, so no `lastIndex` state crosses a call site (landmine `a-global-regex-with-test-fails-open-on-alternate-calls`), and repeated calls return identical results — measured.

**`.claude/skills/lib/output.mjs` — the synchronous sink.** `writeFileSync(1, text)` writes to the process's own stdout descriptor; fd 1 is fixed at spawn and nothing in the diff reopens or dups it, so the write cannot be redirected by anything the caller controls. EPIPE behaviour is unchanged: a 800 KB synchronous write into a closed pipe (`| head -1`) exits 0, matching the stream path. The change fixes a real integrity defect — a >64 KiB write to a pipe was being truncated mid-string before `process.exit`, so a reader received valid-looking JSON that had been silently cut.

**`.claude/skills/conformance/**` — the new engine.** `loadFixture` joins a caller-supplied `fixtureDir` with three fixed filenames and calls `JSON.parse(readFileSync(...))`. A traversal argument does not escape into anything sensitive — it resolves to a path that does not exist and raises ENOENT (`../../../etc`, `/etc` both tested). Both shipped callers pass a constant. The export is public and unvalidated, which is worth naming: it reads a path a caller names, and it is the caller's job not to name a hostile one. That is the same contract every `readFileSync` wrapper in this repo carries, and adding `assertSafeSlug` here would guard a value that is not a slug. `readerResult` catches a throwing reader and carries `err.message` into the result; the audit caller clips it through `terminal-text.clipInline`, which neutralises C0/C1 control sequences (the residual lone-surrogate and bidi gaps are already recorded in `clip-neutralises-c0-c1-only-bidi-survives-4f21` and `clip-truncation-can-emit-a-lone-surrogate-9d38`, both unchanged by this diff).

**`.claude/skills/triage/retriage.mjs` — reject, never repair.** `assertAcIdShape` throws on a non-conforming `acs` array and the write does not proceed; nothing normalizes the value into a different shape. Verified that no epic state file is written when the assertion fires.

## Dependencies

None. This diff adds no third-party package — `node:fs`, `node:path`, `node:os`, `node:url` and `node:test` only, all already in use. No `package.json` change, so no CVE surface is introduced.

## Out of scope / Noted

- `.claude/skills/conformance/fixtures/*.json` is attacker-editable by anyone who can already write `.claude/`, which is the same trust level as editing a hook. Its content reaches an error message and a terminal, both clipped. Not a boundary this diff creates.
- The two `drift_check.mjs` message templates at `:183-184` are pre-existing (0.26.6) and unchanged here; they are cited because they are where the LOW finding lands, not as new code.
- `tests/branch-aware-git-policy.test.mjs`, `tests/git-topology-guard.test.mjs` and `tests/unborn-branch-consent.test.mjs` each gained a missing hook dependency in their sandbox copy lists. Before the fix, the spawned guard died on `ERR_MODULE_NOT_FOUND` and its empty stdout was read as ALLOW — a fail-open that silently passed 20 deny assertions. The tests are fixed; the underlying pattern (a sandbox that lists its dependencies by hand, and a guard whose empty output means allow) is a standing hazard worth a follow-up, and each file now carries a comment saying so.

