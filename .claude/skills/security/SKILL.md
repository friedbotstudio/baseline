---
name: security
owner: baseline
description: Workflow Phase 8 (optional) — OWASP-aligned security review of pending code changes. Produces a prioritized findings report (Critical/High/Medium/Low) mapped to OWASP Top 10 and CWE IDs. Output at `docs/security/<slug>-<date>.md`. Read-only.
---

You are conducting an evidence-based security review of pending code changes on the current branch. No fixes are applied here — fixes go through `/tdd` or a follow-up patch. This skill produces findings.

# Prereqs

- `simplify` in `completed`.

Per `workflow.json → exceptions`, security may be skipped for low-risk changes. Triage decides.

# Scope

Review the current branch's changes (git diff vs. base branch) and any files the user names explicitly. Do **not** review the full repo history.

Focus areas, in order:

1. **OWASP Top 10 (2021)** — A01 Broken Access Control, A02 Cryptographic Failures, A03 Injection, A04 Insecure Design, A05 Security Misconfiguration, A06 Vulnerable & Outdated Components, A07 Identification & Authentication Failures, A08 Software & Data Integrity Failures, A09 Logging & Monitoring Failures, A10 SSRF.
2. **Secrets hygiene** — hardcoded tokens, API keys, private keys, `.env` leakage.
3. **Input validation / output encoding** at trust boundaries (HTTP handlers, CLI entrypoints, message consumers, file parsers).
4. **AuthN / AuthZ** — missing checks, IDOR, privilege confusion, session fixation.
5. **Cryptography** — weak algorithms, hardcoded IVs, ECB mode, unsalted hashes, homegrown crypto.
6. **Dependency risk** — newly added packages; check known CVEs via context7 / WebFetch advisory DBs.

# Method

1. `git diff --stat` then `git diff` against the base branch.
2. For each changed file, identify the trust boundary (if any) and enumerate tainted data flows.
3. For any library's secure-usage API in doubt, hit the `context7` MCP — never recall crypto/auth APIs from training data.
4. Run existing security linters if configured (`bandit`, `semgrep`, `gosec`, `npm audit`, `pip-audit`) via Bash. Do **not** install new tools.

# Output

Write the report to `docs/security/<slug>-<date>.md`. Format:

```
# Security Review — <branch name> — <date>

## Summary
<1–3 sentences. State overall risk: LOW | MEDIUM | HIGH | CRITICAL.>

## Findings

### [CRITICAL|HIGH|MEDIUM|LOW] <short title>
- **OWASP**: <A0X - category> | **CWE**: CWE-XXX
- **File**: path:line
- **Evidence**:
  ```
  <5–10 lines of the offending code>
  ```
- **Impact**: <what an attacker can do>
- **Recommendation**: <concrete fix, not "consider sanitizing">

## Dependencies
<new packages in this diff, with CVE check results>

## Out of scope / Noted
<Observations not in the diff but worth flagging for later.>
```

# Decision after review

- **CRITICAL or HIGH findings** → surface them, do **not** mark this phase complete. Ask the user how to proceed (fix now, track and accept risk, or defer).
- **Only MEDIUM/LOW** → append `"security"` to `workflow.json → completed`. Tell the user: `Security review at <path>. Next: /integrate.`

# Constraints

- **Never modify project code.** This skill is read-only against project files. The only write is to `docs/security/`.
- **Never claim PASS/clean without enumerating what you checked.**
- **Speculative findings ("could potentially")** → mark LOW and say so.
- **Don't dump full file contents.** Cite `path:line` and show minimal snippets.
- **If the diff is empty or larger than ~2000 lines**, report that and stop.
