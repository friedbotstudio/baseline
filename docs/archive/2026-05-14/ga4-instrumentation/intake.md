# Wire Google Analytics 4 into the Friedbot Studio site

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

The Friedbot Studio site currently ships no analytics. There is no measurement of who lands on it, what they do, whether the install command is being copied, or whether outbound clicks to friedbotstudio.com convert. This is iteration 1 of a broader SEO optimization journey: without a baseline measurement layer, no later iteration (`/optimize-seo` for Core Web Vitals, content tuning, search-console-driven changes) can show whether anything improved.

## Goal

Every page of the production site sends pageviews to GA4 property `G-MYCZFYXE38`, and three high-signal interactions — button click, copy-install-command, and outbound click to friedbotstudio.com — fire as named custom events visible in the GA4 dashboard.

## Non-goals

- Performance optimization / Core Web Vitals work — that is iteration 2, owned by `/optimize-seo`.
- Custom audiences, funnels, or BigQuery export — out of scope for this iteration.
- Server-side or Measurement Protocol tracking — gtag.js client-side only.
- A/B testing or experimentation framework.
- Tracking every outbound link click — only outbound to `friedbotstudio.com`.
- Replacing or building a consent-management platform — at most a minimal banner if the security phase requires one for EU visitors.

## Success metrics

- gtag.js loader present on 100% of HTML pages in the production site build, verified by grep over the rendered tree. Baseline: 0 pages. Target: every page in `_site/`.
- The four event types (`page_view` + 3 customs) appear in GA4 Realtime within 30 seconds of a triggering action, verified manually post-deploy via DebugView or Realtime report. Baseline: 0 events. Target: 4 event types live.
- Dev preview at `localhost:4321` does not pollute the production property — verified by loading the dev preview and observing zero events in DebugView for the production stream. Baseline: undefined (no analytics yet). Target: 0 production-stream events from dev.

## Stakeholders

- **Requester**: Tushar Srivastava (razieldecarte@gmail.com)
- **Reviewer**: Tushar Srivastava — solo workflow; gate A approval is the same person who requested.
- **Operator**: Tushar Srivastava — runs the deploy and watches Realtime/DebugView after first prod push.

## Constraints

- Static site built with Eleventy (`npm run build:site` → `_site/`; dev preview via `npm run dev:site` at `:4321`). The gtag.js snippet must live in a shared layout or partial so every rendered page picks it up automatically; per-page duplication is not acceptable.
- The snippet must be placed early enough in `<head>` (or top-of-body) for gtag to capture the full pageview, and must be async-loaded to not block FCP.
- Article X.1 copy-register rules apply: `site-src/**/*.njk` is user-facing scope; no em-dashes, no hero-metric template, no glassmorphism/gradient-text patterns from the impeccable shared design laws. Rendered prose changes (if any) route through the `copywriting` register.
- Privacy / cookie-consent: site visitors may be EU-based. GA4 sets first-party cookies (`_ga`, `_ga_<id>`) and sends user IPs and pseudonymous identifiers to Google. The security phase decides whether this iteration requires a consent banner or whether it can defer to a follow-up iteration with explicit non-goal carve-out.
- Dev-vs-prod measurement-ID handling — mechanism is an open question (env-gated load, separate dev property, or noop on localhost). The constraint is that no dev events should pollute the production property.

## Acceptance criteria

1. Given any HTML page produced by `npm run build:site`, when the file is grepped for `googletagmanager.com/gtag/js?id=G-MYCZFYXE38`, then there is exactly one match per page.
2. Given that same page loaded in a browser, when the page's network requests settle, then a request to `googletagmanager.com/gtag/js?id=G-MYCZFYXE38` has fired and `window.dataLayer` exists with the `js`/`config` events recorded.
3. Given the site loaded, when the user clicks a `<button>` element designated as instrumented (selector to be decided in spec — buttons of interest are CTAs, not every native button), then a GA4 custom event fires with at least one parameter naming which button.
4. Given the landing page loaded, when the user activates the install-command copy affordance, then a GA4 custom event fires before or alongside the clipboard write.
5. Given the site loaded, when the user clicks a link whose `href` host is `friedbotstudio.com`, then a GA4 custom event fires before navigation completes, with the destination URL as a parameter.
6. Given the dev preview at `localhost:4321`, when any page is loaded, then no network request to `googletagmanager.com` carries the production measurement ID `G-MYCZFYXE38`. (The exact dev-vs-prod mechanism is an open question; the AC only constrains the observable outcome.)
7. Given the production site post-deploy, when the four event types are triggered manually, then all four appear in GA4 Realtime (or DebugView with `debug_mode: true`) within 30 seconds.

## Open questions

- Which buttons specifically count as "instrumented"? All `<button>` elements, or a curated CTA allowlist? What categorization scheme (event parameter values) — page section, button label, intent tag?
- Dev-vs-prod measurement-ID handling: env-gated snippet (load only when running in production build), a separate dev property, or no-op the gtag on `localhost`?
- Cookie-consent posture for this iteration: deploy without a consent banner (accept-by-default for now, plan a follow-up), or include a minimal banner gated on geo or universally? Anonymize IPs (`anonymize_ip: true` — note this is auto in GA4 but still configurable)?
- Where in the eleventy layout does the snippet live: directly in the base layout's `<head>`, a dedicated partial (`_includes/_analytics.njk`) included by the base layout, or injected via a global data file? Constraint: must be consistent across every page-generating layout.
- Event parameter schema: which dimensions attach to each event? Should the schema align with GA4 recommended-events naming conventions where available, or use bespoke names? Reference: `.claude/skills/google-analytics/references/recommended-events.md`.
- Outbound-link click measurement: synchronous (`onclick` handler that calls `gtag` with a `transport_type: 'beacon'` parameter before navigation), or asynchronous and accept some event loss? `navigator.sendBeacon` vs gtag's built-in handling?
- Does the install command exist on the landing page today, and does it already have a copy UI affordance? Scout phase confirms.
