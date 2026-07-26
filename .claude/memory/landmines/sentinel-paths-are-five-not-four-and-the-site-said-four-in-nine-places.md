---
key: sentinel-paths-are-five-not-four-and-the-site-said-four-in-nine-places
category: landmines
scope: [document, integrate]
source: inferred-from-code
verified-at: e98b712
last-touched: 2026-07-26
---

- **`SENTINEL_PATHS` at `src/cli/conflict.js:12` holds FIVE entries**, not four: `.claude`, `.claude/.baseline-manifest.json`, `CLAUDE.md`, `.mcp.json`, `docs/init/seed.md`. A fresh install refuses with exit 1 if any of them is already present.
- **The site claimed four in nine places** across `install.njk`, `cli.njk`, `404.njk`, and `_includes/hero-symbols/install.njk`, including a `cli.njk` table cell that said "four" and then listed all five inline. The miscount had propagated into the hero symbol's `<title>` and its visible caption.
- **How it bit twice.** The claim was wrong in existing copy, and then I reproduced it in NEW copy I wrote during the same workflow, because I took the number from the page I was rewriting instead of from the source. Counting the list that sits three words later would have caught it.
- **The rule:** a count next to its own enumeration is a free assertion to check. When copy states a number and then lists the items, count the items.
