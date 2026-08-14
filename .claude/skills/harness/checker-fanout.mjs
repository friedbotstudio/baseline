// checker-fanout — deterministic merge of the read-only checkers' verdicts, the
// clause-6 fan-out gate, and the live runner that fans the mechanized spec-review
// oracles out (in parallel) and merges them. Mechanical script fan-out is always
// allowed (parallel scripts are not subagents). LLM-AGENT fan-out is rejected until
// the oracle-bound checker amendment lands (seed.md §II.A clause 6).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleContext, describeInputState } from './assemble-context.mjs';
import { runDiagramOracle } from '../spec-diagram-review/oracle.mjs';
import { runTraceabilityOracle } from '../spec-traceability-review/oracle.mjs';
import { runRolloutOracle } from '../spec-rollout-enforceability-review/oracle.mjs';
import { runSecurityOracle } from '../security/oracle.mjs';
import { runSimplifyOracle } from '../simplify/oracle.mjs';
import { runCodeStructureOracle } from '../code-structure/oracle.mjs';
import { run as runBacklogDeferralChecker } from './checkers/backlog-deferral.mjs';
import { mutationScoreAdapter } from './checkers/mutation-score.mjs';
import { acConformanceAdapter } from './checkers/ac-conformance.mjs';
import { specLintAdapter } from './checkers/spec-lint.mjs';
import { specShippabilityAdapter } from './checkers/spec-shippability.mjs';
import { readPlan, setVerdictArtifact, assertSafeSlug } from './plan-store.mjs';

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

// The extension point: checker name -> { phase, run(ctx) -> { findings } }. Each entry
// carries a `phase` tag — the spec-review subset runs after the spec and before
// implementation (its verdict is read by pre-implementation-gate — gate-collapse D-6),
// the code-review subset runs at the integrate boundary (a parallel projection).
// spec-lint / spec-shippability adapters are deferred (-d186).
export const DEFAULT_CHECKER_REGISTRY = {
  'spec-diagram': { phase: 'spec-review', run: (ctx) => runDiagramOracle(ctx.specContent) },
  'spec-traceability': {
    phase: 'spec-review',
    run: (ctx) => (ctx.intakeContent == null
      ? { findings: [] }
      : runTraceabilityOracle({ spec: ctx.specContent, intake: ctx.intakeContent })),
  },
  'spec-rollout': { phase: 'spec-review', run: (ctx) => runRolloutOracle({ specContent: ctx.specContent }) },
  // The two adapters backlog `-d186` deferred. They compose rather than wrap,
  // because neither source skill exports an oracle-shaped entry — see the module
  // comments in checkers/spec-lint.mjs and checkers/spec-shippability.mjs.
  'spec-lint': specLintAdapter,
  'spec-shippability': specShippabilityAdapter,
  security: { phase: 'code-review', run: (ctx) => runSecurityOracle({ securityReport: ctx.securityReport }) },
  simplify: { phase: 'code-review', run: (ctx) => runSimplifyOracle({ simplifyTable: ctx.simplifyTable }) },
  'code-structure': { phase: 'code-review', run: (ctx) => runCodeStructureOracle({ changedFiles: ctx.changedFiles || [] }) },
  'backlog-deferral': { phase: 'code-review', run: (ctx) => runBacklogDeferralChecker({ changedFiles: ctx.changedFiles || [] }) },
  // C5 — two non-UI oracles ride the same interface, both gated off by default.
  'mutation-score': mutationScoreAdapter,
  'ac-conformance': acConformanceAdapter,
};

function entryRun(entry) {
  return typeof entry === 'function' ? entry : entry.run;
}
function entryPhase(entry) {
  return entry.phase || 'spec-review';
}

/**
 * Migration (AC-008): mirror a merged verdict into the durable plan object when one
 * exists for `slug`. Back-compat: no plan on disk → returns null and nothing changes
 * (the live gate-A path has no plan at spec-review time, so behavior is unchanged).
 */
