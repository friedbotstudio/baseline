#!/usr/bin/env node
// Shipped CLI helper for /upgrade-project. Records a per-target reconciliation
// marker entry by writing <target>/.claude/.baseline-reconciliations.json
// atomically (write-then-rename). The shipped helper exists because consumer
// installs receive only `.claude/` + `docs/init/seed.md` from the npm package —
// they don't receive `src/cli/reconciliation-marker.js`, so the previous
// `node -e "import('./src/cli/reconciliation-marker.js')..."` invocation in
// upgrade-project/SKILL.md failed with ERR_MODULE_NOT_FOUND at every consumer
// /upgrade-project run.
//
// This module is the write side mirror of src/cli/reconciliation-marker.js →
// recordReconciliation. The marker shape and atomic-write semantics are
// byte-identical; only the entry point differs (this file is a CLI; the dev
// tree's file is an in-process library consumed by src/cli/merge.js and
// src/cli/doctor.js).
//
// Spec: docs/specs/marker-helper-shipped-instead-of-dev-import.md

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const MARKER_REL = '.claude/.baseline-reconciliations.json';
const SCHEMA_VERSION = 1;

const USAGE = `usage: node .claude/skills/upgrade-project/marker.mjs record <target> <rel> <baseline_version> <template_sha>`;

async function main(argv) {
  const [subcommand, ...rest] = argv;
  if (!subcommand) return fail(`missing subcommand\n${USAGE}`);
  if (subcommand !== 'record') return fail(`unknown subcommand: ${subcommand}\n${USAGE}`);
  return runRecord(rest);
}

async function runRecord(args) {
  const required = ['target', 'rel', 'baseline_version', 'template_sha'];
  for (let i = 0; i < required.length; i++) {
    if (args[i] === undefined || args[i] === '') {
      return fail(`missing argument: ${required[i]}\n${USAGE}`);
    }
  }
  const [target, rel, baseline_version, template_sha] = args;
  try {
    await recordReconciliation(target, rel, baseline_version, template_sha);
    return 0;
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    return 1;
  }
}

async function recordReconciliation(target, rel, baseline_version, template_sha) {
  const path = join(target, MARKER_REL);
  const existing = (await readMarker(path)) ?? newMarker();
  existing.reconciliations[rel] = {
    baseline_version,
    reconciled_against_template_sha: template_sha,
    reconciled_at: new Date().toISOString(),
  };
  await atomicWriteJson(path, existing);
}

async function readMarker(path) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed.reconciliations !== 'object') return null;
    if (parsed.schema_version !== SCHEMA_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function newMarker() {
  return { schema_version: SCHEMA_VERSION, reconciliations: {} };
}

async function atomicWriteJson(path, obj) {
  const tmp = `${path}.${randomUUID()}.tmp`;
  const body = JSON.stringify(obj, null, 2) + '\n';
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(tmp, body);
    await rename(tmp, path);
  } catch (err) {
    throw new Error(`cannot write ${MARKER_REL}: ${err.message}`);
  }
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  return 2;
}

const code = await main(process.argv.slice(2));
process.exit(code);
