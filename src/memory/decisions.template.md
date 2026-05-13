---
owners: [spec, rca]
category: architectural decisions
size-cap: 500
key: short slug
verifies-against: spec/rca artifact
---

# Architectural decisions

Why this repo took the path it took. Includes rejected alternatives so a future session doesn't re-litigate.

Each entry's stable key is a short slug (e.g., `auth-jwt-vs-session`, `worktree-isolation`).

Per-entry shape:

```markdown
## <short-slug>

- Decision: <what was chosen>
- Rationale: <why — the constraint or evidence that decided it>
- Rejected alternatives:
  - <alt 1> → <why rejected>
  - <alt 2> → <why rejected>
- Source: <spec slug / rca slug / conversation>
- Verified-at: <commit SHA short>
```

---
