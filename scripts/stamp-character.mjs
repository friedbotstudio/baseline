#!/usr/bin/env node
// Orchestration — writes each skill's character block into the DEV tree.
//
// This runs at Stage 0c, before Stage 1's rsync, because build-manifest.mjs hashes
// obj/template while audit-baseline re-hashes the same paths under the repo root.
// Stamping after the copy leaves the two disagreeing on every shipped target.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { loadDoctrine, renderBlock, stampSkill, skillPathFor } from '../.claude/skills/audit-baseline/character.mjs';

export function stampAll(rootDir, { log = console.log } = {}) {
  const doctrine = loadDoctrine(rootDir);
  const changed = [];
  for (const [slug, entry] of Object.entries(doctrine.skills)) {
    const path = skillPathFor(rootDir, slug);
    const rel = `.claude/skills/${slug}/SKILL.md`;
    if (!existsSync(path)) continue;
    const current = readFileSync(path, 'utf8');
    const stamped = stampOne(rel, current, entry);
    if (stamped === current) continue;
    writeFileSync(path, stamped);
    changed.push(rel);
    log(`stamp-character: ${rel} updated`);
  }
  return changed;
}

function stampOne(rel, current, entry) {
  try {
    return stampSkill(current, renderBlock(entry));
  } catch (cause) {
    throw new Error(`stamp-character: ${rel}: ${cause.message}`, { cause });
  }
}

const invokedDirectly = process.argv[1]?.endsWith('stamp-character.mjs');
if (invokedDirectly) {
  try {
    stampAll(process.argv[2] || process.cwd());
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
