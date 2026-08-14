// Domain — a flush re-measures the census literals it moves, or it refuses.
//
// Eight census-literal corrections landed in one two-commit session across four
// sittings, and two of the eight were caused by writing the memory entries that
// described the pattern. The cost always fell on whoever ran the suite next,
// which is the wrong person: the flush that moves a count is the only call that
// knows it moved.
//
// The alternative considered and rejected was deriving the path-leg census — it
// covers one leg and leaves PHASE_BUDGETS and the corpus counts hand-maintained.
// Gating at write time converts a next-workflow surprise into a same-workflow
// chore, which is where the cost belongs.
//
// Refusing is a first-class outcome. Writing canonical files while leaving an
// assertion that describes them stale is the one result this module exists to
// make impossible.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { assertNoTraversal } from '../workspace/store.mjs';
import { countMeasure } from './census-measures.mjs';

export function measureCensusMovement({ rootDir, sites = [], pendingEntries = [] } = {}) {
  if (sites.length === 0) return { moved: [], remeasured: false, refused: false };

  const readings = sites.map((site) => readSite(rootDir, site, pendingEntries));
  const moved = readings.filter((r) => r.unreadable || r.from !== r.to);
  if (moved.length === 0) return { moved: [], remeasured: false, refused: false };

  const unwritable = moved.filter((r) => r.unreadable || !rewrite(rootDir, r));
  if (unwritable.length > 0) {
    return { moved: reportable(moved), remeasured: false, refused: true };
  }
  return { moved: reportable(moved), remeasured: true, refused: false };
}

function readSite(rootDir, site, pendingEntries) {
  assertNoTraversal(site.file);
  const absolute = join(rootDir, site.file);
  if (!existsSync(absolute)) {
    return { ...site, unreadable: true, reason: 'declared census site is missing' };
  }
  const text = readFileSync(absolute, 'utf8');
  const current = literalIn(text, site.symbol);
  if (current === null) {
    return { ...site, unreadable: true, reason: `symbol ${site.symbol} not found` };
  }
  return {
    ...site,
    unreadable: false,
    from: current,
    to: countMeasure(rootDir, site.measure, pendingEntries),
  };
}

function rewrite(rootDir, reading) {
  const absolute = join(rootDir, reading.file);
  try {
    const text = readFileSync(absolute, 'utf8');
    writeFileSync(absolute, text.replace(literalPattern(reading.symbol), `$1${reading.to}`), 'utf8');
    return true;
  } catch {
    return false;
  }
}

function literalIn(text, symbol) {
  const match = literalPattern(symbol).exec(text);
  return match ? Number(match[2]) : null;
}

function literalPattern(symbol) {
  return new RegExp(`(${escapeRegExp(symbol)}\\s*=\\s*)(\\d+)`);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function reportable(moved) {
  return moved.map(({ file, symbol, from, to, reason }) => ({ file, symbol, from, to, reason }));
}
