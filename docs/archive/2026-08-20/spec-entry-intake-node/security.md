# Security reports — spec-entry-intake-node

## spec-entry-intake-node-2026-08-20.md

# Security Review — main (spec-entry-intake-node) — 2026-08-20

## Summary

Overall risk: **LOW**, with one governance trade-off recorded below rather than filed as a
finding. The diff is data and prose only: two `workflows.jsonl` track records, the seed.md
§18.1 amendment and its template mirror, a golden fixture, and tests. No executable code
changed, no dependency moved, and no path in `security.sensitive_globs` was touched.

On the consent surface the change is a strengthening, not a relaxation. Gate A moves from
"after the spec and its shippability review" to "immediately after intake", which means the
approval token is written at a point where no spec exists on disk and therefore cannot hash
one.

## What was checked

- Consent-gate integrity across all 11 tracks: `approve-direction`, `approve-swarm` and
  `grant-commit` each still carry `needs_user: true`; every `commit` node still declares
  `grant-commit` in `depends_on`; and on every track that has both, `approve-direction`
  still precedes `implementation` in node order.
- `security.sensitive_globs` intersection with the diff: empty.
- Secrets scan over added lines: the only hits are the word "token" inside comments
  describing the approval token. No literal credential.
- Track-guard reachability: `track_guard` authorizes writes off the presence of
  `.claude/state/spec_approvals/<slug>.approval`. Under the new ordering that token exists
  before `scout` and `spec` run, so those writes are authorized by a real gate-A consent
  rather than proceeding ungated. This is the same ordering `intake-full` already used.

## Findings

None.

## Dependencies

No packages added, removed, or version-changed.

## Out of scope / Noted

- **The human now consents with less in front of them.** Under the previous spec-entry
  ordering the reviewer saw a drafted spec and its shippability verdict before approving;
  they now see an intake. That is the declared intent of the D3/CO-E gate-collapse — the
  spec is machine-reviewed by spec-traceability, the checker fan-out, shippability, the
  drift check and design-calls, and `checkImplementationReady` blocks implementation entry
  on any BLOCKED verdict — and it is what this change restores rather than invents. It is
  recorded here because it is a real reduction in what the human sees at the moment of
  consent, and because the mitigation is entirely the machine-review chain: if those
  checkers weaken, this gate weakens with them.
- The alternative design that was explicitly rejected: keeping the spec as the approved
  artifact and exempting "minor" amendments from re-approval. A model classifying its own
  amendment as minor is self-approval, which is the failure mode the consent gates exist to
  make structurally impossible. Rejecting it is recorded in seed.md §18.1.

