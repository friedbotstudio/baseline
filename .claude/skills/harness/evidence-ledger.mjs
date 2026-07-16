// evidence-ledger (Foundation) — append-only JSON ledger of governed maker/checker
// round-trips. The graduation gate reads it; nothing mutates a prior entry.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { readPlan, appendRoundTripArtifact } from './plan-store.mjs';

/** Read the ledger, or an empty ledger when the file is missing/unreadable. */
export function readLedger(ledgerPath) {
  if (!existsSync(ledgerPath)) return { round_trips: [] };
  try {
    const parsed = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    return Array.isArray(parsed.round_trips) ? parsed : { round_trips: [] };
  } catch {
    return { round_trips: [] };
  }
}

/** Append one round-trip; creates the parent dir and the file on first write. */
export function appendRoundTrip(ledgerPath, roundTrip) {
  const ledger = readLedger(ledgerPath);
  ledger.round_trips.push(roundTrip);
  mkdirSync(dirname(ledgerPath), { recursive: true });
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
  return ledger;
}

/**
 * Migration (AC-007): record a round-trip durably through the plan object when one
 * exists for `slug`, while preserving the on-disk projection at `ledgerPath` (which
 * graduation-gate and existing readers depend on). Back-compat: with no plan on
 * disk, this is identical to appendRoundTrip — projection only — and returns null.
 * Returns the updated plan when mirrored.
 */
export function recordRoundTripOnPlan({ slug, rootDir, ledgerPath, roundTrip }) {
  appendRoundTrip(ledgerPath, roundTrip);
  const plan = readPlan(slug, rootDir);
  return plan ? appendRoundTripArtifact(plan, roundTrip) : null;
}

/**
 * A4 — append an approval-provenance entry for a spec's /approve-direction grant and
 * return { ledger, entry }. The entry id is deterministic (`ap-<slug>-<n>`, n =
 * the round_trips length at append time) so deriveApprovalToken can anchor the
 * token to it. Append-only, same as every other ledger write.
 */
export function appendApprovalProvenance(ledgerPath, { slug, class: cls, evidence_verdict, spec_hash } = {}) {
  const before = readLedger(ledgerPath);
  const entry = {
    kind: 'approval-provenance',
    id: `ap-${slug}-${before.round_trips.length}`,
    slug,
    class: cls,
    evidence_verdict,
    spec_hash,
  };
  const ledger = appendRoundTrip(ledgerPath, entry);
  return { ledger, entry };
}
