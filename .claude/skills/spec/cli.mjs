// Orchestration — the front door to the spec helpers.
//
// The slug is validated before any path is built, not after: `optimize.mjs`
// exports assertSafeSlug and this calls it first so a traversal never reaches
// join(). Rejecting here and inside analyzeSpec's callee is deliberate belt and
// braces — a second entry point added later inherits the guard either way.

import { join } from 'node:path';

import { dispatch, lines, requireValue, UsageError } from '../lib/argv.mjs';
import { analyzeSpec, assertSafeSlug, CorpusMissingError } from './optimize.mjs';

function optimize({ flags, root }) {
  let slug;
  try {
    slug = assertSafeSlug(requireValue(flags, 'slug'));
  } catch (error) {
    throw new UsageError(error.message);
  }

  const rootDir = flags.root ?? root;
  const specPath = join(rootDir, 'docs/specs', `${slug}.md`);

  let report;
  try {
    report = analyzeSpec({ specPath, rootDir });
  } catch (error) {
    if (error instanceof CorpusMissingError) throw new UsageError(error.message);
    throw new UsageError(`${error.message}`);
  }

  return { data: report, text: lines(renderReport(report)) };
}

function renderReport(report) {
  const rows = [];
  for (const [section, findings] of Object.entries(report)) {
    rows.push(`## ${section} (${findings.length})`);
    for (const finding of findings) rows.push(`  ${finding.elementId} — ${finding.reason}`);
    rows.push('');
  }
  return rows;
}

await dispatch({
  name: 'spec',
  subcommands: {
    optimize: {
      summary: 'Diff a drafted spec against docs/system/ and report undeclared, reuse and correction findings',
      run: optimize,
    },
  },
});
