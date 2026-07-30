## Guard scripts

A guard is a Node ESM script that the runtime invokes as a subprocess at a tool-call boundary, passing the pending call on standard input and reading a decision back from the exit code. Guards are ordinary scripts with no framework around them.

If a guard exits `0`, the call proceeds unchanged. Any non-zero exit stops the call, and the reason the guard wrote to standard error is returned to the model in place of a tool result. A guard may also exit `2` to report a failure that occurred after the call ran; the two `PostToolUse` runners, `lint_runner` and `test_runner`, use this.

The roster is derived from `settings.json` at build time, so a guard added to the directory will appear without a separate edit. One script, `notify`, is wired on three events and counts once per event.

## Outcomes

Each guard resolves to exactly one of three outcomes.

- **block** — the tool call never runs, and the model receives the guard's reason in place of a result.
- **ask** — the call waits for the user to decide before it proceeds.
- **allow** — the call proceeds. Advisory guards add context here and always allow.

When several guards are wired on the same event they run in declaration order, and the first block wins; the remaining guards are skipped. This matters if an advisory guard sits after a blocking one, because its context will never be surfaced on a blocked call.

## Consent paths

Guards that gate consent are the exception to the derivation rule above. Their marker paths must be resolved at run time from the workflow slug, since a stale marker should never satisfy a later workflow. Markers are single-use and they expire (15 minutes for commit consent, 5 for push).

A guard cannot write its own marker. The marker is written by a hook on the user-prompt boundary, which the model has no path to reach.

## Amendment

To change a guard, disable one, or work around one, you need the user's explicit approval first. The genesis specification is then amended, and only afterwards does the matching edit to `settings.json` land. The guard count is part of the constitution: the audit compares it against both the genesis spec and the shipped manifest, and a mismatch will fail the build.
