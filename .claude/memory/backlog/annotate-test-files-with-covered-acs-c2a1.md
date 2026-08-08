---
key: annotate-test-files-with-covered-acs-c2a1
category: backlog
scope: [memory-flush]
status: open
raised-on: 2026-07-15
raised-in-context: input-half-governance-class
source: assistant-deferral
estimated-effort: low
verified-at: e9f6961
last-touched: 2026-07-15
---

> verbatim (assistant, 2026-07-15):
> "That's a genuine (if minor) traceability gap, and the right fix is to annotate each test file with the ACs it covers."

- Intent: Annotate each test file with the acceptance-criteria IDs it covers, so per-test-file AC traceability is explicit in the file rather than inferred through a landmark. Surfaced in `input-half-governance-class`, whose five A1–A5 suites (`governance-class-classifier`, `evidence-ladder`, `discipline-mc-probe`, `approval-provenance`, `skip-brainstorm-class`) map to ACs only via landmark `governance-class-input-half-A1-A5`, not in the test files.
