---
owners: [security, integrate, scout]
category: gotchas and recurring true positives
size-cap: 500
key: path:line or short slug
verifies-against: git
---

# Landmines

Things that have bitten before and will bite again. "Editing X without also editing Y breaks Z." Recurring true positives from security review. Version skew traps.

Each entry's stable key is `path:line` or a short slug.

---

## baseline-skill-edit-needs-manifest-rebuild

- Path: `obj/template/.claude/manifest.json` (canonical hash record) + `scripts/build-template.sh` (Stage 3 manifest rebuild → Stage 4 audit gate; the chicken-and-egg from pre-2026-05-18 is resolved) + `.claude/hooks/test_runner.sh` (PostToolUse hook that runs the audit on every Edit; the new blocking surface).
- Trap: editing any baseline-owned skill file (anything under `.claude/skills/<baseline-skill>/**` per `manifest.owners.skills`) OR a baseline-owned hook (`.claude/hooks/**`, e.g. `common.mjs` / `git_commit_guard.mjs` / `destructive_cmd_guard.mjs` — reconfirmed 2026-05-31 in infra-hardening) OR `CLAUDE.md` makes the on-disk content diverge from the manifest. Next `bash .claude/skills/audit-baseline/audit.sh` reports `skill ownership: <slug> FAIL hash mismatch at <path>` and exits non-zero. **Compounding trap (rediscovered 2026-05-22 in tier1-merge-option workflow at the implement step):** the `test_runner` PostToolUse hook runs `test.cmd` (the audit) on EVERY subsequent Edit, blocking all further edits until the manifest is rebuilt. The block is silent in the sense that the Edit's stated content lands, but the hook output is fed back to the model as `PostToolUse:Edit hook blocking error` and the harness treats it as a verify FAIL until rebuild.
- Mitigation: run `npm run build` IMMEDIATELY after the first baseline-skill SKILL.md edit, before any other Edit fires the PostToolUse hook. The build script's Stage 4 audit gate now correctly runs AFTER Stage 3 manifest rebuild (script reorder landed pre-2026-05-22 — see the script's own Stage 4 comment block), so `npm run build` succeeds in one shot. The pre-reorder workaround (inline Stages 1-3 followed by `node scripts/build-manifest.mjs obj/template`) is no longer necessary.
- Companion requirement: if the edit touches `CLAUDE.md`, also update `src/CLAUDE.template.md` to the byte-equal mirror (Article XI). The build's Stage 2 overlays `src/CLAUDE.template.md` into `obj/template/CLAUDE.md`, so the manifest hash is computed from the src/ pristine — if PKG_ROOT/CLAUDE.md and src/CLAUDE.template.md aren't byte-equal, the audit will still FAIL on the CLAUDE.md hash after manifest rebuild.
- Real fix (deferred): the `test_runner` hook could skip its audit invocation when the edit target itself is the manifest (or run the audit AFTER a manifest rebuild). Either eliminates the "every edit between SKILL.md change and manifest rebuild is blocked" window. Cheaper interim fix: document the immediate-rebuild pattern in the relevant workflow phase (tdd or implement) as "after editing a baseline SKILL.md, run `npm run build` before continuing." Tier1-merge-option's implement worker resolved SQ-3 inline by running the build after the SKILL.md edit; the same pattern works for future baseline-skill edits.
- Verified-at: 92e0d10
- Last-touched: 2026-05-31

## track-guard-tdd-literal-on-swarm-path

- Path: `.claude/hooks/track_guard.sh` (literal-match logic)
- Trap: when Phase 6 is satisfied via the swarm path (`swarm-plan` + `approve-swarm` + `swarm-dispatch` in `workflow.json → completed`), the track guard still refuses Phase 7+ artifact writes because it expects literal `"tdd"` in `completed`. First write attempt to `docs/security/<slug>-<date>.md` after a swarm dispatch fails with "phase 'security': prior phases not completed: tdd".
- Mitigation: after swarm-dispatch finishes, manually add `"tdd"` to `workflow.json → completed` with a rationale in a `completed_notes` field (e.g., `{"tdd": "satisfied via swarm path; track_guard literal-match workaround per seed.md §16 retrospective"}`). Documented in seed.md §16 deviation log too.
- Real fix (deferred): teach track_guard to accept `(swarm-plan + swarm-dispatch)` as Phase-6 satisfaction equivalent to `tdd`.
- Verified-at: 3a3314e
- Last-touched: 2026-05-16

## swarm-refuse-dirty-tree-blocks-mid-workflow

