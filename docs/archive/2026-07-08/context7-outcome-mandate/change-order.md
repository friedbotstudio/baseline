# Change Order — context7 becomes an outcome-mandate, not a tool-mandate

> **✅ SHIPPED — §1–§7 landed in commit `2c3007e` (2026-07-08).** `CLAUDE.md` VI.5 is now
> "Current docs for third-party APIs", `expected-baseline.mjs` carries the `EXPECTED_MCP_SERVERS` /
> `DEFAULT_MCP_SERVERS` split, and `audit-baseline` passes. This document is retained as the source
> brief for that change and archived alongside the workflow at
> `docs/archive/2026-07-08/context7-outcome-mandate/`.
>
> **⚠️ §8 (read-before-write / VI.7) was NOT shipped by `2c3007e`** — it was a flagged "separate
> concern" and got dropped. It has been re-captured as its own pending brief:
> `docs/handoff/read-before-overwrite-convention.md`. Do not re-run §1–§7; only §8 remains open.

> **Pickup instructions.** This is a complete, self-contained change order. No brainstorming
> is needed — the decision, rationale, exact edits, and verification are all below. Run it via
> `/triage` → **chore** track (`skip_brainstorm: true`, `novelty: novel`). The baseline is on
> `main` (protected, github-flow) — cut a **feature branch first**. Authored from the ERP consumer
> session on 2026-07-08 after discovering the coupling while diagnosing the FMCG web-client work.

---

## 1. Decision

Amend the context7 rule so it mandates the **outcome** — *verify third-party APIs against current
documentation* — rather than the **tool**. `context7` stays the **shipped default satisfier** in
`.mcp.json`; a consumer MAY replace or remove it, provided the verify-against-current-docs outcome
still holds.

## 2. Why (rationale — preserve this reasoning)

The baseline is **open-source**. Article VI.5 / seed §2.5 currently *mandate* the `context7` MCP by
name, and `.mcp.json` ships it. `context7` (`@upstash/context7-mcp`) prompts a login and pushes users
toward a **commercial pricing tier**. Mandating it hard-couples every downstream consumer of an
open-source baseline to a paid third-party signup.

That is a latent **U6 violation** (no irreplaceable dependency) hiding inside an Article. The fix is to
mandate the capability, not the vendor: "don't recall third-party APIs from training data; verify
against current docs" can be satisfied by `context7`, a library's official docs / `llms.txt`, or a
pinned local doc cache. The baseline keeps `context7` as the convenient default so nothing changes for
users who keep it — but the open-source ship no longer forces a commercial signup.

## 3. Governance classification

- **Class-A amendment** (Governance Sufficiency Model D8): it touches `seed.md` genesis + an Article.
  Edit **seed.md first** (precedence: seed > CLAUDE > implementation).
- **Low Threat-Value Tier**: near-zero blast radius (makes a tool optional; keeps it as default).
- High-Class / low-Tier ⇒ heavy human evidence (this document + the reasoning above), light machine
  ceremony (**chore** track, not the full spec pipeline). Record the decision in
  `.claude/memory/decisions.md` (this repo has no `docs/adr/`).

---

## 4. Exact edit surface

Nine edits across five concerns. All old-strings below are verbatim from the current tree
(HEAD as of authoring). Line numbers are hints; match on the text.

### 4a. `docs/init/seed.md` §2.5 (line ~79) — GENESIS, edit first

**OLD:**
```
### §2.5 Context7 rule

When writing or reviewing code that uses any third-party library, always invoke the `context7` MCP to retrieve current API documentation. Never assume an API from training recall.

Prefix: `use context7 to find the current API for [library] [version]`.

The rule applies at every gate: scout, research, spec (the "Libraries and versions" table requires a "confirmed via context7" column), TDD, simplify, security, integrate.
```

