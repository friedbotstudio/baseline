# Brainstorm brief — gitignore-setup

## Actor

- Consumer-repo developer running /init-project on their project.
- Anyone running git commit in a baseline-equipped repo (maintainer or consumer dev).
- Baseline maintainer invoking the gitignore skill ad-hoc to (re)generate a .gitignore.

## Trigger

- At /init-project time (every init creates/updates a .gitignore).
- At every git commit (PreToolUse hard-block check).
- On demand via the gitignore skill.

## Current State

- /init-project does not guarantee a .gitignore exists or is correct.
- Baseline-specific transient paths (.claude/state/, obj/, swarm worktrees, _pending.md content) and common secrets/state (.env*, node_modules, OS/editor cruft) can be committed accidentally.
- Nothing blocks a commit that tracks files which should be ignored.

## Desired State

- Every initialized project has a correct .gitignore, generated via gitignore.io with a vendored-default fallback when offline.
- When a .gitignore already exists, init is ADD-ONLY: append the baseline must-ignore lines that are not already covered; never remove, reorder, or overwrite the project existing entries.
- A git commit is HARD-BLOCKED when any required must-ignore path is not actually ignored. The must-ignore list spans BOTH secrets (.env*, keys/tokens) AND generated/transient state (.claude/state/, obj/, node_modules) equally.
- The commit-time check is cheap and offline: git check-ignore against a fixed must-ignore list. NO gitignore.io fetch at commit time.

## Non Goals

- Do NOT destructively overwrite or reorder an existing project .gitignore (add-only merge).
- Do NOT fetch gitignore.io at commit time (offline git check-ignore only).
- Do NOT change verify behavior or any other workflow track.
- Do NOT rewrite history or auto-un-track already-committed files — the hook gates NEW commits only.
- Do NOT make the secret/state distinction matter for the block: any leak of either is commit-stopping.

## Solution Leakage

- Request proposed gitignore.io as the generator (validate + design the fallback at spec/codesign).
- Request proposed a new PreToolUse hard-block hook for validation (user-decided at triage; refine trigger/scope at codesign).
- Request proposed git check-ignore as the offline validation mechanism (validate at spec).
- Request proposed a vendored-default .gitignore fallback (design its source-of-truth at spec).
