// evidence-ledger (Foundation) — append-only JSON ledger of governed maker/checker
// round-trips. The graduation gate reads it; nothing mutates a prior entry.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

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
