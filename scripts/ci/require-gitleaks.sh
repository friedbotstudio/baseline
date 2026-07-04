#!/usr/bin/env bash
# Hard-fail secrets gate for the pre-commit hook (baseline CI posture).
#
# Contract (AC-010): when the gitleaks binary is absent, the commit MUST
# hard-fail — a missing scanner is a silent hole, not a soft skip. When
# present, scan the staged diff only (gitleaks@8.24.x: `gitleaks git
# --pre-commit --staged`).
#
# Tested by tests/require-gitleaks.test.mjs (exempt from same-extension test
# pairing in project.json → tdd.exempt_globs; coverage is cross-extension).
# Template-ready: no repo-specific paths; the calling hook resolves the repo
# root. Emergency bypass (human-only): git -c core.hooksPath= commit.
set -euo pipefail

if ! command -v gitleaks >/dev/null 2>&1; then
  cat >&2 <<'EOF'
pre-commit blocked: the gitleaks binary is not installed.

This repository hard-fails commits without a secrets scan (CI posture).
Install gitleaks and retry:

  brew install gitleaks

Other platforms: https://github.com/gitleaks/gitleaks#installing
EOF
  exit 1
fi

exec gitleaks git --pre-commit --staged --redact --no-banner --verbose
