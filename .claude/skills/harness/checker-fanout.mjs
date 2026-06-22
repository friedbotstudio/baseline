// checker-fanout — deterministic merge of the read-only checkers' verdicts, the
// clause-6 fan-out gate, and the live runner that fans the mechanized spec-review
// oracles out (in parallel) and merges them. Mechanical script fan-out is always
// allowed (parallel scripts are not subagents). LLM-AGENT fan-out is rejected until
// the oracle-bound checker amendment lands (seed.md §II.A clause 6).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDiagramOracle } from '../spec-diagram-review/oracle.mjs';
import { runTraceabilityOracle } from '../spec-traceability-review/oracle.mjs';

/** Merge per-checker verdicts into one deterministic, order-independent result. */
export function mergeVerdicts(verdicts) {
  const checkers = verdicts.map((v) => v.checker).sort();
  const findings = verdicts
    .flatMap((v) => (v.findings || []).map((f) => ({ checker: v.checker, ...f })))
    .sort((a, b) =>
      (a.checker || '').localeCompare(b.checker || '')
      || (a.check || '').localeCompare(b.check || '')
      || (a.severity || '').localeCompare(b.severity || ''));
  const verdict = findings.some((f) => f.severity === 'BLOCKER') ? 'BLOCKED' : 'CLEAN';
  return { checkers, findings, verdict };
}

/** Enforce seed.md §II.A clause 6: no LLM-agent fan-out until the amendment lands. */
export function assertFanoutAllowed({ mode, amendmentPresent }) {
  if (mode === 'agents' && !amendmentPresent) {
    throw new Error('clause 6: fan-out not permitted — oracle-bound checker agent fan-out requires the §II.A amendment.');
  }
}

// The extension point: checker name -> adapter(ctx) -> { findings }. spec-lint and
// spec-shippability adapters are deferred (-d186); add them here when they graduate.
export const DEFAULT_CHECKER_REGISTRY = {
  'spec-diagram': (ctx) => runDiagramOracle(ctx.specContent),
  'spec-traceability': (ctx) => (ctx.intakeContent == null
    ? { findings: [] }
    : runTraceabilityOracle({ spec: ctx.specContent, intake: ctx.intakeContent })),
};

function readOptional(readFile, p) {
  try {
    return readFile(p);
  } catch {
    return null;
  }
}

async function runOne(registry, name, ctx) {
  const adapter = registry[name];
  if (!adapter) return { checker: name, findings: [] };
  const { findings } = await adapter(ctx);
  return { checker: name, findings };
}

/**
 * Run the read-only spec-review checker oracles in parallel and merge their verdicts.
 * Fail-open: `enabled:false` returns a skip marker without invoking any adapter, so the
 * caller falls back to the existing per-skill review. Fail-safe: a checker whose required
 * input is absent contributes an empty verdict rather than throwing.
 */
export async function runCheckerFanout({ slug, rootDir, enabled, checkers, registry, readFile }) {
  if (!enabled) return { skipped: true, reason: 'velocity.checker_fanout disabled' };
  const reg = registry || DEFAULT_CHECKER_REGISTRY;
  const reader = readFile || ((p) => readFileSync(p, 'utf8'));
  const ctx = {
    slug,
    rootDir,
    specContent: reader(join(rootDir, `docs/specs/${slug}.md`)),
    intakeContent: readOptional(reader, join(rootDir, `docs/intake/${slug}.md`)),
  };
  const names = checkers && checkers.length ? checkers : Object.keys(reg);
  const verdicts = await Promise.all(names.map((name) => runOne(reg, name, ctx)));
  return mergeVerdicts(verdicts);
}

function loadFlag(rootDir) {
  try {
    const project = JSON.parse(readFileSync(join(rootDir, '.claude/project.json'), 'utf8'));
    return (project.velocity && project.velocity.checker_fanout) || { enabled: false };
  } catch {
    return { enabled: false };
  }
}

async function runCli(slug) {
  const rootDir = process.cwd();
  const flag = loadFlag(rootDir);
  let result;
  try {
    result = await runCheckerFanout({ slug, rootDir, enabled: flag.enabled, checkers: flag.checkers });
  } catch (err) {
    result = { skipped: true, reason: `fan-out error (fail-open): ${err.message}` };
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.verdict === 'BLOCKED' ? 2 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, slug] = process.argv.slice(2);
  if (cmd === 'run' && slug) {
    runCli(slug).then((code) => process.exit(code));
  } else {
    process.stderr.write('usage: checker-fanout.mjs run <slug>\n');
    process.exit(1);
  }
}
