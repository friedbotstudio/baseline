---
key: .claude/skills/lib/docs-provider.mjs
category: landmarks
scope: [scout, research, tdd, chore]
verified-at: 290a41b
last-touched: 2026-08-25
governs: .claude/skills/lib/docs-provider.mjs,.claude/docs-provider.json,src/docs-provider.template.json,.claude/skills/audit-baseline/expected-baseline.mjs
---

- Role: the one resolver for **which MCP server satisfies Article VI.5** (verify a third-party API against current docs before writing code against it). Exports `readDocsProvider({rootDir})`, plus `DOCS_PROVIDER_POINTER` (`.claude/docs-provider.json`) and `DEFAULT_DOCS_PROVIDER` (`gitmcp`).
- Why it exists: before `release-safety-2026-08-25` T7, the vendor name was written into `CLAUDE.md`, `seed.md`, eight `SKILL.md` files and `audit-baseline`'s expected-server set. Retiring a provider meant editing the governance chain. The pointer holds one field, `provider`, so a swap is a config edit and the governance files never name a vendor.
- **Fails open by construction.** A missing, unreadable or malformed pointer returns the shipped default rather than throwing, so a broken pointer can never stop a skill from checking an API. It is deliberately **not a validator**: it returns whatever name it finds, including a server absent from `.mcp.json` (engineer-confirmed at gate A). The name flows only into a `Set` used for membership comparison — no path is built from it and no shell sees it.
- `rootDir` is load-bearing: `audit-baseline/checks/context.mjs` passes the audited tree's root so a consumer-tree audit expects **that** tree's provider, not this repo's.
- Ships via the recursive `.claude/` rsync in `scripts/build-template.sh`; no manifest entry of its own.
- Caveat: `.claude/docs-provider.json` and `src/docs-provider.template.json` must stay byte-identical, the same rule the other `src/*.template.*` mirrors carry. Switching provider is two edits (the `.mcp.json` entry, then the pointer); self-hosting the shipped one is a single `url` change.
- Related: [[claude-skills-audit-baseline-audit-mjs]] reads this through `DEFAULT_MCP_SERVERS`.