**NEW:**
```
### §2.5 Current-docs rule (context7 is the default, not a mandate)

When writing or reviewing code that uses any third-party library, always verify its API against current documentation rather than training-data recall. This is a **capability requirement, not a tool mandate** — it is satisfied by any current-docs source: the `context7` MCP (the shipped default), a library's official docs or `llms.txt`, or a pinned local doc cache. Never assume an API from training recall.

The baseline ships `context7` in `.mcp.json` as the default satisfier so the capability travels with the project; a project MAY replace or remove it provided the verify-against-current-docs outcome still holds. Rationale: the baseline is open-source and SHALL NOT hard-couple downstream users to any one commercial service (login / paid tier) — U6, no irreplaceable dependency.

The rule applies at every gate: scout, research, spec (the "Libraries and versions" table requires a "confirmed against current docs" column), TDD, simplify, security, integrate.
```

### 4b. `docs/init/seed.md` §4.5 (line ~302)

**OLD:**
```
- **`context7`** — `npx -y @upstash/context7-mcp`. Live library documentation lookup. Required by §2.5.
```
**NEW:**
```
- **`context7`** — `npx -y @upstash/context7-mcp`. Live library documentation lookup. The **default satisfier** for §2.5 (replaceable / removable at will — §2.5 mandates the current-docs outcome, not this specific tool).
```

### 4c. `CLAUDE.md` VI.5 (line ~147)

**OLD:**
```
### VI.5 Context7 for third-party APIs
- For ANY third-party library, you SHALL invoke the `context7` MCP before writing code that uses it.
- Prefix: `use context7 to find the current API for [library] [version]`.
- You SHALL NOT recall an API from training data for external libraries.
- `context7` is declared in `.mcp.json` so the capability travels with the repo.
```
**NEW:**
```
### VI.5 Current docs for third-party APIs
- For ANY third-party library, you SHALL verify its API against current documentation before writing code that uses it. You SHALL NOT recall an API from training data for external libraries.
- This is an **outcome mandate, not a tool mandate**: satisfy it with the `context7` MCP (the shipped default), a library's official docs / `llms.txt`, or a pinned local doc cache — whichever the project provides.
- The baseline ships `context7` in `.mcp.json` as the default satisfier so the capability travels with the repo. A project MAY replace or remove it, provided the verify-against-current-docs outcome still holds (U6 — no irreplaceable dependency; the open-source baseline SHALL NOT hard-couple downstream users to a commercial login / paid tier).
```

### 4d. `CLAUDE.md` Article II sub-skill table (line ~33)

**OLD:**
```
| `implement` | `code-structure` | `context7` MCP for any third-party API |
```
**NEW:**
```
| `implement` | `code-structure` | current-docs check for any third-party API (`context7` default) |
```

### 4e. `src/CLAUDE.template.md` and `src/seed.template.md` — byte-equal mirrors (Article XII)

Apply **4a+4b** to `src/seed.template.md` and **4c+4d** to `src/CLAUDE.template.md`, character-for-character.
`audit-baseline` fails if the mirrors drift from `CLAUDE.md` / `docs/init/seed.md`.

### 4f. `.claude/skills/audit-baseline/expected-baseline.mjs` (line 45)

**OLD:**
```js
export const EXPECTED_MCP_SERVERS = new Set(['context7', 'plantuml', 'playwright']);
```
**NEW:**
```js
// Required MCP servers (hard). context7 is the DEFAULT §2.5 satisfier but is optional/replaceable.
export const EXPECTED_MCP_SERVERS = new Set(['plantuml', 'playwright']);
export const DEFAULT_MCP_SERVERS = new Set(['context7']);
```

### 4g. `.claude/skills/audit-baseline/audit.mjs` — two call sites

**Site 1 (line ~486, src-template check) OLD:**
```js
      const missing = ['context7', 'plantuml', 'playwright'].filter(s => !servers.includes(s));
```
**NEW:**
```js
      const missing = ['plantuml', 'playwright'].filter(s => !servers.includes(s));
```

**Site 2 (line ~654, runtime `.mcp.json` check) OLD:**
```js
  for (const s of ['context7', 'plantuml', 'playwright']) {
    add(`mcp server: ${s}`, servers.includes(s) ? 'PASS' : 'FAIL', servers.includes(s) ? '' : 'not declared');
  }
```
**NEW:**
```js
  for (const s of ['plantuml', 'playwright']) {  // required
    add(`mcp server: ${s}`, servers.includes(s) ? 'PASS' : 'FAIL', servers.includes(s) ? '' : 'not declared');
  }
  // context7 — default §2.5 satisfier, optional & replaceable. Report if present; never FAIL on absence.
  if (servers.includes('context7')) {
    add('mcp server: context7 (default)', 'PASS', 'present — default current-docs satisfier');
  }
```
> Optional cleanup: import `EXPECTED_MCP_SERVERS` from `expected-baseline.mjs` instead of re-hardcoding
> the arrays, so the required set has one source of truth.