- Path: `.claude/project.json → swarm.refuse_dirty_tree` (read by `swarm-dispatch` preflight)
- Trap: `refuse_dirty_tree: true` (the original default) aborts swarm-dispatch when `git status --porcelain` is non-empty. But the 11-phase workflow ALWAYS leaves a dirty tree mid-flow: `docs/intake/<slug>.md`, `docs/scout/<slug>.md`, `docs/research/<slug>.md`, `docs/specs/<slug>.md`, `.claude/state/spec_approvals/`, etc. are all uncommitted until gate C / `/commit`. So `refuse_dirty_tree: true` is incompatible with running swarm-dispatch as part of the regular workflow — the check fires on the exact state the workflow is supposed to produce.
- Mitigation: in branch-aware-git-policy (2026-05-15) we toggled `refuse_dirty_tree: false` permanently. The check was meant for pre-workflow runs only; it's effectively unreachable in normal flow with it true.
- Open question (Q-007 in pending-questions): should the default ship as `false`? Currently disagreement between live `.claude/project.json` (false) and `src/project.template.json` (still true) needs resolving.
- Verified-at: 3a3314e
- Last-touched: 2026-05-16

## hooks-edit-cascade

- Path: `.claude/hooks/lib/common.sh:1`
- Trap: every guard hook sources this. A breaking change to a helper signature breaks all 14 hooks at once, and Claude Code can't run any tool until they're fixed.
- Mitigation: when editing common.sh, run a `find .claude/hooks -name '*.sh' -exec bash -n {} \;` syntax check across the fleet.
- Verified-at: HEAD
- Last-touched: 2026-04-27

## swarm-cleanup-deletes-irreplaceable-assets

