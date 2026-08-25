# Security reports — release-safety-2026-08-25

## release-safety-2026-08-25-2026-08-25.md

# Security Review — main (release-safety-2026-08-25) — 2026-08-25

## Summary

Overall risk: **LOW**. One MEDIUM finding: the new corpus-gate output renders corpus-controlled strings straight to the terminal, while eight other renderers in this repo already route the same class of value through the shared sanitizer. Everything else in the batch either narrows a trust boundary or leaves it untouched. No new dependencies, no secrets, no crypto, no network surface added.

The diff is 43 files, 387 insertions, 98 deletions, plus 11 untracked files — under the 2000-line review ceiling.

## Per-ticket verdicts (`power` track — 7 tickets, none skipped)

| Ticket | Surface reviewed | Verdict |
|---|---|---|
| T1 | `workspace/delta.mjs`, 5 `.puml` shards | CLEAN |
| T2 | `.github/workflows/release.yml` | CLEAN |
| T4 | `docs/runbooks/npm-publish.md` | CLEAN — docs only |
| T5 | `.releaserc.json`, runbook scope table | CLEAN |
| T6 | `harness/checker-fanout.mjs`, `checkers/spec-shippability.mjs` | CLEAN |
| T7 | pointer + resolver, `.mcp.json`, `renames.js`, governance chain, 8 skill docs | CLEAN |
| T8 | `system-reconcile/cli.mjs`, `reconcile-report.mjs`, `archive/SKILL.md` | **1 MEDIUM** |

## Findings

### [MEDIUM] Corpus-controlled strings reach the terminal unsanitized in the new gate output — **RESOLVED 2026-08-25**

**Resolution.** Fixed in this workflow at the engineer's direction rather than deferred, because the sink was introduced by this batch. `memberLabel` now clips through `.claude/skills/lib/terminal-text.mjs`, which neutralises control bytes and bounds the length. The renderers moved out of `cli.mjs` into `gate-render.mjs` so the fix is testable: `cli.mjs` runs `dispatch(...)` at module scope, so importing it executes the CLI, and a renderer nothing can import is a renderer nothing can test. Three tests were written RED first and now pass — a forged erase-line escape, a 5,000-character id, and a structural check that the sink imports the shared sanitizer. Full suite 3,362 pass / 0 fail.

The original finding follows, unedited.


- **OWASP**: A03 – Injection | **CWE**: CWE-150 (Improper Neutralization of Escape Sequences)
- **File**: `.claude/skills/system-reconcile/cli.mjs:31`
- **Evidence**:
  ```js
  function memberLabel(member) {
    if (typeof member === 'string') return member;
    return member?.id ?? member?.element_id ?? member?.path ?? JSON.stringify(member);
  }
  // ...
  ...failures.map(({ section, members }) => `${section}: ${members.map(memberLabel).join(', ')}`),
  ```
- **Impact**: `id`, `element_id` and `path` are read from element records and shard filenames under `docs/system/`. A record carrying ANSI escape sequences renders them live in the operator's terminal at the moment the gate fails — the reader can be shown a "GATE PASSED" line that the gate never emitted. An unbounded `id`, or the `JSON.stringify` fallback on a large object, floods the same output. This is the identical shape already fixed twice in this repo: the `code-structure` oracle's tainted-path finding (`9e12`) and `process_lifecycle_guard`'s advisory block (`8c7e`). `.claude/skills/lib/terminal-text.mjs` exists for exactly this, and eight modules already route through it — this new sink does not.
- **Precondition, stated plainly**: the input is repo-controlled. An attacker needs write access to `docs/system/` before this is reachable, which is why it is MEDIUM rather than HIGH. It is reported because the repo's own convention treats this class as worth fixing, and a new sink that skips the shared sanitizer erodes that convention.
- **Recommendation**: route the return value through `clip` from `.claude/skills/lib/terminal-text.mjs`, matching `simplify/oracle.mjs` and `code-structure/oracle.mjs`. One import and one wrap; it also bounds the length.

## Dependencies

No change to `package.json` or `package-lock.json` in this diff. No new packages, so no CVE check applies.

`.mcp.json` retires one server declaration and adds another. The replacement (`gitmcp`) is a **remote streamable-HTTP endpoint**, not an `npx`-fetched package, so it introduces no new node_modules supply-chain surface. It does introduce an outbound HTTP dependency on a third-party host for documentation lookups, which is the same trust posture the retired `npx`-fetched server had, minus the package-install step. Apache-2.0, no authentication, self-hostable — a consumer who does not want the outbound call changes the `url` or drops the entry, and Article VI.5 explicitly permits both.

## Out of scope / Noted

- **The pointer is deliberately not a validator.** `readDocsProvider` returns whatever name it finds, including a server absent from `.mcp.json`, and falls back to the shipped default on any unreadable pointer. That was confirmed by the engineer at gate A (no pointer-vs-`.mcp.json` validation for now). The returned name flows only into a `Set` used for membership comparison in `audit-baseline` — **no path is constructed from it and no shell sees it**, so a hostile pointer value cannot traverse or execute. An undeclared name surfaces as a missing tool at call time.
- **`reconcileForGate` fails closed on an unreadable corpus** (`produced: false` → the gate fails). That is the correct direction and closes a real hole: a crashed read previously rendered as seven empty arrays, indistinguishable from a clean corpus.
- **The new CI step adds no action reference**, so the SHA-pinning invariant is untouched. It is a `run:` step inside the existing `pre-publish-checks` job.
- **Two `inherited:` size flags** from `/simplify` (`delta.mjs`, `checker-fanout.mjs`) are maintainability, not security.

