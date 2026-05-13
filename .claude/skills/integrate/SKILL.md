---
name: integrate
owner: baseline
description: Workflow Phase 9 — Integration and Verification. Runs the full test suite, stamps the binding verdict at .claude/state/last_test_result, optionally runs a cross-engine smoke check, and writes harness_state so the harness auto-continues or yields. No subagent delegation.
---

# Prereq

`simplify` in `completed` AND (`security` in `completed` OR `security` in `exceptions`).

# Steps

1. **Verify prereq.** Read `.claude/state/workflow.json` and confirm.

2. **Run the binding test command and stamp the verdict (inlined verify).** This used to be a `verify` skill invocation; the four mechanical operations are inlined here per `.claude/skills/verify/SKILL.md` (the contract doc). In order:
   - Read `.claude/project.json` → `test.cmd`. If absent or empty, the verdict is `FAIL` with reason "project.json not configured" and step 2 stops with that verdict.
   - Run the command via Bash from the project root. Capture stdout, stderr, and exit code. Do not retry. Do not pass `{file}` placeholders — integrate always runs the full suite.
   - Apply verdict rules: `PASS` iff exit code 0 AND at least one test executed AND no failed/errored test; otherwise `FAIL`. A timeout is FAIL. A killed process is FAIL.
   - Atomically write `.claude/state/last_test_result` with exactly four lines plus a single trailing newline:
     ```
     <PASS|FAIL>
     <ISO-8601 UTC timestamp>
     <exact command>
     <exit code>
     ```
     The `verify_pass_guard` hook reads line 1 as the binding verdict.
   - Emit the human-readable inline report (Verdict, Command, Exit code, Output tail) alongside the statefile write.

3. **Read line 1 of `.claude/state/last_test_result`.**
   - **PASS** → continue to step 4.
   - **FAIL** → stop. Do **not** proceed to documentation or commit. Surface the verdict's reason and the output tail to the user. Write `harness_state` per step 5 with `state: "yielded"` and `reason: "integrate failed: <one-line summary>; needs user decision"`. Together with the user, decide whether to loop back to `/tdd` (mechanical bug) or escalate to a spec change.

4. **Cross-engine smoke (optional, fires only if applicable).** Run this step only if **all** of the following hold:
   - `playwright` is declared in `.mcp.json` (check before invoking — never hallucinate the tool).
   - The project has a frontend surface (a `package.json` with a dev/start script, or `docs/site/`, or a similar live-rendered target).
   - The diff under review touched at least one file that affects the rendered UI (anything under `src/`, `app/`, `pages/`, `components/`, `docs/site/`, or styles/templates referenced from those).

   When all three hold:
   - Start the dev server in a background Bash with a known port.
   - For each engine in `chromium`, `webkit`, `firefox` (skip engines outside the project's declared browser-support floor):
     - `mcp__playwright__browser_navigate` to the project's primary surfaces (home, plus any route the diff touched).
     - `mcp__playwright__browser_snapshot` for the accessibility tree; check for unexpected `[disabled]` / `[hidden]` regressions vs the prior snapshot if one exists at `docs/site/_visual/<slug>/<engine>.snapshot.json`.
     - `mcp__playwright__browser_screenshot` per primary surface; save to `docs/site/_visual/<slug>/<engine>-<route>.png`.
   - Surface any console errors, 4xx/5xx network responses, or accessibility-tree diffs as **integrate findings** — these don't block the verify verdict but the user must triage before `/commit`.
   - Stop the dev server.

   Skip silently if any of the three conditions don't hold. Don't surface a "no playwright" warning on every run — backend-only repos shouldn't see noise.

5. **Marker op FIRST, then write harness_state.** Append `"integrate"` to `workflow.json → completed`. Then:
   - On `state: "continue"` (more phases remain): `echo "<slug>" > .claude/state/.harness_active` to refresh the active marker, then write `.claude/state/harness_state` with `{state: "continue", slug, reason}`. The next pending non-excepted phase fires on the same turn via the Stop hook.
   - On `state: "yielded"` (line 1 of `last_test_result` was FAIL — handled in step 3): `rm -f .claude/state/.harness_active`, then write `harness_state` with `{state: "yielded", slug, reason}`.
   The state file carries exactly three keys; no `written_at`, no `tick_count`.
   Tell the user: "Tests green<.|, with cross-engine smoke clean / N findings to triage>. Next: `/document`."

# Constraints

- **Always run the full suite at this phase** — not affected-tests-only. The inlined verify operations run the full project test.cmd.
- **Always preserve the four-line `last_test_result` byte format.** The `verify_pass_guard` hook depends on it.
- **Do not modify code here.** If integrate fails, the fix happens in `/tdd` (bug) or via a spec change (design).
- **Cross-engine smoke is opt-in via `.mcp.json` presence.** Do not install playwright as a side effect of running this skill; the user (or `/init-project`) controls whether playwright is declared.
- **Cross-engine findings are advisory.** They surface to the user; they do not flip the verify verdict from PASS to FAIL.
- **Always write `harness_state` before the terminal message.** The Stop hook reads it to drive auto-continuation; integrate's terminal message ends the turn.
