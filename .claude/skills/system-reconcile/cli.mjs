// Orchestration — the front door to the corpus health report.
//
// The report is forwarded whole rather than summarised. runReconcile answers seven
// separate questions, and a dispatcher that printed only the failing ones would
// make "no output" mean both "healthy" and "the check did not run".

import { isAbsolute, join } from 'node:path';

import { dispatch } from '../lib/argv.mjs';
import { assertNoTraversal } from '../workspace/tree.mjs';
import { runReconcile } from './reconcile-report.mjs';

function corpusDir({ flags, root }) {
  const given = flags['spec-dir'];
  if (!given) return join(root, 'docs/system');
  if (isAbsolute(given)) return given;
  assertNoTraversal(given);
  return join(root, given);
}

function report(ctx) {
  const data = runReconcile({ specDir: corpusDir(ctx), rootDir: ctx.root });
  const rows = Object.entries(data).map(([check, result]) => {
    const count = Array.isArray(result) ? result.length : Number(result ?? 0);
    return `${check}: ${count}`;
  });
  return { data, text: rows.join('\n') + '\n' };
}

dispatch({
  name: 'system-reconcile',
  subcommands: {
    report: { summary: 'the seven-check corpus health report', run: report },
  },
});
