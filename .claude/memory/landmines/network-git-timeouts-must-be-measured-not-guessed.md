---
key: network-git-timeouts-must-be-measured-not-guessed
category: landmines
scope: [tdd, implement]
governs: .claude/skills/standup/**
verified-at: c53a121
last-touched: 2026-08-13
---

- Trap: a plausible-looking timeout on a network git operation produces intermittent false failures that look like flakiness.
- Measured 2026-08-13, five consecutive `git ls-remote --tags origin` runs against this repo's GitHub remote: **3.5s / 7.0s / 6.8s / 12.3s / 12.9s**. TLS and auth setup dominate, and a cold connection routinely passes ten seconds.
- Consequence of the 10s bound first shipped in `gather.mjs`: `remote-probe-failed` for a perfectly healthy remote on roughly half the runs. That is worse than not probing, because a false "could not check" trains the reader to ignore the marker. Raised to 30s, verified 6/6 clean.
- Caught by live smoke, NOT by tests. The fixtures use local bare repos that answer in milliseconds, so no test exercises the real latency distribution. When a bound guards a network call, measure the real thing before choosing the number, and record the measurements next to the constant.
- Pair with `killSignal: 'SIGKILL'`: Node's docs state `execFileSync` keeps waiting for a child that ignores the signal, so the default SIGTERM makes the timeout advisory rather than a bound.
