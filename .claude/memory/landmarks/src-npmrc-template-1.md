---
key: src/.npmrc.template:1
category: landmarks
scope: [scout]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: pristine ship-time bytes for the target project's `.npmrc`. Contents are exactly `ignore-scripts=true\nmin-release-age=7\n` (38 bytes). Materialized into `<target>/.npmrc` by `src/cli/install.js → materializeNpmrc()` during freshInstall/forceInstall.
- Caveat: this file is NOT overlaid into `obj/template/` by `scripts/build-template.sh` — npm pack drops `.npmrc` from published tarballs regardless of `package.json → files`. The bytes ship in `src/.npmrc.template` (non-excluded basename) and `install.js` reads them at install time. The `ignore-scripts=true` default protects downstream consumers from postinstall-script supply-chain attacks; `min-release-age=7` (npm 11+) refuses to install registry versions younger than 7 days. AC-007 of the supply-chain-hardening workflow asserts these bytes are byte-identical end-to-end. Tied to runbook §Pre-publish hygiene sweep `~/.npmrc` operator defaults.
