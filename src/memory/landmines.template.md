---
owners: [security, integrate, scout]
category: gotchas and recurring true positives
size-cap: 500
key: path:line or short slug
verifies-against: git
---

# Landmines

Things that have bitten before and will bite again. "Editing X without also editing Y breaks Z." Recurring true positives from security review. Version skew traps.

Each entry's stable key is `path:line` or a short slug.

Per-entry shape:

```markdown
## <path:line or slug>

- Path: <file/symbol involved>
- Trap: <what goes wrong, plain language>
- Mitigation: <what to check / do instead>
- Verified-at: <commit SHA short>
- Last-touched: <ISO date>
```

---
