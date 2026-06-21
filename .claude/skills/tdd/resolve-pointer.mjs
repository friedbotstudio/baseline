// Foundation — resolve a tdd-state behavior pointer to its spec section text.
//
// A compressed tdd state file stores {spec_slug, ac_id, anchor} pointers instead
// of verbatim §Behavior excerpts. resolvePointer reads the approved spec on
// demand and returns the anchored section's text (the enclosing ```plantuml
// fence, or the anchor line through the next blank line / heading when not
// fenced). A missing spec or unresolvable anchor throws DanglingPointerError so
// a stale pointer fails loudly rather than silently feeding an empty contract.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export class DanglingPointerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DanglingPointerError';
  }
}

async function readSpec(specSlug, rootDir) {
  try {
    return await readFile(join(rootDir, 'docs/specs', `${specSlug}.md`), 'utf8');
  } catch {
    throw new DanglingPointerError(`spec not found: docs/specs/${specSlug}.md`);
  }
}

function enclosingFence(lines, anchorLine) {
  let open = -1;
  for (let i = anchorLine; i >= 0; i--) {
    if (/^\s*```/.test(lines[i])) { open = i; break; }
  }
  if (open < 0) return null;
  for (let i = anchorLine + 1; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) return lines.slice(open, i + 1).join('\n');
  }
  return null;
}

function looseSection(lines, anchorLine) {
  const out = [lines[anchorLine]];
  for (let i = anchorLine + 1; i < lines.length; i++) {
    if (lines[i].trim() === '' || /^##\s/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

// The spec slug is interpolated into a filesystem path; confine it to the
// kebab-case slug convention so a crafted pointer cannot traverse out of
// docs/specs/ (CWE-22). Forecloses `..`, `/`, absolute paths, and null bytes.
const SAFE_SLUG = /^[a-z0-9-]+$/;

export async function resolvePointer({ spec_slug, ac_id, anchor }, rootDir) {
  if (!anchor) throw new DanglingPointerError(`pointer for ${ac_id} has no anchor`);
  if (!SAFE_SLUG.test(spec_slug ?? '')) {
    throw new DanglingPointerError(`invalid spec slug (must match ${SAFE_SLUG}): ${spec_slug}`);
  }
  const content = await readSpec(spec_slug, rootDir);
  const lines = content.split(/\r?\n/);
  const anchorLine = lines.findIndex((ln) => ln.includes(anchor));
  if (anchorLine < 0) {
    throw new DanglingPointerError(`anchor '${anchor}' not found in docs/specs/${spec_slug}.md`);
  }
  return enclosingFence(lines, anchorLine) ?? looseSection(lines, anchorLine);
}
