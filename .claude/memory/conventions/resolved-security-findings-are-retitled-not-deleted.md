---
key: resolved-security-findings-are-retitled-not-deleted
category: conventions
scope: [security, integrate]
governs: docs/security/**
verified-at: 1b4c320
last-touched: 2026-08-20
---

- A finding fixed inside its own workflow is **re-titled**, never deleted and never left bare. Use `### [HIGH — RESOLVED] <title>` or `### [MEDIUM — REMEDIATED] <title>`, and add a Remediation section carrying the fix, the file:line, and the measurement that proves it.
- The reason is mechanical, not stylistic. `.claude/skills/security/oracle.mjs:12` is `/^###\s+\[(CRITICAL|HIGH)\]\s+(.+)$/gim`, and it emits one BLOCKER per match. A bare `### [HIGH]` heading therefore reads as an **open** finding and the code-review fan-out at `/integrate` returns `BLOCKED`, whatever the prose underneath it says. The heading is the interface.
- Observed 2026-08-13 in `standup-recap-single-pass`: the fan-out blocked on a HIGH that had already been fixed, tested and re-verified in the same cycle.
- The spelling is precedent, not invention: archived reports already carry `### [HIGH — RESOLVED]` twice and `### [MEDIUM — REMEDIATED]` three times, plus `[LOW — inherited]` and `[MEDIUM — FIXED]`. Check `docs/archive/*/*/security.md` before coining a new one.
- **Do not clear the gate by deleting the finding.** The report is the record of what was found; removing the heading destroys the history and silently converts an oracle into decoration. Re-titling keeps both the record and the correct verdict, because zero *open* Critical/High is the true state.
- Same rule read the other way: if a finding is genuinely still open, leave the bare severity heading alone and let it block. The BLOCKED verdict is the feature.
