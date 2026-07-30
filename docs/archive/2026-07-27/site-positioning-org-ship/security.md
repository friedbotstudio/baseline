# Security reports — site-positioning-org-ship

## site-positioning-org-ship-2026-07-27.md

# Security Review — site-positioning-org-ship — 2026-07-27

## Summary

Overall risk: **MEDIUM**. Seven tickets reviewed individually per the `power` track's per-ticket rule. Two MEDIUM findings, both in code this branch introduced: an HTML-context escaping gap in the new JSON-LD block (T7), and unvalidated, un-role-gated lane parameters on the new `enqueue_task` channel handler (T3). No CRITICAL or HIGH findings. One pre-existing crash path was **fixed** by this branch (`isSafeId` length bound).

## Per-ticket verdicts (`power_batch_reviews`)

| Ticket | Surface reviewed | Verdict |
|---|---|---|
| T1 governance-amendment | seed.md, CLAUDE.md, annex, PRODUCT.md + mirrors | clean — prose only, no executable surface |
| T2 count-truth-fix | `derive-counts.mjs`, `baseline.cjs`, 4 claim sites | clean — pure functions, no tainted input |
| T6 design-calls-guard-regex-fix | `spec_design_calls_guard.mjs`, `spec-lint/lint.mjs` | clean — see ReDoS note below |
| T3 org-productization | 4 handlers, `safe-id.mjs`, `store.mjs`, `server.mjs`, companion, template | **MEDIUM ×1** + 2 LOW |
| T4 homepage-rewrite | `index.njk` | clean — static markup, no interpolation of external data |
| T5 interior-pages-ia | 8 leads, `nav.json`, `404.njk`, `footer` | clean |
| T7 seo-aeo-surface | `robots.njk`, `llms.njk`, `_layouts/base.njk` | **MEDIUM ×1** |

## Findings

### [MEDIUM] JSON-LD block can be broken out of via `</script>` in an interpolated field

- **OWASP**: A03 Injection | **CWE**: CWE-79 (Improper Neutralization of Input During Web Page Generation), CWE-116 (Improper Encoding)
- **File**: `site-src/_layouts/base.njk:16-56`
- **Evidence**:
  ```njk
  <script type="application/ld+json">
  { "@type": "TechArticle",
    "headline": {{ pageTitle | dump | safe }},
    "description": {{ description | dump | safe }} }
  </script>
  ```
  Demonstrated render with `description = 'x</script><script>alert(1)</script>'`:
  ```html
  <script type="application/ld+json">{"d": "x</script><script>alert(1)</script>"}</script>
  ```
- **Impact**: `dump` produces valid JSON but performs no HTML-context escaping. The `/` in a `</script>` sequence is not escaped, so any value reaching `pageTitle` or `description` that contains a closing script tag terminates the JSON-LD element early and the remainder is parsed as HTML. That yields script execution in the page origin.

  **Not currently exploitable.** Both fields are authored in page frontmatter by maintainers; there is no path from user input, query string, or external data to either value today. The defect is the missing encoding, not a live exploit. It becomes live the moment any page derives a description from external content (a changelog feed, a CMS, an issue title).
- **Recommendation**: Escape the HTML-significant sequences after JSON encoding. Add a Nunjucks filter that post-processes `dump` output, replacing `<` with `<`, `>` with `>`, and `&` with `&`. These are valid JSON string escapes, so the payload still parses as JSON-LD while becoming inert in HTML context. Apply it at all four interpolation sites in the `@graph` block. Do not rely on `| safe` being paired with trusted input — the encoding should hold regardless of source.

### [MEDIUM] `enqueue_task` accepts an arbitrary `write_set` with no role gate

- **OWASP**: A01 Broken Access Control | **CWE**: CWE-862 (Missing Authorization), CWE-20 (Improper Input Validation)
- **File**: `.claude/mcp/sprint-channel/handlers.mjs:145-168`
- **Evidence**:
  ```js
  export function enqueueTask({ channelRoot, task_id, brief, write_set, depends_on, assignee }) {
    if (!isSafeId(task_id)) return { ok: false, error: 'invalid task_id' };
    if (assignee !== undefined && assignee !== null && !isSafeId(assignee)) { ... }
    tasks.push({ id: task_id, write_set: Array.isArray(write_set) ? write_set : [], ... });
  ```
