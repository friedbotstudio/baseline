import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// The shipped manifest lives at `<template>/.claude/manifest.json` (NOT the
// template root) so the recursive install copies it straight to
// `<target>/.claude/manifest.json` without special-casing. Same path is used
// by the consumer-side audit (.claude/skills/audit-baseline/audit.sh) for
// hash-drift detection — the file follows the baseline into every project.
const MANIFEST_REL = '.claude/manifest.json';

// Tier classification rules (CLAUDE.md upgrade-flow-rework spec AC-013).
// Order matters: NEVER_TOUCH > SPECIAL_MERGE > SEMANTIC_EXPLICIT >
// extension default > BINARY_PROMPT. Frontmatter `tier:` overrides all.
const NEVER_TOUCH_PATHS = new Set([
  '.claude/project.json',
  '.claude/workflows.jsonl',
  '.claude/schemas/workflow-track.v1.json',
]);
const SPECIAL_MERGE_PATHS = new Set(['.mcp.json']);
const SEMANTIC_EXPLICIT = new Set([
  'docs/init/seed.md',
  'CLAUDE.md',
  'src/seed.template.md',
  'src/CLAUDE.template.md',
]);
const MECHANICAL_EXTENSIONS = new Set(['.sh', '.mjs', '.js', '.py', '.ts', '.md']);
const VALID_TIERS = new Set(['NEVER_TOUCH', 'SPECIAL_MERGE', 'SEMANTIC', 'MECHANICAL', 'BINARY_PROMPT']);

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

function readFrontmatter(filePath) {
  let text;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) return null;
  const body = fmMatch[1];
  const fm = {};
  for (const line of body.split('\n')) {
    const kv = line.match(/^(\w+):\s*(.+?)\s*$/);
    if (kv) fm[kv[1]] = kv[2];
  }
  return fm;
}

function readOwnerFrontmatter(filePath) {
  const fm = readFrontmatter(filePath);
  return fm?.owner ?? null;
}

function readTierOverride(filePath) {
  const fm = readFrontmatter(filePath);
  if (!fm || typeof fm.tier !== 'string') return null;
  const override = fm.tier.trim();
  if (!VALID_TIERS.has(override)) {
    process.stderr.write(`${filePath}: invalid tier override "${override}" — must be one of ${[...VALID_TIERS].join(', ')}\n`);
    process.exit(1);
  }
  return override;
}

function classifyTier(rel, absPath) {
  if (NEVER_TOUCH_PATHS.has(rel)) return 'NEVER_TOUCH';
  if (SPECIAL_MERGE_PATHS.has(rel)) return 'SPECIAL_MERGE';
  const override = readTierOverride(absPath);
  if (override) return override;
  if (SEMANTIC_EXPLICIT.has(rel)) return 'SEMANTIC';
  if (MECHANICAL_EXTENSIONS.has(extname(rel))) return 'MECHANICAL';
  return 'BINARY_PROMPT';
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
  const absPath = join(templateDir, rel);
  files[rel] = {
    sha256: hashFile(absPath),
    tier: classifyTier(rel, absPath),
  };
}

const ownersSkills = collectOwnersFromTemplate(allFiles);

const manifest = {
  manifest_version: 3,
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
