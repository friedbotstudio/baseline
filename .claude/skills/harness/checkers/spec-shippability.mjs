// spec-shippability checker — the second deferred adapter from backlog `-d186`.
//
// It answers one question: does this spec commit to shipping a dev-tree reference
// that a consumer install will not have? The analyzer that decides is already
// factored — `collectMarkdownCode` finds the code spans, and
// `runDevTreeAndUnshippedChecks` scores them against the shipped manifest. What
// was missing is the adapter that hands the fan-out a `{findings}`.
//
// `check.mjs` is deliberately NOT used: it is script-shaped (a top-level
// `await main(process.argv.slice(2))`) with no exports, so there is nothing to
// call. `analyzer.mjs` is the importable half, and it is the half that decides.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The analyzer is loaded DYNAMICALLY, and that is not stylistic. `spec-shippability-review`
// carries no `owner: baseline`, so `build-template.sh` prunes it from every consumer
// install — a top-level import would throw at MODULE LOAD on a consumer tree, before
// any try/catch in `run` could see it, and because `checker-fanout.mjs` imports this
// adapter at ITS top level the whole fan-out would fail to load. That degrades the
// spec-review boundary instead of failing open, which is the opposite of every other
// path in that registry. Security review 2026-08-09, finding F-3.
async function loadAnalyzer() {
  try {
    return await import('../../spec-shippability-review/analyzer.mjs');
  } catch {
    return null;
  }
}

// The consumer-facing file list. Absent (a tree that has never run the build) means
// the unshipped-import check cannot be decided, so it is skipped rather than
// guessed — reporting every import as unshipped because the manifest is missing
// would be a wrong answer wearing the shape of a right one.
function readManifest(rootDir) {
  try {
    return JSON.parse(readFileSync(join(rootDir, 'obj/template/.claude/manifest.json'), 'utf8'));
  } catch {
    return null;
  }
}

export const specShippabilityAdapter = {
  phase: 'spec-review',
  async run(ctx) {
    if (!ctx?.specContent) return { findings: [] };

    const rootDir = ctx.rootDir ?? process.cwd();
    const manifest = readManifest(rootDir);
    if (!manifest) return { findings: [] };

    // Injectable because the default loader resolves relative to THIS module, not
    // to ctx.rootDir — so in a dev tree the analyzer always imports and the catch
    // below is unreachable from a test. Same seam runCheckerFanout exposes for
    // `registry` and `readFile`.
    const analyzer = await (ctx.loadAnalyzer ?? loadAnalyzer)();
    if (!analyzer) return { findings: [], ran: false };
    const { collectMarkdownCode, runDevTreeAndUnshippedChecks } = analyzer;

    const sourcePath = `docs/specs/${ctx.slug}.md`;

    try {
      const fences = collectMarkdownCode(ctx.specContent);
      const raw = runDevTreeAndUnshippedChecks(fences, manifest, sourcePath) ?? [];

      // The analyzer already stamps severity and check id; normalize only the
      // fields the merge sorts on, and leave its verdict alone.
      return {
        findings: raw.map((f) => ({
          severity: f.severity ?? 'ADVISORY',
          check: f.check ?? 'shippability',
          message: f.message ?? 'shipped prose references a dev-tree path',
          evidence: f.evidence ?? '',
        })),
      };
    } catch {
      return { findings: [] };
    }
  },
};
