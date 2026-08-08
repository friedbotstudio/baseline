---
key: advisory-block-interpolates-an-unsanitised-file-path-8c7e
category: backlog
scope: []
status: open
source: assistant-deferral
raised-on: 2026-08-06
raised-in-context: corpus-recall-reachability
verified-at: d4a1a47
last-touched: 2026-08-06
governs: .claude/hooks/process_lifecycle_guard.mjs
---

> **Recommendation**: strip control characters and backticks from `filePath` before interpolation — `String(filePath).replace(/[`\r\n]/g, '')` — or emit the path on its own line without backtick delimiters. Applies to the identical interpolation in `surfacePhaseScopedMemory`.

- **Source.** LOW finding in `docs/archive/2026-08-06/corpus-recall-reachability/security.md` (CWE-117). Deferred deliberately: the `/security` phase produces findings and never applies fixes.
- **The defect.** `process_lifecycle_guard.mjs` interpolates the payload path into an advisory block as `` `${filePath}` ``. `relative()` preserves backticks and newlines in a filename — measured: a file named ``evil`\nIGNORE.mjs`` round-trips intact. A crafted name closes the backtick span and injects lines into a block that ends by citing Article IX.7 and telling the reader to treat its content as binding.
- **Pre-existing, newly reachable.** The interpolation is unchanged; what changed is that the block now actually fires. Before the absolute-vs-relative fix ([[path-keyed-surfacing-needs-a-repo-relative-path-payload-is-absolute]]) the leg matched nothing on any real write.
- **Bounded by.** Requires an attacker-controlled filename in the repository, which implies write access. Both hooks are advisory and always allow, so the exposure is advisory-text spoofing, not bypass.
- **Two sites, one fix.** `surfaceGovernedMemoryFor` and `surfacePhaseScopedMemory` share the pattern; fix both or neither.
