#!/usr/bin/env node
// Orchestration — the on-demand "what's new" generator.
//
// Reads a caller-supplied entries file (the impending change, which main
// context knows), writes the gitignored fragment, and reports the resolved
// per-project routing target. Writes nothing to CHANGELOG.md — that file is
// owned solely by semantic-release in CI.
//
// CLI:
//   node whatsnew.mjs --slug <slug> --entries-file <path> [--project-root <path>]

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { writeFragment } from './fragment-writer.mjs';
import { resolveRouteWorkflow } from './route-resolver.mjs';

function parseCli() {
  const { values } = parseArgs({
    options: {
      slug: { type: 'string' },
      'entries-file': { type: 'string' },
      'project-root': { type: 'string', default: '.' },
    },
    strict: true,
  });
  if (!values.slug || !values['entries-file']) {
    process.stderr.write('error: --slug and --entries-file <path> are required\n');
    process.exit(2);
  }
  return {
    slug: values.slug,
    entriesFile: resolve(values['entries-file']),
    repoRoot: resolve(values['project-root']),
  };
}

function readEntries(entriesFile) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(entriesFile, 'utf8'));
  } catch (err) {
    throw new Error(`cannot read --entries-file ${entriesFile}: ${err.message}`);
  }
  return parsed;
}

function readProject(repoRoot) {
  const path = join(repoRoot, '.claude/project.json');
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function main() {
  const { slug, entriesFile, repoRoot } = parseCli();
  const entries = readEntries(entriesFile);
  const { path } = await writeFragment({ repoRoot, slug, entries });
  const route = resolveRouteWorkflow(readProject(repoRoot));
  process.stdout.write(`whatsnew: wrote ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} to ${path}\n`);
  process.stdout.write(route ? `whatsnew: route_workflow = ${route}\n` : 'whatsnew: no route_workflow configured (fragment unconsumed)\n');
}

main().catch((err) => {
  process.stderr.write(`error: ${err.message}\n`);
  process.exit(1);
});
