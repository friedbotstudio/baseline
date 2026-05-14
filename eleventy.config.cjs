const { relUrl } = require("./site-src/_filters/rel-url.cjs");

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
