// Orchestration — the corpus health report `/system-reconcile` prints.
//
// Every check below already existed and had no production caller: findGaps,
// classify, repairAfterMerge, findOrphanShards and findUnillustrated were each
// reachable only from a test. Composing them is the whole change — none of their
// logic is reimplemented here, because a second copy of a rule drifts from the
// first and then two answers disagree about one corpus.
//
// D9 — this module exports NO writer, and it must not acquire one. A repair is
// performed by the human-confirmed procedure in SKILL.md, through the writers that
// already exist. That is what keeps `/archive` the corpus's single writer
// (corpus-has-one-writer-archive-on-the-primary-tree-2026-08-06): a workflow phase
// cannot reach an apply path that does not exist. Enforcing the rule by
// construction beats enforcing it by a mode flag someone can pass the wrong way.
//
// `listStale` is deliberately absent: Cycle 1 already wired the memory-side
// staleness sweep at memory-sync/SKILL.md, and duplicating it here would give the
// operator two stale counts over two different corpora under one name.

import { findGaps } from '../workspace/coverage.mjs';
import { architectureMapEnabled } from '../workspace/flags.mjs';
import { classify, repairAfterMerge } from '../workspace/reconcile.mjs';
import { findUnillustrated, readShard } from '../workspace/shards.mjs';
import { readRecords } from '../workspace/store.mjs';

const CHECKS = [
  'gaps', 'stale', 'dangling', 'duplicateAnchors', 'orphanShards', 'unillustrated', 'missingKind',
];

// Every check except `gaps`. Two gaps pre-date the gate — `.claude/skills/commit/cli.mjs`
// and `closure-precommit-check.mjs`, both unanchored — so gating on them would fail
// every workflow until two unrelated modules are anchored. The exclusion is
// arithmetic, not principle: re-include `gaps` once it reads zero.
const GATING_CHECKS = CHECKS.filter((name) => name !== 'gaps');

function emptyReport() {
  return Object.fromEntries(CHECKS.map((name) => [name, []]));
}

// `stale` and `dangling` are two faces of one verdict pass, so they are read off
// the same classify() result rather than computed twice — the digest walk is the
// expensive part of the report.
function withState(verdicts, state) {
  return verdicts.filter((verdict) => verdict.state === state);
}

// An element with no shard at all is reported under `unillustrated`. Counting it
// here as well would make the two arrays sum to more than the corpus and hand the
// operator the same gap twice under two names.
function findMissingKind(specDir) {
  return readRecords(specDir, 'elements')
    .filter((element) => {
      const shard = readShard(specDir, element.id);
      return shard !== null && !shard.kind;
    })
    .map((element) => element.id);
}

function collect(specDir, rootDir) {
  const verdicts = classify(specDir, { rootDir });
  const merged = repairAfterMerge({ specDir });
  return {
    gaps: findGaps({ specDir, rootDir }),
    stale: withState(verdicts, 'stale'),
    dangling: withState(verdicts, 'dangling'),
    duplicateAnchors: merged.duplicateAnchors,
    orphanShards: merged.orphanShards,
    unillustrated: findUnillustrated(specDir),
    missingKind: findMissingKind(specDir),
  };
}

export function runReconcile({ specDir, rootDir = process.cwd() } = {}) {
  if (!architectureMapEnabled({ rootDir })) return emptyReport();
  try {
    return collect(specDir, rootDir);
  } catch (error) {
    // Never throws (Contracts table). An unreadable corpus has nothing to report,
    // which is not the same thing as an exception the operator has to catch
    // mid-archive — Step 5.5 runs after the single writer has already committed.
    //
    // The stderr line is load-bearing, not debug noise. Seven empty arrays are
    // returned for three different states — clean, flag-off, and crashed — so
    // without a trace a failed run reads as a healthy corpus, which is the
    // `a-check-that-measured-nothing-reports-success` shape. A discriminator in
    // the return value is the real fix and needs AC-008's seven-array shape
    // amended, so it is scoped to slice C
    // (docs/security/system-spec-delta-slice-b-2026-08-07.md, MEDIUM #2).
    process.stderr.write(`system-reconcile: corpus unreadable at ${specDir}: ${error.message}\n`);
    return emptyReport();
  }
}

// AC-028 — the discriminator the header above scoped to slice C (security review
// 2026-08-07, MEDIUM #2). A clean corpus, a flag-off project and a crashed read
// all render as seven empty arrays, so emptiness alone is not health: `produced`
// is what tells them apart, and `gatingFailures` fails a report it never got.
// `runReconcile` keeps its seven-array shape because AC-008 elsewhere pins it, so
// the gate gets a sibling rather than an amended return.
export function reconcileForGate({ specDir, rootDir = process.cwd() } = {}) {
  if (!architectureMapEnabled({ rootDir })) return { report: emptyReport(), produced: true };
  try {
    return { report: collect(specDir, rootDir), produced: true };
  } catch (error) {
    process.stderr.write(`system-reconcile: corpus unreadable at ${specDir}: ${error.message}\n`);
    return { report: emptyReport(), produced: false };
  }
}

// Empty means the gate passes. An unproduced report is NOT empty-and-fine: seven
// empty arrays are what a crashed read returns too, so reading emptiness as health
// would pass a corpus nobody managed to open.
export function gatingFailures(report, { produced = true } = {}) {
  if (!produced) {
    return [{ section: 'report', members: ['corpus report could not be produced'] }];
  }
  return GATING_CHECKS
    .map((section) => ({ section, members: report?.[section] ?? [] }))
    .filter(({ members }) => members.length > 0);
}
