import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, mkdtemp, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const BUILD_SCRIPT = join(ROOT, 'scripts', 'build-template.sh');

// THE BASELINE-PRODUCT ALLOWLIST.
//
// What `npx create-baseline` is for: ship the baseline product (constitution +
// enforcement layer + defaults) into a target project — and nothing else.
// The baseline product is enumerated in `docs/init/seed.md` §4 + Appendix A:
//
//   - .claude/                         (hooks, skills, commands, agents, memory,
//                                       skill-memory, bin/LICENSE+NOTICE,
//                                       project.json, settings.json)
//   - CLAUDE.md                        (in-session constitution)
//   - .mcp.json                        (baseline MCP servers)
//   - docs/init/seed.md                (genesis prompt)
//   - manifest.json                    (build-time hash table consumed by --merge)
//
// Everything else (dev docs, site builder, scaffolder source, tests, tour assets,
// macOS/editor cruft) is dev-repo infrastructure and MUST NOT ship to user projects.
//
// This test fails fast on:
//   (1) Any path in template/ that doesn't match an allowed pattern below ("foreign")
//   (2) Any required-component pattern with zero matches ("missing")

const ALLOWED_PREFIXES = [
  // .claude tree (excluded subpaths listed in DISALLOWED_CLAUDE below).
  '.claude/',
  // Constitution + baseline MCP config.
  'CLAUDE.md',
  '.mcp.json',
  // Genesis prompt is the only file under docs/.
  'docs/init/seed.md',
  // Build-time manifest consumed by --merge.
  'manifest.json',
];

// Subpaths inside .claude/ that must NOT ship.
const DISALLOWED_CLAUDE_PATTERNS = [
  /^\.claude\/state(\/|$)/,                // runtime state
  /^\.claude\/settings\.local\.json$/,     // dev-local overrides
  /^\.claude\/bin\/plantuml\.jar$/,        // ~19 MB; side-fetched at install time
  /^\.claude\/\.baseline-manifest\.json$/, // written by CLI, not by build
  /^\.claude\/skill-memory(\/|$)/,         // per-skill working memory (gitignored; dev-repo accumulation)
  /^\.claude\/agent-memory(\/|$)/,         // legacy subagent memory (gitignored)
  /^\.DS_Store$/,                          // macOS Finder metadata
  /\/\.DS_Store$/,                         // nested .DS_Store
];

// Required-component sanity checks: each pattern must match at least one path.
// Mirrors audit-baseline's "20 hooks / 36 skills / 4 commands / 1 agent" claim.
const REQUIRED_PATTERNS = [
  { name: 'CLAUDE.md',            match: (p) => p === 'CLAUDE.md' },
  { name: '.mcp.json',            match: (p) => p === '.mcp.json' },
  { name: 'docs/init/seed.md',    match: (p) => p === 'docs/init/seed.md' },
  { name: '.claude/project.json', match: (p) => p === '.claude/project.json' },
  { name: '.claude/settings.json',match: (p) => p === '.claude/settings.json' },
  { name: 'swarm-worker agent',   match: (p) => p === '.claude/agents/swarm-worker.md' },
  { name: 'plantuml LICENSE',     match: (p) => p === '.claude/bin/LICENSE' },
  { name: 'plantuml NOTICE',      match: (p) => p === '.claude/bin/NOTICE' },
  // Counts mirror seed §4 / audit-baseline.
  { name: '20 hooks',             match: (p) => /^\.claude\/hooks\/[^/]+\.sh$/.test(p), minCount: 20 },
  { name: '4 commands',           match: (p) => /^\.claude\/commands\/[^/]+\.md$/.test(p), minCount: 4 },
  { name: '36 skills (SKILL.md)', match: (p) => /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(p), minCount: 36 },
  { name: '6 memory schemas',     match: (p) => /^\.claude\/memory\/(conventions|decisions|landmarks|landmines|libraries|pending-questions)\.md$/.test(p), minCount: 6 },
];

async function listFiles(root, base = root, acc = []) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      await listFiles(full, base, acc);
    } else if (entry.isFile()) {
      acc.push(relative(base, full).split(sep).join('/'));
    }
  }
  return acc;
}

function pathIsAllowed(rel) {
  for (const pat of DISALLOWED_CLAUDE_PATTERNS) {
    if (pat.test(rel)) return false;
  }
  for (const prefix of ALLOWED_PREFIXES) {
    if (prefix.endsWith('/')) {
      if (rel.startsWith(prefix)) return true;
    } else if (rel === prefix) {
      return true;
    }
  }
  return false;
}

describe('template payload purity', () => {
  let allFiles;
  let isolatedRoot;
  let templateDir;

  before(async () => {
    // Build into an isolated copy of the repo so we don't race with other tests
    // (notably `npm-pack-tarball.test.mjs` which triggers `prepack` → rebuilds
    // the real `template/` mid-read).
    isolatedRoot = await mkdtemp(join(tmpdir(), 'payload-purity-'));
    for (const entry of ['.claude', 'src', 'scripts', 'docs']) {
      const from = join(ROOT, entry);
      if (existsSync(from)) await cp(from, join(isolatedRoot, entry), { recursive: true });
    }
    // Top-level files the audit-baseline gate (Stage 0 of the build) reads.
    for (const entry of ['.mcp.json', 'CLAUDE.md', 'README.md']) {
      const from = join(ROOT, entry);
      if (existsSync(from)) await cp(from, join(isolatedRoot, entry));
    }
    execFileSync('bash', [BUILD_SCRIPT], {
      cwd: isolatedRoot,
      env: { ...process.env, PKG_ROOT: isolatedRoot },
      stdio: 'pipe',
    });
    templateDir = join(isolatedRoot, 'obj', 'template');
    assert.ok(existsSync(templateDir), 'template/ was not produced by build');
    allFiles = (await listFiles(templateDir)).sort();
  });

  after(async () => {
    if (isolatedRoot) await rm(isolatedRoot, { recursive: true, force: true });
  });

  it('contains no foreign files (dev-only cruft must not ship)', () => {
    const foreign = allFiles.filter((p) => !pathIsAllowed(p));
    assert.equal(
      foreign.length,
      0,
      `\nFound ${foreign.length} foreign file(s) in template/ that are not part of the baseline product:\n` +
      foreign.map((p) => '  - ' + p).join('\n') +
      `\n\nFix: exclude these from scripts/build-template.sh, or extend ALLOWED_PREFIXES if any are\n` +
      `legitimately baseline product (and update seed.md Appendix A to match).\n`
    );
  });

  it('contains every required baseline component', () => {
    const missing = [];
    for (const req of REQUIRED_PATTERNS) {
      const matched = allFiles.filter(req.match);
      const minCount = req.minCount ?? 1;
      if (matched.length < minCount) {
        missing.push(`  - ${req.name}: expected >= ${minCount}, found ${matched.length}`);
      }
    }
    assert.equal(
      missing.length,
      0,
      `\nMissing baseline components in template/:\n` + missing.join('\n') + '\n'
    );
  });
});