- **Impact**: `enqueue_task` is documented as a lead tool, but the channel enforces no role: any peer registered on the channel can call it. `write_set` entries are not validated or constrained to the repository, and `swarm_boundary_guard` treats the declared `write_set` as the authority for what a claiming peer may write. A peer could enqueue a lane whose `write_set` names paths outside the intended scope and then claim it, widening its own write boundary.

  Bounded by the trust model: peers are Claude Code sessions the human launched locally, in the same repository, on the same machine. This is privilege confusion between cooperating local processes, not a remote attack. It matters because the `write_set` is a *security control* elsewhere in the system, and a control that any participant can rewrite is weaker than it appears.
- **Recommendation**: Constrain `write_set` entries to repository-relative paths (reject absolute paths, `..` segments, and anything resolving outside the project root) at enqueue time, using the same reject-never-repair posture as `assertSafeSlug`. Separately, consider recording the enqueuing `peer_id` on the task so lead-only operations can be asserted later; full role enforcement is a design change and belongs in a follow-up spec, not here.

### [LOW] `message_id` is unvalidated on `answer_peer`

- **OWASP**: A04 Insecure Design | **CWE**: CWE-20
- **File**: `.claude/mcp/sprint-channel/handlers.mjs:113-126`
- **Evidence**:
  ```js
  export function answerPeer({ channelRoot, message_id, answer }) {
    if (typeof answer !== 'string' || answer.trim() === '') return { ok: false, error: 'empty answer' };
    const target = messages.find((m) => m.message_id === message_id);
  ```
- **Impact**: `message_id` reaches only a strict string comparison against stored records; it never becomes a path component, so there is no traversal (CWE-22) exposure. An unknown id returns a named error and mutates nothing, which the tests assert. The gap is consistency: every other identifier on this server passes `isSafeId`, and a reader auditing the file has to trace the value to conclude it is safe.
- **Recommendation**: Add `if (!isSafeId(message_id)) return { ok: false, error: 'invalid message_id' };` for uniformity with the sibling handlers. Behavioural change is nil; the benefit is that the file's validation posture becomes checkable at a glance.

### [LOW] Free-form escalation bodies are a prompt-injection carrier by design

- **OWASP**: A04 Insecure Design | **CWE**: CWE-74
- **File**: `.claude/mcp/sprint-channel/handlers.mjs:103-111`
- **Impact**: `ask_lead(body)` and `answer_peer(answer)` accept arbitrary text that is persisted and later read into another Claude session's context via `sprint_status`. Text crossing a session boundary and landing in a model's context is an injection surface; Anthropic's own channels reference states that an ungated channel is a prompt-injection vector and gates on *sender identity*.

  Here the sender is identity-checked (`isSafeId(peer_id)`, and peers are locally launched), and free-form text is the explicit purpose of the escalation channel — the closed-message-type rule that governs the rest of the channel deliberately does not apply to these two tools. So this is inherent to Article X's design rather than a defect introduced here. Flagged so it is on the record, not because a change is required now.
- **Recommendation**: No code change this cycle. If org mode later admits peers the human did not launch, revisit: escalation bodies would then need sender attestation and the lead's handling of them would need explicit untrusted-content framing.

## Dependencies

No new packages. `@modelcontextprotocol/sdk@1.29.0` and `zod@4.4.3` are pre-existing devDependencies, unchanged by this branch; the four new tools use the same `registerTool(name, {description, inputSchema}, cb)` shape already in use, confirmed against the pinned v1.29.0 documentation. `npm audit` was not run as a new install step; no lockfile change occurred in this diff.

## Out of scope / Noted

- **ReDoS check on the T6 regex.** `/write[_\s]set\*{0,2}\s*(?::|is\s)\s*(.+)$/i` was examined for catastrophic backtracking. The quantifiers apply to disjoint character classes with no nested repetition over a shared class, so input length drives linear work. Not a finding.
- **`isSafeId` length bound is a fix, not a finding.** Before this branch, a charset-valid identifier of arbitrary length passed validation and then threw `ENAMETOOLONG` from the lock `mkdir` — an unhandled filesystem exception reaching a peer instead of a rejection. Now bounded at 128 (`safe-id.mjs:16`).
- **`robots.txt` allows every crawler by design.** Reviewed and intentional (spec D-5): the project is Apache 2.0 and the content is already public. No secrets or private routes are exposed; `robots.txt` is not an access control in any case.
- **`sprint-pool` remains bundled but unregistered.** Unchanged by this branch. It requires `--dangerously-load-development-channels`, a flag that bypasses the channel allowlist; keeping it off the shipped `.mcp.json` is the correct posture and the spec now records the accurate reason (D-2).
- **`_design_call` / `design-call:` annotations** added for drift traceability are inert comments and one JSON key. No execution path.

