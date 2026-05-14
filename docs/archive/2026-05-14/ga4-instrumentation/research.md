# Pattern Research — ga4-instrumentation

Three decisions, each with 2-4 candidates and a recommended pick.

Sources verified via context7 against `/websites/developers_google_analytics_devguides` (Source Reputation: High, Benchmark 81.94), plus the local GA4 reference set at `.claude/skills/google-analytics/references/`. Last verified: 2026-05-15.

---

## Decision 1 — Cookie-consent posture for iteration 1

### Candidate A: Ship without a banner, mark consent as explicit non-goal

- **Summary**: Deploy gtag.js as-is, no consent prompt. Document in spec + intake that consent management is a follow-up iteration.
- **API references (current)**:
  - `gtag('config', 'G-XXXXXXXXXX')` — `.claude/skills/google-analytics/references/gtag.md` (basic installation block, lines 27-44).
- **Fits**: yes — scout confirms no pre-existing analytics or consent infrastructure to integrate with; YAGNI argues against building consent UX before measurement is even wired.
- **Tests it enables**: structural assertion that the gtag snippet renders on every page; no consent-state tests required.
- **Tradeoffs**:
  - Legally gray for EU visitors under strict ePrivacy reading; GA4's `_ga` and `_ga_<id>` cookies are analytics-purpose (not strictly essential).
  - Public-alpha project, low traffic, low risk surface today; risk grows with traffic.
  - Reversible: adding Consent Mode v2 later is a non-breaking addition.

### Candidate B: GA4 Consent Mode v2 — default denied, no banner

