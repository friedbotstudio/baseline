// Derive a docs page's previous/next neighbours from `_data/docsnav.json`.
//
// Array order in docsnav IS the reading-order contract (recorded in
// PRODUCT.md → Operating Context), so the pager reads it rather than asking
// every page to hand-maintain a `pager: {prev, next}` block that drifts.
//
// Unbuilt pages — entries with no `url`, rendered as inert "soon" text in the
// sidebar — are skipped. That is what makes shipping a partial site viable:
// neighbours re-wire themselves as pages land, and the pager can never point
// at a page nobody has written.
//
// Pairs with site-src/_filters/rel-url.cjs; both are pure so they can be unit
// tested without an Eleventy build (tests/docs-pager.test.mjs).

// Flatten docsnav into reading order, keeping only pages that exist. Each
// entry carries its group so the pager can name what it leads into.
function docsFlow(docsnav) {
  if (!Array.isArray(docsnav)) return [];
  const flow = [];
  for (const group of docsnav) {
    if (!group || !Array.isArray(group.items)) continue;
    for (const item of group.items) {
      if (!item || typeof item.url !== 'string' || item.url.length === 0) continue;
      flow.push({
        label: item.label,
        url: item.url,
        // An item MAY override its group's type, but needing an override is a
        // signal that the page is filed in the wrong group.
        type: item.type || group.type || null,
        group: group.group || null,
      });
    }
  }
  return flow;
}

// The current page's entry, or null when the page is not in the nav — the
// marketing landing page, for instance.
function entryFor(docsnav, currentUrl) {
  if (typeof currentUrl !== 'string') return null;
  return docsFlow(docsnav).find((e) => e.url === currentUrl) || null;
}

// { prev, next } for the current URL. Either side is null at the ends of the
// flow, so the layout renders one cell rather than an empty box.
function pagerFor(docsnav, currentUrl) {
  const flow = docsFlow(docsnav);
  const i = typeof currentUrl === 'string' ? flow.findIndex((e) => e.url === currentUrl) : -1;
  if (i === -1) return { prev: null, next: null };
  return {
    prev: i > 0 ? flow[i - 1] : null,
    next: i < flow.length - 1 ? flow[i + 1] : null,
  };
}

// The global header's links: one per docsnav group, pointing at that group's first
// built page.
//
// WHY GROUPS AND NOT PAGES. The header used to carry six hand-picked page links,
// which duplicated six of the sidebar's seventeen entries and left the other eleven
// unreachable from the header. A global nav is supposed to describe the whole site;
// the sidebar owns the tree beneath it. Every page belongs to exactly one group, so
// five group links cover all seventeen and adding a page never needs a nav edit.
//
// `isCurrent` is decided by group MEMBERSHIP rather than by comparing labels, which
// keeps the lead group (whose `group` is null) from needing a special case.
function groupsFor(docsnav, currentUrl) {
  if (!Array.isArray(docsnav)) return [];
  const out = [];
  for (const group of docsnav) {
    if (!group || !Array.isArray(group.items)) continue;
    const built = group.items.filter(
      (item) => item && typeof item.url === 'string' && item.url.length > 0,
    );
    // A group with nothing built yet would render as a dead link, so it is skipped
    // rather than emitted pointing at nothing.
    if (built.length === 0) continue;
    out.push({
      // The lead group carries no name of its own; its single item's label is the
      // honest one to show ("Overview").
      label: group.group || built[0].label,
      url: built[0].url,
      isCurrent: built.some((item) => item.url === currentUrl),
    });
  }
  return out;
}

module.exports = { docsFlow, entryFor, pagerFor, groupsFor };
