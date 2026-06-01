# Security reports — guard-and-changelog-residual-hardening

## guard-and-changelog-residual-hardening-2026-06-01.md

# Security Review — guard-and-changelog-residual-hardening (Club A) — 2026-06-01

## Summary

Overall risk: **LOW**. This change *is* security hardening — it closes the 7f2c residuals from the infra-hardening review and adds a changelog data-loss guard. The net effect is strictly deny-leaning (the consent-write guard now blocks more, never less) plus a symlink-follow defense and a data-safety guard. No new runtime/network/auth surface, no new dependencies. Reviewed the working-tree diff (5 source files + 3 new tests); full suite 689/689, audit PASS.

## Findings

### [LOW] Consent-write guard remains a deny-lean regex, not a shell parser — by design
- **OWASP**: A04 Insecure Design (defense-in-depth) | **CWE**: CWE-77 (residual)
- **File**: `.claude/hooks/lib/common.mjs` → `writesConsentPath`
- **Status**: the **MEDIUM** `$VAR`-indirected evasion (7f2c) is **fixed**. `CONSENT_REDIRECT_RE` no longer requires a literal `.claude/state/` prefix; it matches a redirect whose target ends in a reserved consent basename however the directory is spelled (`$C/`, `${HOME}/`, `~/`, literal). Verified by 6 probes: no-space redirect, `tee` to a `$VAR` marker, eval-wrapped redirect, and a `spec_approvals/` dir write all block; a substring filename (`commit_consent_notes.txt`, boundary-anchored) and a read mention (`grep commit_consent …`) correctly do not.
- **Residual** (accepted, deny-leaning): full shell tokenization/AST is still not performed. A *benign* command that contains a consent-redirect-shaped substring as **data** (e.g. an `echo`/doc string with a redirect to a `$VAR` consent path inside quotes) is now blocked where it previously wasn't — a false-positive in the **safe** direction (it denies a harmless command, never allows a harmful one). This surfaced live during the review: a read-only analysis command was blocked merely for containing the shape. It matches the backlog framing ("fold into the same segment-aware pass later") and is left for the broader seed.md §16 guard-hardening sweep. The write-signal requirement preserves read-not-blocked behavior, so `cat`/`grep`/`ls` of a consent path still pass.

### [LOW] Grant-marker sweep no longer follows symlinks — fixed
- **OWASP**: A04 | **CWE**: CWE-59 (link following) / CWE-367 (TOCTOU)
- **File**: `.claude/hooks/lib/common.mjs` → `sweepLeakedGrantMarkers`
- The sweep now `lstat`s each marker; a symlink at a marker path is treated as anomalous and only the **link** is removed (never followed to read or delete its target). Verified: a `.commit_consent_grant` symlink pointing at a precious file leaves the target intact. Previously the sweep `readFileSync`'d through the link (to read the epoch) and `rmSync`'d the link; the read-follow is now eliminated.

### [LOW→none] Changelog actuator data-loss guard — added
- **File**: `.claude/skills/changelog/unreleased-writer.mjs`, `changelog.mjs`
- `appendUnderUnreleased` replaces the whole `[Unreleased]` body; supplying fewer entries than present silently dropped the difference (data integrity, A08-adjacent). Now an opt-in `guardShrink` (the actuator enables it; `--allow-shrink` disables for intentional prunes) refuses a shrinking replace before writing. Pure-writer callers and the writer's own unit tests are unaffected (guard off by default). Improves data integrity; introduces no new risk.

## Dependencies

None added. `npm audit` clean (unchanged from prior review).

## Out of scope / Noted

- Full shell-aware tokenization of the consent-write guard (segment isolation so a data-mention-with-redirect-shape isn't blocked) is the deferred seed.md §16 sweep — tracked, not regressed by this change (the deny-lean direction is safe).
- The broadened detector relies on the consent basenames being **reserved** (no legitimate project file is named `commit_consent`, `*_grant`, or lives under `spec_approvals/`/`swarm_approvals/` outside `.claude/state/`). That assumption holds for the baseline.

