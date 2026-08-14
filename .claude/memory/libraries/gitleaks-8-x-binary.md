---
key: gitleaks@8.x-binary
category: libraries
scope: [research]
verified-at: 8201af6
last-touched: 2026-08-14
caveat: version floats with the operator's install; the invocation form is the stable fact — re-verify via context7 if the scan flags change.
---

- Role: secrets scanner invoked by `scripts/ci/require-gitleaks.sh` (CI posture, slice J1). NOT an npm dep — a system binary (`brew install gitleaks`); no lockfile pin possible.
- Load-bearing API fact (context7-verified 2026-07-04): the staged pre-commit scan is `gitleaks git --pre-commit --staged` — modern v8 subcommands are `git`/`dir`/`stdin`; the old `gitleaks protect --staged` form is gone from the current README. Do not recall `protect` from training data.
