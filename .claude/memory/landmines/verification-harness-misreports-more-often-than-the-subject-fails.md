---
key: verification-harness-misreports-more-often-than-the-subject-fails
category: landmines
scope: [tdd, integrate]
verified-at: 6ae2955
last-touched: 2026-07-09
---

- Path: any Bash-driven check in a workflow phase that parses tool output, exit codes, or file contents (verify-tick, integrate, ad-hoc `grep`/`node --test` verification).
- Trap: three DISTINCT verification-harness bugs misreported in one workflow (`power-track-completion`, 2026-07-09), each nearly producing a false verdict on PASSING work: (1) **`node --test ... | tail`** — the pipeline's exit code is `tail`'s (0), masking the test runner's real exit; capture the runner's `$?` BEFORE any pipe, or write to a file and grep that. (2) **zsh does NOT word-split unquoted parameters** — `F="a.mjs b.mjs c.mjs"; node --test $F` passes ONE filename `"a.mjs b.mjs c.mjs"` and silently matches nothing; a `for id in ...; do grep "$id" $F; done` then reports EVERY id missing though all are present. Pass paths as separate quoted vars (`"$A" "$B" "$C"`) or a real array. (3) **wrong reporter prefix** — `node --test` default (`spec`) reporter emits `ℹ pass 1479` / `ℹ fail 0`, NOT `# pass`/`# fail`; a `grep -E "^# fail"` matches nothing and a naive verdict prints FAIL on a green run. Use `--test-reporter=tap` for `# ok/not ok`, or grep the `ℹ` lines.
- Rule (the load-bearing lesson): **a verification reading that is UNIFORM or TOTAL — "every id missing", "all FAIL", "0 tests" — is more likely the CHECK breaking than the subject.** Before acting on a total-failure signal, re-run the check a different way (raw file read, different reporter, explicit paths) to confirm the harness itself is sound. `verify_pass_guard` is the backstop for the specific PASS-when-FAIL case, but most misreports are the inverse (FAIL-when-PASS) and have no guard — they waste a re-run or trigger a spurious yield.
- Companion: [[baseline-self-dev-verify-audit-not-unit-suite]] (which BINDING command runs); this entry is about the harness MISREADING whichever command it ran.
