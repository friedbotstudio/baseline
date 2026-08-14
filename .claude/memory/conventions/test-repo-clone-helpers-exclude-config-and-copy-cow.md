---
key: test-repo-clone-helpers-exclude-config-and-copy-cow
category: conventions
scope: [scenario, implement, tdd]
source: code-pattern
convention: A test that clones the working tree into a tmpdir (via `rsync` directly or `tests/helpers/clone-and-build.mjs → cloneAndBuild`) SHALL exclude `.config` alongside `node_modules`/`obj`/`.git`/`docs/archive`/`.playwright-mcp`. When a test makes many writable copies of one pristine built tree, copy them copy-on-write where the platform supports it: `cp -ac` (APFS clonefile) on macOS, `cp --reflink=auto` on Linux, with a plain `cp -a` fallback (`tests/skill-ownership.test.mjs → cowCopyTree`).
why: `.config` is Claude Code's own gitignored local state (memory, transcripts, file-history) and reaches a few hundred MB on a dev machine, so an unfiltered clone drags it into every `rsync` and every per-test copy though it is irrelevant to any build or audit. Excluding it took `skill-ownership.test.mjs` from ~40-50s to ~10s and the default suite median from ~90-285s to ~34s. The exclude is a no-op in CI / fresh checkouts (where `.config` lives under `$HOME`, not the repo), so it only ever helps. COW copies make per-consumer clones near-instant; mutating tests diverge correctly on first write.
applies-to: `tests/helpers/clone-and-build.mjs` and any test that rsync-clones the repo (skill-ownership, audit-baseline-post-amendment, upgrade-project, workflows-install-upgrade, manifest, build-lock-dir, …). Measurement discipline: single-shot suite timings are noise-dominated — profile per-test `duration_ms` and take a median across runs. Cross-ref: `docs/testing.md → Tests that need a built template`; landmine `live-objtemplate-rebuild-races-parallel-test-readers`.
verified-at: 8201af6
last-touched: 2026-08-14
---

- how to apply: add `'--exclude=.config'` to the rsync exclude list in any clone helper; for many-copy patterns route the copy through a portable COW helper. Five inline clone sites + the shared `cloneAndBuild` helper carry the exclude as of this entry.
