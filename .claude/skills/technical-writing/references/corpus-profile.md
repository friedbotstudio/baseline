# Corpus profile

The measured profile behind `SKILL.md` and `corpus-bands.json`.

## Method

28 documentation pages were fetched, stripped to body prose, and profiled on 24 axes.
Code blocks were removed before any prose measurement; inline identifiers were collapsed to a
single token so that `subprocess.Popen` counts as one word rather than three. Sentence splitting
guards against abbreviations, initials, decimals and version numbers.

Every page was published before 2022. Versioned documentation sets were pinned to a pre-2022
release (PostgreSQL 12, Python 3.8, Django 3.2, Rust 1.58); unversioned sets are long-stable
(SQLite, nginx, Effective Go, Pro Git 2e, 12factor, Backbone). Redis was taken from a
March 2021 archive snapshot.

**Corpus: 113,887 words of body prose across 28 documents.**

| Source | Pages | Type |
|---|---|---|
| SQLite | `lang_select`, `pragma`, `wal`, `whentouse` | reference, explanation |
| PostgreSQL 12 | `sql-select`, `datatype-numeric`, `backup-dump` | reference, how-to |
| Python 3.8 | `json`, `subprocess`, tutorial ×2, `howto/logging` | reference, tutorial, how-to |
| Django 3.2 | `ref/models/fields`, design philosophies, tutorial ×2, how-to ×2 | all four |
| Rust book 1.58 | ownership, guessing game | explanation, tutorial |
| Go | Effective Go | explanation |
| Pro Git 2e | plumbing and porcelain, branches in a nutshell | explanation |
| nginx | `ngx_http_core_module` | reference |
| Backbone.js | full API page | reference |
| 12factor | config, processes | explanation |
| Redis (2021 archive) | persistence | how-to |

The rightmost column of the table below is the shipped baseline docs site measured the same way,
before the rewrite. It is the contrast the skill exists to close.

## The table

Weighted by document length, so a 400-word page cannot outvote a 12,000-word one.

| Measure | All | Reference | Explanation | Tutorial | How-to | Site (pre-rewrite) |
|---|--:|--:|--:|--:|--:|--:|
| Prose words | 113,887 | 64,494 | 25,841 | 14,023 | 9,529 | 15,021 |
| Documents | 28 | 9 | 9 | 5 | 5 | 18 |
| **SENTENCES** | | | | | | |
| Mean length (words) | 17.6 | 17.1 | 19.2 | 16.76 | 17.78 | 12.18 |
| Median length | 16.18 | 15.49 | 18.44 | 15.1 | 16.34 | 11.55 |
| Std deviation | 9.33 | 9.14 | 9.91 | 8.88 | 9.78 | 5.84 |
| 90th percentile | 29.98 | 29.11 | 32.5 | 29.07 | 30.41 | 20.47 |
| % ≤10 words | 24.77 | 26.2 | 20.59 | 25.94 | 24.73 | 44.39 |
| % ≥30 words | 11.48 | 10.15 | 15.82 | 9.38 | 11.76 | 0.29 |
| **PARAGRAPHS** | | | | | | |
| Mean sentences | 2.38 | 2.46 | 2.49 | 2.15 | 1.89 | 2.35 |
| Mean words | 42.41 | 42.51 | 48.65 | 36.47 | 33.52 | 28.82 |
| % 1-sentence | 37.03 | 37.66 | 27.93 | 41.7 | 50.64 | 30.85 |
| % 3–5 sentence | 30.7 | 29.46 | 39.34 | 24.07 | 25.46 | 40.78 |
| **SYNTAX** | | | | | | |
| Commas per sentence | 0.79 | 0.74 | 0.91 | 0.78 | 0.79 | 0.63 |
| Semicolons /1k | 2.97 | 3.45 | 2.57 | 2.71 | 1.15 | 2.6 |
| Colons /1k | 7.75 | 6.48 | 6.06 | 15.55 | 9.45 | 4.6 |
| Em dashes /1k | 0.92 | 1.11 | 1.1 | 0.27 | 0.1 | 1.4 |
| Parentheses /1k | 7.58 | 8.09 | 5.91 | 8.19 | 7.79 | 1.93 |
| % passive sentences | 30.23 | 36.2 | 23.29 | 19.15 | 24.92 | 9.9 |
| Subordinators /1k | 20.37 | 21.91 | 18.99 | 15.53 | 20.82 | 15.04 |
| **PERSON & STANCE** | | | | | | |
| you / your /1k | 9.99 | 7.53 | 7.08 | 19.34 | 20.82 | 18.64 |
| we / our /1k | 2.65 | 0.37 | 6.54 | 6.48 | 1.91 | 0.07 |
| % imperative sentences | 1.91 | 1.83 | 1.13 | 3.39 | 2.35 | 5.29 |
| Modals /1k | 20.25 | 19.19 | 21.92 | 20.06 | 23.17 | 7.93 |
|   can /1k | 7.24 | 6.05 | 9.23 | 7.57 | 9.48 | 3.74 |
|   must /1k | 1.15 | 1.25 | 1.16 | 1 | 0.63 | 0.4 |
| Hedges /1k | 1.88 | 1.44 | 3.14 | 1.63 | 1.78 | 0.93 |
| **SUPPRESSED PATTERNS (natural rate)** | | | | | | |
| Inflated vocabulary /1k | 0.55 | 0.65 | 0.6 | 0.41 | 0 | 0.13 |
| Connectives /1k | 1.49 | 1.37 | 2.03 | 1.49 | 0.93 | 0.07 |
| Negation-definitions /1k | 1.33 | 1.29 | 1.61 | 1.27 | 0.97 | 1.87 |
| Rule-of-three /1k | 0.53 | 0.52 | 0.74 | 0.14 | 0.6 | 0.2 |
| **READABILITY** | | | | | | |
| Flesch-Kincaid grade | 10.67 | 10.73 | 10.85 | 9.93 | 10.85 | 6.63 |
| Syllables per word | 1.65 | 1.67 | 1.61 | 1.62 | 1.66 | 1.48 |
| % 3+ syllable words | 16.96 | 17.62 | 15.84 | 16.25 | 16.56 | 10.96 |
| **STRUCTURE** | | | | | | |
| Headings per document | 27.83 | 30.07 | 32.81 | 15.59 | 17.19 | 6.85 |
| Mean words per heading | 2.73 | 2.49 | 2.46 | 3.85 | 3.49 | 5.08 |
| % Title Case headings | 16.09 | 14.51 | 11.77 | 35.94 | 9.24 | 0.43 |
| Words per section | 802.66 | 1160.43 | 445.25 | 224.78 | 200.88 | 150.05 |
| Code blocks /1k prose | 6.62 | 5.38 | 6.88 | 12.24 | 6.07 | 2.13 |
| Code:total char ratio | 0.14 | 0.11 | 0.14 | 0.32 | 0.12 | 0.06 |
| Inline code per paragraph | 1.44 | 1.48 | 1.32 | 1.7 | 1.11 | 0.58 |
| List items /1k | 7.44 | 6.22 | 9.47 | 6.42 | 11.72 | 0.53 |

