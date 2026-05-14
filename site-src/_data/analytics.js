// Eleventy global data — exposes `analytics.measurement_id` to nunjucks.
// Production CI builds (GITHUB_RUN_ID set) get the live GA4 measurement ID;
// local dev / non-CI builds get `null`, which the {% if analytics.measurement_id %}
// guard in `_layouts/base.njk` uses to suppress the gtag.js loader entirely.
// Same env-gate convention as _data/build.js so dev preview at :4321 never
// pollutes the production GA4 stream.

export default {
  measurement_id: process.env.GITHUB_RUN_ID ? 'G-MYCZFYXE38' : null,
};