export function mirrorVerdictToPlan(rootDir, slug, merged) {
  const plan = readPlan(slug, rootDir);
  return plan ? setVerdictArtifact(plan, slug, merged) : null;
}

/**
 * Persist the merged verdict. The spec-review phase writes the CANONICAL projection
 * at .claude/state/checker-fanout/<slug>.json (read by pre-implementation-gate.mjs, which
 * gates implementation entry on a BLOCKED verdict — gate-collapse D-6). The code-review
 * phase writes a SEPARATE projection at .claude/state/checker-fanout-code/<slug>.json — it is
 * never allowed to touch the spec-review path. The durable-plan mirror rides that path only.
 */
function persistVerdict(rootDir, slug, merged, phase) {
  const dir = phase === 'code-review' ? 'checker-fanout-code' : 'checker-fanout';
  const out = join(rootDir, '.claude/state', dir, `${slug}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(merged, null, 2)}\n`);
  if (phase === 'code-review') return;
  // The projection above is canonical for pre-implementation-gate; the durable-plan mirror is
  // best-effort. A failed mirror write must never take the spec-review verdict down with it, so it
  // is isolated here — but reported, so a persistently broken mirror stays visible.
  try {
    mirrorVerdictToPlan(rootDir, slug, merged);
  } catch (err) {
    process.stderr.write(
      `checker-fanout: durable-plan mirror failed for "${slug}" (verdict projection is intact): ${err.message}\n`,
    );
  }
}

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
  const { findings } = await entryRun(adapter)(ctx);
  return { checker: name, findings };
}

/**
 * Run the read-only spec-review checker oracles in parallel and merge their verdicts.
 * Fail-open: `enabled:false` returns a skip marker without invoking any adapter, so the
 * caller falls back to the existing per-skill review. Fail-safe: a checker whose required
 * input is absent contributes an empty verdict rather than throwing.
 */
export async function runCheckerFanout({ slug, rootDir, enabled, phase, ctx: extraCtx, checkers, registry, readFile }) {
  if (!enabled) return { skipped: true, reason: 'velocity.checker_fanout disabled' };
  // Guard at the entry, not just at the write: the ctx below builds docs/specs/<slug>.md and
  // docs/intake/<slug>.md from the raw slug, so a traversal would read arbitrary files into
  // the oracles before any path was ever persisted.
  assertSafeSlug(slug);
  const reg = registry || DEFAULT_CHECKER_REGISTRY;
  const reader = readFile || ((p) => readFileSync(p, 'utf8'));
  const effectivePhase = phase || 'spec-review';
  const specPath = join(rootDir, `docs/specs/${slug}.md`);
  // Spec-review needs the spec (gate-A oracles read it); code-review scores the diff, so a
  // missing spec is not an error there.
  const specContent = effectivePhase === 'code-review' ? readOptional(reader, specPath) : reader(specPath);
  // The code-review checkers score a diff, so their input is assembled here rather
  // than left to the caller's prose. A caller that supplies changedFiles keeps
  // supplying them; one that does not now gets a real list instead of [].
  const assembled = effectivePhase === 'code-review' && !extraCtx?.changedFiles
    ? assembleContext({ rootDir })
    : null;
  const ctx = {
    slug,
    rootDir,
    specContent,
    intakeContent: readOptional(reader, join(rootDir, `docs/intake/${slug}.md`)),
    ...(assembled ? { changedFiles: assembled.changedFiles } : {}),
    ...(extraCtx || {}),
  };
  const names = checkers && checkers.length
    ? checkers
    : Object.keys(reg).filter((n) => entryPhase(reg[n]) === effectivePhase);
  const verdicts = await Promise.all(names.map((name) => runOne(reg, name, ctx)));
  const merged = {
    ...mergeVerdicts(verdicts),
    ...(effectivePhase === 'code-review'
      ? { inputState: describeInputState(ctx.changedFiles || [], { probeFailed: false }) }
      : {}),
  };
  persistVerdict(rootDir, slug, merged, effectivePhase);
  return merged;
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
