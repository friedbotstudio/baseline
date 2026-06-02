// Foundation — serialize change entries to the gitignored what's-new fragment.
//
// The fragment at .claude/state/whatsnew/<slug>.json is the transient handoff
// buffer a per-project routing workflow consumes. It carries NO version field:
// the version is read at publish time by the routing target, never stored here.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { KEEPACHANGELOG_SECTIONS } from './classifier.mjs';

const VALID_CATEGORIES = new Set(KEEPACHANGELOG_SECTIONS);

function requireNonEmptyString(value, label, index) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`whatsnew fragment: entry ${index} has an empty or non-string ${label}`);
  }
  return value;
}

function normalizeEntry(entry, index) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`whatsnew fragment: entry ${index} is not an object`);
  }
  const category = requireNonEmptyString(entry.category, 'category', index);
  if (!VALID_CATEGORIES.has(category)) {
    throw new Error(`whatsnew fragment: entry ${index} category ${JSON.stringify(category)} is not a keepachangelog section (${[...VALID_CATEGORIES].join(', ')})`);
  }
  const normalized = {
    category,
    title: requireNonEmptyString(entry.title, 'title', index),
    body: requireNonEmptyString(entry.body, 'body', index),
  };
  if ('highlight' in entry && entry.highlight !== undefined) {
    if (typeof entry.highlight !== 'boolean') {
      throw new Error(`whatsnew fragment: entry ${index} highlight must be a boolean`);
    }
    normalized.highlight = entry.highlight;
  }
  return normalized;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function requireSafeSlug(slug) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    throw new Error(`whatsnew fragment: slug must match ${SLUG_RE} (got ${JSON.stringify(slug)})`);
  }
  return slug;
}

function buildFragment(slug, entries, now) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('whatsnew fragment: entries must be a non-empty array');
  }
  return {
    slug,
    generated_at: now ?? new Date().toISOString(),
    entries: entries.map(normalizeEntry),
  };
}

function fragmentPath(repoRoot, slug) {
  return join(repoRoot, '.claude/state/whatsnew', `${slug}.json`);
}

export async function writeFragment({ repoRoot, slug, entries, now }) {
  requireSafeSlug(slug);
  const fragment = buildFragment(slug, entries, now);
  const path = fragmentPath(repoRoot, slug);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(fragment, null, 2) + '\n');
  return { path, fragment };
}
