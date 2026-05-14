# Security reports — ga4-instrumentation

## ga4-instrumentation-2026-05-15.md

# Security Review — ga4-instrumentation — 2026-05-15

## Summary

**Overall risk: LOW.** The diff introduces a third-party tracking script (gtag.js) and two client-side event listeners. No new server-side surfaces, no new auth boundaries, no secrets, no crypto. The third-party script and the cookie-collection posture are accepted risks documented as non-goals in `docs/specs/ga4-instrumentation.md` (consent UX deferred to a follow-up workflow). The Measurement ID is public-by-design (visible in any browser's network panel on any GA4-instrumented site).

## Findings

### [LOW] Third-party script loaded without Subresource Integrity (SRI)
- **OWASP**: A08 - Software & Data Integrity Failures | **CWE**: CWE-353
- **File**: `site-src/_layouts/base.njk:15`
- **Evidence**:
  ```
  <script async src="https://www.googletagmanager.com/gtag/js?id={{ analytics.measurement_id }}"></script>
  ```
- **Impact**: a compromise of `googletagmanager.com` (or DNS hijack of the same) would let the attacker execute arbitrary JavaScript on every page of the site under the visitor's origin (`baseline.friedbotstudio.com`). Theoretical attack surface for credential phishing, cookie theft, or supply-chain takeover.
- **Recommendation**: SRI is **not feasible** for gtag.js because Google rotates the content under a versionless URL — pinning an integrity hash would break the loader the next time Google updates the library. The defensible alternative is a Content Security Policy that allows-lists `googletagmanager.com` + `google-analytics.com` explicitly. Track as a follow-up workflow `site-csp-headers`. Accept this risk for iteration 1.

### [LOW] No Content Security Policy on the site
- **OWASP**: A05 - Security Misconfiguration | **CWE**: CWE-693
- **File**: project-wide (`site-src/_layouts/base.njk` and the GitHub Pages config)
- **Evidence**: grep across `site-src/` and `eleventy.config.cjs` finds zero references to `Content-Security-Policy`. The site is served by GitHub Pages, which does not set a CSP by default and does not allow custom response headers without an intermediate CDN.
- **Impact**: any XSS that does land has no second-line containment. GA4 widens this surface incrementally (one more allowed origin).
- **Recommendation**: same as the SRI finding — track a `site-csp-headers` follow-up to add a `<meta http-equiv="Content-Security-Policy">` tag in `base.njk` head with: `script-src 'self' 'unsafe-inline' https://www.googletagmanager.com; connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com; img-src 'self' https://www.google-analytics.com data:; default-src 'self'`. The `'unsafe-inline'` is required for the gtag config IIFE; a nonced approach is possible but adds eleventy-side complexity. Accept for iteration 1.

### [LOW] User-controlled values flow into `gtag('event', …)` parameters
- **OWASP**: A03 - Injection (defensive-only; no injection vulnerability identified) | **CWE**: CWE-79 (mitigated)
- **File**: `site-src/assets/site.js` — CTA listener reads `el.getAttribute("data-cta")`; copy bolt-on reads `btn.getAttribute("data-copy")`. Both are passed verbatim as `content_id` / `command` string parameters to `gtag('event', …)`.
- **Evidence**:
  ```js
  window.gtag("event", "select_content", {
    content_type: "cta",
    content_id: el.getAttribute("data-cta"),
  });
  ```
- **Impact**: the `data-cta` and `data-copy` attributes are author-controlled (set by `index.njk` / `404.njk` templates and the `cli-strip` button), not visitor-controlled. A visitor cannot influence what values reach gtag from these attributes. If a future change exposes them to visitor input (URL params, form fields), the same code path would forward visitor-controlled strings to Google Analytics as event parameters. GA4 silently truncates parameter values at 100 chars and accepts arbitrary strings — no script-execution surface inside Google's analytics pipeline.
- **Recommendation**: no fix needed today; flag as a watch-item for any future change that wires visitor input into `[data-cta]` or `[data-copy]` attributes. Add this concern to the spec's open-questions log if the SEO journey iterations expand the surface.

### [LOW] Cookie collection without explicit consent
- **OWASP**: A04 - Insecure Design (privacy-by-design) | **CWE**: CWE-359
- **File**: `site-src/_layouts/base.njk:13-21` (gtag config call)
- **Evidence**: `gtag('config', '{{ analytics.measurement_id }}')` activates default GA4 behavior, which sets first-party cookies `_ga` and `_ga_<id>` and sends user agent + IP + page metadata to Google.
- **Impact**: legally gray for EU/EEA visitors under strict ePrivacy reading. The cookies are non-essential per ePrivacy and require informed consent. The project is public-alpha with low traffic, B2B-developer audience; the absolute risk is small.
- **Recommendation**: explicitly accepted in the spec's **Non-goals** section: "No banner, no Consent Mode v2 default-denied flow in this iteration." The follow-up workflow `ga4-consent-mode` (to be triaged separately) adds Consent Mode v2 + a minimal banner. Iteration 1 is shipped under this documented accepted risk.

## Dependencies

No new npm packages added by this diff. The gtag.js library is loaded at runtime from `googletagmanager.com` and is not bundled or vendored.

`npm audit` was not re-run by this skill because no `package.json` changes are present in the diff; the existing audit baseline is unchanged.

## Out of scope / Noted

- **The Measurement ID `G-MYCZFYXE38` is treated as public**, which is correct: GA4 measurement IDs are designed to be exposed in client-side HTML on every instrumented page. The `api_secret` field used in the Measurement Protocol (server-side) is the private credential; this work does not use Measurement Protocol.
- **The `data-cta` and `data-copy` attributes are inert in CSS** (no `[data-cta]` selector in `site-src/assets/site.css`), so the additions are purely behavioral; visual surface is unchanged.
- **No new file under `.env*`** patterns; `env_guard` hook would have blocked it regardless.
- **No new secrets in the diff** (verified by reading every changed line).
- **GitHub Pages hosting** means the site cannot set HTTP security headers (Strict-Transport-Security, X-Frame-Options, Permissions-Policy). All security posture changes must be `<meta http-equiv="…">` tags. Track as part of the `site-csp-headers` follow-up.

