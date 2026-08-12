---
key: shipped-file-pristine-is-byte-identity-not-a-heuristic-c8a7
category: conventions
scope: [scenario]
source: assistant-deferral
raised-on: 2026-08-12
raised-in-context: consumer-install-defects
verified-at: ce8c7cd
last-touched: 2026-08-12
governs: tests/build-template-memory-excludes.test.mjs, src/memory
---

- Convention: assert "this shipped file is pristine / carries no content" by BYTE-IDENTITY against its source template — `readFileSync(shipped) === readFileSync('src/memory/<c>.template.md')` — never by inspecting the body for content-shaped patterns.
- Why: the pristine stubs legitimately contain `## <path:line>` as a SCHEMA PLACEHOLDER. A test counting `^##` headings as entries reports a correct store as carrying one, which is how the first version of this assertion failed against a store that was right. Byte identity proves the property outright and cannot be fooled by placeholder syntax.
- Second half of the rule: do not `continue` past a missing file inside such a loop. Let the read throw. A silent skip is how an absent shipped file passes the test meant to require it — the original had exactly that hole alongside the heuristic.
- Related: [[anti-drift-tests-compare-against-the-live-oracle-b4d2]].
