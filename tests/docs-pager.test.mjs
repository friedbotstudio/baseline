// Unit tests for site-src/_filters/docs-pager.cjs — the pure functions the
// eleventy `docsPager` filter wraps. They derive a docs page's previous/next
// neighbours from _data/docsnav.json, whose array order is the reading-order
// contract. See the source file for the full contract.
//
// The load-bearing behaviour is the unbuilt-page skip: entries with no `url`
// are pages the IA commits to but nobody has written, so the pager must step
// over them rather than emit a 404.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { docsFlow, entryFor, pagerFor, groupsFor } = require(
  path.join(REPO_ROOT, 'site-src/_filters/docs-pager.cjs'),
);

// Three groups, five entries, two of them unbuilt — the shape the real nav has
// while a section is part-written.
const NAV = [
  { group: null, type: 'explanation', items: [{ label: 'Overview', url: '/overview/' }] },
  {
    group: 'tutorials',
    type: 'tutorial',
    items: [
      { label: 'Install', url: '/install/' },
      { label: 'Unwritten tutorial' },
      { label: 'Org tutorial', url: '/org/setup/' },
    ],
  },
  {
    group: 'reference',
    type: 'reference',
    items: [{ label: 'Unwritten ref' }, { label: 'CLI', url: '/cli/' }],
  },
];

describe('docsFlow — flatten to reading order, built pages only', () => {
  it('test_when_nav_has_unbuilt_entries_then_they_are_excluded', () => {
    const flow = docsFlow(NAV);
    assert.deepEqual(
      flow.map((e) => e.url),
      ['/overview/', '/install/', '/org/setup/', '/cli/'],
    );
  });

  it('test_when_flattened_then_group_and_type_travel_with_each_entry', () => {
    const flow = docsFlow(NAV);
    assert.equal(flow[0].group, null);
    assert.equal(flow[0].type, 'explanation');
    assert.equal(flow[1].group, 'tutorials');
    assert.equal(flow[1].type, 'tutorial');
    assert.equal(flow[3].group, 'reference');
  });

  it('test_when_item_declares_its_own_type_then_it_overrides_the_group', () => {
    const nav = [{ group: 'reference', type: 'reference', items: [{ label: 'X', url: '/x/', type: 'how-to' }] }];
    assert.equal(docsFlow(nav)[0].type, 'how-to');
  });

  it('test_when_nav_is_missing_or_malformed_then_flow_is_empty', () => {
    assert.deepEqual(docsFlow(undefined), []);
    assert.deepEqual(docsFlow(null), []);
    assert.deepEqual(docsFlow('nope'), []);
    assert.deepEqual(docsFlow([{ group: 'x' }]), []);
    assert.deepEqual(docsFlow([{ group: 'x', items: [{ label: 'no url' }] }]), []);
  });
});

describe('pagerFor — neighbours in reading order', () => {
  it('test_when_page_is_first_then_prev_is_null', () => {
    const { prev, next } = pagerFor(NAV, '/overview/');
    assert.equal(prev, null);
    assert.equal(next.url, '/install/');
  });

  it('test_when_page_is_last_then_next_is_null', () => {
    const { prev, next } = pagerFor(NAV, '/cli/');
    assert.equal(next, null);
    assert.equal(prev.url, '/org/setup/');
  });

  it('test_when_neighbour_is_unbuilt_then_pager_skips_to_the_next_built_page', () => {
    // /install/ is followed by an unwritten tutorial, then Org tutorial.
    assert.equal(pagerFor(NAV, '/install/').next.url, '/org/setup/');
    // Org tutorial is preceded by that same unwritten page, and crosses a
    // group boundary forward into reference, skipping another unbuilt entry.
    assert.equal(pagerFor(NAV, '/org/setup/').prev.url, '/install/');
    assert.equal(pagerFor(NAV, '/org/setup/').next.url, '/cli/');
  });

  it('test_when_pager_crosses_a_group_then_the_neighbour_names_its_group', () => {
    assert.equal(pagerFor(NAV, '/org/setup/').next.group, 'reference');
    assert.equal(pagerFor(NAV, '/overview/').next.group, 'tutorials');
  });

  it('test_when_page_is_not_in_the_nav_then_both_sides_are_null', () => {
    const { prev, next } = pagerFor(NAV, '/not-a-docs-page/');
    assert.equal(prev, null);
    assert.equal(next, null);
  });

  it('test_when_only_one_page_is_built_then_both_sides_are_null', () => {
    const nav = [{ group: 'tutorials', type: 'tutorial', items: [{ label: 'Only', url: '/only/' }] }];
    const { prev, next } = pagerFor(nav, '/only/');
    assert.equal(prev, null);
    assert.equal(next, null);
  });
});

