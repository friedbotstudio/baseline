# Security reports — sprint-dispatch

## sprint-dispatch-2026-06-23.md

# Security Review — sprint-dispatch (slice C) — 2026-06-23

## Summary

Overall risk: **LOW**. No new HIGH/CRITICAL in the slice-C diff. The live MCP `server.mjs` reuses the slice-B CWE-22 guard for its one untrusted path input (`sprint_id`) and delegates to the already-reviewed handlers; the 3 helpers are pure logic with no trust boundary. The new `@modelcontextprotocol/sdk` is a **devDependency** — `npm audit --omit=dev` reports **0 runtime vulnerabilities**, so the *shipped* posture is unchanged.

## Findings

### [LOW] devDependency advisories from the dev tooling tree (not shipped)
- **OWASP**: A06 Vulnerable & Outdated Components | **CWE**: CWE-1035
- **File**: `package.json` (devDependencies), `package-lock.json`
- **Evidence**: `npm audit` → 9 advisories (8 moderate, 1 high). `npm audit --omit=dev` → **0**. None are via `@modelcontextprotocol/sdk` (the SDK package appears in no advisory path). The flagged packages are dev/build/CI tooling: `js-yaml` via `gray-matter`→`@11ty/eleventy`, `qs` via `typed-rest-client` (Stryker's optional dashboard reporter), `tar`/`brace-expansion` via `npm`, and `undici` (the lone HIGH) via `@actions/http-client`/`npm`.
- **Impact**: none on consumers — devDependencies are not installed in production, and sprint mode is off by default. The eleventy/stryker advisories are pre-existing (tracked: `bump-eleventy-fix-liquidjs-critical-rce-vuln-8caf`). The SDK added no *new* runtime exposure.
- **Recommendation**: accept for now (dev-tier, unshipped). The own-package move (backlog) relocates the SDK to its own package's dependency closure, fully isolating it from the baseline. No action required for this slice.

### [LOW — inherited] Stale lock on holder death
- **OWASP**: A04 | **CWE**: CWE-667. The live `server.mjs` runs the slice-B `lib/lock.mjs`, whose stale-lock-on-death hazard is already filed (`sprint-channel-lock-stale-ttl-recovery-medium`). Now MORE relevant since slice C makes the lock run under real peers — but still bounded (single-machine sandbox, off by default). Tracked for slice C runtime hardening.

## Dependencies

`@modelcontextprotocol/sdk@1.29.0` added as an exact-pinned **devDependency** (not `dependencies` — keeps the shipped runtime posture at `['@clack/prompts']`, per `package-metadata.test.mjs`). `npm audit --omit=dev` = 0 vulnerabilities. Consumer SDK delivery is deferred to the own-package move (backlog).

## Out of scope / Noted (checked, safe)

- **`server.mjs` IO boundary (CWE-22):** `channelRoot(sprint_id)` calls `isSafeId(sprint_id)` and throws on a traversal/separator id *before* any path use (`.claude/mcp/sprint-channel/server.mjs:18`). Each of the 7 tools has a zod `inputSchema`, and all delegate to the slice-B handlers (HIGH path-traversal already fixed there). **No new traversal vector.**
- **Closed-enum boundary:** preserved — `send_message`/`broadcast` still route through `validateMessage`, so the channel carries only mechanical coordination.
- **Subagent spawn:** `/sprint-dispatch` spawns the existing bounded `swarm-worker` subagent type (governed by the 25 live hooks) — the SKILL is orchestration prose, not new code-level attack surface. Workers make no decisions (RALPH yield).
- **The 3 helpers** (`sprint-mode`, `peer-select`, `yield-arbiter`) are pure functions over in-process data / the durable plan — no untrusted IO boundary.

