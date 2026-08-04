// Domain — the discard ledger (spec ticket D).
//
// READ THE SCOUT NOTE BEFORE CHANGING THIS. The capture leg is NOT un-deduped: it
// dedupes against the wrong LIFETIME. memory_stop.mjs builds `existingKeys` from
// the CURRENT `_pending.md` body and skips on a hit, and
// tests/memory-stop-dedup.test.mjs guards exactly that. The re-emission happens
// because /memory-flush RESETS the body, discarding the dedup state along with the
// candidates it curated.
//
// So the job here is to persist a curation decision ACROSS that reset — not to add
// a second dedup. Adding one would duplicate working code and risk regressing the
// suite that defends it.
//
// The ledger lives OUTSIDE the flush reset path for the same reason `_thread.md`
// does: it is durable local state, gitignored in content, and its whole value is
// surviving the operation that clears everything around it.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DISPOSITIONS = new Set(['promoted', 'discarded']);

// The ONE definition of a candidate key's shape. memory_stop builds every key
// through candidateKey() and recordCuration validates through isCandidateKey(),
// so the builder and the validator cannot drift apart — which is exactly how a
// curator following Step 4.5 came to record bare keys that matched nothing.
// decidedKeys() feeds memory_stop's suppression set by exact string, so a key in
// any other shape is stored and inert: the ledger looks healthy and suppresses
// nothing.
export const CANDIDATE_SEPARATOR = ' → ';

export function candidateKey(left, right) {
  return `${left}${CANDIDATE_SEPARATOR}${right}`;
}

export function isCandidateKey(key) {
  if (typeof key !== 'string' || /[\r\n]/.test(key)) return false;
  const at = key.indexOf(CANDIDATE_SEPARATOR);
  if (at < 0) return false;
  return key.slice(0, at).trim().length > 0 && key.slice(at + CANDIDATE_SEPARATOR.length).trim().length > 0;
}

export function ledgerPath(rootDir) {
  return join(rootDir, '.claude', 'memory', '_discard-ledger.md');
}

// Absent ledger reads as empty so the capture leg degrades to today's behavior
// rather than erroring (AC-012, rollout prerequisite P3). Every failure mode —
// missing file, unreadable file, malformed line — resolves to "no prior decision",
// which is the safe direction: a candidate re-surfaces rather than vanishing.
export function readLedger({ rootDir } = {}) {
  const empty = { promoted: [], discarded: [] };
  if (!rootDir) return empty;
  const path = ledgerPath(rootDir);
  if (!existsSync(path)) return empty;

  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return empty;
  }

  const out = { promoted: [], discarded: [] };
  for (const line of text.split('\n')) {
    const match = /^-\s+(promoted|discarded)\s+::\s+(.+?)\s*$/.exec(line);
    if (match) out[match[1]].push(match[2]);
  }
  return out;
}

// Append-only and idempotent per key+disposition: re-recording the same decision
// is a no-op rather than a duplicate row.
export function recordCuration({ key, disposition }, { rootDir } = {}) {
  if (!rootDir || !key || !DISPOSITIONS.has(disposition)) return false;
  // The ledger is line-delimited, so a key carrying a newline writes a second,
  // forged row. That is not cosmetic: decidedKeys() feeds memory_stop's suppression
  // set, so a forged key permanently silences an unrelated future candidate —
  // memory that should have been captured is never offered again (security review
  // F-3). `disposition` was already bounded by a closed set; `key` was not.
  if (/[\r\n]/.test(String(key))) return false;
  // Refused LOUDLY rather than repaired: recordCuration cannot infer which target
  // a bare key belonged to, and rewriting it would mask the mistake at the one
  // moment the curator could still fix it. REJECT, never repair.
  if (!isCandidateKey(key)) {
    process.stderr.write(
      `ledger: refused key ${JSON.stringify(key)} — expected the full '## CANDIDATE:' header form, `
      + `e.g. "<path>${CANDIDATE_SEPARATOR}landmarks.md" or "backlog${CANDIDATE_SEPARATOR}<slug>". `
      + `A key in any other shape records a row that suppresses nothing.\n`,
    );
    return false;
  }
  const existing = readLedger({ rootDir });
  if (existing[disposition].includes(key)) return false;

  const path = ledgerPath(rootDir);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `- ${disposition} :: ${key}\n`, 'utf8');
  return true;
}

// Every key the human has already ruled on, in either direction. A promoted
// candidate is as settled as a discarded one — re-offering either is the noise
// AC-006 removes.
export function decidedKeys({ rootDir } = {}) {
  const { promoted, discarded } = readLedger({ rootDir });
  return new Set([...promoted, ...discarded]);
}
