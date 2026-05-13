module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "site-src/assets": "assets" });

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
