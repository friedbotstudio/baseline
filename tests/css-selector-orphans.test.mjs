// Regression guard for orphaned ancestor-scoped CSS.
//
// Why this exists: the site-positioning batch moved a component out of .hero and
// into its own section. Nine rules written `.hero .<component> …` went dead in
// the same commit. The build stayed green, the full suite stayed green
// (1957/1957), and /integrate stamped a binding PASS — while the homepage's
// first section rendered a 40x116 ideogram at 1016x2946px as three black bars
// and an orange dot.
//
// tests/site-spine.test.mjs even asserted the move. The structural change was
// tested; the fact that its styling no longer matched was not. Nothing in the
// suite could see it, because every existing site test reads HTML or claim text,
// and this failure lives in the join between the two.
//
// The component that motivated it (.meta-strip and its .ms-chain ideogram) was
// retired with the 1b redesign, along with the case that pinned its positioning
// context. The general check below is the durable part and stays: it derives
// every `.a .b` pair from the stylesheet, so it guards components that do not
// exist yet without naming any of them.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { ensureSiteBuilt, renderedPages, readRendered, REPO_ROOT } from './helpers/site-build.mjs';
import { elementsWithAncestry, descendantClassPairs } from './helpers/html-ancestry.mjs';

describe('CSS descendant selectors resolve against the rendered markup', () => {
  let pairs;
  let pages;

  before(() => {
    ensureSiteBuilt();
    const css = readFileSync(path.join(REPO_ROOT, 'site-src', 'assets', 'site.css'), 'utf8');
    pairs = descendantClassPairs(css);
    pages = renderedPages().map((rel) => ({ rel, elements: elementsWithAncestry(readRendered(rel)) }));
  });

  it('test_when_stylesheet_parsed_then_descendant_pairs_found', () => {
    // Guards the guard: a parser change that silently matched nothing would make
    // every assertion below vacuously pass.
    assert.ok(pairs.length > 50, `expected many descendant selectors, got ${pairs.length}`);
  });

  it('test_when_descendant_class_rendered_then_its_ancestor_class_is_above_it', () => {
    const orphans = [];

    for (const { ancestor, descendant, selector } of pairs) {
      // Only pages that actually render the descendant can judge the rule; a
      // rule for a page that does not use it is not evidence of anything.
      const witnesses = [];
      for (const page of pages) {
        const hits = page.elements.filter((el) => el.classes.includes(descendant));
        if (!hits.length) continue;
        witnesses.push({
          page: page.rel,
          scoped: hits.some((el) => el.ancestors.has(ancestor)),
        });
      }
      if (!witnesses.length) continue;
      if (witnesses.some((w) => w.scoped)) continue;

      orphans.push(
        `${selector} — .${descendant} renders on ${witnesses.map((w) => w.page).join(', ')} ` +
          `but never inside .${ancestor}, so the rule is dead`,
      );
    }

    assert.deepEqual(
      orphans,
      [],
      `orphaned ancestor-scoped rules (re-scope them to the component, or move the markup back):\n  ${orphans.join('\n  ')}`,
    );
  });

});
