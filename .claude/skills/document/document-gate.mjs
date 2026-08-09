#!/usr/bin/env node
// document-gate — the enforcement point for Phase 10 routing (ticket E, AC-015..AC-017).
//
// Why this exists rather than a prose rule: `document/SKILL.md` already stated the
// routing correctly, including the two-register requirement for public pages. It
// stated it in prose, and prose in a SKILL.md is what a model under load skips —
// which is exactly what happened during Phase 10 of the workflow that shipped this
// file. A sentence cannot fail a build; an exit code can.
//
// Same enforcement class as `tdd/drift_check.mjs` and `harness/rightsize-gate.mjs`:
// a mechanical `.mjs`, no new hook, no new track, no subagent.
//
// Contract:
//   requiredDelegates({changedPaths, surfaces}) -> [{surface, kind, requires[], reader_target}]
//   missingReceipts({required, receipts})       -> [{surface, delegate}]
//   CLI: --slug <slug> [--paths a,b,c]  ->  exit 0 clean / 1 with a named punch list
//
// Fail-open on configuration, fail-closed on evidence: absent `document.surfaces`
// means nothing is required (the phase behaves as it did before), but a surface
// that IS required and has no receipt always fails.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertSafeSlug } from '../../hooks/lib/slug.mjs';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function globToRegExp(glob) {
  // ONE pass over disjoint alternatives, `**` before `*` so the globstar wins. The
  // earlier version staged `**` through a raw NUL sentinel; that byte made this file
  // classify as binary, so `git diff` reported "Binary files differ" and the module
  // was invisible to review and to every grep-driven check (found 2026-08-05).
  // NOTE: byte-identical to matchesGlob's expansion in memory-index/index-io.mjs —
  // a pre-existing duplication across two skills, left in place rather than coupled.
  const pattern = String(glob)
    .replace(/(\*\*\/?)|(\*)|([.+^${}()|[\]\\?])/g, (_m, globstar, star, special) => (globstar ? '.*' : star ? '[^/]*' : `\\${special}`));
  try {
    return new RegExp(`^${pattern}$`);
  } catch {
    return null;
  }
}

function matchesAny(globs, path) {
  const norm = String(path).replace(/\\/g, '/');
  return (globs || []).some((g) => {
    const re = globToRegExp(g);
    return re ? re.test(norm) : false;
  });
}

// One row per changed path that lands on a declared documentation surface. First
// matching surface wins, so ordering in `document.surfaces` is the precedence rule.
export function requiredDelegates({ changedPaths = [], surfaces = [] } = {}) {
  // First-match-wins means a surface with no `requires` silently shadows every later
  // surface that has real obligations, and the gate then reports CLEAN. That is a
  // config error, never an exemption — exempt a path with `exclude`, not by leaving
  // its obligations empty.
  for (const s of surfaces) {
    if (!Array.isArray(s.requires) || s.requires.length === 0) {
      throw new Error(
        `document-gate: surface ${JSON.stringify(s.kind ?? s.match)} declares no \`requires\`; `
        + 'use `exclude` to exempt a path rather than an empty obligation list',
      );
    }
  }

  const out = [];
  for (const path of changedPaths) {
    const surface = surfaces.find((s) => matchesAny(s.match, path) && !matchesAny(s.exclude, path));
    if (!surface) continue;
    out.push({
      surface: path,
      kind: surface.kind,
      requires: [...(surface.requires || [])],
      reader_target: surface.reader_target ?? null,
    });
  }
  return out;
}

