// spec-content-hash.mjs — Foundation: content-addressed identity for an approved
// spec, so gate A can detect a post-approval amendment even for an untracked
// (first-time) spec whose git SHA is `N/A`.
//
// The /approve-spec token records `computeSpecContentHash(spec bytes)`; the harness
// resume path recomputes it against the live spec and compares. A mismatch means the
// spec changed after approval → re-yield at gate A. Pure and stdlib-only (node:crypto),
// so it runs identically in the command SOP and the harness resume.

import { createHash } from 'node:crypto';

// sha256 hex of a spec's bytes. Accepts a string or a Buffer; throws on anything
// else so a caller never silently hashes a coerced value (a stringified object
// would produce a stable-but-meaningless hash).
export function computeSpecContentHash(bytes) {
  if (typeof bytes !== 'string' && !Buffer.isBuffer(bytes)) {
    throw new TypeError('computeSpecContentHash expects a string or Buffer');
  }
  return createHash('sha256').update(bytes).digest('hex');
}

// The resume check: does the token's recorded hash still match the live spec?
// Fail-safe — an absent, blank, or `N/A` token hash returns false (re-yield), so a
// token that predates content-hashing never silently satisfies the gate.
export function compareSpecHash(tokenHash, specBytes) {
  if (typeof tokenHash !== 'string') return false;
  const recorded = tokenHash.trim();
  if (recorded === '' || recorded === 'N/A') return false;
  return recorded === computeSpecContentHash(specBytes);
}
