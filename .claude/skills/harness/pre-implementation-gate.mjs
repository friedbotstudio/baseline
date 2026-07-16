// pre-implementation-gate — the relocated machine spec-review BLOCKED checks
// (D3/CO-E, spec docs/specs/gate-collapse.md D-6 / AC-007).
//
// With the human spec-review gate (the former /approve-spec) eliminated, the
// shippability + checker-fanout BLOCKED cross-checks that formerly gated the
// approval-token write move here: the harness calls this at the
// spec-shippability-review -> implementation boundary. A BLOCKED verdict yields
// (spec defect to fix); a blocked spec never reaches code — no human gate needed.
//
// Fail-safe, mirroring the guard it replaces: an absent or unparseable verdict
// does NOT hard-block (there is no verdict to block on). Only a verdict that
// explicitly reads BLOCKED stops implementation.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertSafeSlug } from './plan-store.mjs';

const VERDICT_FILES = [
  { key: 'shippability', rel: 'state/spec-shippability' },
  { key: 'checker-fanout', rel: 'state/checker-fanout' },
];

function readVerdict(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null; // fail-safe: unparseable verdict does not block
  }
}

/**
 * @param {object} args
 * @param {string} args.slug
 * @param {string} args.rootDir - project root (dir containing .claude/)
 * @returns {{ready: boolean, blockers: Array<{source: string, findings: object[]}>}}
 */
export function checkImplementationReady({ slug, rootDir }) {
  // REJECT, never repair (CWE-22) — mirrors checker-fanout's guard on the same
  // .claude/state/checker-fanout/<slug>.json path. Throws before any path is built.
  assertSafeSlug(slug);
  const blockers = [];
  for (const { key, rel } of VERDICT_FILES) {
    const report = readVerdict(join(rootDir, '.claude', rel, `${slug}.json`));
    if (report && report.verdict === 'BLOCKED') {
      const findings = (report.findings || []).filter((f) => f.severity === 'BLOCKER');
      blockers.push({ source: key, findings });
    }
  }
  return { ready: blockers.length === 0, blockers };
}
