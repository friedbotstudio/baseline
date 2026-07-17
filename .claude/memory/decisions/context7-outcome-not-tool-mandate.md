---
key: context7-outcome-not-tool-mandate
category: decisions
scope: [spec]
verified-at: a027d2e
last-touched: 2026-07-08
---

- Decision: seed §2.5 / Article VI.5 mandate the OUTCOME (verify third-party APIs against current documentation), NOT the tool. `context7` stays the shipped default satisfier in `.mcp.json`; a project MAY replace or remove it provided the verify-against-current-docs outcome still holds. Satisfiers: the `context7` MCP (default), a library's official docs / `llms.txt`, or a pinned local doc cache.
- Rationale (U6 — no irreplaceable dependency): the baseline is open-source; hard-mandating `@upstash/context7-mcp` (which prompts a login / pushes a commercial tier) coupled every downstream consumer to a paid signup — a latent U6 violation hiding inside an Article. Mandate the capability, not the vendor.
- Rejected alternative: keep the hard `context7` mandate — rejected because it couples an open-source baseline to a paid third-party signup.
- Governance class: Class-A amendment (seed §2.5 genesis + Article VI.5), Low Threat-Value Tier (makes a tool optional, keeps it as default) → heavy human evidence (the change order), light machine ceremony (chore track).
- Enforcement change: `audit-baseline/expected-baseline.mjs` splits the roster into `EXPECTED_MCP_SERVERS` (required: plantuml, playwright) + `DEFAULT_MCP_SERVERS` (context7, optional/replaceable); the runtime `.mcp.json` check reports context7 when present but never FAILs on its absence (proven: audit PASSes with context7 removed). `deriveCounts` still reports 3 shipped servers (required + default).
- Folded-in: the read-before-overwrite convention (change order §8) landed as [[read-before-overwrite]] in conventions.md rather than a CLAUDE.md VI.7 — CLAUDE.md was within ~1KB of its 40k hard cap after the VI.5 rewrite, so the §8 size-cap fallback applied. VI.5 rationale was kept in seed §2.5 (genesis) and trimmed in CLAUDE.md (binding-only, Article I.6); the char-budget test was bumped 38500→38800 per precedent, byte budget unchanged (headroom preserved).
- Source: docs/handoff/context7-outcome-mandate.md (ERP consumer session, 2026-07-08).
