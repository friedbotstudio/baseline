# Spec — feature the standup skill on the marketing site (/standup page + homepage teaser)

## Context

| Input | Path |
|---|---|
| Intake | `docs/intake/standup-site-feature.md` |
| BRD *(if any)* | *(none)* |
| Scout *(if any)* | `docs/scout/standup-site-feature.md` |
| Research *(if any)* | `docs/research/standup-site-feature.md` |
| Brainstorm brief | `docs/brief/standup-site-feature.md` |

## Goal

A developer evaluating the baseline can discover `/standup`, see the real recap it produces, and copy the command to try it, reached from a dedicated `/standup` feature page, a homepage teaser, and site navigation.

## Non-goals

- Not a features-page rewrite or a redesign of existing homepage sections.
- Does not change `standup` skill behavior (shipped in `3fffd06`).
- No email capture, signup, lead-gen, scarcity, or fake-urgency widgets.

## Design

Diagrams are the contract. Prose is only for things a diagram cannot say. This is an eleventy static-site change: new nunjucks pages reusing on-disk components (`.dc-*` dev-console, `.cli-strip` copy pill, `docs.njk` layout). No runtime service, no database.

### C4 — System context

```plantuml
@startuml
!include <C4/C4_Context>
title System Context — standup site feature

Person(dev, "Evaluating developer", "Decides whether to install the baseline")
System(site, "Baseline marketing site", "Eleventy static site at friedbotstudio")
System_Ext(pages, "GitHub Pages", "Serves the built obj/site output")

Rel(dev, site, "Reads /standup, homepage teaser; copies /standup")
Rel(site, pages, "Built by eleventy; deployed to")
@enduml
```

### C4 — Container

```plantuml
@startuml
!include <C4/C4_Container>
title Container — eleventy site build

Person(dev, "Evaluating developer", "")
System_Boundary(site, "Baseline marketing site (site-src/)") {
  Container(pages, "Page templates", "nunjucks (.njk)", "index.njk, standup.njk, skills/core.njk")
  Container(layout, "Layouts + includes", "nunjucks", "docs.njk, base.njk, hero-symbols/, footer.njk")
  Container(data, "Site data", "cjs/json", "nav.json, baseline.cjs, site.cjs")
  Container(assets, "Styles + script", "css/js", "site.css (.dc-*/.cli-strip), site.js")
  Container(out, "Built output", "html", "obj/site/ (gitignored)")
}
Rel(pages, layout, "extends / includes")
Rel(pages, data, "reads nav + counts")
Rel(pages, assets, "links")
Rel(pages, out, "rendered by eleventy into")
Rel(dev, out, "served via GitHub Pages")
@enduml
```

### C4 — Component (changed containers only)

The Page-templates container changes (new page + teaser); the Layout container gains one hero-symbol partial.

```plantuml
@startuml
!include <C4/C4_Component>
title Component — standup page + homepage teaser

Container_Boundary(page, "standup.njk") {
  Component(fm, "frontmatter", "yaml", "docs.njk layout, permalink /standup/, toc, heroSymbol")
  Component(hero, "hero-symbol include", "njk", "hero-symbols/standup.njk SVG")
  Component(dc, "readout figure", "html", ".dc-* static dev-console + figcaption (real readout)")
  Component(modes, "mode caption", "html", "on-demand vs session-start, one line")
  Component(cta, "copy pill", "html", ".cli-strip data-copy=/standup")
}
Container_Boundary(home, "index.njk teaser") {
  Component(tsec, "teaser section", "html", "headline + trimmed .dc-* snippet")
  Component(tcta, "teaser CTA", "html", "data-cta link to /standup/ + .cli-strip pill")
}
Rel(fm, hero, "includes")
Rel(fm, dc, "contains")
Rel(dc, modes, "followed by")
Rel(fm, cta, "contains")
Rel(tsec, tcta, "contains")
Rel(tcta, fm, "links to /standup/")
@enduml
```

### Data model — class diagram

No database. The "data model" is the static content composition rendered into HTML.

