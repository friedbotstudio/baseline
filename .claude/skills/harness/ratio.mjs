#!/usr/bin/env node
// Foundation — what is this workflow's payload against the envelope it pays for?
//
// `work-planner.measurePayload` reads the ARCHIVED corpus, which is the right
// source once a run has landed and the wrong one while it is still going. Every
// ratio a person asks for is for a workflow in flight, because the number is only
// worth having while a decision still hangs on it. So this module reads the live
// timing log, and defers to the archived measure wherever both resolve.
//
// It reports. No flag withholds it: asking for a measurement is a read, and the
// `velocity.work_planner` flag governs whether the HARNESS acts on the number.

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingPath } from '../../hooks/lib/timing.mjs';
import { PAYLOAD_PHASES } from './timing-corpus.mjs';
import { envelopeFor } from './envelope.mjs';
import { measurePayload } from './work-planner.mjs';
import { assertSafeSlug } from './reentry.mjs';
import { classify } from './verdict.mjs';

function readRows(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

const outTokens = (row) => (Number.isFinite(row?.out_tokens) ? row.out_tokens : null);

// `applicable` stays true even with nothing to measure. The archived reader derives
// it from whether a payload phase appears at all, which cannot tell a chore track
// apart from a run that has not reached its payload phase yet. This module measures
// and leaves that judgment to the caller rather than guessing it from an absence.
export function measureLivePayload({ rootDir, slug, track }) {
  assertSafeSlug(slug);
  const rows = readRows(timingPath(rootDir, slug));
  const unmeasured = { track, payload_tokens: 0, measured: false, applicable: true, source: 'live' };
  if (rows.length === 0) return unmeasured;

  const baseline = outTokens(rows.find((r) => r.phase === 'run-start')) ?? 0;
  const done = rows.filter((r) => r.event === 'completed' && PAYLOAD_PHASES.has(r.phase));
  const last = outTokens(done[done.length - 1]);
  if (last === null) return unmeasured;

  return { track, payload_tokens: Math.max(0, last - baseline), measured: true, applicable: true, source: 'live' };
}

export function ratio({ rootDir, slug, track }) {
  const envelope = envelopeFor({ rootDir, track });
  const archived = measurePayload({ rootDir, slug, track });
  const payload = archived.measured
    ? { ...archived, source: 'archive' }
    : measureLivePayload({ rootDir, slug, track });
  return classify({ envelope, payload });
}

const USAGE = `usage: node .claude/skills/harness/ratio.mjs --slug <slug> [--track <track>] [--json]

Prints this workflow's payload against its fitted envelope. Reads the archived
timing table when the run has landed, the live timing log while it is still going.
`;

function trackFor(rootDir, slug, explicit) {
  if (explicit) return explicit;
  try {
    const w = JSON.parse(readFileSync(join(rootDir, '.claude/state/workflow.json'), 'utf8'));
    return w.slug === slug ? w.track_id : null;
  } catch { return null; }
}

function render(v) {
  if (v.ratio === null) return `ratio: ${v.state} — nothing measurable yet for this workflow\n`;
  const env = v.envelope;
  return [
    `payload   ${v.payload.payload_tokens.toLocaleString()} tokens (${v.payload.source})`,
    `envelope  ${env.envelope_tokens.toLocaleString()} tokens (${env.fitted ? `fitted, ${env.sample_count} samples` : 'shipped default, unfitted'})`,
    `ratio     ${v.ratio}  ${v.state}`,
    v.shortfall_tokens > 0 ? `shortfall ${v.shortfall_tokens.toLocaleString()} tokens to the 4x target` : '',
  ].filter(Boolean).join('\n') + '\n';
}

function main(argv) {
  if (argv.includes('--help') || argv.length === 0) { process.stdout.write(USAGE); return 0; }
  const at = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
  const slug = at('--slug');
  if (!slug) { process.stderr.write(`--slug is required\n\n${USAGE}`); return 1; }

  const rootDir = process.cwd();
  const track = trackFor(rootDir, slug, at('--track'));
  if (!track) { process.stderr.write(`could not resolve a track for \`${slug}\`; pass --track\n`); return 1; }

  const verdict = ratio({ rootDir, slug, track });
  process.stdout.write(argv.includes('--json') ? `${JSON.stringify(verdict, null, 2)}\n` : render(verdict));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
