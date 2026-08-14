---
key: src/cli/doctor.js:46
category: landmarks
scope: [scout]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: `runDoctor(target, options={})` — read-only drift check against `<target>/.claude/.baseline-manifest.json`. Returns `{exitCode, strict, matched, customized, missing, added, tampered}`. With `options.strict: true`, any `customized` entry promotes exitCode to 1 and populates `tampered[]` with `{path, shipped, observed}` sha256 hex triples. Without `--strict`, customized is informational (legacy default exitCode 0). `formatReport(report)` at `src/cli/doctor.js:114` renders `TAMPERED: <path>  shipped=<sha256>  observed=<sha256>` lines when `tampered[]` is populated.
- Caveat: `--strict` is the post-install supply-chain tampering detector for the AC-006 contract (supply-chain-hardening workflow, 2026-05-13). `bin/cli.js` routes the flag via `parseArgs` and passes it as `{strict: !!values.strict}` to `runDoctor`. The `tampered[]` array exists ONLY when `customized.length > 0`; downstream consumers should `Array.isArray(report.tampered) && report.tampered.length > 0` before reading.
