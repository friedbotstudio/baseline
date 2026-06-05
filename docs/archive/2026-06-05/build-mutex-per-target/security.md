# Security reports — build-mutex-per-target

## build-mutex-per-target-2026-06-05.md

# Security Review — build-mutex-per-target — 2026-06-05

## Summary
Overall risk: **LOW**. The change adds a build-time helper (`scripts/build-lock-dir.mjs`) that derives a per-target mkdir-mutex lock path and rewires `scripts/build-template.sh` to use it. No network surface, no shipped-to-consumer code, no secrets, no new dependencies. The one theoretical concern (predictable lock-dir name → local lock squatting) is **pre-existing and unchanged** by this diff, and is bounded to a self-limiting DoS on a shared-`/tmp` multi-user host.

## Findings

### [LOW] Predictable build-lock dir name enables local lock-squatting DoS (pre-existing, not introduced)
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-377 (Insecure Temporary File)
- **File**: `scripts/build-lock-dir.mjs:24-26`
- **Evidence**:
  ```js
  const lockKey = createHash('sha256').update(target).digest('hex').slice(0, 16);
  const tmp = process.env.TMPDIR && process.env.TMPDIR.length ? process.env.TMPDIR.replace(/\/+$/, '') : '/tmp';
  process.stdout.write(`${tmp}/create-baseline-build.${lockKey}.lock.d\n`);
  ```
- **Impact**: The lock-dir name is deterministic from the target path. On a shared host where `TMPDIR` resolves to a world-writable `/tmp`, another local user could pre-create the lock dir; `mkdir` then fails for the build, which waits 300×0.2s and times out. This is a denial of the build only, on a multi-user machine, by an already-local actor.
- **Why not higher**: Identical to the prior code — the old global `${TMPDIR:-/tmp}/create-baseline-build.lock.d` was equally predictable and squattable. On the actual dev/CI targets `TMPDIR` is per-user (macOS `/var/folders/<uid>/…`, GitHub Actions ephemeral runner), so cross-user squatting isn't reachable. Per-target keying *reduces* blast radius (one target blocked, not all builds). No regression; flagged for completeness.
- **Recommendation**: None required. If shared-`/tmp` multi-user builds ever become a target, place the lock under a per-user/per-repo dir (e.g. `$PKG_ROOT/obj/.locks/`) instead of `TMPDIR`. Out of scope for this change.

## Dependencies
None added. `node:crypto` is a Node stdlib module (already a runtime dependency of the build).

## Checked and clear
- **A03 Injection**: `TEMPLATE_DIR` reaches the helper as a single quoted argv element (`node "$SCRIPT_DIR/build-lock-dir.mjs" "$TEMPLATE_DIR"`), not via a shell eval. Inside the helper it is only fed to `createHash().update()` (a string sink) — never to a shell, `exec`, or a path that is executed. Shell metacharacters in the path are inert.
- **Race-protection integrity**: same target dir → same hash → same lock (npm-pack prepack + a live-tree build still serialize); distinct targets (isolated tmpdirs) were never sharing a directory, so dropping their artificial co-serialization cannot reintroduce the original `obj/template` rebuild race. Confirmed by `tests/build-lock-dir.test.mjs`.
- **Hash usage**: sha256-truncated-to-64-bits is used as a non-cryptographic keying function, not a security primitive; truncation is irrelevant. Collision would only cause two targets to share a lock (minor over-serialization), not a security effect.
- **TMPDIR handling**: attacker-controlled `TMPDIR` only redirects the lock for the user already running the build; not a privilege boundary.
- **Secrets**: none in the diff.

## Out of scope / Noted
- `scripts/build-template.sh` is a `prepack` build script, run in the publishing/dev repo only; it is not delivered to consumer installs.

