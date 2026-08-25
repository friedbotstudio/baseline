// Orchestration — the front door to the corpus health report.
//
// The report is forwarded whole rather than summarised. runReconcile answers seven
// separate questions, and a dispatcher that printed only the failing ones would
// make "no output" mean both "healthy" and "the check did not run".

import { isAbsolute, join } from 'node:path';

import { dispatch } from '../lib/argv.mjs';
import { assertNoTraversal } from '../workspace/tree.mjs';
import { gatingFailures, reconcileForGate } from './reconcile-report.mjs';
import { countRows, gateVerdict } from './gate-render.mjs';

function corpusDir({ flags, root }) {
  const given = flags['spec-dir'];
  if (!given) return join(root, 'docs/system');
  if (isAbsolute(given)) return given;
  assertNoTraversal(given);
  return join(root, given);
}

// `--gate` turns the report into an exit code. Step 5.5 of /archive used to print
// this and leave the decision to a reader, which is how a wrong corpus write
// reached a commit: a blocking rule nobody is obliged to act on is advice.
function report(ctx) {
  const { report: data, produced } = reconcileForGate({ specDir: corpusDir(ctx), rootDir: ctx.root });
  if (!ctx.flags.gate) return { data, text: countRows(data).join('\n') + '\n' };

  const failures = gatingFailures(data, { produced });
  return {
    data: { ...data, produced, failures },
    text: [...countRows(data), ...gateVerdict(failures)].join('\n') + '\n',
    exitCode: failures.length > 0 ? 1 : 0,
  };
}

dispatch({
  name: 'system-reconcile',
  subcommands: {
    report: { summary: 'the seven-check corpus health report (--gate to exit non-zero on a breach)', run: report },
  },
});
