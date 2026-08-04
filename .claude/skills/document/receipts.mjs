// Receipt writer for Phase 10 — the producer half of the documentation routing gate.
//
// `document-gate.mjs` verifies that each required delegate ran; this module is how a
// delegate says so. Shipping the checker without the producer left the gate an orphan
// that could only ever BLOCK, which is how it was first written.
//
// A receipt asserts one thing: delegate D ran against surface S. It is evidence, not
// permission — recording one for work that was not done converts the gate into
// decoration, which is the single way this mechanism fails.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { assertSafeSlug } from '../../hooks/lib/slug.mjs';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// CWE-22, same policy as the gate: validate before constructing a path, REJECT never
// repair. A normalized slug would silently write the receipt somewhere else.
export function receiptPath(slug, rootDir = ROOT) {
  assertSafeSlug(slug, 'document-receipts');
  return join(rootDir, '.claude', 'state', 'document', `${slug}.json`);
}

export function readReceipts({ slug, rootDir = ROOT } = {}) {
  const path = receiptPath(slug, rootDir);
  if (!existsSync(path)) return { slug, receipts: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return { slug, receipts: Array.isArray(parsed.receipts) ? parsed.receipts : [] };
  } catch {
    // A malformed file proves nothing. Return empty so the gate BLOCKS rather than
    // treating unreadable state as satisfied.
    return { slug, receipts: [] };
  }
}

// Idempotent per (surface, delegate): re-recording the same run is a no-op rather
// than a duplicate row.
export function recordReceipt({ slug, surface, delegate, rootDir = ROOT } = {}) {
  if (!slug || !surface || !delegate) {
    throw new Error('document-receipts: slug, surface and delegate are all required');
  }
  const state = readReceipts({ slug, rootDir });
  const already = state.receipts.some((r) => r.surface === surface && r.delegate === delegate);
  if (already) return { recorded: false, receipts: state.receipts.length };

  state.receipts.push({ surface, delegate });
  const path = receiptPath(slug, rootDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return { recorded: true, receipts: state.receipts.length };
}