### 4h. Skill wording — `research`, `implement`, `spec`, `security` SKILL.md

Reword the mandate from tool to outcome. Keep `context7` as the named default/example; do not delete it.
Pattern: "invoke/use `context7`" → "verify against current docs (`context7` is the default)"; a
"confirmed via context7" column becomes "confirmed against current docs". These are hashed files —
the manifest regen in §5 covers the hash change. Occurrence counts at authoring: research 9, implement 5,
spec 3, security 2. Review each in context; several are prose mentions that only need the framing softened.

### 4i. Decision record — `.claude/memory/decisions.md`

Add an entry (via this chore's `memory-flush`, not a hand-write) capturing §1–§2: key `context7-outcome-not-tool-mandate`,
the U6 rationale, and the rejected alternative (keep the hard mandate — rejected: couples an open-source
baseline to a paid signup).

---

## 5. Manifest regeneration (REQUIRED — or the audit self-drifts)

Editing `audit-baseline/*` and the four skill `SKILL.md` files changes their content hashes. The shipped
manifest (`obj/template/.claude/manifest.json` and the template stamp) records those hashes. Regenerate
it so `audit-baseline`'s Article XII drift check stays green:

```
bash scripts/build-template.sh      # re-stamps template/manifest.json (sha256 table)
```
Then confirm the manifest picked up the new hashes for the edited files.

## 6. Verification (definition of done)

1. `node .claude/skills/audit-baseline/audit.mjs` (or the skill) → **PASS**, no `hash mismatch`, no
   `mcp server: context7 ... FAIL`.
2. Temporarily remove `context7` from a copy of `.mcp.json` → audit still **PASS** (proves "removable at
   will"). Restore it (it stays the shipped default).
3. `src/*.template.md` mirrors are byte-equal to `CLAUDE.md` / `docs/init/seed.md` (audit checks this).
4. Grep confirms no remaining "SHALL invoke the `context7` MCP" / "Required by §2.5" absolute-mandate phrasing.

## 7. Propagation to consumers

After this lands + the baseline is released, consumers (e.g. the ERP at `../erp`) pick up the amendment
via `create-baseline upgrade` → `/upgrade-project`, which reconciles the new outcome-mandate text with
each consumer's local customizations (the ERP customized Article XI, not VI.5, so VI.5/§2.5 reconcile
cleanly). **Do not hand-edit consumer copies** — they inherit from here.

---

## 8. Folded-in second fix — the read-before-write convention

Captured from the same ERP session (user directive, verbatim): *"ensure we read before write (we see
this 'Error writing file' all the time)."*

**What it is.** The Write tool refuses to overwrite a file not Read in the current session (a harness
safety guard — not disableable, and correct). The durable fix is a **behavioral convention**: always
Read a file before Write-overwriting it. Advisory by nature; there is no hard gate to add.

**Where.** For it to reach all consumers it belongs in the CLAUDE.md template (travels via adoption),
not just this repo's memory. Recommended: add a short operating rule and mirror it to
`src/CLAUDE.template.md`. Suggested placement — a new bullet in **Article VI** (engineering rules), e.g.:

```
### VI.7 Read before overwrite
- Before overwriting an existing file (Write / truncating edit), you SHALL Read it in-session first.
  The Write tool refuses to blind-overwrite an unread file; Read-first makes the operation reliable and
  prevents the recurring "File has not been read yet" failure. (Partial edits via Edit already require a prior Read.)
```
Mirror byte-equal into `src/CLAUDE.template.md`. If Article VI is close to the 40k CLAUDE.md size cap,
fall back to a `conventions.md` memory entry in this repo plus the template note. Regenerate the manifest
(§5) since CLAUDE.md/template changed.

> This is a **separate concern** from the context7 amendment. It can land in the same chore/commit or a
> sibling one — the baseline session decides. Keep the reasoning attached either way.
