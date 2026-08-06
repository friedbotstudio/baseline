// The ONE hand-authored list in the corpus (spec D5).
//
// Elements are MATERIALIZED from this map; membership follows from which concept
// declared each anchor. Authoring the map rather than ~110 element records is what
// keeps the corpus re-derivable: seed-elements.mjs was hand-transcribed and never
// learned about the 7 modules the architecture-map cycle shipped.
//
// An anchor declared by TWO concepts yields ONE element in two concepts (D6) —
// conflicts.duplicateAnchor rejects two ids claiming one anchor, so cloning per
// concept is structurally impossible, and correctly so.

// The governed surface is OUR code (D2). Third-party-authored trees are excluded:
// the baseline ships and hash-protects them (seed.md Step 5), but they are not ours
// to model, and a map that describes them maintains data structures for a system
// this repository does not own.
export const GOVERNED_SURFACE = {
  roots: [".claude/hooks/",".claude/skills/",".claude/commands/",".claude/schemas/",".claude/mcp/",".github/workflows/","src/"],
  codeExtensions: [".mjs",".js",".json",".yml"],
  alwaysIncluded: [".claude/commands/"],
  excludedSegments: ["tests/","test/","fixtures/"],
  excludedTrees: [".claude/skills/impeccable/",".claude/skills/copywriting/evals/",".claude/skills/optimize-seo/scripts/"],
};

