# Conversation thread trail (local, gitignored)

<!--
Durable per-developer continuity narrative for the conversation-thread-shelving
feature (CLAUDE.md Article IX clause 8). Claude Code — never the human — appends
one section per shelve (mechanical, verbatim) and transforms the most-recent
section into a surfaced summary at resume. This file's CONTENT is gitignored and
never committed; only this pristine structure ships. It is explicitly excluded
from the /memory-flush reset path, so a shelved thread survives flushes and
/clear. Not a skill, not a command — model-internal.

Section format (described in prose so this placeholder is not itself mistaken
for a real shelved section — see thread_store.mjs for the canonical writer):

  - A heading line: "##" + " SHELVED " + <iso8601> + metadata (trigger, span).
  - A machine-readable data block: an HTML comment whose body is the base64 of
    the entry JSON (base64 so no payload byte can collide with the comment
    close). thread_store.parseSections decodes it; thread_store.appendEntry
    writes it. The literal markers are intentionally NOT reproduced here.
  - Readable subsections for humans / SessionStart injection: Verbatim cues
    (blockquoted), Open questions, In-flight files, Next step.

This file starts empty (no sections). The first /shelve appends the first
section beneath this header.
-->
