---
key: .claude/skills/lib/slice-grammar.mjs
category: landmarks
scope: [spec, tdd, scout]
governs: .claude/skills/lib/slice-grammar.mjs, .claude/skills/spec-lint/lint.mjs, .claude/skills/tdd/drift_check.mjs, .claude/hooks/lib/pinned-spec.mjs
verified-at: 02f3c68
last-touched: 2026-09-02
---

- Role: Foundation. The epic spec's `## Slice <id>` grammar, declared **once**. Exports `sliceSection`, `sliceAcIds`, `sliceIds`, `sliceHeadingPresent`, `assertInertSliceId`, `SLICE_HEADING_PREFIX`.
- Why it exists: three readers parsed this section and each declared it separately. `pinned-spec.mjs` accepted a titled heading, `spec-lint` required the heading to end at the id, `drift_check` only probed for presence. Every epic spec on disk writes a titled heading, so `spec-lint`'s two epic checks had **never passed on a real epic** in this repository's history.
- Shape: one source compiled at two anchors, copying [[the-epic-heading-grammar-has-one-declaration-site]]. The id-bound pattern needs the heading position; the presence probe needs only "some slice heading exists". A single entry point with an optional id would let a presence scan match a body line.
- `ID_TAIL` is `(?![\w-])[^\n]*$` — the negative lookahead keeps `B1` off `## Slice B10`, and `[^\n]*` accepts the title every epic spec on disk writes.
- `AC_LABEL_RE` and `ANY_SLICE_HEADING_RE` are deliberately **non-global**: a shared `/g` regex used with `.test()` advances `lastIndex` and answers differently on alternate calls. See [[a-global-regex-with-test-fails-open-on-alternate-calls]].
- `assertInertSliceId` is the CWE-74 guard, wired at `pinned-spec.mjs → splitPin` so every downstream consumer inherits it at the one place the value enters the system. It rejects newline, `#`, and backtick. The backtick was added after the security review measured a crafted id closing the code span in a drift message and rendering as a clean verdict.
- The grammar this module implements is published in `docs/init/seed.md` §18.9 ("Slice-section grammar (binding)"). Constitution Art. I.4: amend seed.md first, then the `src/seed.template.md` mirror.
- Pinned by `tests/slice-grammar.test.mjs` and by the conformance fixture at [[claude-skills-conformance-engine-mjs]].