export const CONCEPT_ANCHORS = {
  "guard-substrate": [
    { id: "hooks-common-lib", anchor: ".claude/hooks/lib/common.mjs", title: "Hooks common lib" },
    { id: "frontmatter-parser", anchor: ".claude/hooks/lib/frontmatter-parser.mjs", title: "Frontmatter parser" },
    { id: "slug-safety", anchor: ".claude/hooks/lib/slug.mjs", title: "Slug validation and canonicalization" },
    { id: "gate-taxonomy", anchor: ".claude/hooks/lib/gate-taxonomy.mjs", title: "Advisory gate classifier" },
    { id: "tier-dial", anchor: ".claude/hooks/lib/tier-dial.mjs", title: "Governance class floor" },
    { id: "write-set-profile", anchor: ".claude/hooks/lib/write-set-profile.mjs", title: "Write-set diagram profile resolver" },
    { id: "env-guard", anchor: ".claude/hooks/env_guard.mjs", title: "Env file write guard" },
    { id: "setup-guard", anchor: ".claude/hooks/setup_guard.mjs", title: "Unconfigured-project advisory guard" },
    { id: "artifact-template-guard", anchor: ".claude/hooks/artifact_template_guard.mjs", title: "Artifact required-section guard" },
    { id: "skill-probe-lib", anchor: ".claude/skills/lib/*.mjs", title: "Shared skill probe library" },
  ],
  "consent-gates": [
    { id: "consent-gate-grant", anchor: ".claude/hooks/consent_gate_grant.mjs", title: "Consent marker writer (UserPromptSubmit)" },
    { id: "consent-decision", anchor: ".claude/hooks/lib/consent-decision.mjs", title: "Consent decision resolver" },
    { id: "direction-approval-guard", anchor: ".claude/hooks/direction_approval_guard.mjs", title: "Gate A guard" },
    { id: "swarm-approval-guard", anchor: ".claude/hooks/swarm_approval_guard.mjs", title: "Gate B guard" },
    { id: "epic-approval-guard", anchor: ".claude/hooks/epic_approval_guard.mjs", title: "Epic approval flip guard" },
    { id: "git-commit-guard", anchor: ".claude/hooks/git_commit_guard.mjs", title: "Gate C and branch-aware commit guard" },
    { id: "approval-anchor", anchor: ".claude/hooks/lib/approval-anchor.mjs", title: "Approval provenance anchor" },
    { id: "spec-content-hash", anchor: ".claude/hooks/lib/spec-content-hash.mjs", title: "Approved-artifact content hash" },
    { id: "consent-commands", anchor: ".claude/commands/*.md", title: "Consent slash commands (user-typed)" },
  ],
  "git-policy": [
    { id: "branch-guard", anchor: ".claude/hooks/branch_guard.mjs", title: "Branch guard" },
    { id: "git-commit-guard", anchor: ".claude/hooks/git_commit_guard.mjs", title: "Git commit guard" },
    { id: "gitignore-leak-guard", anchor: ".claude/hooks/gitignore_leak_guard.mjs", title: "Commit leak guard" },
    { id: "destructive-cmd-guard", anchor: ".claude/hooks/destructive_cmd_guard.mjs", title: "Destructive command guard" },
    { id: "commit-helpers", anchor: ".claude/skills/commit/*.mjs", title: "Commit phase helpers" },
    { id: "commit-planner-helper", anchor: ".claude/skills/commit-planner/*.mjs", title: "Commit split planner" },
    { id: "gitignore-baseline", anchor: ".claude/skills/gitignore/*.json", title: "Baseline must-ignore set" },
  ],
  "tdd-verification": [
    { id: "test-runner", anchor: ".claude/hooks/test_runner.mjs", title: "Test runner" },
    { id: "lint-runner", anchor: ".claude/hooks/lint_runner.mjs", title: "Lint runner" },
    { id: "tdd-order-guard", anchor: ".claude/hooks/tdd_order_guard.mjs", title: "Test-before-source guard" },
    { id: "verify-pass-guard", anchor: ".claude/hooks/verify_pass_guard.mjs", title: "Verify verdict guard" },
    { id: "tdd-helpers", anchor: ".claude/skills/tdd/*.mjs", title: "TDD drift-check and pointer resolution" },
    { id: "simplify-helpers", anchor: ".claude/skills/simplify/*.mjs", title: "Simplify oracle and reverify guard" },
    { id: "code-structure-oracle", anchor: ".claude/skills/code-structure/*.mjs", title: "Code structure oracle" },
    { id: "code-browser-walk", anchor: ".claude/skills/code-browser/*.mjs", title: "Universal navigation walk" },
  ],
  "workflow-tracks": [
    { id: "workflow-track-schema", anchor: ".claude/schemas/workflow-track.v1.json", title: "Workflow track schema" },
    { id: "workflows-validators", anchor: ".claude/skills/triage/workflows-validator-*.js", title: "Workflows validators" },
    { id: "track-tasklist-materializer", anchor: ".claude/skills/triage/track-tasklist-materializer.js", title: "Track tasklist materializer" },
    { id: "triage-helpers", anchor: ".claude/skills/triage/*.mjs", title: "Triage classification and exception derivation" },
    { id: "track-order-lib", anchor: ".claude/hooks/lib/track-order.mjs", title: "Phase ordering table" },
    { id: "track-guard", anchor: ".claude/hooks/track_guard.mjs", title: "Phase ordering guard" },
    { id: "brainstorm-helpers", anchor: ".claude/skills/brainstorm/*.mjs", title: "Entry-phase brainstorm discipline" },
    { id: "chore-sensitive-surface", anchor: ".claude/skills/chore/*.mjs", title: "Chore conditional-phase triggers" },
    { id: "power-commit-split", anchor: ".claude/skills/power/*.mjs", title: "Power batch commit split" },
    { id: "workflows-validator-entry", anchor: ".claude/skills/triage/workflows-validator.js", title: "Workflow track validator entry point" },
  ],
  "harness-loop": [
    { id: "harness-helpers", anchor: ".claude/skills/harness/*.mjs", title: "Harness loop, gates, plan state and notifier" },
    { id: "workflow-migrator", anchor: ".claude/skills/harness/workflow-migrator.js", title: "Pre-section-18 workflow.json migrator" },
    { id: "harness-continuation", anchor: ".claude/hooks/harness_continuation.mjs", title: "Harness Stop-hook safety net" },
    { id: "phase-timer", anchor: ".claude/hooks/phase_timer.mjs", title: "Per-phase timing observer" },
    { id: "timing-lib", anchor: ".claude/hooks/lib/timing.mjs", title: "Timing ledger" },
    { id: "harness-checkers", anchor: ".claude/skills/harness/checkers/*.mjs", title: "Harness oracle checkers" },
  ],
  "memory-model": [
    { id: "governed-memory", anchor: ".claude/hooks/lib/governed-memory.mjs", title: "Governed memory" },
    { id: "scoped-memory", anchor: ".claude/hooks/lib/scoped-memory.mjs", title: "Scoped memory" },
    { id: "surfacing-triggers", anchor: ".claude/hooks/process_lifecycle_guard.mjs", title: "Surfacing triggers" },
    { id: "memory-index-resolve", anchor: ".claude/skills/memory-index/resolve.mjs", title: "Memory index resolve" },
    { id: "memory-index-helpers", anchor: ".claude/skills/memory-index/*.mjs", title: "Memory index build, migrate, constraints" },
    { id: "memory-flush-helpers", anchor: ".claude/skills/memory-flush/*.mjs", title: "Flush sweep, routing, ledger" },
    { id: "memory-session-start", anchor: ".claude/hooks/memory_session_start.mjs", title: "Session-start memory injection" },
    { id: "memory-stop", anchor: ".claude/hooks/memory_stop.mjs", title: "Turn-end candidate extraction" },
    { id: "memory-pre-compact", anchor: ".claude/hooks/memory_pre_compact.mjs", title: "Pre-compaction resume snapshot" },
    { id: "memory-hook-libs", anchor: ".claude/hooks/lib/memory_*.mjs", title: "Memory hook libraries" },
    { id: "thread-store", anchor: ".claude/hooks/lib/thread_store.mjs", title: "Durable local thread trail" },
    { id: "resume-libs", anchor: ".claude/hooks/lib/resume_*.mjs", title: "Resume snapshot transform and writer" },
    { id: "shelve-libs", anchor: ".claude/hooks/lib/shelve_*.mjs", title: "Thread shelve capture and detection" },
    { id: "entry-body-lib", anchor: ".claude/hooks/lib/entry-body.mjs", title: "Memory entry body shape" },
    { id: "derived-header-lib", anchor: ".claude/hooks/lib/derived-header.mjs", title: "Derived index header" },
    { id: "closure-check-lib", anchor: ".claude/hooks/lib/closure-check.mjs", title: "Backlog closure stamp check" },
    { id: "workspace-corpus", anchor: ".claude/skills/workspace/*.mjs", title: "Architecture map corpus engine" },
  ],
  "constitution-chain": [
    { id: "audit-baseline-helpers", anchor: ".claude/skills/audit-baseline/*.mjs", title: "Baseline drift audit" },
    { id: "manifest-cli", anchor: "src/cli/manifest.js", title: "Baseline manifest builder" },
    { id: "surface-cli", anchor: "src/cli/surface.js", title: "Shipped surface enumeration" },
    { id: "audit-baseline-checks", anchor: ".claude/skills/audit-baseline/checks/*.mjs", title: "Per-surface baseline audit checks" },
  ],
  "project-config": [
    { id: "project-json-cli", anchor: "src/cli/project-json.js", title: "project.json reader and writer" },
    { id: "project-json-merge", anchor: "src/cli/project-json-merge.js", title: "project.json three-way merge" },
    { id: "workspace-flags", anchor: ".claude/skills/workspace/flags.mjs", title: "Architecture map feature flags" },
  ],
  "docs-pipeline": [
    { id: "document-helpers", anchor: ".claude/skills/document/*.mjs", title: "Document phase gate and receipts" },
    { id: "technical-writing-helper", anchor: ".claude/skills/technical-writing/*.mjs", title: "Corpus profile targets" },
    { id: "reader-level-helper", anchor: ".claude/skills/reader-level/*.mjs", title: "Reading level measurement" },
    { id: "whatsnew-helpers", anchor: ".claude/skills/whatsnew/*.mjs", title: "Whats-new fragment routing" },
    { id: "plantuml-cli", anchor: "src/cli/plantuml.js", title: "PlantUML jar resolution" },
    { id: "plantuml-syntax-guard", anchor: ".claude/hooks/plantuml_syntax_guard.mjs", title: "PlantUML parse guard" },
    { id: "spec-diagram-presence-guard", anchor: ".claude/hooks/spec_diagram_presence_guard.mjs", title: "Required diagram kinds guard" },
    { id: "technical-writing-bands", anchor: ".claude/skills/technical-writing/*.json", title: "Measured corpus bands" },
  ],
  "review-fanout": [
    { id: "spec-helpers", anchor: ".claude/skills/spec/*.mjs", title: "Spec evidence ladder and decision capture" },
    { id: "spec-review-helpers", anchor: ".claude/skills/spec-*/*.mjs", title: "Spec review oracles (lint, diagram, traceability, rollout, shippability, render)" },
    { id: "security-helper", anchor: ".claude/skills/security/*.mjs", title: "Security review helper" },
    { id: "research-retrieve", anchor: ".claude/skills/research/*.mjs", title: "Research retrieval" },
  ],
  "parallel-execution": [
    { id: "sprint-channel-server", anchor: ".claude/mcp/sprint-channel/server.mjs", title: "Sprint channel server" },
    { id: "sprint-channel-handlers", anchor: ".claude/mcp/sprint-channel/handlers.mjs", title: "Sprint channel handlers" },
    { id: "sprint-channel-lib", anchor: ".claude/mcp/sprint-channel/lib/*.mjs", title: "Sprint channel store, lock, schema" },
    { id: "sprint-broker", anchor: ".claude/mcp/sprint-broker/*.mjs", title: "Sprint broker transport" },
    { id: "sprint-pool", anchor: ".claude/mcp/sprint-pool/*.mjs", title: "Sprint pool registrar and handlers" },
    { id: "swarm-dispatch-helpers", anchor: ".claude/skills/swarm-dispatch/*.mjs", title: "Swarm wave audit and merge" },
    { id: "swarm-plan-helper", anchor: ".claude/skills/swarm-plan/*.mjs", title: "Swarm wave scheduler" },
    { id: "swarm-boundary-guard", anchor: ".claude/hooks/swarm_boundary_guard.mjs", title: "Write-set discipline guard" },
    { id: "org-dispatch-helpers", anchor: ".claude/skills/org-dispatch/*.mjs", title: "Org peer selection and yield arbitration" },
    { id: "companion-watch", anchor: ".claude/skills/companion/*.mjs", title: "Companion peer loop" },
  ],
  "planning-release": [
    { id: "release-workflow", anchor: ".github/workflows/release.yml", title: "Release workflow" },
    { id: "ci-automation", anchor: ".github/workflows/*.yml", title: "CI automation workflows" },
    { id: "standup-helper", anchor: ".claude/skills/standup/*.mjs", title: "Release and backlog recap" },
    { id: "sprint-planner-helper", anchor: ".claude/skills/sprint-planner/*.mjs", title: "Next-sprint proposal" },
    { id: "sprint-plan-helper", anchor: ".claude/skills/sprint-plan/*.mjs", title: "Sprint manifest decomposition" },
    { id: "sprint-oracle-helper", anchor: ".claude/skills/sprint-oracle/*.mjs", title: "Sprint completeness oracle" },
    { id: "roadmap-sync-helper", anchor: ".claude/skills/roadmap-sync/*.mjs", title: "Roadmap status sync" },
    { id: "ci-posture-cli", anchor: "src/cli/ci-posture.js", title: "CI posture detection" },
    { id: "roadmap-planner-scripts", anchor: ".claude/skills/roadmap-planner/scripts/*.mjs", title: "Roadmap dependency-graph engine" },
    { id: "sprint-plan-manifest", anchor: ".claude/skills/sprint-plan/*.json", title: "Sprint manifest template" },
  ],
  "design-routing": [
    { id: "design-calls-lib", anchor: ".claude/hooks/lib/design-calls.mjs", title: "Design calls row rule" },
    { id: "spec-design-calls-guard", anchor: ".claude/hooks/spec_design_calls_guard.mjs", title: "UI spec design-calls guard" },
    { id: "design-judge", anchor: ".claude/skills/harness/design-judge.mjs", title: "Design judge scoring" },
  ],
  "build-distribution": [
    { id: "release-workflow", anchor: ".github/workflows/release.yml", title: "Release workflow" },
    { id: "cli-core", anchor: "src/cli/*.js", title: "Installer CLI core" },
    { id: "cli-tui", anchor: "src/cli/tui/*.js", title: "Installer TUI" },
    { id: "upgrade-project-helper", anchor: ".claude/skills/upgrade-project/*.mjs", title: "Staged upgrade reconciliation" },
    { id: "src-templates", anchor: "src/*.json", title: "Shipped template config" },
  ],
};

export const CONCEPT_TITLES = {
  "guard-substrate": "Guard substrate",
  "consent-gates": "Consent gates",
  "git-policy": "Git policy",
  "tdd-verification": "Tdd verification",
  "workflow-tracks": "Workflow tracks",
  "harness-loop": "Harness loop",
  "memory-model": "Memory model",
  "constitution-chain": "Constitution chain",
  "project-config": "Project config",
  "docs-pipeline": "Docs pipeline",
  "review-fanout": "Review fanout",
  "parallel-execution": "Parallel execution",
  "planning-release": "Planning release",
  "design-routing": "Design routing",
  "build-distribution": "Build distribution",
};
