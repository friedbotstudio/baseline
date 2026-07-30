// Eleventy global data — becomes the `build` global in templates.
//
// Stamps every rendered page with the build that produced it, so a page in the
// wild can be traced back to a CI run. Inside GitHub Actions the id is the run
// id, prefixed so it reads as a provenance token rather than a bare number.
// Everywhere else it is `dev`, which is the honest answer for a local build.

export default {
  build_id: process.env.GITHUB_RUN_ID ? `gha-${process.env.GITHUB_RUN_ID}` : 'dev',
};
