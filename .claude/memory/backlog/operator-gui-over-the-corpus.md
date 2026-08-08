---
key: operator-gui-over-the-corpus
category: backlog
scope: []
status: open
source: user-instruction
raised-on: 2026-08-08
raised-in-context: skill-helper-cli-dispatchers
verified-at: b164ae7
last-touched: 2026-08-08
governs: docs/system/**,.claude/schemas/graph-document.v1.json,.claude/skills/workspace/graph.mjs
---

> this is what we will be building in future; a web GUI where operator can actually look at the documents, and also the relationship (like obsidian graph); they will use diagrams as companion. This will be used to review spec before proceeding; et-al that we can't do today leading to a lot of misses

> ok we will do the 12% and then for the rest we will do it later when we build the GUI layer

- **What it is.** A web GUI where an operator reads corpus documents beside a live relation graph, Obsidian-shaped. Used to review a spec before proceeding. Diagrams are a companion, not the primary artifact.
- **The contract it reads.** `node .claude/skills/workspace/cli.mjs graph --json`, whose shape is pinned at `.claude/schemas/graph-document.v1.json`. That schema shipped 2026-08-08 specifically so the GUI and the CLI share one contract instead of guessing it twice.
- **Decision D1 — the graph is LAYERED.** Derived edges are witnessed and drawn solid; authored links are unwitnessed and drawn hollow. This needs no new schema: `edges.mjs → edge()` already stamps `provenance: 'derived'`, so the layer is an existing field surfaced. v1 emits only derived; the authored set ships empty so the contract does not change when it lands.
- **Decision D2 — element bodies are HARVESTED FROM ARCHIVED SPECS**, not generated from source. The human chose reviewed prose over generated prose.
- **The measured caveat the human accepted.** Spec-harvest starts at 14 of 114 elements (12%) and grows FORWARD only. 96 archived specs exist; 3 carry a `## System delta` section (required only from 2026-08-07), 0 carry a write-set table, and the same-commit join fails — tested against `architecture-map`, whose spec was archived in a later docs commit than the code it describes. Fuzzy commit-subject attribution was rejected: a wrong `source_spec` yields a confidently wrong body, and the digest witnesses the anchor rather than the attribution, so nothing would catch it.
- **The gap that decides whether this is worth building.** Measured 2026-08-08: the corpus would render as 129 nodes with 28 authored links and ~101 orphans, because element and concept records carry frontmatter only — 0 body lines across all 114 elements and all 15 concepts. The well-connected graph is the derived one (124 edges), and 53 of 114 elements are glob-anchored and derive zero edges by design.
- **Related.** [[finish-the-dispatcher-sweep]] covers the write-path subcommands this GUI would eventually need.