describe('entryFor — the current page, for the type chip', () => {
  it('test_when_url_is_in_nav_then_entry_carries_its_type_and_group', () => {
    const e = entryFor(NAV, '/org/setup/');
    assert.equal(e.label, 'Org tutorial');
    assert.equal(e.type, 'tutorial');
    assert.equal(e.group, 'tutorials');
  });

  it('test_when_url_is_absent_or_not_a_string_then_entry_is_null', () => {
    assert.equal(entryFor(NAV, '/nope/'), null);
    assert.equal(entryFor(NAV, undefined), null);
    assert.equal(entryFor(NAV, 42), null);
  });
});

describe('groupsFor — the global header, one link per group', () => {
  it('test_when_nav_grouped_then_one_entry_per_group_at_its_first_built_page', () => {
    const groups = groupsFor(NAV, '/nowhere/');
    assert.deepEqual(
      groups.map((g) => [g.label, g.url]),
      [
        ['Overview', '/overview/'],
        ['tutorials', '/install/'],
        ['reference', '/cli/'],
      ],
      'each group links its first BUILT page, skipping unwritten entries',
    );
  });

  it('test_when_lead_group_has_no_name_then_its_item_label_is_used', () => {
    // The lead group carries `group: null`; showing an empty label would be worse
    // than showing the one page it holds.
    assert.equal(groupsFor(NAV, '/')[0].label, 'Overview');
  });

  it('test_when_group_has_no_built_page_then_it_is_omitted', () => {
    const nav = [
      { group: 'built', items: [{ label: 'A', url: '/a/' }] },
      { group: 'all pending', items: [{ label: 'B' }, { label: 'C' }] },
    ];
    assert.deepEqual(
      groupsFor(nav, '/a/').map((g) => g.label),
      ['built'],
      'a group with nothing written would render as a dead link',
    );
  });

  it('test_when_current_page_is_not_first_in_its_group_then_group_is_still_current', () => {
    // The regression that motivated groups: page-level matching only marked a
    // page that was itself in the header, so 11 of 17 pages marked nothing.
    const groups = groupsFor(NAV, '/org/setup/');
    assert.deepEqual(
      groups.filter((g) => g.isCurrent).map((g) => g.label),
      ['tutorials'],
      'membership decides current, not whether the page is the group entry point',
    );
  });

  it('test_when_page_is_outside_the_nav_then_no_group_is_current', () => {
    // The marketing homepage belongs to no group.
    assert.equal(groupsFor(NAV, '/').filter((g) => g.isCurrent).length, 0);
  });

  it('test_when_nav_is_absent_or_malformed_then_empty', () => {
    assert.deepEqual(groupsFor(undefined, '/'), []);
    assert.deepEqual(groupsFor([null, { group: 'x' }], '/'), []);
  });
});

describe('the real docsnav.json satisfies the contract', () => {
  const realNav = require(path.join(REPO_ROOT, 'site-src/_data/docsnav.json'));

  it('test_when_real_nav_loaded_then_every_group_declares_a_type', () => {
    for (const g of realNav) {
      assert.ok(g.type, `group ${g.group} is missing a type`);
    }
  });

  it('test_when_real_nav_loaded_then_every_built_page_resolves_a_pager', () => {
    const flow = docsFlow(realNav);
    assert.ok(flow.length > 0, 'no built pages in docsnav');
    for (const e of flow) {
      const { prev, next } = pagerFor(realNav, e.url);
      // At least one side exists unless the whole flow is a single page.
      if (flow.length > 1) assert.ok(prev || next, `${e.url} has no neighbours`);
      for (const side of [prev, next]) {
        if (side) assert.ok(side.url.startsWith('/'), 'pager target must be root-style');
      }
    }
  });
});
