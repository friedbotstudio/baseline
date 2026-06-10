# Codebase Scout Report — harden the epic `approved: true` flip

Scope: map the consent-gate machinery, the epic-state `approved` flip, `track_guard`'s read of it, and every governance-count surface that a hook change touches. Source-read only; no recommendation (that is `/research`'s job).

## Primary touchpoints

### The consent-gate handshake (the pattern to mirror)
- `.claude/hooks/consent_gate_grant.mjs:2` — UserPromptSubmit hook; runs **before** Claude is invoked, outside the tool boundary. This is why Claude cannot forge consent.
- `.claude/hooks/consent_gate_grant.mjs:47` — fast-path regex gate: `/\/(approve-spec|approve-swarm|grant-commit|grant-push)/`. A new consent command must be added here.
- `.claude/hooks/consent_gate_grant.mjs:54-67` — `/approve-spec` handler: `canonicalSlug(arg)` → `writeMarkerAtomic(CONSENT_MARKER_SPEC, slug, epoch, absPath)`.
- `.claude/hooks/consent_gate_grant.mjs:104-107` — silent `exit(0)` on any error (UserPromptSubmit must never block).

### The two existing guards that mirror the target shape
- `.claude/hooks/spec_approval_guard.mjs:42` — `blockMarkerSelfWrite(rel, CONSENT_MARKER_SPEC_REL, …)` — blocks Claude from writing the marker file itself.
- `.claude/hooks/spec_approval_guard.mjs:44-69` — gates the token write `.claude/state/spec_approvals/<slug>.approval`; extracts the stem as `expectedSlug`; calls `validateConsentMarker(CONSENT_MARKER_SPEC, …, expectedSlug)`. Also enforces the shippability verdict (BLOCKED → deny).
- `.claude/hooks/spec_approval_guard.mjs:82-91` — content scan: blocks `approved: true` / `Status: Approved` appearing in a **spec** file (self-approval prevention). NOTE: this is the spec *document*, distinct from the epic *state* flag this task targets.
- `.claude/hooks/swarm_approval_guard.mjs:37` — `blockMarkerSelfWrite(rel, CONSENT_MARKER_SWARM_REL, …)`.
- `.claude/hooks/swarm_approval_guard.mjs:39-43` — gates `.claude/state/swarm_approvals/<slug>.approval` via `validateConsentMarker(CONSENT_MARKER_SWARM, …, expectedSlug)`. This is the terser twin of spec_approval_guard — the closest structural template for a new guard.

### Shared helper layer (every hook imports this)
- `.claude/hooks/lib/common.mjs:29-32` — `CONSENT_MARKER_{SPEC,SWARM,COMMIT,PUSH}` absolute path constants (`.claude/state/.spec_approval_grant`, `.swarm_approval_grant`, `.commit_consent_grant`, `.push_consent_grant`).
- `.claude/hooks/lib/common.mjs:33-36` — `CONSENT_MARKER_*_REL` relative siblings (used by `blockMarkerSelfWrite`).
- `.claude/hooks/lib/common.mjs:159-169` — `writeMarkerAtomic(markerPath, ...lines)` — temp-write + atomic rename.
- `.claude/hooks/lib/common.mjs:196-202` — `blockMarkerSelfWrite(rel, markerRel, gateLabel, cmdHint)`.
- `.claude/hooks/lib/common.mjs:204-256` — `validateConsentMarker(markerPath, gateLabel, cmdHint, expectedSlug='')` — freshness (TTL) + optional slug match, **then deletes the marker** (single-use; see §Single-use below).
- `.claude/hooks/lib/common.mjs:149-156` — `canonicalSlug()`; `:136-143` — `canonicalRel()`.
- `.claude/hooks/lib/common.mjs:88-116` — `emitBlock` / `emitAsk` / `emitAllow`; `:39-45` `readPayload`; `:63-65` `payloadGet`; `:83-85` `projectGet`; `:262-286` `computeProposedContent` (post-write content reconstruction for content-aware guards).

### `track_guard` — the reader of the epic `approved` flag
- `.claude/hooks/track_guard.mjs:44-61` — `epicInheritanceSatisfied(ws)`: checks `ws.epic` non-empty, `.claude/state/epic/<epic>.json` exists, **`es.approved === true` (line 51)**, and all three `pinned_artifacts` (scout/research/spec) resolve on disk.
- `.claude/hooks/track_guard.mjs:63-69` — gate: if `track_id === 'epic-child'` AND target is not under `.claude/state/` AND `epicInheritanceSatisfied()` is false → BLOCK. (Writes under `.claude/state/*` are exempt so `/triage` can repair state.)

### The epic state file + where `approved: true` is written today
- Epic state shape: `.claude/state/epic/<epic>.json` = `{ epic, spec, scout, research, slices[], approved, children[], created_at, updated_at }`.
- `.claude/skills/harness/SKILL.md:134` — the SOP that performs the flip: *"When the `epic` track's `approve-spec` phase completes … also set `approved: true` … never set it ahead of the gate."* **This is the trusted, un-enforced write the task hardens.**
- `.claude/skills/triage/SKILL.md:4` and `:80` — triage reads `approved: true` to auto-select `epic-child`, and documents that the harness performs the flip post-gate. (Read side + documentation, not a second writer.)

## Entry points that reach this code
- **UserPromptSubmit** → `consent_gate_grant.mjs` fires on every user prompt; acts only on the four consent-command patterns. A new `/approve-epic`-style command would enter here.
- **PreToolUse / Write|Edit|MultiEdit** → the guard chain (`spec_approval_guard`, `swarm_approval_guard`, `track_guard`, …) fires on every file write. A new epic-flip guard would register on this event.
- The harness loop (`Skill(harness)`) is the runtime caller that performs the epic `approved: true` write at SKILL.md:134.

