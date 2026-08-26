---
key: analytics-hooks-key-on-a-data-attribute-not-a-class
category: conventions
scope: [document, implement]
source: inferred-from-code
raised-on: 2026-08-25
raised-in-context: docs-site analytics review
verified-at: 3c08c8a
last-touched: 2026-08-26
governs: site-src/assets/site.js,tests/ga4-event-hooks-rendered.test.mjs
---

- Convention: a GA4 listener binds to a dedicated data attribute (`[data-cta]`, `.js-copy` + `data-copy`) and never to a presentational class. A class is owned by the design; an analytics attribute is owned by the measurement, and only one of those two survives a restyle.
- **This was load-bearing and nobody knew.** The approved spec identified the CTAs as the `.btn-primary` / `.btn-secondary` anchors. Measured 2026-08-25: neither class exists anywhere in the built site — the vocabulary is now `btn-repo` and `btn-cmd`. All four CTA markers still fire, purely because `site.js` keys on `[data-cta]` alone, a choice its own comment records as deliberate for a different reason (avoiding a double count with `[data-copy]`).
- **A dead listener is a silent zero, and a zero reads as "nobody clicked".** That is why the failure is worth guarding rather than noticing later.
- The ten tests in `tests/ga4-events.test.mjs` read `site.js` and assert the handler shape. Every one stays green if the attributes vanish from the templates. `tests/ga4-event-hooks-rendered.test.mjs` covers the other half: the hooks exist in the rendered site, every copy button carries a command to report, and no two CTAs share a `content_id` — GA4 aggregates by that id, so a collision merges two CTAs into one row neither can be read out of again.
- Parsing trap when extending either test: `data-copy` is written with **single** quotes wherever the copied command contains double quotes, as in `data-copy='/triage "your request"'`. A double-quote-only regex reports those buttons as uninstrumented and sends the reader hunting a defect in the site.
- Outbound-link clicks are **not** in this code at all. They depend on GA4 Enhanced Measurement being enabled in the property admin, which no test here can see; the `btn-repo` link on all 19 pages rides entirely on that setting.