## Reading the deltas

Seven axes separate the corpus from the pre-rewrite site by more than a factor of two:

| Axis | Corpus | Site | Direction |
|---|--:|--:|---|
| Sentences ≥ 30 words | 11.5% | 0.3% | **39× fewer** |
| List items /1k words | 7.4 | 0.5 | **14× fewer** |
| Discourse connectives /1k | 1.5 | 0.07 | **21× fewer** |
| Parentheticals /1k | 7.6 | 1.9 | 4× fewer |
| % passive sentences | 30.2 | 9.9 | 3× fewer |
| Modal verbs /1k | 20.3 | 7.9 | 2.6× fewer |
| Code blocks /1k prose | 6.6 | 2.1 | 3× fewer |

Each one is an *absence*. The site does not contain bad writing so much as it is missing the
qualification, enumeration, exemplification and conditionality that technical prose is made of.
That is why a ban-list style guide could not repair it, and why the bands in
`corpus-bands.json` carry floors as well as ceilings.

## Paragraph opening moves

Share of paragraphs opening with each rhetorical move.

| Move | Reference | Explanation | Tutorial | How-to | Site |
|---|--:|--:|--:|--:|--:|
| assertion | 70% | 69% | 64% | 64% | **82%** |
| condition | 13% | 7% | 10% | 9% | 2% |
| definition | 9% | 11% | 9% | 11% | 8% |
| aside | 3% | 1% | 3% | 3% | 0% |
| purpose | 2% | 3% | 3% | 4% | 0% |
| contrast | 1% | 3% | 2% | 0% | 0% |
| address-reader | 1% | 1% | 3% | 4% | 2% |
| directive | 1% | 1% | 4% | 4% | 6% |
| authorial | 0% | 2% | 3% | 0% | 0% |

## Heading grammar

| Type | noun phrase | gerund | imperative | question | sentence |
|---|--:|--:|--:|--:|--:|
| Reference | 91.2% | 7.4% | 0.9% | 0.5% | 0% |
| Explanation | 89.7% | 4.5% | 3.2% | 0.6% | 1.9% |
| Tutorial | 60.6% | 35.2% | 4.2% | 0% | 0% |
| How-to | 57.1% | 28.6% | 0% | 11.1% | 3.2% |
| Site | 89.3% | 0% | 4.1% | 1.7% | 5.0% |

Gerund headings carry roughly a third of tutorial and how-to headings in the corpus. A blanket
ban on `-ing` headings is contradicted by the evidence for those two types.

## Sentence-opening words

Across the whole corpus, as a share of all sentences:

`the` 15.8% · `if` 8.4% · `this` 6.3% · `in` 3.4% · `for` 2.9% · `a` 2.8% · *identifier* 2.7% ·
`when` 2.4% · `it` 1.9% · `to` 1.5% · `you` 1.4% · `see` 1.2% · `note` 1.0% · `by` 0.9% ·
`however` 0.8% · `but` 0.8% · `as` 0.8% · `we` 0.7% · `there` 0.7% · `these` 0.6%

`if` and `when` together open 10.8% of all sentences in professional documentation.

## Reproducing

The corpus fetch, extraction and analysis scripts are not shipped with the skill; they were
one-shot derivation tooling. The derived artefacts that matter — the bands, the weights and the
calibrated threshold — live in `corpus-bands.json`, and `measure.mjs` is the only thing needed to
apply them. To re-derive against a different corpus, profile the new pages on the same axes and
regenerate the band endpoints as the 10th and 90th percentile of per-document values.

## Calibration

The verdict is a weighted deviation score rather than a per-axis gate, because across 24 axes at
p10/p90 even excellent documentation lands outside two or three by chance. Each axis contributes
`weight × (distance outside band ÷ band width)`.

| | Score |
|---|--:|
| Corpus median | 0.14 |
| Corpus 75th percentile | 1.39 |
| Corpus 90th percentile | 4.93 |
| **Threshold** | **4.5** |
| Site minimum (pre-rewrite) | 5.83 |
| Site median (pre-rewrite) | 10.61 |
| Site maximum (pre-rewrite) | 30.21 |

At 4.5 the gate passes 86% of the professional corpus and none of the 17 pre-rewrite site pages.
The corpus documents that fail are `12factor-processes` (10.5) and `progit-plumbing` (6.0), both
atypical: a terse manifesto and a chapter that is mostly shell transcript.
