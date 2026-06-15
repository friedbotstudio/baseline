# Pattern Research — gitignore setup

Three codesign decisions (A source-of-truth, B gitignore.io+fallback, C guard mechanism). Decision D (governance cascade) is mechanical, mapped in the scout — not researched here.

## gitignore.io API (fact-check, WebFetch-verified)

- Canonical base: `https://www.toptal.com/developers/gitignore/api/` (the old `gitignore.io/api/` host 301-redirects here; WebFetch confirmed the live list endpoint at the toptal path).
- `GET /api/<comma-separated-types>` (e.g. `/api/node,macos,visualstudiocode`) → **plain-text** `.gitignore` body, ready to write.
- `GET /api/list` → the catalog of supported type tokens.
- **It is a network call.** No auth. Per Article VI.5 (offline-first; only context7 sanctioned), this can only be an *enrichment*, never on a required/offline path. Source: WebFetch of `https://www.toptal.com/developers/gitignore/api/list` (2026-06-15).
- No project lockfile dependency — gitignore.io is a service, not an npm package. Nothing to pin.

---

## Decision A — canonical must-ignore source of truth

The skill (writes `.gitignore`), the init/install overlay (writes/merges `.gitignore`), and the guard (verifies paths are ignored) must read ONE set. The artifact has two faces: the *lines to write* (`.gitignore` text) and the *paths to verify* (the must-ignore check set). Keep them derivable from one source.