## Existing tests
- `tests/track-guard-epic-child.test.mjs` — 7 cases on the epic-child inheritance gate, including **"epic present but approved:false → deny"** and **"approved:true + pins resolve → allow"**. This is the closest existing harness; a new guard's tests should mirror its fixture style (synthesizes epic state JSON on disk, invokes the hook with a payload).
- `tests/branch-aware-git-policy.test.mjs` — `git_commit_guard` consent handling (TTL + protected branch), a second example of consent-marker test setup.
- **No standalone unit tests** today for `consent_gate_grant`, `spec_approval_guard`, or `swarm_approval_guard` — they are exercised only end-to-end. A new guard should ship with direct unit tests (gap worth closing).

## Constraints and co-changes
- **TTL:** `validateConsentMarker` reads `project.json → .consent.gate_marker_ttl_seconds`, default **120s** (`common.mjs:214`). (Note: CLAUDE.md prose says "5-min TTL" for consent; the code default is 120s — version-skew flag, see Risks.) Any new consent class inherits this knob.
- **Hook wiring:** `.claude/settings.json:19-23` (PreToolUse guards) and `:41` (UserPromptSubmit `consent_gate_grant`); mirror `src/settings.template.json`. A new hook registers in both.
- **Governance counts — "22 hooks" asserted in lockstep at:** `CLAUDE.md:7`, `:46`, `:93`, `:184`; `docs/init/seed.md:138` (§4.1), `:550`; `README.md:44`, `:64`, `:175`. Byte-equal mirror `src/CLAUDE.template.md` carries the same Article VIII rows; `src/seed.template.md` mirrors §4.1.
- **Article VIII hook table:** `CLAUDE.md:186-209` (22 rows in order). A new hook adds a row here + the mirror.
- **audit-baseline:** `EXPECTED_HOOKS` set at `.claude/skills/audit-baseline/audit.mjs:91-102` (22 names). A new hook is added here or the audit FAILs.
- **Manifest:** `obj/template/.claude/manifest.json` records baseline-owned hook files + sha256; regenerated by `npm run build` / `scripts/build-template.sh`. A new hook file + any edited file must be rebuilt or the manifest hash check FAILs.
- **Shipped-helper rule:** a new hook/helper ships to consumers; must be `.mjs`/`.js`/`.sh` and listed in the manifest (no Python; no dev-tree path references in shipped prose).

## Patterns in use here
- Guards are thin `.mjs` files that `readPayload()` from stdin, compute the project-relative target via `canonicalRel`, short-circuit with `emitAllow()` for irrelevant paths, and `emitBlock()` with a `cmdHint` otherwise. The consent pattern is exactly two moves: (1) `blockMarkerSelfWrite` so Claude can't forge the marker; (2) `validateConsentMarker(MARKER, …, expectedSlug)` on the gated token-write path. `swarm_approval_guard.mjs` (≈43 lines) is the minimal reference implementation.
- Consent markers are written **only** by `consent_gate_grant` (outside Claude's boundary) and **consumed/deleted** by the guard. The security rests entirely on Claude being unable to reach the UserPromptSubmit write path.

## Single-use marker — the load-bearing finding
- `common.mjs:255` — `validateConsentMarker` calls `unlinkSync(markerPath)` on success: **the marker is single-use, deleted the moment the gated write is allowed.** (`:245` also deletes on TTL-expiry.)
- Sequence at gate A today: user runs `/approve-spec` → `consent_gate_grant` writes `.spec_approval_grant` → Claude writes `spec_approvals/<slug>.approval` → `spec_approval_guard` validates **and deletes** the marker → harness records `spec` in `completed` → **only then** harness flips epic `approved: true` (SKILL.md:134).
- **Therefore the approve-spec marker is already gone when the epic flip happens.** The epic `approved: true` write cannot validate against the spec-approval marker — it is spent one step earlier. This is the central design fork `/research` must resolve: introduce a distinct consent class for the epic flip (its own marker + command + guard) vs. an alternative enforcement that does not depend on the spent spec marker (e.g., deriving authorization from the on-disk `spec_approvals/<slug>.approval` token, which persists). Scout states the fact; research picks the approach.

## Risks / landmines
- **TTL prose/code skew:** CLAUDE.md narrates a "5-min" consent window; `common.mjs:214` defaults to 120s. Don't assume 300s — read the knob. Not introduced by this task, but a new consent class inherits whichever value is live.
- **Adding a hook moves the canonical count (22 → 23) across ≥9 prose sites + the audit set + Article VIII table + both mirrors + the manifest.** Missing any one is an `audit-baseline` FAIL. This is the highest-friction part of the change and must be done in lockstep.
- **`spec_approval_guard:82-91` already blocks `approved: true` in spec _documents_** — do not conflate with the epic _state_ flag; they are different surfaces. A new guard must scope precisely to `.claude/state/epic/*.json` to avoid overlap.
- **`track_guard` exempts all `.claude/state/*` writes** (`:63`) so triage can repair state. A new epic-flip guard targets a path *under* `.claude/state/` — it must therefore be its own guard (track_guard's exemption deliberately does not cover it), and must not be defeated by that same exemption logic.
- **No existing standalone unit tests** for the consent guards — the new guard is the first; budget for building the test fixture pattern (epic state JSON + marker on disk + payload) from `track-guard-epic-child.test.mjs`.
