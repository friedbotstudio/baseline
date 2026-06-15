# [0.18.0](https://github.com/friedbotstudio/baseline/compare/v0.17.0...v0.18.0) (2026-06-15)


### Features

* **chore-track:** gate verify on test.kind; fix stale vitest reporter ([179e638](https://github.com/friedbotstudio/baseline/commit/179e638dd286e5342b15fbac6cecb08616fc5b85))
* **gitignore:** add gitignore skill, commit-leak guard, and init .gitignore ([52a5f34](https://github.com/friedbotstudio/baseline/commit/52a5f34ea6fd1b349667a2aeb3f41984df6dfeea))
* **site:** generate sitemap.xml from the page collection ([6e53aec](https://github.com/friedbotstudio/baseline/commit/6e53aec949f67fbeabc2bb6679b1e1bb2d8f9a6f))

# [0.17.0](https://github.com/friedbotstudio/baseline/compare/v0.16.0...v0.17.0) (2026-06-10)


### Bug Fixes

* **ci:** peel annotated tags in action SHA verifier ([f6495b2](https://github.com/friedbotstudio/baseline/commit/f6495b25334f133870bfb1c3329c4218d3b0a4b5))


### Features

* **governance:** add epic / epic-child tracks for amortized discovery ([66fac2a](https://github.com/friedbotstudio/baseline/commit/66fac2ad0144eb04c908b356d6858aecb0dd6d88))
* **governance:** structurally gate the epic approved flip via epic_approval_guard (hooks 22→23) ([121078f](https://github.com/friedbotstudio/baseline/commit/121078f1df63ce287c17a6aaea6612c655a0b9f8))
* **site:** add /standup feature page and homepage teaser ([f9c04e3](https://github.com/friedbotstudio/baseline/commit/f9c04e3f83ab28363a91bb9536d8c0a6281290c1))
* **skills:** add standup release+backlog recap skill (40→41) ([3fffd06](https://github.com/friedbotstudio/baseline/commit/3fffd069d3953b1cd55d5cd5f925082019a239bc))

# [0.16.0](https://github.com/friedbotstudio/baseline/compare/v0.15.1...v0.16.0) (2026-06-08)


### Bug Fixes

* **deps:** bump @11ty/eleventy 3.1.5→3.1.6 to clear critical liquidjs RCE ([4e539ff](https://github.com/friedbotstudio/baseline/commit/4e539ff83994b7ccec6e79ce98330fca20dce95d))


### Features

* **governance:** add §II.A bounded maker/checker charter to Article II ([75257cb](https://github.com/friedbotstudio/baseline/commit/75257cb7c8842facf2b9f1f4fd58f3287d1831ec))
* **governance:** enforce atomic backlog-closure stamping at the commit hook ([9fe7109](https://github.com/friedbotstudio/baseline/commit/9fe7109e85d0c40170cbd5573ce950da95267571))
* **testing:** add dev-only mutation-testing oracle (Stryker, advisory) ([6c85282](https://github.com/friedbotstudio/baseline/commit/6c85282c4b3650f06fb60f461171313f260cde5e))

## [0.15.1](https://github.com/friedbotstudio/baseline/compare/v0.15.0...v0.15.1) (2026-06-05)


### Performance Improvements

* **build:** key the template-build mutex per target so isolated builds parallelize ([c32aaaa](https://github.com/friedbotstudio/baseline/commit/c32aaaa044a1e4e4ea6b2eb247e2e09f82540d0d))

# [0.15.0](https://github.com/friedbotstudio/baseline/compare/v0.14.0...v0.15.0) (2026-06-04)


### Bug Fixes

* **gates:** write consent/state via Write tool; drop guard-blocked Bash redirect ([0a70375](https://github.com/friedbotstudio/baseline/commit/0a703757ecdc8ed3da319f5943503d076cd332e9))
* **guard:** anchor consent write-detection to the resolved write target ([d70911f](https://github.com/friedbotstudio/baseline/commit/d70911f1faf1343027f53f7a5972d8e2dd4749bc))
* **guard:** exempt git-commit message payloads from consent-write scan ([6b310eb](https://github.com/friedbotstudio/baseline/commit/6b310ebc2fec6700a8a92c89b6b0311e8c695b4d))
* prefilter consent-path scan and exclude spec prose from drift-check ([e11e176](https://github.com/friedbotstudio/baseline/commit/e11e17696c04cb68795100ca98a3edbd559830b7))
* **tdd:** drift_check sources the working tree, not committed history ([12db8fc](https://github.com/friedbotstudio/baseline/commit/12db8fc6ad6cfceb0211d4729a268d03c3ad0b45))


### Features

* **git:** declare and guard-enforce a git workflow topology model ([0e2fc79](https://github.com/friedbotstudio/baseline/commit/0e2fc790d15ddfa0204a90d0cab186dbfda4bcbc))
* **memory:** filter boilerplate at capture, converge noise list into common.mjs ([8e6fecf](https://github.com/friedbotstudio/baseline/commit/8e6fecf361792e47eeafa82ca0f4ef3903090769))
* **memory:** sentence-level capture, route suggestions, durable working thread ([9036fc4](https://github.com/friedbotstudio/baseline/commit/9036fc470ab13ae4be72163b3f395450215d0eed)), closes [hi#precision](https://github.com/hi/issues/precision)
* **navigation:** make code-browser the primary navigation path in any language ([edd7b19](https://github.com/friedbotstudio/baseline/commit/edd7b1912c44a6d789bb161b496807998a79bb31))

# [0.14.0](https://github.com/friedbotstudio/baseline/compare/v0.13.0...v0.14.0) (2026-06-02)


### Features

* **whatsnew:** replace mandatory Phase 11.5 changelog with on-demand generator ([6e11f2f](https://github.com/friedbotstudio/baseline/commit/6e11f2fc998d25d099076cd3e646d5c2fe8f0f60))

# [0.13.0](https://github.com/friedbotstudio/baseline/compare/v0.12.0...v0.13.0) (2026-06-01)


### Bug Fixes

* **changelog:** source [Unreleased] entries from --entries-file, not git log ([ce7e11c](https://github.com/friedbotstudio/baseline/commit/ce7e11c8224b63f9e0a15b41f565525ccfc78c5e))
* **changelog:** stop the Phase 11.5 actuator from deleting released version blocks ([4585688](https://github.com/friedbotstudio/baseline/commit/4585688c9b25c781aca76878172bbc052ad7e153))
* **guards:** wrapper/quote-aware git classification + Bash consent-write block ([35e3926](https://github.com/friedbotstudio/baseline/commit/35e392664281f48676360d73b80abefe3ee9d413))
* **hooks,changelog:** changelog shrink guard + 7f2c consent-guard residuals ([08899d1](https://github.com/friedbotstudio/baseline/commit/08899d1f811f287465805d287d6f336ac7b99305))
* **hooks,cli:** atomic JSON state writes + slug validation + consent-TTL doc ([cb132d6](https://github.com/friedbotstudio/baseline/commit/cb132d659499cf0b6b3812203b367171e5f683b2))
* **memory:** bound the local thread trail with a roll-off cap ([464da06](https://github.com/friedbotstudio/baseline/commit/464da063cd21a8258742664b002e3b9462ce0a32))
* **test:** align python3 allow-list with seed.md _thread.md amendment; stamp b7e2 closure ([08718b7](https://github.com/friedbotstudio/baseline/commit/08718b71af6a97cb79d821b6ad2600baa0861b53))


### Features

* **audit:** single source of truth for governance counts + drift cross-check ([13fd15f](https://github.com/friedbotstudio/baseline/commit/13fd15f2c9bf5cbe0126ab455012b24bd43876db))
* brainstorm helper (PM mode) and /spec codesign mode (Engineer mode) ([4cd839d](https://github.com/friedbotstudio/baseline/commit/4cd839dbd2650c13df47fc79b7c56df0b6d3a17b)), closes [#4](https://github.com/friedbotstudio/baseline/issues/4)
* **document:** reflective public-site trigger + feature-value register ([ad558d7](https://github.com/friedbotstudio/baseline/commit/ad558d7ff91a1f815e5ee427cc593aa25f642e58))
* durable local conversation-thread trail with context-switch shelving ([f7a8f85](https://github.com/friedbotstudio/baseline/commit/f7a8f856d848d197de08e0aa65d9d9ed57b4bc01))
* **harness:** consolidate open questions at the /approve-spec gate ([5ae9178](https://github.com/friedbotstudio/baseline/commit/5ae91782b8ec953935981c88ddf082612bfabc85))
* **hooks:** make plantuml_syntax_guard advisory by default (no JVM) ([ce4d2c7](https://github.com/friedbotstudio/baseline/commit/ce4d2c7cdc4dcda2e7f3db674b50a1c9fa81a8d1))
* **memory:** capture unanchored backlog-routing intent markers + ReDoS cap ([28f2d6f](https://github.com/friedbotstudio/baseline/commit/28f2d6f2a3a9e01fe4ac796359bf6cd0ac4cb23d)), closes [hi#precision](https://github.com/hi/issues/precision)

# [0.12.0](https://github.com/friedbotstudio/baseline/compare/v0.11.0...v0.12.0) (2026-05-29)

### Bug Fixes

* **memory:** hardening batch closes 14 review findings ([33560f2](https://github.com/friedbotstudio/baseline/commit/33560f272eafd66eabd8d8c92dd5fc3180b0b812))

### Features

* add freeform workflow track for ad-hoc edit batches ([751e892](https://github.com/friedbotstudio/baseline/commit/751e892bf5b4ec84b328ace0f4802dc40977bde0))

# [0.11.0](https://github.com/friedbotstudio/baseline/compare/v0.10.0...v0.11.0) (2026-05-27)

### Features

* remove python3 runtime dependency; port skill helpers to Node ESM ([756dd42](https://github.com/friedbotstudio/baseline/commit/756dd420f239a9480e50c2d5446ea597985524d5))

# [0.10.0](https://github.com/friedbotstudio/baseline/compare/v0.9.0...v0.10.0) (2026-05-27)

### Bug Fixes

* **plantuml:** always-download jar + java -jar runtime; pin now enforced ([d058472](https://github.com/friedbotstudio/baseline/commit/d058472749f62c73cba14ea0c2f078bb5e48d11e))
* **shippability:** vendor src/cli modules into shipped tree + harden scanner ([3e1bf19](https://github.com/friedbotstudio/baseline/commit/3e1bf194374f489e72f8e28c760c9a76d549aba5))

### Features

* add code-browser skill as default code-navigation mechanism ([7901e65](https://github.com/friedbotstudio/baseline/commit/7901e650f9bec72d4feefa73a099a408f0d3cce1))
* **upgrade:** version-aware no-op fast-path + baseline_version stamping ([64b79c8](https://github.com/friedbotstudio/baseline/commit/64b79c85791b868d0f3bc957d45a93ce89155b29))

### Performance Improvements

* **hooks:** port 22 hooks to Node ESM + audit fast-path + tier hardening ([9b54561](https://github.com/friedbotstudio/baseline/commit/9b5456168cd60ea38418a62655773cea4402c2ce))

# [0.9.0](https://github.com/friedbotstudio/baseline/compare/v0.8.2...v0.9.0) (2026-05-26)

### Features

* ship /upgrade-project marker helper + build-time SKILL.md scan gate ([b5d40eb](https://github.com/friedbotstudio/baseline/commit/b5d40eb4a0eda25f088f9f9aa848c1dc3ed32e1d))
* **spec-shippability:** catch dev-tree refs in shipped SKILL.md prose ([67da6dc](https://github.com/friedbotstudio/baseline/commit/67da6dce8259bfb6f43da544bffd1dfb83753068))

## [0.8.2](https://github.com/friedbotstudio/baseline/compare/v0.8.1...v0.8.2) (2026-05-22)

### Bug Fixes

* **audit:** silently skip README.md count claims when file absent ([4e5395d](https://github.com/friedbotstudio/baseline/commit/4e5395df4e2abd1b07213a0808cfac995c3c86a4))
* **tui:** render BASELINE wordmark on install / upgrade / doctor ([7b630ce](https://github.com/friedbotstudio/baseline/commit/7b630ce00e13ba030ab04ec1ebd6f76c22cc8e33))
* **upgrade:** stop replay prompts on runtime-state files + post-reconciliation files ([558fab5](https://github.com/friedbotstudio/baseline/commit/558fab50726e5734b7ef58794cc49e9f61c14938))

## [0.8.1](https://github.com/friedbotstudio/baseline/compare/v0.8.0...v0.8.1) (2026-05-22)

### Bug Fixes

* **audit:** stop false-FAILing on consumer installs + bump commit_consent TTL to 900s ([ea66e1d](https://github.com/friedbotstudio/baseline/commit/ea66e1d21b973206fecc850e03f3b6d7d59f5a59)), closes [#5](https://github.com/friedbotstudio/baseline/issues/5)

# [0.8.0](https://github.com/friedbotstudio/baseline/compare/v0.7.0...v0.8.0) (2026-05-22)

### Features

* **cli:** tier-1 Merge option + BASE-less stage + /upgrade-project two-way reconciliation ([f1f4fc2](https://github.com/friedbotstudio/baseline/commit/f1f4fc2f592bf6ab47f6495fea99cd230389b405))

# [0.7.0](https://github.com/friedbotstudio/baseline/compare/v0.6.0...v0.7.0) (2026-05-21)

### Bug Fixes

* **cli:** surface tier-2/3 unrecoverable-BASE files in upgrade dry-run ([92e0d10](https://github.com/friedbotstudio/baseline/commit/92e0d10921224bd2059d06fbc5b0383d11386ddf))

### Features

* **workflows:** declarative track DAGs via workflows.jsonl (§18 + Article IV) ([cb1d511](https://github.com/friedbotstudio/baseline/commit/cb1d51116fe3ba6ec660fb6315335a12d60a589b))

# [0.6.0](https://github.com/friedbotstudio/baseline/compare/v0.5.0...v0.6.0) (2026-05-20)

### Bug Fixes

* **scripts:** smoke-tarball handles v3 shipped manifest {sha256, tier} entries ([6837992](https://github.com/friedbotstudio/baseline/commit/68379924902be1b3234217dad17b26f772e8507d))

### Features

* **cli:** three-tier upgrade flow + /upgrade-project skill ([3a82801](https://github.com/friedbotstudio/baseline/commit/3a828018a56e42e96f27d04d9adb63cf12289f21))

# [0.5.0](https://github.com/friedbotstudio/baseline/compare/v0.4.0...v0.5.0) (2026-05-20)

### Features

* **cli:** BASELINE wordmark splash + manifest relocation + branded error paths ([e2927c7](https://github.com/friedbotstudio/baseline/commit/e2927c7160dd3737ee164fa9d50c0d50eb0c196d)), closes [#080b12](https://github.com/friedbotstudio/baseline/issues/080b12)

# [0.4.0](https://github.com/friedbotstudio/baseline/compare/v0.3.0...v0.4.0) (2026-05-18)

### Features

* **cli:** branded TUI for install / upgrade / doctor + retire --merge ([71d5577](https://github.com/friedbotstudio/baseline/commit/71d5577a5baeb5863ac0bd274d1534185284e505))
* **site:** add brand byline + install-pill component + redesign hero ([490a4a6](https://github.com/friedbotstudio/baseline/commit/490a4a67c1158b8b2e7a2629b6aeee9225eb8f92))
* **workflow:** add Phase 11.5 changelog skill + responsive bento SVG ([db291ed](https://github.com/friedbotstudio/baseline/commit/db291ed0d3971bbde26bc7385d063225c0a7fd14))

# [0.3.0](https://github.com/friedbotstudio/baseline/compare/v0.2.1...v0.3.0) (2026-05-17)

### Bug Fixes

* **audit:** allow preamble-only canonical memory files ([db0221b](https://github.com/friedbotstudio/baseline/commit/db0221b53f1a6575fbb9e86cf6d203fa6039c9ed))
* **audit:** require closing separator in canonical memory preambles ([e6ca9b6](https://github.com/friedbotstudio/baseline/commit/e6ca9b63bbee46bcfa24a720b101f4d13a924a59))

### Features

* **design-ui:** add mixed_brief Stage 0 terminal for multi-lane briefs ([be2d941](https://github.com/friedbotstudio/baseline/commit/be2d94122fe58475c12c642126345978c713f223))
* drift-check tick, backlog auto-flip, ac008 fixture regen ([bfad579](https://github.com/friedbotstudio/baseline/commit/bfad579c8477f813c8aa7b8a30778d3ebd2050cf))
* **harness:** auto-resume across consent gates via Stop-hook rung 4 ([1333cb7](https://github.com/friedbotstudio/baseline/commit/1333cb7bdf3d451ddfac70cdc3bfb8e56db33819))
* **hooks:** branch-aware git consent policy with /grant-push gate ([3a3314e](https://github.com/friedbotstudio/baseline/commit/3a3314ebe18c342e77d1b39c932e202985461a2e))
* **init-project:** explicit gate at Step 5 review surface ([5a79b1c](https://github.com/friedbotstudio/baseline/commit/5a79b1cb95204e7ab8d815e97425bf1709ab91ba))
* **memory:** add backlog bucket for future-work intent extraction ([54a9235](https://github.com/friedbotstudio/baseline/commit/54a923512cd620e35d5450441ad85fa829bd796a))
* **workflow:** add /memory-flush as workflow Phase 10.6 (end-of-workflow memory curation) ([a3c55f8](https://github.com/friedbotstudio/baseline/commit/a3c55f89d9d97a6debc8e722df918280826d0892))

# [0.2.1](https://github.com/friedbotstudio/baseline/compare/v0.2.0...v0.2.1) (2026-05-14)

### Bug Fixes

* **release:** release refactors and constitution scope changes ([149e415](https://github.com/friedbotstudio/baseline/commit/149e4157c4da749c9cfba5b96374a81ab24343a0))

### Features

* **site:** wire Google Analytics 4 into the Friedbot Studio site ([14f06f6](https://github.com/friedbotstudio/baseline/commit/14f06f6ad7acc38ccc3674899e13d9519e9b12f0))

# [0.2.0](https://github.com/friedbotstudio/baseline/compare/v0.1.0...v0.2.0) (2026-05-14)

### Bug Fixes

* **cli:** exclude manifest.json from install copy + make .npmrc opt-in ([ae351e2](https://github.com/friedbotstudio/baseline/commit/ae351e2d56702218588b294eb028f0abbef02970))
* **release:** revert branches range modifier (semantic-release ERELEASEBRANCHES) ([06f79a4](https://github.com/friedbotstudio/baseline/commit/06f79a4ba523c787250364055e4a44572a5f4b2d))

### chore

* **release:** cap main at 0.x + breaking → minor (alpha safety belt) ([0682a28](https://github.com/friedbotstudio/baseline/commit/0682a2838df68e7690f776bf8d1a03b0ba2aaec4))

### BREAKING CHANGES

* **release:** / feat! commits from default major to minor so they
actually cut a release within 0.x (0.N → 0.N+1) instead of being silently
skipped by the cap.

Net effect during alpha: feat → minor; fix → patch; feat! / BREAKING
CHANGE → minor (the 0.x semver convention); chore(release / site / ci /
actions) and build → no release (existing rules). When ready for 1.0,
remove both modifications in one chore.

The corresponding release-workflow test (test_when_releaserc_parsed_then_branches_is_main_capped_at_0x_and_next_prerelease,
renamed from the plain-main predecessor) was updated to assert the new
branches shape.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
