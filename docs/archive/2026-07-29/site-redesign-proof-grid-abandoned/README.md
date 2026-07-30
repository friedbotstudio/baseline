# Abandoned — 2026-07-29

The `site-redesign-proof-grid` workflow was abandoned before implementation, on the
project owner's direction. Its `completed` list was
`["spec", "spec-shippability-review", "approve-direction"]` — TDD never ran, and none of
the 1b primitives (`.canvas`, `.bento`, the unified top bar, the band token pairs) were
ever built.

The site was redesigned ad-hoc instead. This directory keeps the approved spec and its
acceptance test so nothing is lost:

| File | Was |
|---|---|
| `spec.md` | `docs/specs/site-redesign-proof-grid.md` |
| `spec.test.mjs.retired` | `tests/site-redesign-proof-grid.test.mjs` — the `.retired` suffix keeps it out of the runner |

## Why the scope-boundary test was failing

AC-013 deferred the interior-page layout pass (`deferred: cost`). That pass was
subsequently built ad-hoc — the sixteen docs pages under `site-src/` — inside the same
branch. `test_when_diff_inspected_then_no_interior_page_template_modified` was therefore
failing correctly, right up until this workflow was abandoned.

## Left in place deliberately

`.claude/state/spec_approvals/site-redesign-proof-grid.approval` is still on disk. It is a
consent record, and `destructive_cmd_guard` blocks moving it from Bash. With no workflow
referencing the slug it grants nothing, and it is the durable evidence that gate A really
was passed for the spec archived here.