```plantuml
@startuml
title Content model — standup page composition

class StandupPage <<new>> {
  +permalink: "/standup/index.html"
  +layout: "docs.njk"
  +heroSymbol: "standup"
  +toc: TocEntry[]
}
class ReadoutFigure <<new>> {
  +tag: "figure"
  +ariaLabelledby: string
  +isImage: false
  +figcaption: string
}
class StandupReadout <<new>> {
  +lastRelease: string
  +commitsSinceTag: CommitLine[]
  +aggregateBump: string
  +upstream: string
  +backlogBuckets: string
  +openQuestions: string
  +recommendedPickup: string
}
class CommitLine <<new>> {
  +type: string
  +subject: string
  +bump: string
}
class HomepageTeaser <<new>> {
  +slot: "before #install"
  +snippetLines: int
  +ctaHref: "/standup/"
  +dataCta: string
}
StandupPage "1" *-- "1" ReadoutFigure
ReadoutFigure "1" *-- "1" StandupReadout
StandupReadout "1" *-- "many" CommitLine
StandupPage "1" o-- "1" HomepageTeaser
@enduml
```

#### Migration DDL

```sql
-- No schema migration: this is a static-site change with no database.
-- forward: (none)
-- reverse: (none)
```

### Behavior — sequence per AC

```plantuml
@startuml
title Behavior #1 — build emits a reachable /standup page
participant "npm run build:site" as Build
participant "eleventy" as E
participant "standup.njk" as P
participant "obj/site/" as O
Build -> E : run
E -> P : render (layout docs.njk, permalink /standup/)
P -> P : include hero-symbols/standup.njk
P --> E : html
E -> O : write standup/index.html
@enduml
```

```plantuml
@startuml
title Behavior #2 — readout is real text, not an image
participant reviewer as R
participant "standup.njk" as P
R -> P : inspect centerpiece
P --> R : <figure aria-labelledby><pre class="dc-body">...real readout...</pre><figcaption></figure>
note right of R : assert no <img> for readout; text is selectable
@enduml
```

```plantuml
@startuml
title Behavior #3 — discoverability links resolve to /standup/
participant visitor as V
participant "nav.json (topnav+sidebar)" as N
participant "footer.njk" as F
participant "skills/core.njk" as S
participant "index.njk teaser" as T
V -> N : sees Standup nav item -> /standup/
V -> F : sees Standup footer link -> /standup/
V -> S : sees standup in Generators catalog
V -> T : sees teaser CTA (data-cta) -> /standup/
@enduml
```

```plantuml
@startuml
title Behavior #4 — copy is Article X.1-clean
participant linter as L
participant "standup section markup" as M
L -> M : scan rendered copy
alt contains em dash or banned fluff word
  M --> L : FAIL
else clean
  M --> L : PASS (lowercase, plain)
end
@enduml
```

```plantuml
@startuml
title Behavior #5 — reduced-motion gate
actor User
participant Browser
participant "site.css" as CSS
User -> Browser : prefers-reduced-motion: reduce
Browser -> CSS : match @media (prefers-reduced-motion: reduce)
CSS --> Browser : reveal animation disabled
@enduml
```

```plantuml
@startuml
title Behavior #6 — copy pill mirrors install pill
actor User
participant "/standup .cli-strip" as Pill
participant clipboard as C
User -> Pill : click
Pill -> C : write "/standup" (data-copy)
Pill --> User : copied state (reused .cli-strip behavior)
@enduml
```

```plantuml
@startuml
title Behavior #7 — build-output verification
participant test as T
participant "npm run build:site" as B
participant "obj/site/standup/index.html" as H
T -> B : build
B --> H : emitted
T -> H : read
T -> T : assert exists + readout text present + no <img> readout + no em-dash + audit green
@enduml
```

### State — core entity *(only if stateful)*

No state machine. Static pages rendered once per build. Heading retained to record the explicit choice.

### Dependencies — graph

```plantuml
@startuml
' @kind dependency-graph
title Dependencies — standup site feature
left to right direction
[standup.njk] --> [docs.njk]
[docs.njk] --> [base.njk]
[standup.njk] --> [hero-symbols/standup.njk]
[standup.njk] --> [site.css]
[index.njk] --> [site.css]
[index.njk] --> [standup.njk]
[nav.json] --> [standup.njk]
[footer.njk] --> [standup.njk]
[skills/core.njk] --> [baseline.cjs]
[build-output.test] --> [obj/site]
@enduml
```

