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

import { dispatch, lines, NotFoundError } from '../lib/argv.mjs';
import { migrateWorkflowJsonInPlace } from './workflow-migrator.js';

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

dispatch({
  name: 'harness',
  subcommands: {
    migrate: { summary: 'migrate a pre-§18 workflow.json to the post-§18 shape in place (writes)', run: migrate },
  },
});
