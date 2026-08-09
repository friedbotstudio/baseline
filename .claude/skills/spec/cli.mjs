// Orchestration — the front door to the spec helpers.
//
// The slug is validated before any path is built, not after: `optimize.mjs`
// exports assertSafeSlug and this calls it first so a traversal never reaches
// join(). Rejecting here and inside analyzeSpec's callee is deliberate belt and
// braces — a second entry point added later inherits the guard either way.

import { join } from 'node:path';

import { dispatch, lines, requireValue, UsageError } from '../lib/argv.mjs';
import { analyzeSpec, assertSafeSlug, CorpusMissingError } from './optimize.mjs';
import { runCheckerFanout } from '../harness/checker-fanout.mjs';

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

// The spec-review fan-out, as a verb.
//
// The runner is the harness's, not this skill's — `checker-fanout.mjs` owns the
// registry, the parallel dispatch and the deterministic merge, and the harness
// loop already calls it at the spec-review boundary. This verb is the hand-invoked
// front door onto the same runner, so a maintainer iterating on a spec gets the
// same merged verdict the pipeline will compute, rather than running five checkers
// by hand and eyeballing five different output shapes.
//
// Exit 2 on BLOCKED is deliberate and matches the runner's own CLI: a blocked spec
// is not a usage error (the caller did nothing wrong) and not success.
async function review({ flags, root }) {
  let slug;
  try {
    slug = assertSafeSlug(requireValue(flags, 'slug'));
  } catch (error) {
    throw new UsageError(error.message);
  }

  const rootDir = flags.root ?? root;
  const merged = await runCheckerFanout({ slug, rootDir, enabled: true, phase: 'spec-review' });

  if (merged.skipped) {
    return { data: merged, text: lines([`skipped: ${merged.reason}`]) };
  }

  const rows = [
    `verdict: ${merged.verdict}`,
    `checkers: ${merged.checkers.join(', ')}`,
  ];
  for (const f of merged.findings) {
    rows.push(`  ${f.severity}  ${f.checker}/${f.check ?? '?'}  ${f.message ?? ''}`.trimEnd());
  }
  if (!merged.findings.length) rows.push('  (no findings)');

  return { data: merged, text: lines(rows), exitCode: merged.verdict === 'BLOCKED' ? 2 : 0 };
}

await dispatch({
  name: 'spec',
  subcommands: {
    optimize: {
      summary: 'Diff a drafted spec against docs/system/ and report undeclared, reuse and correction findings',
      run: optimize,
    },
    review: {
      summary: 'Fan the spec-review checkers out over checker-fanout and emit one merged verdict',
      run: review,
    },
  },
});