### Contracts

| Kind | Name | Input | Output | Errors | Idempotent |
|---|---|---|---|---|---|
| Build | `npm run build:site` | `site-src/**` | `obj/site/standup/index.html` + rebuilt pages | non-zero on missing include / template error | yes |
| Route | `/standup/` | GET | the feature page | 404 if not built | yes |
| Attr | teaser CTA `data-cta` | click | GA4 event (measurability) | — | yes |
| Attr | `.cli-strip` `data-copy="/standup"` | click | clipboard write + copied state | — | yes |

### Libraries and versions

No new dependency. Eleventy + nunjucks are already present in the site toolchain. No third-party API surface is introduced, so context7 is not applicable.

| Library@version | Purpose | Key APIs | Confirmed via context7 |
|---|---|---|---|
| *(none — existing eleventy/nunjucks toolchain)* | — | — | n/a |

### Alternatives considered

| Alt | Summary | Rejected because |
|---|---|---|
| Animated streamed console | Reuse hero `#dc-stream` JS to type the readout | Adds JS + motion/a11y burden; dilutes the hero's animated moment; static text scans better as proof |
| New bespoke terminal component | Author fresh CSS for the block | Violates reuse-before-create; `.dc-*` exists on disk with full tokens |
| Image of a terminal (.cli-preview) | Screenshot the readout like cli.njk | AC-4 forbids an image; not AT-readable/selectable |
| Words-only teaser (no readout) | Tease in prose, full readout only on /standup | Loses the demonstration hook where attention is highest |

## Design calls

UI surfaces under `site-src/**` (∈ `tdd.ui_globs`). `/tdd` Step 6 runs `Skill(design-ui, task_brief)` once per row; design-ui routes through `impeccable`.

| Slug | Intent | Target files | Write set | Register | References |
|---|---|---|---|---|---|
| standup-page | A /standup feature page whose centerpiece is the real terminal readout as proof-by-demonstration, in the existing docs.njk + `.dc-*` design system and lowercase disciplined voice; authority-via-competence + liking-via-shared-pain, no scarcity/urgency | `site-src/standup.njk`, `site-src/_includes/hero-symbols/standup.njk` | `site-src/**` | inherit | `.dc-*` component `site-src/index.njk:33-39`; frontmatter exemplar `site-src/swarm.njk:1-22`; figure a11y `site-src/index.njk:55,86` |
| standup-teaser | A compact homepage teaser section before Adoption with a trimmed 3-4 line `.dc-*` readout snippet, a `data-cta` link to /standup/, and a click-to-copy `/standup` pill reusing `.cli-strip` | `site-src/index.njk` | `site-src/index.njk`, `site-src/assets/site.css` | inherit | Adoption boundary `site-src/index.njk:519`; `.cli-strip` pill `site-src/index.njk:552`; `data-cta` pattern `site-src/index.njk:21` |

## Acceptance criteria

| ID | Criterion (given / when / then) | Upstream AC | Sequence |
|---|---|---|---|
| AC-001 | given the eleventy build runs, when it completes, then `obj/site/standup/index.html` is emitted and reachable at `/standup/` | intake AC 1 | §Behavior #1 |
| AC-002 | given `/standup`, when rendered, then it uses `layout: docs.njk` with toc, eyebrow, lead, heroSymbol, consistent with swarm.njk/memory.njk | intake AC 2 | §Behavior #1 |
| AC-003 | given the page, when rendered, then `site-src/_includes/hero-symbols/standup.njk` exists and the include resolves (no build error) | intake AC 3 | §Behavior #1 |
| AC-004 | given the centerpiece, when rendered, then the readout is semantic text in a `<figure>` (`.dc-*` `<pre>` + `<figcaption>`), not an `<img>`, and is selectable | intake AC 4 | §Behavior #2 |
| AC-005 | given the homepage, when rendered, then a compact teaser section appears before the Adoption section and links to `/standup/` | intake AC 5 | §Behavior #3 |
| AC-006 | given navigation, when rendered, then nav.json (topnav+sidebar) and footer.njk link to `/standup/`, and skills/core.njk names `standup` | intake AC 6 | §Behavior #3 |
| AC-007 | given the rendered standup page + teaser copy, when scanned, then no em dash and no Article X.1 banned fluff word | intake AC 7 | §Behavior #4 |
| AC-008 | given `prefers-reduced-motion: reduce`, when the page loads, then any reveal-on-scroll animation is disabled (CSS-gated) | intake AC 8 | §Behavior #5 |
| AC-009 | given the build, when the terminal block is populated, then its content is a representative REAL `/standup` readout (captured from an actual repo state), labeled as an example | intake AC 9 | §Behavior #2 |
| AC-010 | given the page and teaser, when rendered, then the primary CTA is a click-to-copy `/standup` pill reusing `.cli-strip`/`data-copy` (no signup) | intake AC 10 | §Behavior #6 |
| AC-011 | given the full change, when `/integrate` runs, then the test suite and `audit-baseline` stay green | intake AC 11 | §Behavior #7 |

