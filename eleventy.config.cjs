const { relUrl } = require("./site-src/_filters/rel-url.cjs");
const { entryFor, pagerFor, groupsFor } = require("./site-src/_filters/docs-pager.cjs");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "site-src/assets": "assets" });
  // CNAME tells GitHub Pages which custom domain to serve from. The file
  // ships in obj/site/ alongside the built HTML so the deployed artifact
  // carries the domain assertion. Update site-src/CNAME to change domains.
  eleventyConfig.addPassthroughCopy("site-src/CNAME");

  // `rel` filter — convert root-style site paths to page-relative URLs.
  // Templates write the canonical /assets/site.css, /hooks/, etc.; the
  // filter rewrites at render time using `this.page.url` so the same
  // built artifact serves correctly at any mount point (custom domain
  // root, /baseline/ project URL, or any subpath). See
  // site-src/_filters/rel-url.cjs for the full contract; tests/rel-url.test.mjs
  // for unit behavior; tests/site-relative-paths.test.mjs for the
  // built-artifact smoke check.
  eleventyConfig.addFilter("rel", function (absPath) {
    return relUrl(absPath, this.page && this.page.url);
  });

  // `docsPager` / `docsEntry` — derive a docs page's neighbours and its own
  // nav entry from _data/docsnav.json, whose array order is the reading-order
  // contract. Pages no longer hand-maintain prev/next, and the type chip is
  // resolved from the sidebar grouping so the two cannot disagree. Both skip
  // entries with no `url`, i.e. pages the IA commits to but nobody has written.
  // Contract and unit tests: site-src/_filters/docs-pager.cjs,
  // tests/docs-pager.test.mjs.
  eleventyConfig.addFilter("docsPager", function (docsnav) {
    return pagerFor(docsnav, this.page && this.page.url);
  });

  eleventyConfig.addFilter("docsEntry", function (docsnav) {
    return entryFor(docsnav, this.page && this.page.url);
  });

  // `docsGroups` — the global header's links, one per docsnav group. The header
  // describes the whole documentation site; the sidebar owns the tree under it.
  // Deriving from the same file means a new page joins a header group with no nav
  // edit, and the header can never link a page that does not exist.
  eleventyConfig.addFilter("docsGroups", function (docsnav) {
    return groupsFor(docsnav, this.page && this.page.url);
  });

  // `isoDate` — render a front-matter date as YYYY-MM-DD.
  //
  // YAML parses an unquoted `2026-07-29` into a JS Date, and Nunjucks prints a
  // Date via toString(), so the docs footer read "last updated Wed Jul 29 2026
  // 05:30:00 GMT+0530 (India Standard Time)" on every page. Quoting the value
  // in front matter fixes one page and silently regresses the next one someone
  // writes, so the formatting lives here instead. Accepts a Date or a string;
  // anything else renders as-is rather than throwing mid-build.
  eleventyConfig.addFilter("isoDate", function (value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    return typeof value === "string" ? value.slice(0, 10) : value;
  });

  // JSON embedded in an HTML <script> block needs HTML-context escaping on top
  // of JSON encoding. `dump` escapes quotes but leaves `/` alone, so a value
  // containing `</script>` closes the element early and the remainder parses as
  // HTML. Escaping the three HTML-significant characters as JSON \u sequences
  // keeps the payload valid JSON-LD while making it inert in HTML context.
  // Pair with `dump`: {{ value | dump | jsonScript | safe }}.
  eleventyConfig.addFilter("jsonScript", function (jsonText) {
    return String(jsonText)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026");
  });

  return {
    dir: {
      input: "site-src",
      output: "obj/site",
      includes: "_includes",
      layouts: "_layouts",
      data: "_data",
    },
    templateFormats: ["njk", "html"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
};
