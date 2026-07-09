# Change Order — Read before overwrite (VI.7 convention)

> **Pickup instructions.** Small, self-contained. No brainstorming needed. Run via `/triage` →
> **chore** track (`skip_brainstorm: true`, `novelty: novel`). Baseline is on `main` (protected,
> github-flow) — cut a **feature branch first**. Touches `CLAUDE.md` + its byte-equal mirror
> `src/CLAUDE.template.md` (manifest-hashed) → regenerate the manifest.
>
> **Provenance.** This was §8 of `context7-outcome-mandate.md`, flagged there as a *separate concern*
> that could ride the same commit or a sibling one. The context7 amendment shipped in `2c3007e`
> (§1–§7) but **dropped §8** — this brief re-captures it so the thread isn't lost. Original user
> directive, verbatim: *"ensure we read before write (we see this 'Error writing file' all the time)."*

---

## Problem

The Write tool refuses to overwrite a file not Read in the current session (a harness safety guard —
not disableable, and correct). Without a standing convention, sessions repeatedly hit the recurring
"File has not been read yet" / "Error writing file" failure on blind overwrites.

## Desired outcome

A **behavioral convention** in the constitution: always Read a file before Write-overwriting it. It is
advisory by nature — there is no hard gate to add (the Write tool already enforces it mechanically); the
value is making the expectation explicit so it travels to every consumer via the CLAUDE.md template.

## Exact edit

Add a new bullet to **Article VI** (engineering rules) of `CLAUDE.md`:

```
### VI.7 Read before overwrite
- Before overwriting an existing file (Write / truncating edit), you SHALL Read it in-session first.
  The Write tool refuses to blind-overwrite an unread file; Read-first makes the operation reliable and
  prevents the recurring "File has not been read yet" failure. (Partial edits via Edit already require a prior Read.)
```

Mirror **byte-equal** into `src/CLAUDE.template.md` (Article XII — `audit-baseline` fails if the mirror drifts).

## Acceptance criteria

1. `CLAUDE.md` Article VI carries a `### VI.7 Read before overwrite` bullet with the SHALL-Read-first rule.
2. `src/CLAUDE.template.md` is byte-equal to `CLAUDE.md` for the new section (audit checks this).
3. `node .claude/skills/audit-baseline/audit.mjs` → PASS (no `hash mismatch`, no size-cap FAIL, no mirror-drift).
4. The manifest is regenerated so the new content hashes are recorded.

## Constraints / governance

- Baseline-owned, manifest-hashed: `CLAUDE.md`, `src/CLAUDE.template.md`. Regenerate via
  `bash scripts/build-template.sh` after editing.
- **Size-cap check:** `CLAUDE.md` SHALL NOT exceed 40,000 chars (Article I.6). If Article VI is near the
  cap, fall back to a `conventions.md` memory entry in this repo **plus** the template note — but the
  template note is the load-bearing half (it's what reaches consumers).
- Class: low blast radius (additive advisory rule, no behavior change) but touches `CLAUDE.md` genesis-
  adjacent surface → treat as Class-A for the mirror + manifest discipline; the human approves at the gate.

## Cross-references

- `docs/archive/2026-07-08/context7-outcome-mandate/` — the shipped sibling amendment this split off from.
- `.claude/memory/conventions.md` — fallback home if the size-cap blocks the CLAUDE.md bullet.