## Test plan

| Category | Scenario | Expected | Covers |
|---|---|---|---|
| Golden path | build site; stat `obj/site/standup/index.html` | file exists | AC-001 |
| Golden path | built standup html contains the readout text inside `<pre class="dc-body">` | present | AC-004, AC-009 |
| Contract violation | built standup readout region contains `<img` | absent (assert NOT present) | AC-004 |
| Input boundary | scan built standup section + teaser for em dash `—` and banned fluff words | none found | AC-007 |
| Golden path | built index.html contains a teaser section before `id="install"` linking `/standup/` with `data-cta` | present | AC-005 |
| Golden path | nav.json + footer.njk + skills/core.njk reference `/standup/` or `standup` | present in all three | AC-006 |
| Regression trap | `site.css` standup reveal rule is inside a `@media (prefers-reduced-motion: reduce)` gate | gate present | AC-008 |
| Golden path | built standup contains a `.cli-strip` with `data-copy="/standup"` | present | AC-010 |
| Regression trap | `node .claude/skills/audit-baseline/audit.mjs` after change | exit 0 (skill count unchanged) | AC-011 |
| Cross-engine (integrate) | playwright navigate to `/standup/` in chromium/webkit/firefox | renders, no console error, readout visible | AC-001, AC-004 |

## Observability

| Signal | Name | Shape | Purpose |
|---|---|---|---|
| Analytics | teaser `data-cta` | GA4 event on click | measure click-through to /standup/ |
| n/a | — | static site; no metrics/alarms | — |

## Rollout

- **Feature flag**: none — additive static pages. The page exists or it doesn't.
- **Migration order**: 1) `hero-symbols/standup.njk`; 2) `standup.njk`; 3) capture the real readout into the `.dc-*` block; 4) `index.njk` teaser + any `site.css` reveal rule; 5) nav.json + footer.njk + skills/core.njk wiring; 6) `npm run build:site` clean; 7) build-output test + audit green.
- **Canary**: n/a (static marketing page). The integrate gate (build-output test + audit + playwright smoke) is the success signal.

## Rollback

- **Kill-switch**: remove `site-src/standup.njk` + `hero-symbols/standup.njk`, revert the `index.njk` teaser + `site.css` + nav.json + footer.njk + skills/core.njk edits, rebuild.
- **Signal to roll back**: build failure, the build-output test red, or the playwright smoke failing to render `/standup/` — all trip in CI within one run, under 5 minutes.

## Archive plan

- Defaults *(automatic)*: intake, brief, scout, research, spec, spec-rendered/, spec approval.
- Extras *(list any non-default files)*:
  - *(none)*

## Open questions

- Teaser slot precision: new `<section>` immediately before Adoption (`index.njk:519`) vs right after "How it flows" (`:184`). Resolved in the standup-teaser design call; default is before Adoption.
- Homepage snippet vs words-only: research recommends a trimmed `.dc-*` snippet (B1); confirm acceptable given homepage length, else fall back to words-only (B2).
- Test-glob placement: add the build-output test to the default `npm test` glob vs gate it behind a build-tests flag (per the existing publish-check convention) to control suite time.
