---
key: build-template-tests-need-workflows-template-fixture
category: landmines
scope: [chore, integrate]
verified-at: 3c74ba8
last-touched: 2026-06-20
---

- Any test that calls `runBuild(fixtureRoot)` (a `bash scripts/build-template.sh` shellout against a synthetic `PKG_ROOT`) MUST seed `src/.claude/workflows.template.jsonl` in the fixture. `scripts/build-template.sh:127` runs `cp "$PKG_ROOT/src/.claude/workflows.template.jsonl" "$TEMPLATE_DIR/.claude/workflows.jsonl"` unconditionally as part of Stage 2; absence fails with a cryptic `cp: <path>: No such file or directory` rather than a structured assertion.
- Why it matters: when §18 added the workflows.jsonl overlay (commit cb1d511), the fixture-seed helpers in `tests/build-template.test.mjs`, `tests/build-template-build-id.test.mjs`, and the rsync-clone in `tests/skill-ownership.test.mjs` were silently incomplete (rsync clones the full tree, so skill-ownership *did* work — but the two synthetic-fixture suites broke immediately and persisted as red until 2026-05-21). Future Stage-2 overlays (e.g. a new `src/.claude/<x>.template.<ext>`) will repeat the same trap unless tests are updated in lockstep.
- How to apply: when adding a new `src/*.template.*` overlay, grep `scripts/build-template.sh` for `cp .* "\$PKG_ROOT/src/...`; any new line means every `mkTestRoot()`/`makeFixture()` that calls `runBuild` needs a matching `writeFile(join(root, 'src', ...))` for the new path. A minimal-but-valid stub is fine — the build script doesn't validate JSONL/JSON content, only file existence.
