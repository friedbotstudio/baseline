#!/usr/bin/env node
// audit-baseline — drift check between docs/init/seed.md and the implementation.
//
// Orchestration layer: a table-of-contents. It parses args, builds the shared
// audit context (checks/context.mjs), runs each check module in order, and
// prints the PASS/FAIL/WARN table. Every check's logic lives in its own module
// under checks/; the pure surface-check helpers and the config-parity primitives
// are re-exported here for the governance test suite's existing import paths.
//
// Reports each check as PASS / FAIL / WARN with a short detail. Exits 0 on a
// clean audit, 1 if any FAIL. Read-only; safe to run any time, in CI, or as
// the final step of /init-project.
//
// `runAudit({rootDir})` is the programmatic entry point: it runs the same
// checks and RETURNS `{verdict, checks, failures}` as data rather than
// printing and exiting. cli.mjs's `report` verb is the only other caller —
// it renders the same table and owns the CI exit-code contract (§Behavior #6:
// exit 1 on a FAIL verdict). The IS_MAIN block below is the historical
// `node audit.mjs` entry point; it now delegates to runAudit too, so there is
// exactly one place the checks actually run.

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildContext } from './checks/context.mjs';
import { run as counts } from './checks/counts.mjs';
import { run as skillOwnership } from './checks/skill-ownership.mjs';
import { run as constitution } from './checks/constitution.mjs';
import { run as memory } from './checks/memory.mjs';
import { run as srcTemplatesA } from './checks/src-templates-a.mjs';
import { run as srcTemplatesB } from './checks/src-templates-b.mjs';
import { run as helperScripts } from './checks/helper-scripts.mjs';
import { run as settingsWiring } from './checks/settings-wiring.mjs';
import { run as projectJson } from './checks/project-json.mjs';
import { run as mcpServers } from './checks/mcp-servers.mjs';
import { run as licenses } from './checks/licenses.mjs';
import { run as designUiSurface } from './checks/design-ui-surface.mjs';
import { run as crossDocCounts } from './checks/cross-doc-counts.mjs';
import { run as quickfixInvariants } from './checks/quickfix-invariants.mjs';
import { run as derivedCountSurfaces } from './checks/derived-count-surfaces.mjs';
import { run as docsiteDrift } from './checks/docsite-drift.mjs';
import { run as hookDecisionPaths } from './checks/hook-decision-paths.mjs';

export {
  checkSurfaceCount, checkByCategorySum,
} from './checks/surface-helpers.mjs';
export { checkConfigParity, CONFIG_PARITY_ALLOWLIST } from './config-parity.mjs';

// True only when run as a script (`node audit.mjs`), false when imported by a
// test. realpathSync both sides: import.meta.url is symlink-resolved by Node, but
// process.argv[1] is passed verbatim, so an invocation under a symlinked path
// (macOS /tmp -> /private/tmp) would otherwise mis-compare and silently skip run.
const IS_MAIN = (() => {
  if (!process.argv[1]) return false;
  try { return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; }
  catch { return import.meta.url === pathToFileURL(process.argv[1]).href; }
})();

const CHECKS = [
  counts, skillOwnership, constitution, memory, srcTemplatesA, srcTemplatesB,
  helperScripts, settingsWiring, projectJson, mcpServers, licenses, designUiSurface,
  crossDocCounts, quickfixInvariants, derivedCountSurfaces, docsiteDrift,
  hookDecisionPaths,
];

// The programmatic entry point. Builds the context, runs every check, and
// returns data — it never writes to stdout/stderr and never calls
// process.exit. `rootDir` defaults the same way the script path always has
// (CLAUDE_PROJECT_DIR, then cwd) so a bare `runAudit()` behaves like `node
// audit.mjs` did. A context-build or check-module throw is caught and folded
// into a FAIL verdict rather than propagating — the contract is "never
// throws" so a caller (the CI dispatcher) can always render a result.
export function runAudit({ rootDir, skipHashCheck = false } = {}) {
  const root = rootDir || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    const ctx = buildContext({ root, skipHashCheck });
    const checks = [];
    for (const check of CHECKS) checks.push(...check(ctx));
    const failures = checks.filter(([, status]) => status === 'FAIL');
    return { verdict: failures.length > 0 ? 'FAIL' : 'PASS', checks, failures };
  } catch (err) {
    const detail = err && err.message ? err.message : String(err);
    return {
      verdict: 'FAIL',
      checks: [['audit-error', 'FAIL', detail]],
      failures: [['audit-error', 'FAIL', detail]],
    };
  }
}

// ---------- output ----------
// Guarded: only when run as a script (`node audit.mjs`). When imported (by a
// test, or by cli.mjs) nothing runs and nothing prints — the caller gets
// `runAudit` and decides what to do with it.
if (IS_MAIN) {
  const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  let SCOPE_FILE = '';
  // --skip-hash-check suppresses ONLY the per-file sha256 re-hash of manifest-listed
  // skill files (build-internal Stage-4 invocation, where the manifest was just
  // stamped from the same source). The standalone verify/integrate audit runs
  // WITHOUT this flag and keeps full hash-drift detection.
  let SKIP_HASH_CHECK = false;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--file=')) SCOPE_FILE = arg.slice('--file='.length);
    else if (arg === '--skip-hash-check') SKIP_HASH_CHECK = true;
  }

  if (SCOPE_FILE) {
    const inScope = (
      SCOPE_FILE.startsWith('.claude/') ||
      SCOPE_FILE === 'CLAUDE.md' || SCOPE_FILE === 'README.md' ||
      SCOPE_FILE === 'docs/init/seed.md' ||
      SCOPE_FILE === 'src/CLAUDE.template.md' || SCOPE_FILE === 'src/seed.template.md' ||
      SCOPE_FILE === 'src/settings.template.json' || SCOPE_FILE === 'src/project.template.json' ||
      SCOPE_FILE.startsWith('src/agents/') || SCOPE_FILE.startsWith('src/memory/') ||
      SCOPE_FILE === 'src/.mcp.template.json' || SCOPE_FILE.startsWith('obj/template/') ||
      SCOPE_FILE === 'scripts/build-manifest.mjs' || SCOPE_FILE === 'scripts/build-template.sh'
    );
    if (!inScope) {
      process.stdout.write(`audit-baseline: ${SCOPE_FILE} is out of baseline scope (no checks affected)\n`);
      process.exit(0);
    }
  }

  const { checks: results } = runAudit({ rootDir: ROOT, skipHashCheck: SKIP_HASH_CHECK });

  const nameW = Math.max(20, ...results.map(r => r[0].length));
  let failN = 0, warnN = 0;
  for (const [, s] of results) { if (s === 'FAIL') failN++; else if (s === 'WARN') warnN++; }
  process.stdout.write('check'.padEnd(nameW) + '  ' + 'status'.padEnd(6) + '  detail\n');
  process.stdout.write('-'.repeat(nameW) + '  ' + '-'.repeat(6) + '  ' + '-'.repeat(50) + '\n');
  for (const [name, status, detail] of results) {
    process.stdout.write(`${name.padEnd(nameW)}  ${status.padEnd(6)}  ${detail}\n`);
  }
  process.stdout.write('-'.repeat(nameW) + '  ' + '-'.repeat(6) + '\n');
  const overall = failN > 0 ? 'FAIL' : 'PASS';
  process.stdout.write(`${'overall'.padEnd(nameW)}  ${overall.padEnd(6)}  fails=${failN} warns=${warnN}\n`);
  process.exit(failN > 0 ? 1 : 0);
}
