// Eleventy global data — becomes the `analytics` global in templates.
//
// The measurement id is env-gated on GITHUB_RUN_ID, which is set only inside a
// GitHub Actions run. A local `npm run build:site` therefore resolves to null,
// base.njk's `{% if analytics.measurement_id %}` block emits nothing, and no
// developer's local browsing reaches the property. Production builds run in
// Actions, so they carry the id.
//
// Read at import time (rather than behind a function) so the value is fixed for
// the whole build: one build, one decision about whether this site is measured.

const PROD_MEASUREMENT_ID = 'G-MYCZFYXE38';

export default {
  measurement_id: process.env.GITHUB_RUN_ID ? PROD_MEASUREMENT_ID : null,
};
