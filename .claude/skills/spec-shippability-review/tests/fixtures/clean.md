# Clean spec — should produce zero findings

## Design

Pure-prose design with no runtime invocations in shell fences. The maintainer
intent is documented but no scripts run.

## Contracts

| Path | Why |
|---|---|
| .claude/skills/foo/helper.mjs | Pure JS, .mjs extension |
| .claude/skills/foo/SKILL.md | Markdown, .md extension |
| docs/init/seed.md | Allowed under docs/ — shipped exception |
