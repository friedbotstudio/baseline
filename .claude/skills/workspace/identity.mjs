// Foundation — a deterministic element id derived from its anchor.
//
// Ids stay AUTHORED wherever a concept declares one: the 114 existing ids are
// semantic (`slug-safety`, `hooks-common-lib`) and carry meaning no path can. This
// is the fallback for the case where no human has authored anything — `/spec-sync`
// scanning a repository for the first time.
//
// Determinism is the whole point. Two branches materializing the same anchor must
// produce the same filename, or the merge yields two records for one anchor and
// conflicts.duplicateAnchor turns a mechanical merge into manual repair.

import { createHash } from 'node:crypto';

import { MAX_SLUG_LEN, SLUG_RE } from '../../hooks/lib/slug.mjs';

// Leaves room for the disambiguating suffix below without crossing MAX_SLUG_LEN.
const HASH_LEN = 8;
const STEM_MAX = MAX_SLUG_LEN - HASH_LEN - 1;

function slugify(anchor) {
  return String(anchor)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function shortHash(anchor) {
  return createHash('sha256').update(String(anchor)).digest('hex').slice(0, HASH_LEN);
}

export function deriveId(anchor) {
  const text = String(anchor ?? '');
  if (!text) throw new Error('deriveId: refusing to derive an id from an empty anchor');

  // The hash is ALWAYS appended, not only on overflow. Slugification is lossy —
  // every non-alphanumeric run collapses to one separator and the ends are trimmed
  // — so `.claude/skills/**` and `.claude/skills/*` both reduce to `claude-skills`.
  // Two distinct anchors sharing one id is precisely the duplicate-anchor conflict
  // deterministic derivation exists to prevent, and it would surface only at merge
  // time on someone else's repository.
  const stem = slugify(text).slice(0, STEM_MAX).replace(/-+$/, '');
  const id = stem ? `${stem}-${shortHash(text)}` : `el-${shortHash(text)}`;

  // A stem starting with a separator cannot satisfy SLUG_RE; prefix it rather than
  // silently reshaping what the anchor named.
  return SLUG_RE.test(id) ? id : `el-${shortHash(text)}`;
}
