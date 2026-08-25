// Every docs page renders "last updated <date>" from hand-maintained frontmatter,
// and nothing checked it. Measured 2026-08-25: 14 of 17 pages carried a date older
// than their own last edit, several by nearly a month, and two were edited that
// same day by the workflow that found this.
//
// The claim is the reader's only signal that a page still describes the system. A
// page that says July while describing August behaviour is worse than an undated
// one, because it invites the reader to trust prose they should re-check.
//
// The rule is deliberately one-directional. A date at or after the last edit is
// fine — bumping a date after re-reading a page and changing nothing is an honest
// act. A date BEFORE the last edit cannot be honest: the page changed after the
// day it claims to have last changed.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';

import { REPO_ROOT } from './helpers/memory-fixtures.mjs';

const SITE_SRC = join(REPO_ROOT, 'site-src');

function git(args) {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

// Pages, not partials: `_layouts/` and `_includes/` carry no `updated:` of their
// own, and `_data/` is JSON. Anything with the field is in scope wherever it sits.
function pagesWithUpdated() {
  const tracked = git(['ls-files', 'site-src']).split('\n').filter(Boolean);
  return tracked
    .filter((rel) => rel.endsWith('.njk'))
    .map((rel) => ({ rel, abs: join(REPO_ROOT, rel) }))
    .filter(({ abs }) => existsSync(abs))
    .map((page) => ({ ...page, declared: declaredDate(page.abs) }))
    .filter(({ declared }) => declared !== null);
}

function declaredDate(abs) {
  const match = /^updated:\s*(\d{4}-\d{2}-\d{2})\s*$/m.exec(readFileSync(abs, 'utf8'));
  return match ? match[1] : null;
}

// The day the page's CONTENT last changed. An uncommitted content edit has no
// commit date yet, so today is the honest answer, and that is what makes the check
// bite before a stale date lands on main rather than after.
//
// A working-tree diff touching only the `updated:` line is not a content change.
// Counting it as one makes the rule circular — correcting a wrong date would be
// the very edit that invalidates the corrected value, and the only way out would
// be stamping today on every page, which claims a review that did not happen.
function lastChangedDate(rel) {
  const untracked = git(['ls-files', '--others', '--exclude-standard', '--', rel]) !== '';
  if (untracked) return today();
  if (touchesContent(git(['diff', '--unified=0', 'HEAD', '--', rel]))) return today();

  // Walk history newest-first for the last commit that changed something other
  // than the date line. `git log -1` is wrong here and was the first version's
  // defect: the commit that CORRECTS a wrong date is itself the newest commit
  // touching the file, so the rule would demand the date be stamped forward to
  // that commit's own day — the same circularity the working-tree carve-out
  // above removes, displaced into history rather than solved.
  for (const line of git(['log', '--format=%H %ad', '--date=short', '--', rel]).split('\n')) {
    const [sha, date] = line.split(' ');
    if (!sha) continue;
    if (touchesContent(git(['show', '--unified=0', '--format=', sha, '--', rel]))) return date;
  }

  // Every commit in this file's history was date-only. Nothing to hold it to.
  return '';
}

// True when a diff changes any line other than the `updated:` frontmatter value.
// Correcting a date is bookkeeping about the page; it is not a change to it.
function touchesContent(diff) {
  if (diff === '') return false;
  return diff
    .split('\n')
    .filter((line) => /^[+-]/.test(line) && !/^(\+\+\+|---)/.test(line))
    .some((line) => !/^[+-]updated:\s*\d{4}-\d{2}-\d{2}\s*$/.test(line));
}

function today() {
  const head = git(['log', '-1', '--format=%ad', '--date=short']);
  const now = new Date().toISOString().slice(0, 10);
  // A clock ahead of the last commit is normal; a clock behind it is not, and in
  // that case the commit date is the safer floor.
  return now > head ? now : head;
}

describe('site — a page cannot claim it was updated before it last changed', () => {
  it('test_when_every_page_updated_date_is_read_then_none_predates_its_last_edit', () => {
    const pages = pagesWithUpdated();
    assert.ok(pages.length > 0, 'expected at least one site page carrying an `updated:` date');

    const lying = [];
    for (const { rel, declared } of pages) {
      const changed = lastChangedDate(relative(REPO_ROOT, join(REPO_ROOT, rel)));
      if (!changed) continue;
      if (declared < changed) {
        lying.push(`${rel}: says ${declared}, last changed ${changed}`);
      }
    }

    assert.deepEqual(
      lying,
      [],
      'each page renders its `updated:` value to the reader as "last updated <date>". A date earlier than the page\'s own last edit tells the reader the prose is older than it is, which is the one direction that cannot be true. Bump the frontmatter in the same change that edits the page.',
    );
  });
});
