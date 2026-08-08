// commit-planner inventory — pure, deterministic dirty-tree → single-concern groups.
//
// groupDirtyTree(entries) partitions [{path, status}] into ordered groups, each
// {type, scope, paths}. No fs, no git, no clock — same entries (any order) →
// identical output. Pairing rule: a source file and its conventionally-named
// test land in the SAME group (a behavior change carries its test). Source
// groups surface as `src`-typed for main context to refine into feat/fix;
// docs/test/chore types are mechanical.

const TEST_PATH_RE = /(^|\/)(tests?|__tests__|spec)\//i;
const TEST_FILE_RE = /[._-](test|spec)\.[^.]+$/i;
const DOCS_RE = /\.mdx?$/i;
const CONFIG_RE = /\.(json|ya?ml|toml)$/i;

function isTest(path) {
  return TEST_PATH_RE.test(path) || TEST_FILE_RE.test(path);
}

function classify(path) {
  if (isTest(path)) return 'test';
  if (DOCS_RE.test(path) || path.startsWith('docs/')) return 'docs';
  if (CONFIG_RE.test(path)) return 'chore';
  return 'src';
}

/** Pairing key: basename, extensions and test markers stripped, [-_.] folded. */
function slugOf(path) {
  const base = path.split('/').pop() || '';
  return base
    .replace(/\.[^.]+$/, '')
    .replace(/[._-](test|spec)$/i, '')
    .toLowerCase()
    .replace(/[._]/g, '-');
}

/** Scope hint: `.claude/<area>` keeps two segments; otherwise the top dir; root files → null. */
function scopeOf(path) {
  const segs = path.split('/');
  if (segs.length < 2) return null;
  if (segs[0] === '.claude' && segs.length >= 3) return `${segs[0]}/${segs[1]}`;
  return segs[0];
}

function sharedScope(paths) {
  const scopes = [...new Set(paths.map(scopeOf))];
  return scopes.length === 1 ? scopes[0] : null;
}

export function groupDirtyTree(entries) {
  if (!Array.isArray(entries)) throw new TypeError('groupDirtyTree: entries must be an array');
  for (const e of entries) {
    if (!e || typeof e.path !== 'string' || e.path === '') {
      throw new TypeError('groupDirtyTree: every entry needs a non-empty string path');
    }
  }

  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  const byKind = { src: [], test: [], docs: [], chore: [] };
  for (const e of sorted) byKind[classify(e.path)].push(e.path);

  const groups = [];

  const srcSlugs = new Map(byKind.src.map((p) => [slugOf(p), p]));
  const pairedTests = new Map();
  const orphanTests = [];
  for (const t of byKind.test) {
    const match = srcSlugs.get(slugOf(t));
    if (match) {
      if (!pairedTests.has(match)) pairedTests.set(match, []);
      pairedTests.get(match).push(t);
    } else {
      orphanTests.push(t);
    }
  }

  const srcByScope = new Map();
  for (const p of byKind.src) {
    const scope = scopeOf(p);
    if (!srcByScope.has(scope)) srcByScope.set(scope, []);
    srcByScope.get(scope).push(p, ...(pairedTests.get(p) || []));
  }
  for (const [scope, paths] of srcByScope) {
    groups.push({ type: 'src', scope, paths: [...paths].sort() });
  }

  if (byKind.docs.length) {
    groups.push({ type: 'docs', scope: sharedScope(byKind.docs), paths: byKind.docs });
  }
  if (orphanTests.length) {
    groups.push({ type: 'test', scope: sharedScope(orphanTests), paths: orphanTests });
  }
  if (byKind.chore.length) {
    groups.push({ type: 'chore', scope: sharedScope(byKind.chore), paths: byKind.chore });
  }

  return groups.sort(
    (a, b) => a.type.localeCompare(b.type)
      || String(a.scope).localeCompare(String(b.scope))
      || a.paths[0].localeCompare(b.paths[0]),
  );
}

// ─── entry point (spec dispatcher-sweep, Pattern B) ───
//
// The purity claim above is about groupDirtyTree, and it still holds: the export
// takes entries and touches nothing. What moves here is the GATHERING the SOP used
// to hand-roll inside a `node -e` block — parsing `git status --porcelain` — which
// is the part that gets copied wrong.
//
// Not sharing power/commit-split.mjs's identical parser: two uses, and hoisting at
// two is the pre-emptive abstraction VI.4 forbids. The third use hoists it.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const USAGE = `usage: node .claude/skills/commit-planner/inventory.mjs group [--root <dir>]

subcommands:
  group   partition the dirty tree into single-concern commit groups

flags:
  --root <dir>  project root (default: cwd)
  --json        emit machine-readable output
`;

// `XY <path>`, with a rename rendering as `old -> new`; the new path is the one on
// disk. Status is kept, unlike harness/rightsize-gate.mjs's parsePorcelain, because
// groupDirtyTree classifies on it.
export function dirtyEntries(text) {
  const entries = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    const status = line.slice(0, 2).trim();
    let path = line.slice(3).trim();
    if (path.includes(' -> ')) path = path.split(' -> ').pop().trim();
    if (path) entries.push({ path, status });
  }
  return entries;
}

function main(argv) {
  const subcommand = argv[0];
  if (!subcommand || subcommand === '--help') { process.stdout.write(USAGE); return 0; }
  if (subcommand !== 'group') { process.stderr.write(`unknown subcommand \`${subcommand}\`\n\n${USAGE}`); return 1; }

  const rootIndex = argv.indexOf('--root');
  const root = rootIndex >= 0 ? argv[rootIndex + 1] : process.cwd();
  const status = spawnSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' });
  if (status.status !== 0) { process.stderr.write(`git status failed: ${status.stderr ?? ''}\n`); return 1; }

  const groups = groupDirtyTree(dirtyEntries(status.stdout));
  if (argv.includes('--json')) { process.stdout.write(JSON.stringify(groups, null, 2) + '\n'); return 0; }
  process.stdout.write(groups.length
    ? groups.map((g) => `${g.type}(${g.scope ?? '-'})  ${g.paths.length} path(s)\n${g.paths.map((p) => `    ${p}`).join('\n')}`).join('\n') + '\n'
    : '(clean tree — nothing to group)\n');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
