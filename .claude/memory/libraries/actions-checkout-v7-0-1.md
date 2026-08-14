---
key: actions/checkout@v7.0.1
category: libraries
scope: [research]
verified-at: 8201af6
last-touched: 2026-08-14
caveat: pinning a privileged job's checkout to base is only HALF the protection — under `pull_request` GitHub executes the **workflow file itself from the PR merge ref**, so a PR can rewrite the workflow the pin lives in. What actually stops a fork self-merging is GitHub capping `GITHUB_TOKEN` to read-only for fork PRs. Full trust model: `docs/runbooks/ci-posture.md → Auto-merge trust model`.
---

- Role: GitHub Action (NOT an npm dep — no lockfile pin). SHA-pinned `3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1` in `.github/workflows/release.yml` + `auto-merge.yml` + `labels.yml` (bumped from `df4cb1c0… # v6.0.3` at cd9ac76; this entry was keyed to the old version until 2026-08-14); `scripts/verify-action-shas.mjs` re-validates the pin against the upstream tag.
- Load-bearing API fact (context7 `/actions/checkout`, verified 2026-07-12): the `ref` input takes "the branch, tag, or SHA to checkout"; a **full 40- or 64-char hex string is treated as a commit SHA**. Unset on the workflow repo → the GitHub context ref/SHA (for `pull_request`, that is the PR **merge ref**).
- **The security pattern**: `ref: ${{ github.event.pull_request.base.sha }}` is actions/checkout's own documented **"Safe Pull Request Checkout"** — check out the BASE commit so a privileged job never executes PR-supplied code. Used by `auto-merge.yml`'s `classify-and-enable` job so a PR cannot supply the classifier that judges it. Do NOT reach for `pull_request_target` as the fix: it hands fork PRs a privileged token and is strictly worse.
