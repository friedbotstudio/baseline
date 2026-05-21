#!/usr/bin/env node
// Foundation helper for the triage skill (post-§18). Two modes:
//
//   node .claude/skills/triage/seed-tasklist.mjs --validate-only
//     Loads .claude/workflows.jsonl, validates against the §18 schema +
//     invariants I1..I11, exits 0 on success or non-zero on failure (with
//     a named error printed to stderr citing the offending track / node).
//
//   node .claude/skills/triage/seed-tasklist.mjs <track_id> <slug> [--exclude-nodes id1,id2,...]
//     Loads .claude/workflows.jsonl, validates, finds the chosen Track,
//     materializes its DAG into a canonical TaskList shape, and prints the
//     resulting JSON array to stdout. The optional --exclude-nodes flag
//     skips the named nodes during emission (used to drop git-conditional
//     consent gates on non-git projects).
//
// The triage skill body invokes this helper as a subprocess; for each entry
// in the printed TaskList it calls TaskCreate, then TaskUpdate to wire
// blockedBy by translating ordinal references to session-assigned task_ids.

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWorkflowsJsonl } from '../../../src/cli/workflows-validator.js';
import { materializeTaskList } from '../../../src/cli/track-tasklist-materializer.js';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '../../..');
const WORKFLOWS_PATH = resolve(REPO_ROOT, '.claude/workflows.jsonl');

async function main(argv) {
  const args = argv.slice(2);
  const validateOnly = args.includes('--validate-only');
  if (validateOnly) {
    return runValidate();
  }
  const positional = args.filter((a) => !a.startsWith('--'));
  const excludeFlag = args.find((a) => a.startsWith('--exclude-nodes='));
  const excludedNodeIds = excludeFlag
    ? new Set(excludeFlag.slice('--exclude-nodes='.length).split(',').filter(Boolean))
    : new Set();
  if (positional.length < 2) {
    printUsageAndExit(2);
  }
  return runMaterialize(positional[0], positional[1], excludedNodeIds);
}

async function runValidate() {
  const result = await validateWorkflowsJsonl(WORKFLOWS_PATH);
  if (!result.ok) {
    printValidationErrors(result.errors);
    process.exit(1);
  }
  process.stderr.write(`validated ${result.tracks.length} tracks in ${WORKFLOWS_PATH}\n`);
  process.exit(0);
}

async function runMaterialize(trackId, slug, excludedNodeIds) {
  const result = await validateWorkflowsJsonl(WORKFLOWS_PATH);
  if (!result.ok) {
    printValidationErrors(result.errors);
    process.exit(1);
  }
  const track = result.tracks.find((t) => t.track_id === trackId);
  if (!track) {
    process.stderr.write(`track_id '${trackId}' not found in ${WORKFLOWS_PATH}\n`);
    process.exit(1);
  }
  if (track.selectable !== true) {
    process.stderr.write(`track '${trackId}' is selectable=false (sub-track); only selectable tracks may be materialized at workflow seed time.\n`);
    process.exit(1);
  }
  const tasks = materializeTaskList(track, { slug });
  const filtered = excludedNodeIds.size > 0
    ? tasks.filter((t) => !excludedTask(t, excludedNodeIds))
    : tasks;
  process.stdout.write(JSON.stringify(filtered, null, 2) + '\n');
  process.exit(0);
}

function excludedTask(task, excludedNodeIds) {
  if (excludedNodeIds.has(task.metadata?.phase)) return true;
  return false;
}

function printValidationErrors(errors) {
  process.stderr.write(`validation failed (${errors.length} error(s)):\n`);
  for (const err of errors) {
    const parts = [err.kind];
    if (err.line) parts.push(`line=${err.line}`);
    if (err.track_id) parts.push(`track_id=${err.track_id}`);
    if (err.node_id) parts.push(`node_id=${err.node_id}`);
    process.stderr.write(`  - ${parts.join(' ')}: ${err.message}\n`);
  }
}

function printUsageAndExit(code) {
  process.stderr.write(
    'usage:\n' +
    '  node .claude/skills/triage/seed-tasklist.mjs --validate-only\n' +
    '  node .claude/skills/triage/seed-tasklist.mjs <track_id> <slug> [--exclude-nodes id1,id2,...]\n'
  );
  process.exit(code);
}

main(process.argv).catch((err) => {
  process.stderr.write(`fatal: ${err.message}\n`);
  process.exit(2);
});
