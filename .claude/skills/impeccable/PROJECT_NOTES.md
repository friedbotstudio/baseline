# impeccable — project-side modifications

Per Apache 2.0 §4(b), files modified from upstream are recorded here.

## 2026-04-28 — Path remap

The vendored `impeccable` skill assumes its scripts live under `.agents/skills/impeccable/`. In this baseline they live under `.claude/skills/impeccable/`. The following files were edited in place to make the runtime invocations match the actual layout:

- `SKILL.md` lines 22, 149 — `.agents/skills/impeccable/scripts/<X>` → `.claude/skills/impeccable/scripts/<X>`.
- `reference/document.md` lines 336, 401 — same replacement.
- `reference/teach.md` lines 15, 133 — same replacement.
- `reference/live.md` line 29 — same replacement.

**Not modified (intentional):**

- `scripts/cleanup-deprecated.mjs` and `scripts/pin.mjs` retain `.agents` in their `['.claude', '.cursor', '.gemini', '.codex', '.agents', ...]` arrays. Those entries identify sibling agent-tool directories the scripts may need to enumerate or clean up, not paths to this skill's own assets. Renaming would corrupt the cross-tool detection.

The `$impeccable teach` / `$impeccable document` / `$impeccable live` shell aliases referenced in upstream prose remain as-is. They're shell shortcuts the user is expected to provide locally; the scripts they wrap are reachable via the corrected `node .claude/skills/impeccable/scripts/<...>.mjs` form.

## License

Upstream skill licensed Apache 2.0. No `LICENSE` / `NOTICE` files were vendored alongside the original — if the upstream attribution is later confirmed and re-vendored, those should land at `.claude/skills/impeccable/{LICENSE,NOTICE}` and be added to `audit-baseline`'s checks.