- **Summary**: Issue `gtag('consent', 'default', {...denied...})` *before* loading gtag.js. Without a banner, consent stays denied forever; GA4 receives consent-aware cookieless pings (and Google's "conversion modeling" estimates the gap statistically).
- **API references (current)**:
  - `gtag('consent', 'default', ...)` — `.claude/skills/google-analytics/references/privacy.md:64-82`. Required parameters per Consent Mode v2: `ad_storage`, `ad_user_data`, `ad_personalization`, `analytics_storage`.
  - Context7 (Google devguides) confirms `ad_user_data` and `ad_personalization` are required Consent Mode v2 fields (since March 2024).
- **Fits**: partial — code-only, no dependency on a banner library, but the goal of iteration 1 is *measurement*. Default-denied with no path-to-granted means we measure approximated data only.
- **Tests it enables**: assertion that the `consent` call happens before the `config` call in `base.njk` head.
- **Tradeoffs**:
  - Defensible privacy posture: cookies-not-stored-without-consent.
  - Severely degraded data: GA4 reports modeled estimates, not actual event counts. Defeats the purpose of iteration 1.
  - The right shape for *iteration 2* once a banner is added: Consent Mode v2 + banner = grant-on-accept flow.

### Candidate C: Minimal universal banner (lightweight library or hand-rolled)

- **Summary**: Add a small CSS-only banner with accept/decline buttons. Gate the gtag `config` call (or use Consent Mode v2) on accept. Vanilla-cookieconsent or klaro at ~15-25KB, or hand-roll ~50 LOC.
- **API references (current)**:
  - Existing pattern in `.claude/skills/google-analytics/references/privacy.md` covers both gtag-only consent-mode update and the dual-path (denied/granted) flow.
- **Fits**: weakest — adds UI surface, copy decisions, design considerations to a workflow scoped at "wire analytics." Article X.1 also constrains the banner copy register.
- **Tests it enables**: banner-presence test, accept/decline state-machine test, consent-update gtag call assertion.
- **Tradeoffs**:
  - Most legally defensible.
  - Highest implementation + design cost; touches `impeccable` via `design-ui` for UX (per Article X.2).
  - Scope-creep risk for what is supposed to be iteration 1 of analytics wiring.

### Candidate D: Geo-gated banner (EU-only)

- **Summary**: `gtag('consent', 'default', {...denied...}, { region: ['AT','BE',...,'GB'] })`. Non-EU visitors are granted by default; EU visitors see denied state with optional accept banner.
- **API references (current)**:
  - `.claude/skills/google-analytics/references/privacy.md:127-145` — regional consent default. The `region` parameter is gtag-native; no geo-detection code required client-side (Google handles via IP).
- **Fits**: middle ground; less risk-exposed than (A), less work than (C).
- **Tests it enables**: assertion that the `region` array contains the EU+UK list; otherwise like (B).
- **Tradeoffs**:
  - Geo-detection happens server-side at Google's edge; we don't see the gating outcome client-side, which makes unit tests for behavior harder.
  - Still degrades EU data (denied for EU users without banner).
  - Best paired with a banner gated on geo (the most complete posture, also the most scope-creep).

### Recommendation — Candidate A (ship without banner, non-goal carve-out)

Rationale:
- Iteration 1's goal is to prove the wiring end-to-end; consent UX is its own design + legal exercise.
- The intake already lists consent as an open question; making it an explicit non-goal in the spec is honest and keeps scope tight.
- The follow-up iteration adding Consent Mode v2 + banner is non-breaking: the `gtag('consent', 'default', …)` call goes *before* the existing `config` call; no rewrites of `base.njk` structure.
- Risk profile justifies it: public-alpha, low traffic, B2B-developer audience for whom analytics on a docs site is unsurprising.

**What flips it**: a stakeholder requirement for GDPR compliance before launch (`/triage` re-runs the workflow with consent as an in-scope goal), or measurable EU traffic emerging that materially shifts the risk calculus.

---

## Decision 2 — Outbound link click measurement (friedbotstudio.com footer link)

### Candidate A: Enhanced Measurement built-in `click` event

- **Summary**: GA4 properties have **Enhanced Measurement** auto-fire a `click` event with parameters `link_url`, `link_domain`, `link_text`, `outbound: true` for every click on a link whose host is not in the property's hostname. Filter by `link_domain == friedbotstudio.com` in the GA4 dashboard to isolate the metric.
- **API references (current)**:
  - `.claude/skills/google-analytics/references/events-fundamentals.md:42` lists `click` as an Enhanced Measurement event for outbound link clicks.
  - `.claude/skills/google-analytics/references/setup.md:92` confirms it's optional but on-by-default for new web streams.
  - Context7 (Google devguides) confirms `click` parameters: `link_url`, `link_domain`, `link_text`, `outbound`.
- **Fits**: yes — zero client-side code. Configuration toggle in the GA4 admin UI (Admin → Data Streams → Web Stream → Enhanced Measurement gear icon).
- **Tests it enables**: none code-side. Manual verification via GA4 Realtime / DebugView after deploy.
- **Tradeoffs**:
  - Zero code, zero maintenance.
  - Event name is generic `click` (not `outbound_friedbotstudio_click`). Dashboard filtering is required to isolate friedbotstudio.com clicks.
  - No custom parameters beyond what Enhanced Measurement attaches automatically.

### Candidate B: Custom gtag event with default async transport

- **Summary**: Bind a delegated `click` listener that calls `gtag('event', 'outbound_friedbotstudio_click', {link_url: a.href})` for matching anchors. Gtag's modern transport defaults to `sendBeacon`, which works on navigation.
- **API references (current)**:
  - `.claude/skills/google-analytics/references/events-fundamentals.md` covers custom event firing via `gtag('event', name, params)`.
  - Per GA4 documentation, the legacy `transport_type: 'beacon'` parameter from Universal Analytics is now the default behavior — no explicit setting is required.
- **Fits**: yes; matches the existing delegated `querySelectorAll("[data-copy]")` pattern in `site-src/assets/site.js:244`.
- **Tests it enables**: structural assertion that the listener registers; jsdom-style assertion that clicking the friedbotstudio anchor calls gtag.
- **Tradeoffs**:
  - Named event in the dashboard, no filter required.
  - Adds code to maintain (~10-15 LOC).
  - Some event-loss risk on very fast navigation; minor for a footer link people don't furiously click.

### Candidate C: gtag with explicit `event_callback` to delay navigation

- **Summary**: `gtag('event', 'click', {event_callback: () => location.href = url})` — defers navigation until the beacon confirms. Most reliable, most fragile.
- **API references (current)**:
  - `event_callback` is a GA4-supported gtag parameter (legacy from Universal Analytics, retained).
- **Fits**: weak — disrupts native link click behavior (modifier keys, middle-click new-tab, browser navigation timing).
- **Tests it enables**: same as B, with extra timing assertions.
- **Tradeoffs**:
  - Breaks middle-click / Cmd-click for new tab if the handler `preventDefault()`s. Fragile.
  - Reliability under fast navigation: marginally better than B, not enough to justify the UX cost.

### Candidate D: `navigator.sendBeacon` directly to Measurement Protocol

- **Summary**: Bypass gtag entirely. Build a Measurement Protocol payload and post via `sendBeacon`.
- **API references (current)**:
  - Context7 returned the Measurement Protocol reference at the `/mp/collect` endpoint; requires `api_secret` server-side.
- **Fits**: no — Measurement Protocol is server-side. Putting `api_secret` in client JS leaks it; mixing client-side gtag with client-side MP for the same property is unusual and unsupported.
- **Tests it enables**: irrelevant.
- **Tradeoffs**: disqualified for client-side use.

### Recommendation — Candidate A (Enhanced Measurement built-in)

Rationale:
- Zero code is the most maintainable code.
- The footer link is the *only* outbound to friedbotstudio.com in the entire site (scout: `site-src/_includes/footer.njk:9`). The volume of clicks is low enough that filtering by `link_domain` in the dashboard is not a burden.
- AC 5 of the intake (event fires with destination URL as parameter) is satisfied by Enhanced Measurement's `link_url` parameter.
- Combining A + B (Enhanced Measurement for breadth + a custom named event for the specific friedbotstudio outbound) is over-instrumentation at this iteration — pick one.

**What flips it**: if the GA4 dashboard's filter-by-link_domain experience proves clunky for the operator (Tushar), upgrade to B (named custom event). Both options coexist gracefully — adding B later doesn't break A.

---

## Decision 3 — Event parameter schema

Three events, mapped against the GA4 recommended-events catalog and the local references.

### Event 1 — CTA button click

- **Candidate A1: `select_content` (recommended event)**
  - `gtag('event', 'select_content', {content_type: 'cta', content_id: '<button-slug>'})`.
  - Required params: none. Optional: `content_type`, `content_id`. (Context7 confirms.)
  - Reasoning: GA4 recommended-event status enables standard reporting (e.g. "select_content events by content_id" pre-built). CTAs map cleanly to "user selected this content."
- **Candidate A2: Custom `cta_click`**
  - `gtag('event', 'cta_click', {cta_label: '<text>', cta_destination: '<href>', page_path: '<path>'})`.
  - Reasoning: distinctive event name in the dashboard; bespoke params capture the destination (which `content_id` doesn't naturally hold).
- **Trade**: A1 is Google-idiomatic, A2 is more expressive. For Friedbot Studio's small CTA surface (4 marketing CTAs total: `Get the baseline`, `Read the docs`, `Back to overview`, `Install instead`), A1 is sufficient. A2 wins if we anticipate richer per-CTA reporting (conversion rates by destination, etc.).
- **Recommended**: **A1 (`select_content`)** with `content_id` set to a kebab-case CTA slug (e.g. `cta_get_the_baseline_index_hero`, `cta_install_404_help`). Lean on the recommended-event reporting path.

### Event 2 — Copy install command

- **Candidate B1: Custom `copy_install_command`**
  - `gtag('event', 'copy_install_command', {command: 'npx @friedbotstudio/create-baseline@latest .', page_path: '<path>'})`.
  - Reasoning: this is a *primary conversion goal* (copying the install command is the closest action to "intent to install"). It deserves its own first-class event name in the dashboard, not a multiplexed `select_content`.
- **Candidate B2: `select_content` with `content_type: 'install_command'`**
  - Reasoning: keeps everything under the recommended-event umbrella.
- **Trade**: B1 is more dashboard-friendly for the operator's "did anyone copy the command?" question. B2 muddies the data — `select_content` will then contain CTAs *and* install copies, and the operator filters every time.
- **Recommended**: **B1 (custom `copy_install_command`)**. Naming follows the snake_case + `[action]_[object]` framework documented in `.claude/skills/google-analytics/references/custom-events.md`.

### Event 3 — Outbound click to friedbotstudio.com

- Per Decision 2 (Candidate A — Enhanced Measurement), no custom event is created. The auto-fired `click` event with `link_domain: 'friedbotstudio.com'` carries the data.
- If a named event becomes necessary later: **`outbound_friedbotstudio_click`** with `link_url`, `link_text`. Follows the `[direction]_[brand]_[action]` pattern.

### Recommendation summary

| Event | Name | Type | Required params | Optional params |
|---|---|---|---|---|
| CTA click | `select_content` | recommended | (none) | `content_type: 'cta'`, `content_id: '<slug>'` |
| Copy install command | `copy_install_command` | custom | `command` | `page_path` |
| Outbound to friedbotstudio | `click` (Enhanced Measurement auto) | enhanced_measurement | (auto) | `link_url`, `link_domain`, `link_text`, `outbound` (all auto-attached) |

---

## Open questions

These need the human reviewer's call at `/spec`:

- **CTA slug scheme**: per-button hand-coded slugs (verbose, explicit) or auto-derived from `data-cta` attribute on each anchor (terser, requires template edits)? Spec decides.
- **Cli-strip double-count guard**: the cli-strip copy button is ALSO a `<button>` element. If we instrument both "CTA click" and "copy install command" listeners across the same DOM, the cli-strip fires both. Spec needs a rule: exclude `cli-strip` from the CTA listener, or fire only `copy_install_command` (the more specific event) and skip `select_content` for that click. Recommend: exclude `cli-strip` from the CTA selector (treat copy as a specialization, not a co-occurring event).
- **Confirm Enhanced Measurement is enabled** on the GA4 property (G-MYCZFYXE38). It's on-by-default for new web streams, but the operator should verify in the GA4 admin before relying on Decision 2 / Recommendation A. Mark this as a deploy-time checklist item in the spec's rollout section.
- **`page_path` parameter**: GA4 already attaches `page_location` and `page_path` to every event automatically. Re-attaching it on custom events is redundant. Spec can drop the explicit `page_path` from B1 if Enhanced Measurement / autoconfig already carries it.
