// Foundation — where is THIS workflow's spec, and which part of it is mine?
//
// A single-shot track keeps its spec at `docs/specs/<slug>.md`. An `epic-child`
// has no spec at its own slug at all: it inherits the epic's, pinned in
// `workflow.json → pinned_artifacts.spec` as `docs/specs/<epic>.md#slice-<id>`.
//
// Every consumer that resolved only the first shape read `null` on every
// epic-child and treated it as "this workflow has no spec", which is the chore
// case. `drift_check` turned that into `no spec; skipped` + exit 0 and
// `verifyAndApplyDelta` into an all-empty verdict — both mechanically green,
// neither having looked at anything. Three consecutive children shipped that way
// before anyone noticed, because a check that measures nothing reports success.
//
// So the return distinguishes the two: `source: null` means no spec ANYWHERE
// (chore — a genuine skip), `source: 'pin'` means one exists but not at this slug.
// Collapsing those is the defect, not an implementation detail of it.
//
// The resolution is COPIED from `track_guard.mjs:59-66`, which has always read
// pins correctly — split the fragment off, then check the bare path. That guard is
// deliberately left alone: it is the reference, and a second divergent copy is what
// this module exists to prevent.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { assertSafeSlug } from './slug.mjs';

const SPEC_DIR = 'docs/specs';
const PIN_FRAGMENT_RE = /^slice-(.+)$/;

// Same predicate as workspace/tree.mjs, restated here rather than imported because
// hooks/lib is the lower layer — a hook primitive that reached up into a skill's
// module would invert the dependency every other file in this directory respects.
function assertNoTraversal(rel) {
  const text = String(rel ?? '');
  if (text.split(/[\\/]/).includes('..') || /^([\\/]|[A-Za-z]:)/.test(text)) {
    throw new Error(`unsafe path traversal (REJECT, never normalize): ${JSON.stringify(text)}`);
  }
  return text;
}

function readWorkflow(rootDir) {
  try {
    return JSON.parse(readFileSync(join(rootDir, '.claude/state/workflow.json'), 'utf8'));
  } catch {
    // An absent or unreadable workflow.json is not an error here: an ad-hoc
    // invocation outside a workflow has no pin, which is the same answer.
    return null;
  }
}

// `docs/specs/<epic>.md#slice-C` -> { bare, sliceId: 'C' }. A pin with no fragment
// is legal and scopes to the whole spec; a fragment that is not `slice-<id>` names
// no section, so it scopes to the whole spec too rather than to nothing.
function splitPin(pin) {
  const [bare, fragment] = String(pin).split('#');
  assertNoTraversal(bare);
  if (fragment !== undefined) assertNoTraversal(fragment);
  return { bare, sliceId: PIN_FRAGMENT_RE.exec(fragment ?? '')?.[1] ?? null };
}

const noSpec = () => ({ path: null, rel: null, sliceId: null, source: null });

// `rel` rides alongside `path` so a caller in the Domain layer can read through its
// own Foundation wrapper (`store.readSourceText(rootDir, rel)`) instead of reaching
// for `node:fs` directly — the absolute path alone would force that reach.
export function resolveSpecPath({ rootDir = process.cwd(), slug } = {}) {
  // The pin below is guarded; so is the slug, and for the same reason. This is a
  // Foundation primitive, so leaving validation to callers means every future one
  // inherits whichever discipline its author remembered — `drift_check` passed
  // `--slug` straight through, and a slug of `../../secrets/private` resolved to
  // and read a file outside `docs/specs/` (phase-8 finding, 2026-08-07).
  assertSafeSlug(slug, 'spec slug');
  const relBySlug = `${SPEC_DIR}/${slug}.md`;
  if (existsSync(join(rootDir, relBySlug))) {
    return { path: join(rootDir, relBySlug), rel: relBySlug, sliceId: null, source: 'slug' };
  }

  const pin = readWorkflow(rootDir)?.pinned_artifacts?.spec;
  if (typeof pin !== 'string' || !pin) return noSpec();

  const { bare, sliceId } = splitPin(pin);
  if (!existsSync(join(rootDir, bare))) return noSpec();
  return { path: join(rootDir, bare), rel: bare, sliceId, source: 'pin' };
}

// The `## Slice <id>` body, bounded by the next `##` heading. Returns null when the
// spec carries no such section, so a caller can tell "scoped to nothing" from
// "scoped to an empty slice".
export function sliceSection(specText, sliceId) {
  if (!sliceId) return null;
  const pattern = new RegExp(
    `^##\\s+Slice\\s+${String(sliceId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`,
    'im',
  );
  return pattern.exec(String(specText))?.[1] ?? null;
}

// A slice section lists its ACs as a `- **ACs**: AC-004, AC-005` BULLET. It carries
// no `| AC-004 |` table rows — those live once, at the spec's top level.
//
// This is the whole reason the function exists. Scoping a table-row regex to the
// section text matches zero rows and reports clean, which is the same vacuous green
// one layer deeper. The bullet supplies the id set; the caller filters the spec's
// top-level table by it.
export function sliceAcIds(sectionText) {
  const bullet = /^[-*]\s*\*\*ACs?\*\*\s*:\s*(.+)$/im.exec(String(sectionText ?? ''));
  if (!bullet) return [];
  return [...new Set(bullet[1].match(/AC-\d+/g) ?? [])];
}