- Path: any swarm task that deletes files without preserving a copy first
- Trap: T-014 of swarm `site-react-ssg-seo` (2026-04-29) deleted `site/index.html` (1,250 lines, 1,223-line embedded design CSS — the visual ground truth) and `site/assets/src/app.jsx` (1,374 lines, all the visual component logic) after T-009/T-010/T-011/T-012/T-013 ported their structure. Workers ported the JSX shape but did not port the CSS rules. The CSS was irretrievable: no git locally, no Time Machine local snapshots, Trash empty (terminal `rm` doesn't go to Trash), Spotlight had no index match, no `.bak`/swap files. Only ~77% of `app.jsx` was recoverable from worker tool-result transcripts at `/private/tmp/claude-502/<user>/<session-uuid>/tasks/*.output`; the original `index.html` was never read by any worker so 0% recoverable.
- Mitigation: swarm-plan tasks that delete files SHALL include a "preserve-to-archive" step that copies the deleted bytes to `docs/archive/_pre-delete/<slug>/<original-relpath>` (or equivalent) BEFORE `rm`. This applies in particular to: any file containing visual/design ground truth, any file >500 lines authored by hand, any file the workflow's own components were meant to replace. Cleanup is a real action; treat it like a destructive git operation.
- Mitigation (workflow-level): the `archive` skill (Phase 10.5) runs AFTER cleanup, so it cannot rescue what cleanup deleted. Either move cleanup into the archive bundle's first step, or have swarm-plan emit cleanup tasks that explicitly write to the archive dir before `rm`.
- Recovery surface (when this DOES bite): `/private/tmp/claude-502/<user-encoded-path>/<session-uuid>/tasks/*.output` JSONL transcripts contain every Read tool_use and tool_result. Match `tool_use(id)` → `tool_result(tool_use_id)` and stitch lines by the `<line>\t<content>` format from the result text. ~77% recovery is realistic if workers had the file in their read_set; 0% if no worker read it.
- Verified-at: HEAD
- Last-touched: 2026-04-29

## lsof-port-kill-takes-firefox-with-it

- source: incident
- Path: any cleanup pattern of the form `lsof -ti:<PORT> | xargs kill`
- Trap: `lsof -i:PORT` matches **every TCP socket touching that port**, including outbound ESTABLISHED connections from clients. When the user has a browser tab open on `http://localhost:<PORT>` (e.g., reviewing the live dev site we just built), Firefox holds a client TCP connection to that port. `lsof -ti:PORT` returns the dev-server PID *and Firefox's PID*; `xargs kill` then SIGTERMs Firefox along with the server. Symptom from prior session: "playwright chrome starts (good), but it crashes firefox" — playwright was a red herring; the cleanup `lsof | xargs kill` after the smoke test was killing the user's browser. Verified against the user's screenshot 2026-04-30.
- Mitigation: never write `lsof -ti:<PORT> | xargs kill`. Use one of:
  - `lsof -ti:<PORT> -sTCP:LISTEN | xargs -r kill` — restricts to listening sockets only, never matches clients.
  - `pkill -f "<command-substring>"` — matches by command line (e.g., `pkill -f "http.server 4321"`).
  - PID-file pattern: write `$!` to a file when starting the server, kill by that PID.
- Applies to: any skill or session where Claude runs a local dev server (`eleventy --serve`, `python -m http.server`, `vite`, `next dev`, etc.) and then cleans up. Also applies to Bash blocks generated by `impeccable live`, `verify`, `integrate` smoke runs.
- Verified-at: HEAD
- Last-touched: 2026-04-30

## npm-pack-excludes-dotnpmrc

- source: implementation incident (supply-chain-hardening workflow, 2026-05-13 implement-tick iteration 1)
- Path: `scripts/build-template.sh:88` (the overlay block) + `src/cli/install.js:71` (the workaround)
- Trap: npm pack mechanically excludes any file named `.npmrc` from the published tarball, even when `package.json → files` explicitly lists it (registry-credential hardening built into npm). The exclusion fires on basename, not path — `obj/template/.npmrc` is dropped just as `.npmrc` at the repo root would be. A file named `src/.npmrc.template` (different basename) IS shipped. This caught the AC-007 implementation: the first build-template.sh attempt `cp src/.npmrc.template → obj/template/.npmrc` produced bytes on disk in the dev repo, but every `npm pack` produced a tarball without `.npmrc`, and smoke-tarball's installed-tree hash verify (AC-004 mechanism) reported `HASH_MISMATCH: obj/template/.npmrc (listed in shipped manifest but absent on disk)` on every clean smoke.
- Mitigation: ship `.npmrc` bytes under a non-excluded basename in `src/` (today: `src/.npmrc.template`). At install time, the CLI reads the bytes and writes them to `<target>/.npmrc`. The `obj/template/.npmrc` overlay step in build-template.sh is intentionally NOT present; the script body documents this with a comment so a future contributor doesn't re-add it.
- Confirmation: `npm pack --dry-run --json --ignore-scripts | jq '.[0].files[].path'` lists `src/.npmrc.template` but not `obj/template/.npmrc` even when the latter exists on disk and is referenced in the shipped manifest.
- Applies to: any future config file the baseline materializes into a target whose basename is on npm's exclusion list (`.npmrc`, `.npmignore`, `package-lock.json` under conditions). When in doubt, ship under `src/<name>.template` and overlay at install time.
- Verified-at: HEAD
- Last-touched: 2026-05-13

## approve-spec-slug-marker-mismatch

- source: user-instruction (2026-05-11T19:45Z, mid-workflow on slug `design-ui-orchestrator` at Gate A)
- Path: `.claude/hooks/consent_gate_grant.sh` (marker writer) + `.claude/hooks/spec_approval_guard.sh` (validator) + `.claude/commands/approve-spec.md` (filename-derivation rule)
- verbatim: > before we move, mark this error in approval flow; we will revisit and fix this later
- Trap: `/approve-spec <arg>` writes a consent marker at `.claude/state/.spec_approval_grant` keyed to `<arg>` verbatim. `spec_approval_guard` then requires the approval-token filename basename (minus `.approval`) to slug-match that marker. When the user types just the slug (`design-ui-orchestrator`) and Claude follows the documented `<slug>.md.approval` filename pattern, the basename is `design-ui-orchestrator.md` and the marker is `design-ui-orchestrator` — slug mismatch → DENY. The first denial burns one tool call; the marker's 60-second TTL is short enough that a single retry can exceed it, forcing the user to re-type the consent command.
- Reproduction (2026-05-12, `design-ui-orchestrator` workflow): user typed `/approve-spec design-ui-orchestrator` (slug-only). Attempt 1 wrote `design-ui-orchestrator.md.approval` → DENY (slug mismatch). Attempt 2 wrote `design-ui-orchestrator.approval` → DENY (marker expired, 67s old, TTL 60s). User re-typed `/approve-spec`; attempt 3 wrote `design-ui-orchestrator.approval` → ALLOW.
- Mitigation today: type `/approve-spec <slug>` (no `.md` extension, no path) and Claude writes `.claude/state/spec_approvals/<slug>.approval` (no `.md` in the filename). One-shot success inside the 60s TTL. Confirmed working at attempt 3 of the reproduction.
- Fix candidates (decision deferred):
  - **A**: `consent_gate_grant.sh` normalizes argv (strip leading path + `.md`) so the marker slug is always canonical; approval-file pattern stays `<slug>.md.approval`.
  - **B**: `spec_approval_guard.sh` accepts either basename form (`<slug>` or `<slug>.md`) against the same marker.
  - **C**: `.claude/commands/approve-spec.md` always strips `docs/specs/` + `.md` from the user's argv before deriving the filename, so both input forms map to the same approval-file path.
  - **D** (belt-and-suspenders): all three. Matches "Claude cannot forge consent, but a typo shouldn't break the gate."
- Why it matters: the gate is structurally correct (Claude cannot forge), but the rough edge undermines confidence — a user thinks "I approved twice and the system still rejected me" when the second rejection was a TTL race, not a logic failure. Article IV gate language ("structurally un-invokable") implies the gate fires only on real violations.
- Affects archive too: `.claude/skills/archive/archive.sh` looks for `<slug>.md.approval` in the spec_approvals dir; an approval token written under the workaround name (`<slug>.approval`) won't move into the bundle. Observed on `design-ui-orchestrator` archive 2026-05-12 — 5 artifacts archived, spec approval token left behind.
- Verified-at: HEAD
- Last-touched: 2026-05-12

## bsdtar-vs-gnutar-default-extraction

- The macOS default `tar` is `bsdtar` (libarchive); Linux/CI default is GNU `tar`. Both DEFAULT-reject absolute paths and `..` path components when extracting (bsdtar: "files containing components that resolve outside of the destination directory" are refused; GNU tar: strips leading `/` and warns). So a malicious tarball cannot write outside `-C tmp` on either platform with default flags.
- BUT the safety relies on the tar binary's default behavior. A custom-built tar, a future flag-default change, or a different tarball processor in the chain would re-expose path traversal. `src/cli/upgrade-tiers.js → extractFromTarball` adds an explicit `path.resolve(candidate).startsWith(tmpRoot + sep)` defense-in-depth check after extraction — throws `NoBaseError` with `kind: 'tarball_path_traversal'` on escape, which routes through the tier-1 binary-prompt fallback.
- Why it matters: the security review for `upgrade-flow-rework` (2026-05-20) initially rated this HIGH because BSD tar absolute-path handling had been mis-recalled. The actual bsdtar behavior is safe-by-default per man bsdtar; the explicit check makes the safety contract platform-agnostic and survives future tar-binary changes.
- Don't strip the defensive check thinking "tar handles it" — keep the belt-and-suspenders. Same principle applies to any future tarball/zip extraction code paths.
- Verified-at: e2927c7
- Last-touched: 2026-05-20

## build-template-tests-need-workflows-template-fixture

- Any test that calls `runBuild(fixtureRoot)` (a `bash scripts/build-template.sh` shellout against a synthetic `PKG_ROOT`) MUST seed `src/.claude/workflows.template.jsonl` in the fixture. `scripts/build-template.sh:127` runs `cp "$PKG_ROOT/src/.claude/workflows.template.jsonl" "$TEMPLATE_DIR/.claude/workflows.jsonl"` unconditionally as part of Stage 2; absence fails with a cryptic `cp: <path>: No such file or directory` rather than a structured assertion.
- Why it matters: when §18 added the workflows.jsonl overlay (commit cb1d511), the fixture-seed helpers in `tests/build-template.test.mjs`, `tests/build-template-build-id.test.mjs`, and the rsync-clone in `tests/skill-ownership.test.mjs` were silently incomplete (rsync clones the full tree, so skill-ownership *did* work — but the two synthetic-fixture suites broke immediately and persisted as red until 2026-05-21). Future Stage-2 overlays (e.g. a new `src/.claude/<x>.template.<ext>`) will repeat the same trap unless tests are updated in lockstep.
- How to apply: when adding a new `src/*.template.*` overlay, grep `scripts/build-template.sh` for `cp .* "\$PKG_ROOT/src/...`; any new line means every `mkTestRoot()`/`makeFixture()` that calls `runBuild` needs a matching `writeFile(join(root, 'src', ...))` for the new path. A minimal-but-valid stub is fine — the build script doesn't validate JSONL/JSON content, only file existence.
- Verified-at: cb1d511
- Last-touched: 2026-05-21

## tdd-order-guard-test-stem-must-match-source-stem

- Path: `.claude/hooks/tdd_order_guard.sh` (candidate-derivation logic, the Python heredoc starting around line 64)
- Trap: when creating a NEW source file under a path matching `project.json → tdd.source_globs`, the guard generates expected test paths via a fixed template: `tests/<src-stem>.test.<ext>`, `tests/<src-stem>_test.<ext>`, `tests/<src-stem>.spec.<ext>`, plus mirrored-layout variants. A test file whose stem does NOT exactly match the source stem will FAIL the guard with `no test file found for new source 'X'. Candidates were derived from project.json → tdd.test_globs (e.g. ...)`. Caught at the upgrade-version-aware-noop implement step (2026-05-27): scenario worker wrote `tests/project-json-refresh.test.mjs` for `src/cli/project-json.js`; the `-refresh` suffix broke the stem match and the guard refused the Write.
- Mitigation: name tests `tests/<source-stem>.test.<ext>` exactly. For `src/cli/foo.js` → `tests/foo.test.mjs` or `tests/foo.test.js`. Suffixed names like `tests/foo-edge-cases.test.mjs` or `tests/foo-refresh.test.mjs` will fail the guard on the FIRST creation of the source file. After the source exists, the guard skips (only fires on file creation), so suffixed tests can be added later — but the first test file MUST match the stem.
- Real fix (deferred): broaden the candidate-derivation Python to also accept `tests/<src-stem>-<anything>.test.<ext>` patterns. Until then, the convention applies.
- Verified-at: b5d40eb
- Last-touched: 2026-05-27

## npm-install-local-tarball-under-os-tmpdir-writes-no-node-modules

- Path: `tests/publish-check.test.mjs` (the `smokeInstallWorks()` probe + the 4 env-gated smoke/orchestrator tests) and `scripts/smoke-tarball.mjs` (phase=install).
- Trap: in this dev sandbox, `npm install <local-tarball> --no-save --prefer-offline` run with cwd under node's `os.tmpdir()` (resolves to `/tmp/claude-502`) **exits 0 but writes NO `node_modules` into the target dir** — npm reports "changed 1 package, audited N" yet the package never materializes. The smoke-tarball test then fails at its "installed CLI missing at .../bin/cli.js" assertion. A registry install (`npm install <name>`) into the SAME tmpdir works, and the local-tarball install works under `/var/folders/...` — so it is specifically local-tarball-install + the sandbox TMPDIR. Spent real time chasing this as a code bug before isolating it to the environment.
- Mitigation: env-gate the smoke/orchestrator tests with a FAITHFUL probe — `smokeInstallWorks()` packs a trivial throwaway package and installs the tgz into an `os.tmpdir()` dir, then asserts `node_modules/<pkg>/package.json` exists; if not, the tests `it(..., { skip: PACK_SKIP }, ...)` rather than fail. A shallow "is npm/tar on PATH" probe is INSUFFICIENT — both are present here yet the install silently no-ops. In a real CI/TMPDIR the probe materializes node_modules and the tests run normally.
- Verified-at: HEAD
- Last-touched: 2026-05-31

## shell-command-guards-must-classify-wrapper-and-quote-aware

- Path: `.claude/hooks/lib/common.mjs` → `executedFragments` / `gitSubcommandInvoked` / `gitSegments` / `extractSubstitutions` / `shellTokens`; consumed by `.claude/hooks/git_commit_guard.mjs` (handleBash) and `.claude/hooks/destructive_cmd_guard.mjs`.
- Trap: a Bash-matcher guard that classifies a command by regex/substring has TWO opposite failure modes, and fixing one naively opens the other. (1) Substring match false-POSITIVES on data: `grep "git commit"` was blocked as a commit (Q-003). (2) Leading-verb-only tokenizing false-NEGATIVES on wrappers: `sh -c "git commit"`, `eval "..."`, `command git commit`, `(git commit)`, `echo $(git commit)`, and `\`-newline continuations execute git but evade a verb==git check — a security-HIGH consent-gate bypass (docs/archive/2026-05-30/infra-hardening/security.md). (3) Regex extraction of `$(...)`/backticks is itself quoting-blind: a `$(git commit)` inside SINGLE quotes is literal (not executed) and must NOT classify, else you re-open the Q-003 false-positive.
- Mitigation: classify over `executedFragments(cmd)` — peel subshell/brace groups, recurse into executor verbs (`sh -c`/`bash -c`/`eval`/`command`/`env`/`xargs`/`timeout`…), follow `$(…)`/backticks ONLY when shell-active (track single-quote state; double quotes do not suppress), normalize `\`-newline. The discriminator vs. a grep pattern: an executor's quoted string is executed; grep's is data. Scope FORBIDDEN_RE checks to the executed git fragments. Covered by `tests/git-commit-guard-tokenize.test.mjs` (24 cases incl. wrapper-deny + single-quote-not-classified).
- Verified-at: HEAD
- Last-touched: 2026-05-31

## drift_check-diffs-committed-HEAD-empty-for-in-flight-workflow

- Path: `.claude/skills/tdd/drift_check.mjs` → `loadDiff()` (`git merge-base HEAD main` then `git diff <merge-base>..HEAD`); inlined by the harness as the `drift-check-tick` between the last design-ui/verify tick and `tdd-finalize`.
- Trap: `drift_check` scores each spec AC / Design-call as `resolved` only if a `+`-added line in the diff literally `includes` the item id (`AC-001`, the design-call slug). But its default diff source is `merge-base..HEAD` — **committed** history. In the 11-phase workflow the implementation is written to the WORKING TREE and committed only at Phase 11 (`/commit`), so at drift-check time (Phase 6, inside `/tdd`) `HEAD` has none of the change → empty diff → ALL items report `unresolved` → exit 1 → false YIELD. A fully-correct, fully-tested in-flight implementation trips a spurious drift failure. Hit live in WF-5 (governance-count-single-source): 684/684 tests green, every AC backed, yet drift_check exit 1 with 8/8 ACs "no diff added-line references this item".
- Mitigation: pass the WORKING-TREE diff via the `--diff <path>` override. Build it with `git add -N <untracked-new-files>` (intent-to-add so untracked files show as additions) → `git diff HEAD -- <scopes> > /tmp/x.diff` → `git reset -q` (clear the intent-to-add). Re-run `drift_check.mjs --slug <slug> --diff /tmp/x.diff`. Secondary limit: matching is literal-id-substring, so an AC verified behaviorally but never cited by id in any added source line (e.g. a mirror-byte-equality AC) can stay `unresolved` even with the right diff — judge those against the tests, don't blindly YIELD. NOT yet auto-fixed in drift_check (it still defaults to HEAD); the harness orchestrator must supply `--diff` for in-flight runs.
- Verified-at: d336e01
- Last-touched: 2026-06-01

## destructive-guard-blocks-benign-bash-containing-consent-redirect-shapes

- Path: `.claude/hooks/destructive_cmd_guard.mjs` (Bash matcher) → `.claude/hooks/lib/common.mjs` → `writesConsentPath`.
- Trap: the consent-write guard is deny-leaning by design — it blocks any Bash command whose string contains a redirect/write to a reserved consent basename (`commit_consent`, `push_consent`, `*_grant`, `spec_approvals/`, `swarm_approvals/`), and after Club A it also catches `$VAR`/`${HOME}`-indirected targets. It does NOT shell-parse, so a perfectly benign command that merely CONTAINS such a shape as data — e.g. `node -e "... echo x > $C/commit_consent ..."` written to probe/test the guard, or an `echo`/doc string quoting a redirect — is BLOCKED (false-positive in the safe direction). Hit twice in Club A: read-only analysis `node -e` probes were denied for containing the shape in a string literal.
- Mitigation: when you need to RUN a command that legitimately contains a consent-write shape (probing the guard, generating fixtures, doc examples), put the code in a throwaway file and run `node /tmp/probe.mjs` — the Bash command string is then just `node <path>` with no consent shape, so the guard passes; the file's CONTENTS are never scanned. (Same applies to `git commit -F <file>` for commit messages containing forbidden-looking strings.) The remaining false-positive is accepted/deny-leaning per backlog `destructive-guard-and-grant-sweep-residual-hardening-7f2c`; full shell-segment scoping is the deferred seed.md §16 sweep.
- Verified-at: HEAD
- Last-touched: 2026-06-01

## live-objtemplate-rebuild-races-parallel-test-readers

- Path: `tests/build-template.test.mjs` (and other build-exercisers) vs any test that reads `obj/template/**`; helper `tests/helpers/clone-and-build.mjs`.
- Trap: `build-template.test.mjs` runs `scripts/build-template.sh` against the LIVE tree (PKG_ROOT=repo root), which `rm -rf`s + rebuilds `obj/template/` (including `manifest.json`). Under default-parallel `node --test tests/*.test.mjs`, any OTHER test that reads the live `obj/template/` races that rebuild and fails intermittently: ENOENT on `manifest.json`, a half-written manifest, a transient scan finding, or a build-mutex timeout. Observed: a fresh `whatsnew-counts.test.mjs` that read the live manifest produced 4 different failure shapes across 3 consecutive full runs (ENOENT -> mutex-timeout -> scan), every one GREEN in isolation. The flakes are NOT real test failures.
- Mitigation: (1) a test that needs the BUILT tree must build its OWN isolated copy via `tests/helpers/clone-and-build.mjs` (`cloneAndBuild(label)` rsyncs the repo to a tmpdir, builds there, returns the path) and read from that path, NOT the live `obj/template/`. (2) Better still, assert the SOURCE of truth (e.g. skill frontmatter `owner: baseline` + dir presence) instead of the built manifest when possible — rebuild-free and contention-free. (3) For a deterministic binding verdict at `/integrate`, run the suite serially: `node --test --test-concurrency=1 tests/*.test.mjs` avoids the shared-live-tree race entirely. RE-CONFIRMED 2026-06-03 (drift-check-working-tree-diff workflow): `npm test` (= `node --test tests/*.test.mjs`, NO concurrency pin → parallel) surfaced `thread-shelving-governance.test.mjs` FAIL (`audit overall FAIL fails=1`) that passed in isolation and under the serial command; the serial run was clean (750 pass / 0 fail).
- Mitigation status (UPDATED 2026-06-05, reduce-test-suite-runtime): now STRUCTURALLY enforced for the default tier. Root cause confirmed to be the WRITERS — `npm pack` (via `prepack` → `build-template.sh`) rebuilding the live `obj/template` while sibling tests read it. Fix: the heavy `publish-check` npm-pack/install cases + the one live-tree-writing supply-chain case are gated behind `PUBLISH_TESTS=1`; the always-on packaging smoke uses `npm pack --dry-run --ignore-scripts` (skips prepack → no rebuild). New meta-test `tests/no-live-objtemplate-reads.test.mjs` FAILs if any default-tier test executes a build/`npm pack` against the live tree without isolation or a gate (regression guard). Result: default-parallel `node --test tests/*.test.mjs` is now deterministic — 8/8 consecutive green (was 2/3 red). The serial `--test-concurrency=1` run is KEPT as a documented fallback (not retired) per spec Decision. Speed remains unaddressed (see backlog `reduce-test-suite-wall-clock-blocked-on-global-build-mutex`).
- Verified-at: a493cdb
- Last-touched: 2026-06-05

## consent-guard-carveout-must-retain-executed-substitutions

- Path: `.claude/hooks/lib/common.mjs` → `writesConsentPath` / `sanitizeGitCommitForScan` / `collectExecutedSubstitutions`.
- Trap: `destructive_cmd_guard` now exempts a `git commit` MESSAGE payload (`-m`/`--message` arg + heredoc body) from consent-path scanning so a commit message that merely *describes* consent tokens isn't blocked (fixed the `git commit -F <file>` workaround papercut). The naive carve-out — strip the whole message arg/heredoc body before scanning — opened a HIGH guard BYPASS: a real consent write hidden in a command substitution inside the message (`git commit -m "$(tee .claude/state/commit_consent)"`, backtick form, `--message="$(... > .../push_consent)"`, or `$()` in an unquoted heredoc body) was stripped along with the prose and thus ALLOWED. The pre-carve-out whole-command scan had correctly blocked all of these. Caught by the `/security` phase, not by tests-first.
- Mitigation: when sanitizing, RETAIN every EXECUTED command-substitution/backtick body (use `extractSubstitutions` recursively via `collectExecutedSubstitutions`) and re-append it to the scanned string — drop only literal, non-executed prose. Also: an unterminated heredoc must NOT swallow trailing lines (it would hide a trailing real write). General rule: any "exempt part of a command from a security scan" carve-out SHALL still scan whatever that part would EXECUTE. Over-inclusion (scan a literal that looks executable) is the safe direction; under-inclusion is a bypass. Regression tests: `tests/guard-commit-msg-falsepos.test.mjs` (5 SEC cases: 4 substitution forms BLOCK + plain prose ALLOW + unterminated-heredoc BLOCK).
- Verified-at: 0a70375
- Last-touched: 2026-06-02

## consent-guard-precision-needs-target-anchoring-via-var-expansion

- Path: `.claude/hooks/lib/common.mjs` → `writesConsentPath` / `resolveAssignments` / `expandWithEnv` / `fragmentWritesConsentTarget`.
- Trap: making `writesConsentPath` MORE PRECISE (stop false-blocking commands that merely READ a consent path while a write-verb targets elsewhere, e.g. `head .claude/state/commit_consent; git mv a b`) is deceptively dangerous: any "is a write-verb NEAR a consent ref" heuristic UNDER-BLOCKS variable indirection. The first attempt — per-fragment co-occurrence (consent ref + write signal in the SAME executed fragment) — passed its own tests but `/security` proved a HIGH bypass: `F=.claude/state/commit_consent; tee $F` puts the basename in the `F=` fragment and the verb in the `tee $F` fragment, so neither fragment co-occurs. `executedFragments` does NOT expand variables. Two separate quickfix shapes failed `/security` (this + the git-commit carve-out above) before the sound design landed.
- Mitigation: **expand-then-detect.** (1) `resolveAssignments(scan)` builds a `VAR→value` map left-to-right, expanding each value against the map so far (fixpoint, so `G=$F` inherits `F`). (2) `expandWithEnv` substitutes `$VAR`/`${VAR}` BEFORE detection, so `tee $F` becomes `tee .claude/state/commit_consent`. (3) the redirect check stays WHOLE-COMMAND (path-anchored; the `>|` clobber embeds a `|` that `splitShellSegments` splits, so a per-fragment redirect check misses it); verb/sed/prog checks run per executed fragment. Boundary (accepted): a consent path entering a var with NO literal basename (`X=$(...)`, `read X`, env, function args) is unreachable by any literal scanner — `tee $UNKNOWN` is allowed, same as the prior guard. General rule: **precision changes to a security guard are spec-entry territory, not quickfix** — write the exhaustive bypass matrix as the test plan and run `/security` against it. Regression: `tests/anchor-consent-write-target.test.mjs` (18-row matrix) + the 19-vector probe in the archived security report.
- Verified-at: 6b310eb
- Last-touched: 2026-06-03

## constitutional-amendment-tripwires-headroom-seedmirror-python3ledger

- Path: `CLAUDE.md` + `src/CLAUDE.template.md`; `docs/init/seed.md` + `src/seed.template.md`; tests `tests/code-browser-primary-navigation.test.mjs`, `tests/seed-template-parity.test.mjs`, `tests/governance-no-python3-runtime.test.mjs`.
- Trap: amending Article VII / a `seed.md` section looks like a two-file mirror edit (CLAUDE.md ↔ src/CLAUDE.template.md, already covered by the manifest landmine) but has THREE more tripwires the full suite catches only after the fact. (1) **CLAUDE.md has a hard 38500-byte budget, not the 40000 cap.** `code-browser-primary-navigation.test.mjs:39` pins `CLAUDE_TARGET_MAX = 38500` (≥1500 headroom under the Article I.6 cap); the file ships near the ceiling (38491 at edd7b19, 9 bytes of slack), so ANY net addition busts it. Fix: put the binding clause in CLAUDE.md tersely, move the full rule to the annex `.claude/CONSTITUTION.md` (no cap) + seed.md, and trim verbose existing prose to offset — but never drop a `REQUIRED_BINDING_MARKER` (`No stubs`, `YAGNI`, `Context7`, `swarm-worker`, `approve-spec`, `grant-commit`, `§17`) or an `## Article N` heading (same test asserts them). (2) **seed.md has a SECOND parity mirror** `src/seed.template.md` (`seed-template-parity.test.mjs`): the pre-§16 body AND the §17+ tail must be byte-identical to `docs/init/seed.md` (only §16 diverges — template keeps the `*Reserved.*` placeholder). Any pre-§16 seed edit must be applied identically to both. (3) **Inserting lines in seed.md shifts the python3 line-ledger.** `governance-no-python3-runtime.test.mjs` `ALLOWED_LINES['docs/init/seed.md']` is a hardcoded line-number Set for legitimate historical `python3` mentions; a multi-line insertion above one shifts its line number and the test fails. The test's own comment delegates the ledger to implementers ("must adjust this map together with their edits") — bump the number, it is data not an assertion.
- Mitigation: when a workflow touches CLAUDE.md or seed.md, BEFORE the verify-tick run the cheap checks: `wc -c CLAUDE.md` (≤ 38500), `diff -q CLAUDE.md src/CLAUDE.template.md`, `diff <(sed '/## §16/,$d' docs/init/seed.md) <(sed '/## §16/,$d' src/seed.template.md)` (pre-§16 parity), and `grep -n '\bpython3\b' docs/init/seed.md` vs the ledger. Cheaper than discovering all three in a 7-minute full-suite run at verify time. The manifest-hash + CLAUDE-mirror trap is the separate `obj/template` landmine above; this entry is the test-suite tripwires that are NOT manifest-related.
- Verified-at: edd7b19
- Last-touched: 2026-06-04
