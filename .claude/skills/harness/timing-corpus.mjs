// Foundation — read archived timing tables into per-bundle token sums.
//
// Spec D1: the envelope is fitted from the RENDERED `timing.md`, not from
// `.claude/state/timing/<slug>.jsonl`. The JSONL does not survive archival, so the
// rendered table is the only durable corpus an operator accumulates.
//
// Spec D2: a token cell that is not a decimal integer marks the bundle UNMEASURED.
// It is never coerced to zero. Six archived bundles carry `n/a` because the
// transcript was unavailable, which is a different fact from costing nothing.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Spec D6: swarm-dispatch is payload — a swarm worker runs scenario then implement.
const PAYLOAD_PHASES = new Set(['tdd', 'scenario', 'implement', 'swarm-dispatch']);

const CHILD_PREFIX = '└';
const RETRY_SUFFIX = /^attempt-\d+$/;
const TOKEN_CELL = /^\d+$/;

// The renderer prefixes every child row with `└ ` (timing.mjs:336) and both kinds of
// child ride it, so the prefix alone cannot separate them. The anchoring does:
// worker-tick subs anchor at the parent's START and sum to the parent rollup, so
// counting them double-counts; re-entry retries anchor at the parent's COMPLETION,
// so they are cost the parent row does not contain. Skip the first, keep the second.
function classifyRow(rawLabel) {
  let label = rawLabel.trim();
  const isChild = label.startsWith(CHILD_PREFIX);
  if (isChild) label = label.slice(CHILD_PREFIX.length).trim();

  if (label === 'run-start') return { count: false };

  const colon = label.indexOf(':');
  if (colon === -1) return { count: true, phase: label };

  const base = label.slice(0, colon);
  const suffix = label.slice(colon + 1);
  if (!RETRY_SUFFIX.test(suffix)) return { count: false };
  return { count: true, phase: base };
}

function parseTable(text) {
  let payload = 0;
  let envelope = 0;
  let sawPayloadPhase = false;
  let measured = text.includes('Tokens (out)');

  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 4) continue;
    if (cells[0] === 'Phase' || cells[0].startsWith('---')) continue;

    const row = classifyRow(cells[0]);
    if (!row.count) continue;

    const isPayload = PAYLOAD_PHASES.has(row.phase);
    if (isPayload) sawPayloadPhase = true;

    if (!TOKEN_CELL.test(cells[3])) {
      measured = false;
      continue;
    }
    const tokens = Number(cells[3]);
    if (isPayload) payload += tokens;
    else envelope += tokens;
  }

  // An unmeasured bundle carries nulls, not zeros. A zero here would be a MEASURED
  // zero — the same conflation D2 forbids at the fit, moved one layer down into the
  // record where it is harder to see.
  if (!measured) return { payload_tokens: null, envelope_tokens: null, measured: false, applicable: sawPayloadPhase };

  return { payload_tokens: payload, envelope_tokens: envelope, measured: true, applicable: sawPayloadPhase };
}

function subdirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => {
    try {
      return statSync(join(dir, name)).isDirectory();
    } catch {
      return false;
    }
  });
}

function trackOf(bundleDir) {
  try {
    return JSON.parse(readFileSync(join(bundleDir, 'workflow.json'), 'utf8')).track_id ?? null;
  } catch {
    return null;
  }
}

// Every archived bundle carrying a rendered timing table, with its track and its
// two token sums. Bundles are returned whether or not they measured — the caller
// decides what to exclude, and `measured` is how it tells.
export function readCorpus({ rootDir }) {
  const archive = join(rootDir, 'docs/archive');
  const bundles = [];

  for (const day of subdirs(archive)) {
    for (const slug of subdirs(join(archive, day))) {
      const dir = join(archive, day, slug);
      const table = join(dir, 'timing.md');
      if (!existsSync(table)) continue;

      const parsed = parseTable(readFileSync(table, 'utf8'));
      bundles.push({ slug, day, track: trackOf(dir), ...parsed });
    }
  }

  return bundles;
}

export { PAYLOAD_PHASES };
