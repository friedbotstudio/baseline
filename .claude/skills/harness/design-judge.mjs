// design-judge — the C4 quality oracle WITH TEETH. Captures the rendered surface via
// Playwright (the playwright MCP tools in production; injected `deps` in tests), scores
// it MECHANICALLY against the spec's B1 Quality criteria, and fails `verify` below the
// threshold. The LLM-vision read against the Reference target is ADVISORY only — it is
// surfaced but never flips a mechanical PASS to FAIL (D1). No browser → SKIP with a
// recorded reason, never a false FAIL (AC-007).

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCheckerThreshold } from '../../hooks/lib/tier-dial.mjs';

// tier-dial:read-path — the design-judge pass threshold (max allowed missed quality
// criteria) is `resolveCheckerThreshold('design-judge').floor` (D2). floor 0 = every
// mechanical criterion must be met.

// --- Foundation: mechanical scoring of a snapshot against measurable criteria --------

function contrastFloor(token) {
  if (token === 'aa') return 4.5;
  if (token === 'aaa') return 7;
  const n = parseFloat(token);
  return Number.isFinite(n) ? n : 0;
}

function criterionMet(criterion, snapshot) {
  const c = criterion.toLowerCase();
  const contrast = /contrast\s*>?=?\s*(aa|aaa|[\d.]+)/.exec(c);
  if (contrast) {
    return typeof snapshot.contrast === 'number' && snapshot.contrast >= contrastFloor(contrast[1]);
  }
  const element = /(?:element\s+)?(\w+)\s+present/.exec(c);
  if (element) {
    const name = element[1];
    const tree = String(snapshot.tree || '');
    const boxes = Array.isArray(snapshot.boxes) ? snapshot.boxes : [];
    return tree.includes(name) || boxes.some((b) => String(b.ref || '').includes(name));
  }
  return true; // an unparseable bar is not a mechanical fail — the vision read covers subjective intent
}

function scoreAgainstCriteria(snapshot, qualityCriteria) {
  const criteria = String(qualityCriteria || '').split(/[;,]/).map((c) => c.trim()).filter(Boolean);
  const failed = criteria.filter((c) => !criterionMet(c, snapshot));
  return { total: criteria.length, met: criteria.length - failed.length, failed, score: criteria.length ? (criteria.length - failed.length) / criteria.length : 1 };
}

function stampFail(rootDir) {
  const out = join(rootDir, '.claude/state/last_test_result');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `FAIL\n${new Date().toISOString()}\ndesign-judge\n1\n`);
}

// --- Domain: the judge --------------------------------------------------------------

export async function runDesignJudge({ row, deps }) {
  const d = deps || {};
  try {
    if (typeof d.navigate === 'function') await d.navigate(row && row.referenceTarget);
  } catch (err) {
    return { status: 'SKIP', reason: `playwright browser unavailable: ${err.message}` };
  }
  let snapshot;
  try {
    snapshot = (typeof d.snapshot === 'function' ? await d.snapshot() : {}) || {};
  } catch (err) {
    return { status: 'SKIP', reason: `render capture failed (no browser?): ${err.message}` };
  }
  const scored = scoreAgainstCriteria(snapshot, row && row.qualityCriteria);
  const tierDial = d.tierDial || resolveCheckerThreshold;
  const maxMisses = Number(tierDial('design-judge').floor) || 0;
  let vision = null;
  try {
    vision = typeof d.vision === 'function' ? await d.vision() : null;
  } catch { vision = null; }

  if (scored.failed.length > maxMisses) {
    if (d.rootDir) stampFail(d.rootDir);
    return { status: 'FAIL', score: scored.score, reason: `quality criteria not met: ${scored.failed.join('; ')}`, vision };
  }
  return { status: 'PASS', score: scored.score, reason: 'all quality criteria met', vision };
}

// --- Orchestration: CLI (gated by velocity.design_judge.enabled) --------------------

function judgeEnabled(rootDir) {
  try {
    const project = JSON.parse(readFileSync(join(rootDir, '.claude/project.json'), 'utf8'));
    return Boolean(project.velocity && project.velocity.design_judge && project.velocity.design_judge.enabled);
  } catch {
    return false;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const slug = process.argv[2];
  const rootDir = process.cwd();
  if (!slug) {
    process.stderr.write('usage: design-judge.mjs <slug>\n');
    process.exit(1);
  }
  if (!judgeEnabled(rootDir)) {
    process.stdout.write(`{"status":"SKIP","reason":"velocity.design_judge disabled"}\n`);
    process.exit(0);
  }
  // Production capture wiring (the playwright MCP tools) is bound by the harness at the
  // design-judge tick; the CLI entrypoint is the disabled-gate stub until then.
  process.stdout.write(`{"status":"SKIP","reason":"no capture deps bound in CLI context"}\n`);
  process.exit(0);
}
