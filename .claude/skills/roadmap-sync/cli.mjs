// Orchestration — the front door to the ad-hoc epic backfill.
//
// One subcommand. `backfill` is not a workflow phase: it reads the epic states
// on disk, appends the ones the roadmap does not already carry, and always
// exits 0, because the same helper runs inside a commit path it must not block.

import { dispatch, lines } from '../lib/argv.mjs';
import { backfillEpics } from './backfill.mjs';

function report(result) {
  const rows = [];
  if (result.reason) rows.push(`no-op: ${result.reason}`);
  for (const { slug, epicNum } of result.appended) rows.push(`appended  Epic ${epicNum}  ${slug}`);
  for (const { slug, reason } of result.skipped) rows.push(`skipped   ${slug} — ${reason}`);
  if (result.dryRun) rows.push('dry run — nothing was written');
  if (rows.length === 0) rows.push('nothing to append; the roadmap already carries every epic on disk');
  return rows;
}

function backfill({ flags, root }) {
  const result = backfillEpics({
    rootDir: flags.root ?? root,
    slugs: flags.slug ? [flags.slug] : undefined,
    dryRun: flags['dry-run'] === true,
  });
  return { data: result, text: lines(report(result)) };
}

await dispatch({
  name: 'roadmap-sync',
  subcommands: {
    backfill: {
      summary: 'Append every epic on disk that the execution roadmap does not already carry',
      run: backfill,
    },
  },
});
