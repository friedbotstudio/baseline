# Security reports — review-gate-input-measurement

## review-gate-input-measurement-2026-08-26.md

# Security Review — main — 2026-08-26

## Summary

Overall risk: **LOW**. The change widens what the code-review gate measures and corrects two
parsers that were dropping input. Every behavioural edit makes a control see more, not less:
the fan-out probe now lists files a change created, the swarm wave audit compares individual
files instead of a collapsed directory string, and the simplify oracle stops silently dropping
a flagged row whose path contains a pipe. One finding is a genuine defect I introduced in the
new test file. The other is a consequence worth recording rather than a live exposure.

This is the first review to use the corrected Method step 1, and the correction paid for itself
immediately: `tests/review-gate-input-measurement.test.mjs` is the largest single file in this
change, it is untracked, and `git diff` does not show it. Under the old instruction the file
below would not have been reviewed at all.

## Findings

### [LOW] Predictable temp path in the newline-support probe — RESOLVED 2026-08-26

- **OWASP**: A04 Insecure Design | **CWE**: CWE-377 (Insecure Temporary File)
- **File**: `tests/review-gate-input-measurement.test.mjs:56`
- **Evidence**:
  ```js
  function newlinePathsSupported() {
    try {
      const probe = join(tmpdir(), `nl-probe-${process.pid}\nx`);
      writeFileSync(probe, '');
      return true;
  ```
- **Impact**: The path is derived from the PID alone, so it is guessable. On a shared machine
  another user can pre-create a symlink at that name pointing at a file the test user may write;
  `writeFileSync(probe, '')` then truncates the target. The probe also never removes the file,
  so each run leaves litter behind.
- **Recommendation**: Use `mkdtempSync` for a directory with a random suffix, write the probe
  inside it, and remove the directory in a `finally`. The random component is what closes the
  pre-creation window; the cleanup is hygiene.
- **Resolution**: Applied on operator instruction, in this workflow, before the commit. The
  probe now writes inside a `mkdtempSync` directory and removes it in a `finally`. Verified by
  running the suite twice: the leftovers from the old probe were the only `nl-probe-*` entries
  in the temp directory, and a fresh run after clearing them leaves none behind.

### [LOW] A pipe in a flagged path now reaches the finding record

- **OWASP**: A03 Injection | **CWE**: CWE-116 (Improper Encoding or Escaping of Output)
- **File**: `.claude/skills/simplify/oracle.mjs:40`
- **Evidence**:
  ```js
  function splitOnVerdict(cells) {
    const at = cells.findIndex((cell, index) => index >= 1 && VERDICT.test(cell));
    if (at === -1) return null;
    return { file: cells.slice(0, at).join('|'), ... };
  ```
- **Impact**: Before this change a path containing a pipe was dropped, so no finding carried
  one. It now flows into `finding.file`, `finding.message`, and `artifact.file`, which are
  serialized to `.claude/state/checker-fanout-code/<slug>.json` and mirrored into the durable
  plan. Any consumer that renders that field into a markdown table would break its own row for
  the same reason the oracle used to — one layer downstream.
- **Recommendation**: None required now. I checked `checker-fanout.mjs` and
  `pre-implementation-gate.mjs` and neither renders a finding into a markdown table; the values
  are JSON-serialized, where a pipe is inert. `clip` already replaces control characters with a
  space, so an ANSI escape sequence in a path cannot reach a terminal. This is recorded so a
  future consumer that does render a table knows the field is not table-safe.

## Dependencies

No new packages. `package.json` is unchanged and this repo pins `dependencies` to empty. The
change uses `git` and the Node standard library only.

## Out of scope / Noted

**`--exclude-standard` is load-bearing for secrets, not just for noise.** The new created-file
probe is `git ls-files --others --exclude-standard`. Without that flag the probe would list
gitignored paths, and `hydrateChangedFile` reads every listed path's **contents** into
`ctx.changedFiles`, which flow into checker findings and are written to on-disk state. A
`.env` in an ignored path would be ingested and persisted. The flag is present and correct; it
is recorded here because it reads like a noise-reduction convenience and is not one.

**Content ingestion widened.** Files a change created are now read into memory alongside the
files it modified. A large untracked artifact that is not gitignored (a build output, a core
dump) is now read in full. `hydrateChangedFile` catches read errors but does not bound size.
The same unbounded read already applied to modified tracked files, so this widens an existing
exposure rather than opening a new one, and it is local-only. Not filed as a finding; a size
bound on `hydrateChangedFile` would be the fix if it ever matters.

**The `-uall` change strengthens the wave audit.** A wholly-new untracked directory previously
collapsed to one path string that failed the union comparison opaquely. Individual files are
now compared, so a stray write inside an otherwise-legitimate new directory is caught by name
instead of being hidden behind the directory that failed anyway.

**Two pre-existing test files were edited.** `tests/changedfiles-shape-contract.test.mjs` and
`tests/checker-fanout.test.mjs` had `exec` stubs returning newline-joined output, which modelled
a git command this module no longer runs. Only the stub's delimiter changed; every assertion is
byte-identical. Worth a reviewer's eye, since editing a test to make a change pass is the shape
of a real problem even when this instance is not one.

