// Orchestration — is this workflow carrying enough work to justify its envelope?
//
// Composition only: the verdict lives in verdict.mjs, the candidate work in
// proposal.mjs, the envelope fit in envelope.mjs. This module resolves the flag,
// measures this workflow's own payload, and joins the three.
//
// It reports and proposes. It never skips a phase, never adds one, and never writes
// a consent token (Rollout prerequisite 3).

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { envelopeFor } from './envelope.mjs';
import { readCorpus } from './timing-corpus.mjs';
import { assertSafeSlug } from './reentry.mjs';
import { classify, FLOOR, TARGET } from './verdict.mjs';
import { proposeWork, applyProposal, recordOverride } from './proposal.mjs';
import { clip } from '../lib/terminal-text.mjs';

function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

// An absent key resolves false, so an un-upgraded config keeps today's behaviour.
export function checkEnabled(project) {
  return project?.velocity?.work_planner?.enabled === true;
}

// This workflow's own payload, read from the bundles it has already stamped.
export function measurePayload({ rootDir, slug, track }) {
  assertSafeSlug(slug);
  const own = readCorpus({ rootDir }).filter((b) => b.slug === slug);

  if (own.length === 0 || !own[0].measured) return { track, payload_tokens: 0, measured: false, applicable: true };
  return { track, payload_tokens: own[0].payload_tokens, measured: true, applicable: own[0].applicable };
}

export function check({ rootDir, slug }) {
  assertSafeSlug(slug);
  if (!checkEnabled(readJson(join(rootDir, '.claude/project.json'), {}))) {
    return { state: 'disabled', ratio: null, shortfall_tokens: 0 };
  }

  const workflow = readJson(join(rootDir, '.claude/state/workflow.json'));
  if (!workflow) return { state: 'unfitted', ratio: null, shortfall_tokens: 0 };

  const track = workflow.track_id ?? null;
  const verdict = classify({
    envelope: envelopeFor({ rootDir, track }),
    payload: measurePayload({ rootDir, slug, track }),
  });

  if (verdict.state === 'under-floor' || verdict.state === 'acceptable') {
    verdict.proposal = proposeWork({ rootDir, shortfallTokens: verdict.shortfall_tokens });
  }
  return verdict;
}

// ─── entry point (spec dispatcher-sweep, Pattern B) ───

const USAGE = `usage: node .claude/skills/harness/work-planner.mjs check --slug <slug> [--json]

subcommands:
  check    report the payload/envelope verdict for a workflow

flags:
  --slug <slug>  the workflow slug (required)
  --json         emit the raw verdict object
`;

function renderVerdict(verdict) {
  const ratio = verdict.ratio === null ? 'n/a' : `${verdict.ratio}x`;
  const lines = [`${verdict.state}  ratio=${ratio}  shortfall=${verdict.shortfall_tokens}`];

  if (verdict.proposal?.candidates?.length) {
    lines.push(`proposed to close the gap (${verdict.proposal.candidates.length}):`);
    // A backlog key is repository-controlled content on its way to a terminal; an
    // erase-line escape in one rewrites the candidate printed above it.
    for (const c of verdict.proposal.candidates) lines.push(`  ${clip(c.key)}`);
  }
  return `${lines.join('\n')}\n`;
}

function main(argv) {
  const subcommand = argv[0];
  if (!subcommand || subcommand === '--help') { process.stdout.write(USAGE); return 0; }
  if (subcommand !== 'check') { process.stderr.write(`unknown subcommand \`${subcommand}\`\n\n${USAGE}`); return 1; }

  const slugIndex = argv.indexOf('--slug');
  const slug = slugIndex >= 0 ? argv[slugIndex + 1] : null;
  if (!slug) { process.stderr.write(`check requires --slug\n\n${USAGE}`); return 1; }

  let verdict;
  try {
    verdict = check({ rootDir: process.cwd(), slug });
  } catch (error) {
    process.stderr.write(`work-planner: ${error.message}\n`);
    return 1;
  }

  process.stdout.write(argv.includes('--json') ? `${JSON.stringify(verdict, null, 2)}\n` : renderVerdict(verdict));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}

export { classify, proposeWork, applyProposal, recordOverride, FLOOR, TARGET };