export function missingReceipts({ required = [], receipts = [] } = {}) {
  const seen = new Set(receipts.map((r) => `${r.surface}::${r.delegate}`));
  const gaps = [];
  for (const row of required) {
    for (const delegate of row.requires) {
      if (!seen.has(`${row.surface}::${delegate}`)) gaps.push({ surface: row.surface, delegate });
    }
  }
  return gaps;
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function parseArgs(argv) {
  const args = { slug: '', paths: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--slug') args.slug = argv[++i] || '';
    else if (argv[i] === '--paths') {
      // `--paths "$CHANGED"` with an empty variable must not read as "nothing
      // changed" — that reported CLEAN and exited 0. An explicit but empty list is a
      // caller bug; `pathsGiven` lets main() reject it instead of passing.
      args.pathsGiven = true;
      args.paths = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return args;
}

// git C-quotes any path containing a space, a quote, a control character or a
// non-ASCII byte: `"site-src/a b.njk"`. Left encoded, the quotes make every glob
// miss — a silent pass on exactly the files a human named descriptively.
function unquoteGitPath(raw) {
  if (!raw.startsWith('"') || !raw.endsWith('"')) return raw;
  const body = raw.slice(1, -1);
  const bytes = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '\\') { bytes.push(...Buffer.from(body[i], 'utf8')); continue; }
    const esc = body[++i];
    if (esc === 'n') bytes.push(0x0a);
    else if (esc === 't') bytes.push(0x09);
    else if (esc === 'r') bytes.push(0x0d);
    else if (esc >= '0' && esc <= '7') { bytes.push(parseInt(body.slice(i, i + 3), 8)); i += 2; }
    else bytes.push(...Buffer.from(esc, 'utf8'));
  }
  return Buffer.from(bytes).toString('utf8');
}

// Default source of changed paths when --paths is not supplied. Returns [] on a
// non-git tree so the gate degrades rather than throwing.
//
// `-uall` is load-bearing: plain `--porcelain` collapses an untracked directory to a
// single `?? docs/` entry, so a brand-new documentation directory is invisible to
// every glob and the gate passes without ever seeing the pages.
//
// `rootDir` is a parameter (not the module-scoped ROOT) so `runGate` behaves the
// same whether it is invoked by `main()`'s direct path (which pins ROOT from
// CLAUDE_PROJECT_DIR at import time) or by an in-process caller such as the
// `document gate` verb, which resolves its root from `--root`/cwd per invocation.
function changedPathsFromGit(rootDir = ROOT) {
  const res = spawnSync('git', ['-C', rootDir, 'status', '--porcelain', '-uall'], { encoding: 'utf8' });
  if (res.status !== 0) return [];
  return res.stdout
    .split('\n')
    .filter(Boolean)
    .map((l) => unquoteGitPath(l.slice(3).replace(/^.* -> /, '').trim()));
}

// The core gate computation, extracted so a caller other than this file's own CLI
// can ask "what's required, what's missing, is it clean" as DATA rather than by
// spawning a process and parsing an exit code. Never throws: every failure mode
// (no surfaces configured, a malformed surface declaration, a malformed receipt
// file) resolves to a `{required, missing, ok}` shape rather than an exception —
// slug SAFETY validation stays the caller's job (main() and the `document gate`
// verb each validate their own `--slug` before it reaches here), because that is
// argv-shaped, not gate-shaped.
export function runGate({ slug, paths = null, rootDir = ROOT } = {}) {
  const surfaces = readJson(join(rootDir, '.claude/project.json'), {})?.document?.surfaces;
  if (!Array.isArray(surfaces) || surfaces.length === 0) {
    return { required: [], missing: [], ok: true };
  }

  const changedPaths = paths ?? changedPathsFromGit(rootDir);

  let required;
  try {
    required = requiredDelegates({ changedPaths, surfaces });
  } catch {
    // A malformed surface declaration (a `requires`-less row) proves nothing about
    // receipts either way. runGate's contract is "never throw", so this resolves
    // to BLOCKED-with-nothing-known rather than propagating the config error.
    return { required: [], missing: [], ok: false };
  }
  if (required.length === 0) {
    return { required: [], missing: [], ok: true };
  }

  // A malformed receipt file proves nothing, so it BLOCKS. Previously a non-array
  // `receipts` threw an uncaught TypeError — fail-closed by accident rather than by
  // design. Here it resolves to "every required delegate is unproven".
  const state = readJson(join(rootDir, '.claude/state/document', `${slug}.json`), { receipts: [] });
  if (state.receipts !== undefined && !Array.isArray(state.receipts)) {
    const missing = required.flatMap((row) => row.requires.map((delegate) => ({ surface: row.surface, delegate })));
    return { required, missing, ok: false };
  }

  const missing = missingReceipts({ required, receipts: state.receipts || [] });
  return { required, missing, ok: missing.length === 0 };
}

function main() {
  const { slug, paths, pathsGiven } = parseArgs(process.argv.slice(2));
  if (!slug) {
    process.stderr.write('document-gate: --slug is required\n');
    process.exit(1);
  }
  // CWE-22, validated BEFORE any path is constructed. A gate whose receipt file can
  // be pointed outside `.claude/state/document/` defeats itself: `--slug
  // ../../../outside/evil` made a foreign JSON satisfy the gate and exit 0 CLEAN.
  // REJECT, never repair — normalizing a malformed slug would mask the traversal by
  // silently reading a different path. Same policy and same helper as plan-store and
  // checker-fanout (docs/security/durable-plan-slug-guard-2026-07-12.md).
  try {
    assertSafeSlug(slug, 'document-gate');
  } catch (err) {
    process.stderr.write(`document-gate: ${err.message}\n`);
    process.exit(1);
  }

  if (pathsGiven && (!paths || paths.length === 0)) {
    process.stderr.write('document-gate: --paths was given but empty; refusing to treat that as a clean tree\n');
    process.exit(1);
  }

  const result = runGate({ slug, paths, rootDir: ROOT });

  if (result.required.length === 0) {
    if (result.ok) {
      process.stdout.write('document-gate: no documentation surface in the diff — CLEAN\n');
      process.exit(0);
    }
    process.stderr.write('document-gate: BLOCKED — surface configuration could not be evaluated\n');
    process.exit(1);
  }

  if (result.ok) {
    process.stdout.write(`document-gate: ${result.required.length} surface(s), every required delegate has a receipt — CLEAN\n`);
    process.exit(0);
  }

  process.stderr.write('document-gate: BLOCKED — required delegate(s) left no receipt\n\n');
  for (const gap of result.missing) {
    process.stderr.write(`  ${gap.surface}  ->  missing: ${gap.delegate}\n`);
  }
  process.stderr.write('\nRun the named delegate for each surface, or correct document.surfaces if the obligation is wrong.\n');
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
