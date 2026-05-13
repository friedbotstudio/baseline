// Eleventy global data — exposes `build.build_id` to nunjucks. Spec contract:
// `gha-<GITHUB_RUN_ID>` in CI, `dev` locally (a footer reading "build dev"
// makes it obvious the page is not a published build).

export default {
  build_id: process.env.GITHUB_RUN_ID ? `gha-${process.env.GITHUB_RUN_ID}` : 'dev',
};
