// Orchestration — the front door to the flush helpers.
//
// `ledger` is the one write here, and its validation order matters: recordCuration
// refuses a malformed candidate key BEFORE it looks at the disposition, so a bare
// key would be rejected for the wrong reason and a caller would never learn the
// disposition was also wrong. Both are checked here, key first, with distinct
// messages.

import { isAbsolute, join } from 'node:path';

import { dispatch, lines, requireValue } from '../lib/argv.mjs';
import { assertNoTraversal } from '../workspace/tree.mjs';
import { listStale } from './stale-elements.mjs';
import { suggestRoutes } from './route.mjs';
import { isCandidateKey, recordCuration, readLedger, CANDIDATE_SEPARATOR } from './ledger.mjs';
import { runSweep } from './sweep.mjs';

const DISPOSITIONS = ['promoted', 'discarded'];

// --spec-dir is caller input and reaches a path join, so it is validated the same
// way the workspace dispatcher validates it. Two dispatchers accepting the flag
// with only one checking it is how a traversal survives a review.
function corpusDir({ flags, root }) {
  const given = flags['spec-dir'];
  if (!given) return join(root, 'docs/system');
  if (isAbsolute(given)) return given;
  assertNoTraversal(given);
  return join(root, given);
}

function staleElements(ctx) {
  const drifted = listStale({ specDir: corpusDir(ctx), rootDir: ctx.root });
  return {
    data: { stale: drifted },
    text: lines(drifted.length ? drifted.map((e) => `${e.id}  ${e.detail ?? ''}`.trim()) : ['(nothing stale)']),
  };
}

function route(ctx) {
  const raw = ctx.positional[0];
  if (!raw) throw new Error('route needs a JSON array of candidates');
  let candidates;
  try {
    candidates = JSON.parse(raw);
  } catch (error) {
    throw new Error(`route: candidates must be valid JSON — ${error.message}`);
  }
  const suggestions = suggestRoutes(candidates);
  return {
    data: { suggestions },
    text: lines(suggestions.map((s) => `${s.suggested_bucket}  ${s.weight}  ${s.evidence ?? ''}`.trim())),
  };
}

function ledger(ctx) {
  const key = ctx.flags.key;
  const disposition = ctx.flags.disposition;
  if (!isCandidateKey(key)) {
    throw new Error(`ledger: --key must be a candidate key of the form "<left>${CANDIDATE_SEPARATOR}<right>"; got ${JSON.stringify(key)}`);
  }
  if (!DISPOSITIONS.includes(disposition)) {
    throw new Error(`ledger: --disposition must be one of ${DISPOSITIONS.join(' | ')}; got ${JSON.stringify(disposition)}`);
  }
  const recorded = recordCuration({ key, disposition }, { rootDir: ctx.root });
  if (!recorded) throw new Error(`ledger: refused to record ${JSON.stringify(key)}`);
  return { data: { key, disposition, recorded }, text: lines([`recorded ${disposition}: ${key}`]) };
}

function ledgerRows(ctx) {
  const rows = readLedger({ rootDir: ctx.root });
  return { data: { rows }, text: lines(rows.length ? rows.map((r) => JSON.stringify(r)) : ['(empty ledger)']) };
}

// The verb rides `runSweep` rather than re-implementing the mode dispatch:
// `sweep.mjs` owns every mode's semantics and the closure precondition
// (assertRelifted) — this handler's only job is translating cli.mjs's flag
// surface into runSweep's call shape and the result into a subcommand result.
// A bad --mode surfaces via runSweep's own UnknownModeError, naming the legal
// set; dispatch() maps that (and any other thrown error) to exit 1.
function sweep(ctx) {
  const mode = requireValue(ctx.flags, 'mode');
  const report = runSweep({ mode, rootDir: ctx.root, memoryDir: ctx.flags['mem-dir'] });
  return { data: report, text: lines([JSON.stringify(report)]) };
}

dispatch({
  name: 'memory-sync',
  subcommands: {
    'stale-elements': { summary: 'corpus elements whose anchor digest drifted', run: staleElements },
    route: { summary: 'deterministic bucket suggestion for candidates (JSON array)', run: route },
    ledger: { summary: 'record a curation decision (--key, --disposition)', run: ledger },
    'ledger-rows': { summary: 'read the discard ledger', run: ledgerRows },
    sweep: { summary: 'run a memory sweep mode (--mode)', run: sweep },
  },
});
