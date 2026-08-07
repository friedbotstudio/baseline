---
key: Q-003
category: pending-questions
scope: [intake, spec, integrate]
source: assistant-deferral
verified-at: d4a1a47
last-touched: 2026-08-06
---

> Worth flagging, though: roadmap item C was marked ✅ for delivering a path-keyed surfacing trigger that **never fired** — the absolute-vs-relative mismatch meant it matched nothing on any real write until this cycle. A green roadmap line describing an inert mechanism is exactly the drift class this cycle exists to remove.

- **Question.** Should a roadmap task be markable ✅ on "the code landed and the suite is green", or should a task whose deliverable is a *runtime behaviour* require evidence that the behaviour actually fired at least once?
- **The instance.** `docs/roadmap-execution-plan.md:137` — epic item C, "Index and recall layer", claims "a second surfacing trigger keyed on path that extends `process_lifecycle_guard`". It shipped with unit tests that passed (they called the resolver with relative paths) and was inert in production for the whole interval, because the hook feeds it an absolute path. See [[path-keyed-surfacing-needs-a-repo-relative-path-payload-is-absolute]].
- **Why it is a real question and not just a bug report.** Every gate in the pipeline was green: tests passed, audit passed, drift-check passed, the roadmap flipped. The failure mode is a fail-open advisory whose tests exercise the unit but never the wiring. A "wiring test" requirement already exists in the `sprint-plan` / `sprint-oracle` done-criteria vocabulary; the open question is whether the roadmap should adopt it, and at what cost in ceremony.
- **Do not resolve by editing the roadmap.** `roadmap-sync` is deterministic and flips only tokens named in `workflow.json → roadmap_tasks[]`; un-flipping C by hand would be the same inference-from-diff the skill forbids.
- **Answer shape wanted.** Either a rule ("a task whose AC names a runtime trigger carries a wiring test") or an explicit decision that green-suite is sufficient and this class of miss is accepted.