### Candidate A1: shipped data module + project.json extension (recommended)
- **Summary**: a single shipped data file holds the baseline must-ignore entries (e.g. `src/gitignore-baseline.json` → array of `{pattern, comment}` plus a render-to-text helper); install overlays/merges it into the target `.gitignore` (like `src/.npmrc.template`), and the guard reads the same shipped list to know what must be ignored. Consumer-specific additions live in `project.json → gitignore.extra_must_ignore` (array), which the guard unions in.
- **Fits**: yes — mirrors the `src/.npmrc.template` overlay precedent (scout: install drops dotfiles, so dotfile content ships from `src/` and is overlaid). Guard already has `projectGet` for the project.json extension.
- **Tests it enables**: assert the shipped list renders the expected `.gitignore` lines; assert install merges them add-only; assert the guard's check-set = baseline ∪ project.json extras.
- **Tradeoffs**: install.js (`src/cli/`, ships to npm) and the guard (`.claude/hooks/`, ships) read the SAME data — decouple via a **runtime data read of a shipped JSON at a known consumer path**, not a cross-tree `import` (install.js can't cleanly import from `.claude/hooks/lib/`). Decide the on-disk home of that JSON in the consumer at codesign.

### Candidate A2: project.json only (`gitignore.must_ignore` array)
- **Summary**: the entire must-ignore set lives in `project.json`; init seeds it, the guard reads it, the skill renders from it.
- **Fits**: partial — guard reads project.json natively, but `project.json` is itself a baseline-shipped config that a consumer may not have at the moment the guard runs in a fresh repo, and putting ~30 default lines in project.json bloats it.
- **Tradeoffs**: simplest single-read for the guard; but the *defaults* don't belong in per-project config — they're baseline-owned. Better as the *extension* mechanism (A1's second half) than the home of defaults.

### Candidate A3: hardcoded in `lib/common.mjs`
- **Summary**: the set is a constant in the hooks' shared lib.
- **Fits**: no — `common.mjs` is hooks-only; install.js (`src/cli/`) and the markdown skill can't share it. Forces duplication → drift (the exact failure mode this decision exists to prevent).
- **Tradeoffs**: rejected.

---

## Decision B — gitignore.io integration + offline fallback

### Candidate B1: skill enriches, install is always-offline (recommended)
- **Summary**: `/init-project` and `src/cli/install.js` ONLY ever write the vendored baseline set (deterministic, zero network). gitignore.io enrichment is the *skill's* job: the `gitignore` skill (Claude-driven) may fetch `/api/<types>` (WebFetch/curl) for richer language/IDE coverage, then always re-ensures the baseline must-ignore lines are present (add-only merge). Offline → the skill skips the fetch and writes the vendored baseline only, reporting the fallback.
- **Fits**: yes — keeps the install critical path offline and deterministic (Article VI.5), makes gitignore.io a pure value-add the user opts into via the skill. The commit guard never touches gitignore.io.
- **Tests it enables**: install-writes-vendored-offline; skill-falls-back-on-unreachable; skill-merge-preserves-baseline-after-enrichment.
- **Tradeoffs**: a fresh `/init-project` gets only the baseline set, not a language-tailored one, until the user runs the skill. Acceptable: baseline correctness (the must-ignore guarantee) never depends on the network.

### Candidate B2: install.js fetches gitignore.io with timeout+fallback
- **Summary**: the CLI installer makes the network call during `npx` install, falling back to vendored on timeout/error.
- **Fits**: weaker — bakes a network call into `npm`/`npx` install (beyond npm's own), adds a latency/timeout surface and a flaky-network failure path to the most critical path.
- **Tradeoffs**: richer default out-of-the-box, but violates the spirit of offline-first install and complicates the install tests (network mock). Rejected unless the reviewer wants tailored defaults at init without a second step.

---

## Decision C — commit-guard leak mechanism

All options use `git check-ignore` / `git diff --cached` — both cheap, offline, no gitignore.io.

### Candidate C1: block on a staged must-ignore path (recommended)
- **Summary**: on a detected `git commit`, read `git diff --cached --name-only`; if any staged path matches the must-ignore set (or `git check-ignore` says it *would* be ignored yet is staged via force-add), hard-block and name the path(s). This catches the actual, actionable leak at the moment it would land.
- **Fits**: yes — precise, low false-positive (only fires when a must-ignore file is actually being committed), mirrors `git_commit_guard`'s per-commit Bash-boundary pattern.
- **Tests it enables**: stage a `.env`/`.claude/state/x` → deny; clean stage → allow; force-added ignored file → deny.
- **Tradeoffs**: does not catch a *latent* gap (a must-ignore path that exists, isn't ignored, but isn't staged this commit) — only catches it when it's staged. That's arguably correct (block the leak, not unrelated commits).

### Candidate C2: block when the must-ignore set isn't fully ignored
- **Summary**: for each baseline must-ignore entry that exists in the tree, run `git check-ignore`; if any isn't ignored, block — regardless of what's staged.
- **Fits**: matches the intake's literal "required must-ignore paths are not actually ignored," but blocks commits unrelated to the gap (annoying; a missing `.gitignore` line blocks ALL commits until fixed).
- **Tradeoffs**: enforces `.gitignore` completeness aggressively; higher false-positive friction. Good as a one-time init check, heavy as a per-commit gate.

### Candidate C3: hybrid (C1 always; C2 as a warning)
- **Summary**: hard-block on staged leaks (C1); emit an advisory (non-blocking) when the set has a latent gap (C2).
- **Tradeoffs**: best coverage, slightly more code; the advisory can't be `emitBlock` (would re-introduce C2's friction) so it rides the hook's allow output as a note.

**Compose-order with `git_commit_guard`**: both are independent PreToolUse/Bash hooks in the same matcher array; either may `emitBlock`. Order in the array doesn't change correctness (the runtime runs all; any deny blocks). Put the new guard AFTER `git_commit_guard` so consent/forbidden-flag denials surface first. **Fail-closed**: when the command is unambiguously a `git commit` and the staged-path inspection throws, the new guard SHALL `emitBlock` (deny) — opposite of `git_commit_guard`'s fail-open `emitAllow`, because this guard's whole purpose is preventing a leak; erroring open would defeat it. On a non-commit or unparseable-non-commit payload, `emitAllow`.

---

## Recommendation

- **A → A1**: shipped baseline data file (single source) + `project.json → gitignore.extra_must_ignore` for consumer additions; guard reads baseline ∪ extras at a known consumer path. *Flips* if the reviewer objects to a runtime data-read and prefers project.json-only (A2).
- **B → B1**: install writes vendored baseline only (offline-deterministic); the skill does gitignore.io enrichment with offline fallback. *Flips* if the reviewer wants language-tailored defaults at init time (B2).
- **C → C1** (optionally C3): hard-block on a staged must-ignore path; fail closed on inspection error for a clear commit. *Flips* to C2/C3 if the reviewer wants per-commit enforcement of full `.gitignore` completeness, accepting the friction.

## Open questions (for codesign at /spec)
1. On-disk home, in the consumer, of the shared baseline must-ignore data (so install + guard read one file without a cross-tree import). 
2. Whether the guard also runs the latent-gap check (C2/C3) or staged-only (C1).
3. The baseline default token set for the gitignore.io enrichment call (e.g. `node,macos,windows,linux,visualstudiocode` + the baseline `.claude/` block) and how the vendored fallback's content is kept current.
4. Exact `project.json` key name/shape for consumer extensions (`gitignore.extra_must_ignore`?).
