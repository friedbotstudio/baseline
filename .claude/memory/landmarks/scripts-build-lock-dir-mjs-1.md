---
key: scripts/build-lock-dir.mjs:1
category: landmarks
scope: [scout]
verified-at: 0e5cc8f
last-touched: 2026-07-09
---

- Role: Foundation helper that derives the build-mutex lock dir for `scripts/build-template.sh`. Takes `argv[2]` = build target dir, prints `${TMPDIR:-/tmp}/create-baseline-build.<sha256(target)[:16]>.lock.d`. Keying the mkdir-mutex on the TARGET (instead of the prior single global `create-baseline-build.lock.d`) lets isolated tmpdir builds (`tests/helpers/clone-and-build.mjs`) run concurrently while same-target builds (npm pack prepack + a live-tree build) still serialize, so the original `obj/template` rebuild race stays fixed. Measured: 3 concurrent isolated builds ~2s per-target vs ~8s global.
- Companion: `scripts/build-template.sh:29` (the LOCK_DIR call site), `tests/build-lock-dir.test.mjs` (4 property tests: distinct→distinct, same→stable, under-TMPDIR/.lock.d, live-target-stable), `docs/testing.md` ("The build lock is keyed per target"). Cross-ref landmine `live-objtemplate-rebuild-races-parallel-test-readers`.
