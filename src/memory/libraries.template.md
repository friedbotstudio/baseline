---
owners: [research]
category: validated library APIs
size-cap: 500
key: lib@version
verifies-against: lockfile + context7
---

# Validated library APIs

Library APIs the team has confirmed via `context7` MCP against the version present in this repo's lockfile. Saves a context7 round-trip when a stable choice is referenced again.

Each entry's stable key is `<lib>@<version>`. If the lockfile bumps, re-verify and update the version.

Per-entry shape:

```markdown
## <lib>@<version>

- Role: <what this lib is used for in this repo>
- API: <key symbols / canonical call shape>
- Verified-at: <commit SHA short>
- Last-touched: <ISO date>
- Caveat: <optional — version pin reason, breaking-change notes>
```

---
