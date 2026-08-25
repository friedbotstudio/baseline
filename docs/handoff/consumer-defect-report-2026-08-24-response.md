# Response — consumer defect report, 2026-08-24

Ten items reported. Nine were verified against the tree rather than accepted on
the report; eight are fixed and shipped on `main`, one was already fixed, and one
is not this repository.

Every fix is unreleased at the time of writing. `v0.25.0` is the shipped tag and
these land in the next one.

---

## What happened to each item

| # | Verdict | Where it landed |
|---|---|---|
| 1 | Fixed — new `state_write_guard`, the 27th hook | `6fdc3df` |
| 2 | Fixed — `assertWritable` now distinguishes the two faults | `694f131` |
| 3 | Already fixed before you reported it, in `05d8fec` | — |
| 4 | Fixed — hard-block patterns anchored at a command head | `f2bf0d0`, `6fdc3df` |
| 5 | Fixed — `roadmap-sync` correlates by epic number, not slug | `694f131` |
| 6 | Fixed — `/spec-lint` gained the two epic checks | `694f131` |
| 7 | Fixed, but not as reported — see below | `6fdc3df` |
| 8 | **Not this repository** — see below | — |
| 9 | Fixed — commit SOP Step 1 names the plain `mv` | `cf75ecd` |
| 10 | Fixed — a reference token in prose is no longer read as a real one | `6fdc3df` |

---

## Item 8: right bug, wrong repository

`roadmap-issues` does not exist here. Not on disk, and not anywhere in this
repository's git history. Nothing in the baseline ships it, so there is no fix
for us to make and no release that changes it for you.

**The damage you saw is real, though, and item 5 explains it.** Seven GitHub
issues opened under the wrong epic identity is exactly what happens when a tool
tries to match a workflow to an epic and cannot.

Here is the mechanism. `roadmap-sync` identified an epic by the tag in its
heading, `## Epic 3 — Some title  (some-tag)`, and matched that tag against the
workflow slug. That works only while every epic heading is tagged with a slug.
An epic tagged by category instead, `(foundation)` or `(module)`, can never match
any slug, so the correlation fails silently and the tool appends a fresh epic
section rather than finding the existing one. Downstream, anything keyed off that
section is keyed off the wrong identity.

Our own epics are all slug-tagged, which is why this repository never hit it.
Yours are not, which is why you did.

The fix is in `694f131`. `roadmap_epic` used to be an output stamp only, written
after the fact and never read back. It is now also an input: a workflow that
knows its epic number binds by number, and the tag stops being load-bearing.
Category-tagged headings are recognised, and no duplicate is appended.

**What this means for you.** If `roadmap-issues` derives epic identity the same
way — by parsing a heading tag and matching it to a slug — then the same fix
applies to it and the patch shape is small. If it derives identity some other
way, item 5 is not your root cause and we cannot tell you what is from here.
Either way we would want to see it, because a second tool making the same
assumption is worth knowing about.

Send us the correlation code from `roadmap-issues` and we will tell you which of
the two it is.

---

## Item 7: the reported symptom was not the real one

You reported that `harness_continuation` fired three times while the session was
blocked on a test suite. We checked the full 3,358-line hook log and found no
misfire in this repository. All three fires that day were legitimate: the loop
resuming after a human satisfied a consent gate, which is what it is for.

The claim also cannot hold mechanically. A synchronous shell call cannot end a
turn, so a session blocked on a test suite never reaches a Stop hook at all.

There is a real gap next door, and that is what we fixed. Work sent to the
background outlives the turn that started it, so the loop can wake and advance
into a phase whose predecessor is still running. The hook now recognises a fourth
state, `parked`, which a caller that owns the session declares on the way in and
clears on the way out. `/harness` rearms it.

We chose declaring over detecting deliberately. A detector needs a registry, the
registry needs a lifecycle, and a wave that crashes leaves a stale entry behind
that silences the hook forever. Declaring costs one value on a state machine that
already existed.

---

## Two things your report caused that were not in it

**A security hole we opened while fixing item 4.** Anchoring the patterns at a
command head is the right fix, but our first version anchored at position zero
only. Measured against the tree: `sh -c "shutdown -h now"`, `bash -c 'mkfs.ext4
/dev/sda1'`, `eval "poweroff"`, `(reboot)` and `echo $(halt)` were all blocked
before the change and all passed after it. The shipped version walks executor
wrappers, subshells and substitutions to a depth of six.

If you are carrying a local patch that anchors these patterns, check it against
those five commands before you trust it.

**A test that measured the machine rather than the code.** Our publish check ran
`npm pack --dry-run` under a 30-second cap. It takes two seconds alone and gets
killed under full-suite load, and a killed process reports as a null status,
which our verify gate read as a genuine failure. It failed, passed, then failed
again in one day. The cap is now 180 seconds.

---

## Your framing was right

You wrote that several of these are mechanisms that exist to catch a problem and
either misreport the cause or never run. That is the accurate description, and it
is what made the batch worth doing as one piece of work rather than nine.

Item 2 is the clearest case. A guard that blames the wrong thing is worse than an
absent guard, because its stated remedy sends the operator to edit something that
was already correct.
