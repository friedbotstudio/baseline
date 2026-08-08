// Domain — propose a narrowed `scope:` for a memory entry, and apply a confirmed one.
//
// Roadmap Epic 6 T8. The sharded store carries 136 entries whose `scope:` came from
// `SCOPE_BY_CATEGORY` rather than from a judgment about the entry, so a docs/specs/**
// write surfaces 107 facts against a 15-row index and names 15 of them.
//
// Neither pure mechanism reaches the whole problem: deriving from `governs:` covers
// 58 of 305 entries, and hand-curating 136 in one diff is unreviewable. So this module
// PROPOSES and reports its evidence; main context confirms every proposal (Article II).
// `proposeNarrowing` performs no I/O at all — it reads the entry it is handed.

import { readFileSync, writeFileSync } from 'node:fs';

import { CANONICAL, asList } from './categories.mjs';
import { resolveCategory } from './lift-fields.mjs';
import { SCOPE_PLACEHOLDER, isReachable, splitFrontmatter } from './resolve.mjs';

// A landmark key is the thing it names — `bin/cli.js:1`, `.claude/skills/foo/bar.mjs`.
// The trailing `:<line>` is a position within the file, not part of the path.
const PATH_SHAPED_KEY = /^([\w.@-]+(?:\/[\w.@-]+)+\.\w+)(?::\d+)?$/;

// The house body convention: the first bullet opens `- Role:` or `- Path:` and cites
// the file in backticks. Roughly a third of landmarks carry the path only here.
const BODY_ANCHOR = /^-\s+(?:Role|Path):.*?`([^`]+\.\w+)`/m;

function proposalOf(key, { scope = [], governs = [], evidence, confidence }) {
  return { key, proposed_scope: scope, proposed_governs: governs, evidence, confidence };
}

// Evidence is ranked by how directly it names a file, because that is what the path
// leg matches on. An explicit `governs:` outranks a key that merely looks like a
// path, which outranks a path recovered from prose.
function evidenceFor(entry) {
  const declared = asList(entry?.fields?.governs);
  if (declared.length) return { globs: declared, note: `declared governs: ${declared.join(', ')}` };

  const key = String(entry?.key ?? '');
  const fromKey = PATH_SHAPED_KEY.exec(key);
  if (fromKey) return { globs: [fromKey[1]], note: `key is path-shaped: ${fromKey[1]}` };

  const fromBody = BODY_ANCHOR.exec(String(entry?.body ?? ''));
  if (fromBody) return { globs: [fromBody[1]], note: `body anchor cites ${fromBody[1]}` };

  return null;
}

// An entry the path leg can carry needs no phase scope: `governs:` reaches it when
// the code it governs is edited, which is more precise than any phase could be.
// An entry with no path evidence keeps whatever phase scope a curator gives it —
// this module never invents one, because inventing it is what SCOPE_BY_CATEGORY did.
export function proposeNarrowing(entry) {
  const key = entry?.key ?? entry?.fields?.key ?? '(unkeyed)';
  const evidence = evidenceFor(entry);
  if (!evidence) {
    return proposalOf(key, {
      evidence: 'no governs:, no path-shaped key, no body anchor — needs a human judgment',
      confidence: 'low',
    });
  }
  return proposalOf(key, {
    scope: asList(entry?.fields?.scope).filter((s) => s !== SCOPE_PLACEHOLDER),
    governs: evidence.globs,
    evidence: evidence.note,
    confidence: 'high',
  });
}

// Frontmatter-only rewrite. The body is never re-serialised — it is sliced off by
// `splitFrontmatter` and concatenated back verbatim, so quoted `scope:` lines inside
// entry prose (this corpus documents its own schema constantly) cannot be rewritten.
export function applyNarrowing({ path, scope, governs }) {
  const text = readFileSync(path, 'utf8');
  const split = splitFrontmatter(text);
  if (!split) throw new Error(`no frontmatter block in ${path}`);

  const front = withField(split.front, 'scope', `[${asList(scope).join(', ')}]`);
  const patched = ['---', ...(governs ? withField(front, 'governs', asList(governs).join(', ')) : front), ...split.rest].join('\n');
  if (patched !== text) writeFileSync(path, patched, 'utf8');
  return { path, changed: patched !== text };
}

// Replaces the first occurrence and DROPS any later duplicates. Replacing only the
// first left a stale second line behind, and the frontmatter parser is last-wins, so
// the stale value silently won. Duplicate keys are not hypothetical: the shared test
// fixture emits two `scope:` lines, and any hand-edited shard can do the same.
function withField(front, name, value) {
  const matches = (line) => new RegExp(`^${name}:`).test(line);
  if (!front.some(matches)) return [...front, `${name}: ${value}`];
  let placed = false;
  const next = [];
  for (const line of front) {
    if (!matches(line)) { next.push(line); continue; }
    if (placed) continue;
    next.push(`${name}: ${value}`);
    placed = true;
  }
  return next;
}

// ─── Orchestration: the two read-only subcommands ───

function liveEntries(memDir) {
  const out = [];
  for (const category of CANONICAL) {
    for (const entry of resolveCategory(memDir, category).entries) out.push({ ...entry, category });
  }
  return out;
}

function offendersIn(memDir) {
  return liveEntries(memDir)
    .filter((entry) => asList(entry.fields.scope).includes(SCOPE_PLACEHOLDER) || !isReachable(entry))
    .map((entry) => `${entry.category}/${entry.key}`);
}

function runReport(memDir) {
  for (const entry of liveEntries(memDir)) {
    const p = proposeNarrowing(entry);
    if (p.confidence !== 'high') continue;
    process.stdout.write(`${entry.category}/${p.key}\t${p.proposed_governs.join(', ')}\t${p.evidence}\n`);
  }
  return 0;
}

function runCheck(memDir) {
  const offenders = offendersIn(memDir);
  if (!offenders.length) {
    process.stdout.write('scope-narrow: every entry is reachable by at least one leg\n');
    return 0;
  }
  process.stdout.write(`scope-narrow: ${offenders.length} unreachable or placeheld entr${offenders.length === 1 ? 'y' : 'ies'}:\n`);
  for (const name of offenders) process.stdout.write(`  ${name}\n`);
  return 1;
}

const SUBCOMMANDS = { report: runReport, check: runCheck };

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const run = SUBCOMMANDS[process.argv[2]];
  if (!run) {
    process.stderr.write('usage: scope-narrow.mjs <report|check>\n');
    process.exit(2);
  }
  process.exit(run(`${process.cwd()}/.claude/memory`));
}
