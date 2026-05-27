// Structural 3-way merge for `.claude/project.json` on upgrade.
//
// Why it exists: project.json is the per-project config a user tailors via
// /init-project (test.cmd, lint.cmd, tdd globs, destructive patterns, swarm
// settings, etc.). Under the previous NEVER_TOUCH tier, any baseline-side
// improvement to a default (e.g. test.cmd gaining a `--file={file}` placeholder)
// silently stayed out of the user's install forever. Promoting to a structural
// 3-way merge lets baseline defaults flow to users who never customized those
// specific fields, while preserving every field the user did customize.
//
// Semantics (per leaf field K, with `base` = prior baseline shipped value):
//   - K in base, incoming, local:
//       * objects on all three sides → recurse
//       * deepEq(local, base)          → take incoming (user never customized)
//       * else                          → keep local    (user customized)
//   - K in incoming + local, not in base: both added independently → keep local
//   - K in base + incoming, not in local: user explicitly removed → stay removed
//   - K only in local: user-added → keep
//   - K only in incoming (new in this release): add
//   - K only in base (removed upstream): drop
//
// Arrays are treated as atomic values (full deepEq compare). A future
// refinement could add set-semantics for known list-shaped fields
// (e.g. tdd.source_globs as a set, additions.* as a set union).

import { readFile, writeFile, access } from 'node:fs/promises';

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!deepEqual(a[k], b[k])) return false;
    }
    return true;
  }
  return false;
}

/**
 * Pure three-way merge of three values. See module header for semantics.
 * Returns the merged value. Inputs are not mutated.
 */
export function structuralMerge3Way(base, incoming, local) {
  if (isPlainObject(base) && isPlainObject(incoming) && isPlainObject(local)) {
    const merged = {};
    const allKeys = new Set([
      ...Object.keys(base),
      ...Object.keys(incoming),
      ...Object.keys(local),
    ]);
    for (const k of allKeys) {
      const inBase = Object.prototype.hasOwnProperty.call(base, k);
      const inIncoming = Object.prototype.hasOwnProperty.call(incoming, k);
      const inLocal = Object.prototype.hasOwnProperty.call(local, k);

      if (inLocal && inIncoming) {
        if (inBase) {
          if (isPlainObject(base[k]) && isPlainObject(incoming[k]) && isPlainObject(local[k])) {
            merged[k] = structuralMerge3Way(base[k], incoming[k], local[k]);
          } else if (deepEqual(local[k], base[k])) {
            merged[k] = incoming[k];
          } else {
            merged[k] = local[k];
          }
        } else {
          merged[k] = local[k];
        }
      } else if (inLocal) {
        // Key absent from incoming. Two sub-cases:
        //   - inBase && deepEq(local, base): upstream removed it AND user
        //     didn't customize → drop (follow baseline).
        //   - else: user added it (no base) OR user customized → keep local.
        if (inBase && deepEqual(local[k], base[k])) {
          // drop — propagate upstream removal
        } else {
          merged[k] = local[k];
        }
      } else if (inIncoming && !inBase) {
        merged[k] = incoming[k];
      }
      // else (only in base, or in base+incoming but not local): drop.
    }
    return merged;
  }

  if (deepEqual(local, base)) return incoming;
  return local;
}

/**
 * File I/O wrapper. See module header for fallback when BASE is unavailable.
 * Returns { merged, existing, baseUnavailable? }. Caller compares
 * merged === existing to decide whether to write.
 *
 * BASE content is supplied as `baseText` (the prior baseline-shipped bytes
 * for this path). Pass `null` when BASE recovery failed — local will be
 * preserved verbatim and `baseUnavailable: true` returned. `basePath` is
 * accepted as a fallback for callers that want file-based input.
 */
export async function computeMergedProjectJson({ baseText, basePath, incomingPath, localPath }) {
  const incomingText = await readFile(incomingPath, 'utf8');
  const incoming = JSON.parse(incomingText);

  let existingText = null;
  let local;
  try {
    await access(localPath);
    existingText = await readFile(localPath, 'utf8');
    local = JSON.parse(existingText);
  } catch {
    return { merged: incomingText, existing: null };
  }

  let base = null;
  if (baseText != null) {
    try { base = JSON.parse(baseText); } catch { base = null; }
  } else if (basePath) {
    try {
      const text = await readFile(basePath, 'utf8');
      base = JSON.parse(text);
    } catch {
      base = null;
    }
  }

  if (base === null) {
    return { merged: existingText, existing: existingText, baseUnavailable: true };
  }

  const merged = structuralMerge3Way(base, incoming, local);
  return {
    merged: JSON.stringify(merged, null, 2) + '\n',
    existing: existingText,
  };
}

/**
 * Apply the structural merge in place. Returns { wrote, baseUnavailable }.
 */
export async function mergeProjectJsonFile({ baseText, basePath, incomingPath, localPath }) {
  const { merged, existing, baseUnavailable } =
    await computeMergedProjectJson({ baseText, basePath, incomingPath, localPath });
  if (merged === existing) {
    return { wrote: false, baseUnavailable: !!baseUnavailable };
  }
  await writeFile(localPath, merged);
  return { wrote: true, baseUnavailable: !!baseUnavailable };
}
