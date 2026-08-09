// Orchestration — the front door to the harness helpers a SOP invokes by hand.
//
// Only `migrate` today. The other seventeen modules in this directory already carry
// their own `process.argv` entry points (rightsize-gate, checker-fanout, notify,
// consolidate-open-questions, …) and are cited that way; adding second front doors
// beside working ones would be scaffold, not reuse.
//
// Why `workflow-migrator.js` could not have one of its own: it is a byte-for-byte
// build mirror of `src/cli/workflow-migrator.js` (build-template.sh Stage 0b,
// guarded by tests/vendored-mirror-bytes.test.mjs). An entry point added to the
// mirror is silently reverted by the next build — two memory landmines record
// exactly that — and added to the source it pulls the change into `src/**`, which
// matches no diagram profile. A wrapper in this directory is the front door that
// costs neither.
//
// This is the caller that made `dispatch` async (see lib/argv.mjs).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { dispatch, lines, NotFoundError, UsageError } from '../lib/argv.mjs';
import { migrateWorkflowJsonInPlace } from './workflow-migrator.js';
import { runRightsize } from './rightsize-gate.mjs';

async function migrate({ positional }) {
  const path = positional[0];
  if (!path) throw new Error('migrate requires the path to a workflow.json');
  if (path.split(/[\\/]/).includes('..')) {
    throw new Error(`unsafe path traversal (REJECT, never normalize): ${JSON.stringify(path)}`);
  }

  let result;
  try {
    result = await migrateWorkflowJsonInPlace(path);
  } catch (error) {
    // ENOENT is "the thing you named is not there" — exit 2 — while an unmapped
    // entry_phase is a validation error the caller can act on — exit 1. Collapsing
    // them would tell a caller to fix their config when the real problem is a typo
    // in the path.
    if (error?.code === 'ENOENT') throw new NotFoundError(`no workflow.json at ${path}`);
    throw error;
  }

  return {
    data: result,
    text: lines([result.migrated
      ? `migrated: entry_phase -> track_id ${result.track_id}`
      : `not migrated: ${result.reason}`]),
  };
}

// The right-size oracle, as a verb. It delegates to `runRightsize` rather than the
// sibling `main`, because `main` prints its own JSON — two documents on stdout
// would break the "--json emits JSON only" contract.
//
// `baseline` writes (it stamps workflow.json → rightsize_base); `check` is pure.
// Both stay fail-open: the gate may never report a skip it did not earn.
const RIGHTSIZE_SUBS = ['baseline', 'check'];

async function rightsize({ positional, root }) {
  const sub = positional[0];
  if (!RIGHTSIZE_SUBS.includes(sub)) {
    throw new UsageError(`rightsize needs one of ${RIGHTSIZE_SUBS.join(' | ')}; got ${JSON.stringify(sub)}`);
  }

  const result = await runRightsize({ sub, rootDir: root });
  const text = sub === 'baseline'
    ? lines([`baseline ${result.baseline.applied ? 'recorded' : 'already present'}: ${result.baseline.paths.length} path(s)`])
    : lines([`skip: ${result.skip.join(', ') || '(none)'}`, `keep: ${result.keep.join(', ')}`]);
  return { data: result, text };
}

// The live workflow, read-only. `next` is the first node of the chosen track that
// is neither completed nor excepted — the same question the harness loop answers
// each iteration, exposed so a caller (or a GUI) can ask it without re-deriving
// the DAG.
//
// ENOENT is "no active workflow" (exit 2); malformed JSON is a usage error (exit
// 1). Collapsing them would tell a caller to fix their file when the real answer
// is that no workflow is running.
function state({ root }) {
  const path = join(root, '.claude', 'state', 'workflow.json');

  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') throw new NotFoundError(`no active workflow at ${path}`);
    throw error;
  }

  let workflow;
  try {
    workflow = JSON.parse(raw);
  } catch (error) {
    throw new UsageError(`workflow.json is not valid JSON: ${error.message}`);
  }

  const completed = workflow.completed ?? [];
  const exceptions = workflow.exceptions ?? [];
  const next = nextPhase(root, workflow.track_id, completed, exceptions);

  return {
    data: {
      slug: workflow.slug ?? null,
      track_id: workflow.track_id ?? null,
      completed,
      exceptions,
      next,
      tickets: workflow.tickets ?? [],
    },
    text: lines([
      `slug:       ${workflow.slug ?? '(none)'}`,
      `track:      ${workflow.track_id ?? '(none)'}`,
      `completed:  ${completed.join(', ') || '(none)'}`,
      `exceptions: ${exceptions.join(', ') || '(none)'}`,
      `next:       ${next ?? '(workflow complete)'}`,
    ]),
  };
}

// Reads the track's node order from workflows.jsonl. Returns null when the track
// is unknown or every node is accounted for — an absent answer, not a guess.
function nextPhase(root, trackId, completed, exceptions) {
  if (!trackId) return null;

  let jsonl;
  try {
    jsonl = readFileSync(join(root, '.claude', 'workflows.jsonl'), 'utf8');
  } catch {
    return null;
  }

  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    let track;
    try {
      track = JSON.parse(line);
    } catch {
      continue;
    }
    if (track.track_id !== trackId) continue;

    for (const node of track.nodes ?? []) {
      const phase = node.metadata?.phase ?? node.id;
      if (!completed.includes(phase) && !exceptions.includes(phase)) return phase;
    }
    return null;
  }
  return null;
}

dispatch({
  name: 'harness',
  subcommands: {
    migrate: { summary: 'migrate a pre-§18 workflow.json to the post-§18 shape in place (writes)', run: migrate },
    rightsize: { summary: 'the right-size oracle: baseline (writes) or check', run: rightsize },
    state: { summary: 'the live workflow: track, completed, exceptions, next, tickets', run: state },
  },
});
