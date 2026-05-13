---
name: resume
type: continuity
last-updated: never
trigger: stop
---

# Resume snapshot

No prior session. This file is overwritten by `memory_stop.sh` at end of each turn and by `memory_pre_compact.sh` before context compaction. The SessionStart hook reads it on the next session start.
