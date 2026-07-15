// A4 (roadmap Epic 2) — provenance-anchor verification for the /approve-spec
// token. Stdlib-only hook lib so spec_approval_guard can import it without
// reaching into skill code (and so the skill-side approval-provenance.mjs can
// re-export the same logic — one implementation, no drift).
//
// The /approve-spec token's provenance anchor is a `ledger_ref: <id>` line that
// must resolve to an append-only evidence-ledger entry of kind
// 'approval-provenance' for the same slug. A missing, empty, or dangling anchor
// is unverifiable → the guard BLOCKs (fail-safe). Scope: the /approve-spec gate
// only; /approve-swarm and /grant-commit are untouched.

import { existsSync, readFileSync } from 'node:fs';

// parseAnchorRef(tokenLines) → the ledger entry id named by the token, or null.
export function parseAnchorRef(tokenLines) {
  const line = (Array.isArray(tokenLines) ? tokenLines : []).find((l) => /^ledger_ref:\s*/.test(l));
  if (!line) return null;
  const ref = line.replace(/^ledger_ref:\s*/, '').trim();
  return ref || null;
}

// verifyApprovalAnchor({ slug, tokenLines, ledgerPath }) → { ok, reason, entry? }.
// Reads the ledger with fs (self-contained). Every failure mode returns
// ok:false with a named reason so the guard can surface it.
export function verifyApprovalAnchor({ slug, tokenLines, ledgerPath } = {}) {
  const ref = parseAnchorRef(tokenLines);
  if (!ref) return { ok: false, reason: 'no provenance anchor line in token' };
  if (!ledgerPath || !existsSync(ledgerPath)) return { ok: false, reason: 'evidence ledger absent' };
  let ledger;
  try { ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')); } catch { return { ok: false, reason: 'evidence ledger unreadable' }; }
  const entries = Array.isArray(ledger && ledger.round_trips) ? ledger.round_trips : [];
  const entry = entries.find((e) => e && e.id === ref && e.kind === 'approval-provenance');
  if (!entry) return { ok: false, reason: 'dangling provenance anchor' };
  if (slug && entry.slug && entry.slug !== slug) return { ok: false, reason: 'anchor slug mismatch' };
  return { ok: true, reason: null, entry };
}
