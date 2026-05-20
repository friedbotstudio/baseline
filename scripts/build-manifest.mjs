import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// The shipped manifest lives at `<template>/.claude/manifest.json` (NOT the
// template root) so the recursive install copies it straight to
// `<target>/.claude/manifest.json` without special-casing. Same path is used
// by the consumer-side audit (.claude/skills/audit-baseline/audit.sh) for
// hash-drift detection — the file follows the baseline into every project.
const MANIFEST_REL = '.claude/manifest.json';

const templateDir = process.argv[2];
if (!templateDir) {
  process.stderr.write('Usage: build-manifest.mjs <template-dir>\n');
  process.exit(1);
}

async function collectFiles(dir, base) {
  const entries = await readdir(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await collectFiles(full, base);
      results.push(...sub);
    } else if (entry.isFile()) {
      results.push(relative(base, full));
    }
  }
  return results;
}

function hashFile(filePath) {
  const buf = readFileSync(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

function readOwnerFrontmatter(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) return null;
  const ownerMatch = fmMatch[1].match(/^owner:\s*(\S+)\s*$/m);
  return ownerMatch ? ownerMatch[1] : null;
}

function collectOwnersFromTemplate(allFiles) {
  const skillSlugs = new Set();
  for (const rel of allFiles) {
    const m = rel.match(/^\.claude\/skills\/([^/]+)\/SKILL\.md$/);
    if (m) skillSlugs.add(m[1]);
  }
  const sortedSlugs = [...skillSlugs].sort();
  const ownersSkills = {};
  for (const slug of sortedSlugs) {
    const skillPath = join(templateDir, '.claude/skills', slug, 'SKILL.md');
    const owner = readOwnerFrontmatter(skillPath);
    // Absence-of-`owner` is treated as user/third-party and silently skipped —
    // mirrors the audit's policy so projects with pre-existing skills can
    // install the baseline without annotating every file. Only `owner: baseline`
    // ends up in manifest.owners.skills; everything else is out-of-scope.
    if (owner === null) continue;
    if (owner !== 'baseline' && owner !== 'user') {
      process.stderr.write(`${slug}: invalid owner=${owner} (must be baseline or user)\n`);
      process.exit(1);
    }
    if (owner === 'baseline') {
      ownersSkills[slug] = 'baseline';
    }
  }
  return ownersSkills;
}

const allFiles = await collectFiles(templateDir, templateDir);
allFiles.sort();

const files = {};
for (const rel of allFiles) {
  // Self-skip: the manifest hashes every file EXCEPT itself.
  if (rel === MANIFEST_REL) continue;
  files[rel] = hashFile(join(templateDir, rel));
}

const ownersSkills = collectOwnersFromTemplate(allFiles);

const manifest = {
  manifest_version: 2,
  generated_at: new Date().toISOString(),
  files,
  owners: {
    skills: ownersSkills,
  },
};

// When built inside a GitHub Actions run, stamp the run id so the materialized
// baseline (and the rendered Pages footer) trace back to a single workflow
// execution. Outside CI the key is omitted entirely — dev manifests stay
// byte-identical to the pre-change shape, which keeps template-payload /
// template-drift / manifest tests deterministic across machines.
if (process.env.GITHUB_RUN_ID) {
  manifest.build_id = `gha-${process.env.GITHUB_RUN_ID}`;
}

const manifestPath = join(templateDir, MANIFEST_REL);
await mkdir(join(templateDir, '.claude'), { recursive: true });
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
