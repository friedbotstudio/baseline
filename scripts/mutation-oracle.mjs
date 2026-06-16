// mutation-testing-oracle (-f029) — dev-only, advisory mutation-score oracle.
//
// DEV-ONLY: this file lives in scripts/ (NOT in the npm `files` whitelist) and
// uses @stryker-mutator/core (a devDependency). It never ships to consumers
// (AC-007) and never writes .claude/state/last_test_result (AC-005, advisory).
//
// Interface (codesign D2 + scenario finding): the test path is EXPLICIT because
// the co-named convention is not strict in this repo.
//   npm run test:mutation -- <module> <testPath>
//
// Stryker drives the bare `node --test` suite via its command runner. context7
// (@stryker-mutator/core@9.6.1) confirmed `coverageAnalysis: perTest` is NOT
// supported by the command runner, so we set it to "off" and bound cost by
// scoping `mutate` to ONE file and the command to ONE test (D2).

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
// tier-dial:read-path — the tdd checker's floor/ceiling come from the tier dial at
// .claude/hooks/lib/tier-dial.mjs via resolveCheckerThreshold('tdd'). Advisory only
// this slice (piece 2): the oracle surfaces score-vs-floor; it never blocks (piece 5).
import { resolveCheckerThreshold } from '../.claude/hooks/lib/tier-dial.mjs';

// ---------- Domain (pure) ----------

/** Mutation score from raw counts: killed/total, or null when there are no mutants. */
function scoreFromCounts(total, survivorCount) {
  if (total === 0) return null;
  return (total - survivorCount) / total;
}

/** Mutation score (0..1) for a report, or null when the report has no mutants. */
export function computeScore(report) {
  return scoreFromCounts(countMutants(report), parseSurvivors(report).length);
}

/** Compare a score against its floor. null score OR null floor → NA (no verdict). */
export function surfaceComparison(score, floor) {
  let relation;
  if (score === null || floor === null) relation = 'NA';
  else relation = score >= floor ? 'ABOVE' : 'BELOW';
  return { score, floor, relation };
}

/** Build a Stryker config scoped to one module + one test command. */
export function buildConfig(modulePath, testPath) {
  if (!modulePath || !testPath) {
    throw new Error('mutation-oracle: both <module> and <testPath> are required (test path is not derived)');
  }
  return {
    mutate: [modulePath],
    testRunner: 'command',
    commandRunner: { command: `node --test ${testPath}` },
    coverageAnalysis: 'off', // perTest unsupported by the command runner (context7)
    reporters: ['json'],
    jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  };
}

/** Extract surviving mutants from a mutation-testing-report-schema JSON object. */
export function parseSurvivors(report) {
  const survivors = [];
  const files = (report && report.files) || {};
  for (const [file, entry] of Object.entries(files)) {
    for (const m of entry.mutants || []) {
      if (m.status === 'Survived') {
        survivors.push({
          file,
          line: m.location?.start?.line ?? null,
          mutationKind: m.mutatorName,
        });
      }
    }
  }
  return survivors;
}

/** Count total mutants across all files in a report. */
export function countMutants(report) {
  const files = (report && report.files) || {};
  return Object.values(files).reduce((n, e) => n + (e.mutants?.length || 0), 0);
}

function scopeSlug(modulePath) {
  return modulePath.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ---------- Foundation (advisory I/O — never last_test_result) ----------

/** Write the advisory report; returns the path. NEVER writes last_test_result. */
export function emitAdvisory(run, { stateDir, generatedAt }) {
  const dir = join(stateDir, 'mutation');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${scopeSlug(run.scopeModule)}.json`);
  writeFileSync(
    out,
    JSON.stringify(
      {
        scopeModule: run.scopeModule,
        mutantsTotal: run.mutantsTotal,
        survivors: run.survivors,
        score: run.score ?? null,
        floor: run.floor ?? null,
        relation: run.relation ?? 'NA',
        generatedAt,
        advisory: true,
      },
      null,
      2,
    ) + '\n',
  );
  return out;
}

// ---------- Orchestration ----------

/** Run Stryker scoped to (modulePath, testPath); return {survivors, mutantsTotal}. */
export async function runOracle(modulePath, testPath, { cwd = process.cwd() } = {}) {
  const cfg = buildConfig(modulePath, testPath);
  const cfgPath = join(cwd, `.stryker.oracle.${scopeSlug(modulePath)}.json`);
  const reportPath = join(cwd, 'reports/mutation/mutation.json');
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  try {
    const res = spawnSync(
      'npx',
      ['stryker', 'run', cfgPath],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    if (!existsSync(reportPath)) {
      throw new Error(
        `mutation-oracle: Stryker produced no JSON report (exit ${res.status}).\n${res.stderr || res.stdout || ''}`.trim(),
      );
    }
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    return { survivors: parseSurvivors(report), mutantsTotal: countMutants(report) };
  } finally {
    rmSync(cfgPath, { force: true });
  }
}

// ---------- CLI ----------

async function main(argv) {
  const [modulePath, testPath] = argv;
  if (!modulePath || !testPath) {
    process.stderr.write('usage: npm run test:mutation -- <module> <testPath>\n');
    process.exit(2);
  }
  const cwd = process.cwd();
  const { survivors, mutantsTotal } = await runOracle(modulePath, testPath, { cwd });
  const score = scoreFromCounts(mutantsTotal, survivors.length);
  const { tier, floor } = resolveCheckerThreshold('tdd');
  const { relation } = surfaceComparison(score, floor);
  const out = emitAdvisory(
    { scopeModule: modulePath, mutantsTotal, survivors, score, floor, relation },
    { stateDir: resolve(cwd, '.claude/state'), generatedAt: new Date().toISOString() },
  );
  const pct = (x) => (x === null ? 'n/a' : `${Math.round(x * 100)}%`);
  process.stdout.write(`mutation score ${pct(score)} vs floor ${pct(floor)} (${tier}): ${relation}\n`);
  if (survivors.length === 0) {
    process.stdout.write(`mutation-oracle: no surviving mutants in ${modulePath} (${mutantsTotal} mutants). Report: ${out}\n`);
  } else {
    process.stdout.write(`mutation-oracle: ${survivors.length}/${mutantsTotal} SURVIVED in ${modulePath}:\n`);
    for (const s of survivors) process.stdout.write(`  ${s.file}:${s.line}:${s.mutationKind}\n`);
    process.stdout.write(`Report (advisory): ${out}\n`);
  }
  // Advisory: survivors do NOT set a non-zero exit (they are not an error).
  process.exit(0);
}

// `new Date()` is allowed here (dev CLI, not a workflow-state writer).
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
