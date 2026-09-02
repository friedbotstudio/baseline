// Domain — runs every registered reader over an adversarial fixture and
// compares each result to a golden value.
//
// Golden rather than reader-agreement: agreement is silent whenever readers are
// wrong together, and silent entirely for a section with one reader. Measured at
// 02f3c68 — all four Acceptance-criteria readers agreed on every real spec in
// docs/specs/ while two live bugs went undetected, and the closure-stamp defect
// had exactly one reader to disagree with.
//
// This module does not import a reader. registry.mjs owns that edge.

import { registrations as defaultRegistrations } from './registry.mjs';
import { loadFixture, ConformanceUnmeasured } from './fixture.mjs';

// Floors, not thresholds. An emptied fixture or an unwired registry must fail
// loudly rather than report a clean run over nothing — the failure recorded by
// coverage-alarm-fixture-derives-zero-elements-9a3c, where a fixture returned
// zero elements while the live corpus had sixteen gaps.
const MIN_ROWS = 9;
const MIN_READERS = 6;

function isDegenerate(value) {
  if (value === null || value === undefined || value === false) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') return value.length === 0;
  if (value instanceof Map) return value.size === 0;
  return false;
}

function readerResult(registration, row) {
  try {
    return registration.read(row.doc);
  } catch (err) {
    return { error: String(err?.message ?? err) };
  }
}

function comparable(value) {
  if (value instanceof Map) return Object.fromEntries([...value].map(([k, v]) => [k, v]));
  return value;
}

function matches(expected, actual) {
  return JSON.stringify(comparable(expected)) === JSON.stringify(comparable(actual));
}

/**
 * Compare every registered reader against the golden value of every fixture row
 * for its artifact. Throws ConformanceUnmeasured when the run would measure
 * nothing; otherwise returns the full result including readers that were
 * degenerate on every row they saw.
 */
export function runConformance({ fixtureDir, registry = defaultRegistrations() } = {}) {
  const rows = loadFixture(fixtureDir);
  if (rows.length < MIN_ROWS) {
    // The path is in the message because the reported case was a consumer
    // install, where "floor is 9" alone gives the reader no route to the file.
    throw new ConformanceUnmeasured(
      `fixture holds ${rows.length} rows, floor is ${MIN_ROWS} — ${fixtureDir} is short or unreadable`,
    );
  }
  if (registry.length < MIN_READERS) {
    throw new ConformanceUnmeasured(`registry holds ${registry.length} readers, floor is ${MIN_READERS}`);
  }

  const assertions = [];
  const sawNonDegenerate = new Set();
  const sawAnyRow = new Set();

  for (const row of rows) {
    for (const registration of registry) {
      if (registration.artifact !== row.artifact) continue;
      sawAnyRow.add(registration.id);
      const actual = readerResult(registration, row);
      if (!isDegenerate(actual)) sawNonDegenerate.add(registration.id);
      if (!Object.prototype.hasOwnProperty.call(row.expect, registration.id)) continue;
      assertions.push({
        rowId: row.id,
        readerId: registration.id,
        expected: row.expect[registration.id],
        actual: comparable(actual),
        ok: matches(row.expect[registration.id], actual),
      });
    }
  }

  const unmeasured = registry
    .map((r) => r.id)
    .filter((id) => !sawAnyRow.has(id) || !sawNonDegenerate.has(id));

  return {
    measured: { rowCount: rows.length, readerCount: registry.length, assertionCount: assertions.length },
    assertions,
    failures: assertions.filter((a) => !a.ok),
    unmeasured,
  };
}

// Re-exported so the engine stays the single import for both callers; the
// Contracts table pins `loadFixture` as an engine export.
export { loadFixture, ConformanceUnmeasured, MIN_ROWS, MIN_READERS };
