---
key: a-required-section-locks-out-every-spec-that-predates-it
category: landmines
load_bearing: true
scope: [spec, tdd, archive]
governs: .claude/hooks/artifact_template_guard.mjs,.claude/project.json
verified-at: 3c08c8a
last-touched: 2026-08-26
---

- Path: `artifact_template_guard.mjs:44` reads `project.json → artifacts.required_sections.spec` and denies any write to a spec missing one of them. It checks the file being written, not the file's age.
- Landmine: **adding a name to `required_sections` retroactively locks every spec already on disk that lacks it.** The guard cannot tell "this spec never had the section" from "this edit deleted it", so an artifact that was compliant when approved becomes un-editable the moment the list grows. There is no grandfathering and no warning at the moment the list changes — the wall appears the next time someone edits an old spec, which may be weeks later and in a different workflow.
- First observed 2026-08-07 on `system-spec-delta-slice-c`. Slice A of the `system-spec-delta` epic added `System delta` to the required list. The epic's OWN spec predates slice A, so **the epic's first slice locked out the epic's spec** — an amendment to the Slice C write-surface line was denied, and slices D, E and F would each have hit the identical wall. Fixed by authoring the section retroactively; the section then linted PASS with one real row.
- Why it hides: the guard fires on WRITE, not on read or on the config change. A required-section addition looks costless at the moment it lands (`/spec-lint` passes on every spec you are actively writing, because you are writing them to the new template), and the cost is paid later by whoever first needs to touch an older artifact.
- Mitigation when you add a required section: grep `docs/specs/*.md` for the new heading in the SAME change and backfill every spec that lacks it. A live spec is not just history — an epic spec is the standing contract for every slice still unbuilt.
- Sibling: [[drift-check-does-not-resolve-epic-child-pinned-specs]] — both are cases where a guard or checker resolves an artifact by a rule that was true when it was written and quietly stopped being true.
