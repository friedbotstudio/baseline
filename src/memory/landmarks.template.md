---
owners: [scout]
category: codebase landmarks
size-cap: 500
key: path:line
verifies-against: git
---

# Codebase landmarks

Where things live in this repo. The `scout` skill cites these and re-verifies before use; failed verifications are corrected or deleted in the same run.

Each entry's stable key is `path:line`.

Per-entry shape:

```markdown
## <path:line>

- Role: <what lives here, why it matters>
- Verified-at: <commit SHA short>
- Last-touched: <ISO date>
- Caveat: <optional — gotcha, neighbour file that must change with this one, etc.>
```

---
