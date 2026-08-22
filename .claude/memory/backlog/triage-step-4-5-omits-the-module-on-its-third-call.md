---
key: triage-step-4-5-omits-the-module-on-its-third-call
category: backlog
scope: []
status: open
raised-on: 2026-08-22
raised-in-context: baseline-mcp
source: user-feedback
estimated-effort: small
verified-at: 3eafe4f
last-touched: 2026-08-22
caveat: reported from a CONSUMER INSTALL, not this dev tree. Re-verify against `src/*.template.*` and `obj/template/`, never against the live `.claude/` tree — the dev tree runs ahead of what ships, and an earlier pass in this session verified against it and wrongly cleared three of these items. All seven were re-confirmed against the shipped payload at 3eafe4f.
governs: .claude/skills/triage/SKILL.md
---

> verbatim (user-feedback, 2026-08-22): "fyi, these issues are reported from user installed baseline; so note accordingly"
>
> The report itself, verbatim, from the same session: MEDIUM — `security.sensitive_globs` dropped the baseline's own entries (`.claude/hooks/**`, `.claude/commands/**`, `src/cli/**`, `bin/**`) when `/init-project` tailored the list, so `sensitive-surface.mjs` reported not sensitive for a diff rewriting the commit guard; the chore track's security trigger cannot fire for the class of change it was built to catch. LOW — `terminal-text.mjs` neutralises control characters and backticks but not Unicode bidi overrides, so a filename can render in a misleading order. Baseline drift: no track declares a `review` node yet `track_guard` demands one before `security`, and `deriveExceptions` can never except it; the chore track declares no `internal_phases[]` so its five conditionals derived straight into exceptions; `integrate`'s prereq accepts an excepted `security` but demands a completed `simplify`, which a chore can never have; `triage/SKILL.md` step 4.5 calls `ratio.mjs -> projectRatio` while the module exports `measureLivePayload` and `ratio`; and the power track lists only `requires_git`, not the `requires_config_flag` gate the SOP describes, so it was already selectable before the flag was flipped."

- Intent: step 4.5 names `estimatePayload` from `payload-estimate.mjs` and `envelopeFor` from `envelope.mjs`, then says "then `projectRatio({estimate, envelope})`" with no module at all. `projectRatio` lives in `payload-estimate.mjs`; `ratio.mjs` exports only `measureLivePayload` and `ratio`. A reader looks in the wrong module — which happened in this very session before the export list was checked.
