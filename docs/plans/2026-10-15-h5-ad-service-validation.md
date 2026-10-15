# H5 advertising and optional service acceptance

The twelve-package matrix passed on 2026-10-15 UTC. It covers Cops and Robbers,
Street Pursuit and Xiangqi Five, each with advertising on/off and service on/off.
The implementation source is `ff699e184b2c`; Xiangqi is pinned to
`2238989bb5fa9beeaab591b6fa5717cf08fab6c7`. The art handoff was preserved in
`01458f37`, then normally merged with remote dev `5fbc6feadf2663e1905538ab6b6feae0ed26156b`.

Evidence is in [the validation directory](2026-10-15-h5-ad-service-validation/):

- `matrix.json`: all twelve H5 ZIP hashes, file inventories, configuration and source identities.
- `browser-report.json`: 12/12 passed in Chrome 155.0.8059.40, 390x844 mobile touch
  emulation. Six online variants used two independent authenticated contexts each,
  actual touch actions, real local Runtime/PostgreSQL, natural settlement, both
  result screens and leaderboard navigation. Retrying each player's identical
  real action preserved the settlement. Expected terminal input rejection is
  accepted only after rereading that same room and confirming it finished.
- `http-integration.json`: real HTTP identity and membership isolation, invalid
  input, consistent/idempotent settlement, restart, names, Top100/rank101/ties and
  version isolation. Its realtime timeout uses an explicit isolated clock fixture;
  the browser matches above use real elapsed time.
- `restart.json`: a separate probe retained a guest credential only in memory
  while the owned Runtime and PostgreSQL container restarted. The old session
  authenticated, every runtime table content digest matched, and twelve actual
  matrix players remained on the three leaderboards. The browser report's
  `notRun` field describes that browser process alone; this supplemental report
  supplies its restart verification.
- Representative actual home and settlement screenshots for all three games.
- `candidate-ci.json`: exact final implementation candidate, complete local
  comparison from the last green baseline, normal push and successful CI/Pages.
- `cloud-rollout.json` and `cloud-postcheck.txt`: sanitized deployment receipt,
  protected data/volume/port checks, exact running image and company HTTPS health.
- `local-cleanup.json`: task-owned test database stopped; its volume and artifacts
  remain. The local Runtime port was already closed; no stale PID was stopped.

The isolated database was `competition_test` in task-owned container
`small-games-h5-matrix-20261015`, bound only to `127.0.0.1:15439`; Runtime used
`127.0.0.1:43802`, static packages `127.0.0.1:43810`. Node 24.21.0 and pnpm 12.6.0
were used. Other local services and worktrees were left untouched.

Advertising-off variants directly performed hints/support without an ad provider.
Existing support quotas, assisted-score separation and the chess hint's one-star
cap remained. Advertising-on variants selected the host and refused rewards when
the real SDK was unavailable. No browser test invented a completed advertisement.
Contract unit fixtures separately check strict completion, cancellation, failure,
timeout and late callbacks; they do not verify actual ad playback. Xiangqi's
background-cancel/foreground retry path was checked without completing an ad.

Xiangqi's independent rule suite passed 31 tests. Its standalone pavilion suite
passed 18 cases and 107 screenshots, including the unchanged 375x650 and 390x844
`.home-note` visibility assertions with simulated host safe-area insets. Independent
CI and Pages passed for `2238989`. These are desktop mobile emulation results,
not physical-device results.

The ZIPs remain in `outputs/h5-taptap/ff699e184b2c-1792098171014/`; they are explicitly
local validation artifacts containing loopback HTTP service URLs. Formal packages
require a confirmed HTTPS API and actual TapTap host/advertisement acceptance.
H5 ZIPs are separate from Cocos native platform packages.

Cloud rollout followed local interface acceptance and exact candidate checks. The
existing server has an internal nginx listener at 127.0.0.1:8080 and a separate
company site on 80/443. Its database initially lacked migration 012, which the new
Runtime health check requires. The completed rollout performed whole-database
backup, isolated restore/content/schema validation and the additive migration,
then changed only Runtime's image and recreated Kart with its previous immutable
image in the new network namespace. No production data restore, volume replacement,
new credentials, public route or firewall change was performed.

The implementation candidate is `490b17bfb45daecdbdaf3f7c1092910ee600d716`, normally
pushed to `dev` after the complete incremental pre-push gate passed against
`5fbc6feadf2663e1905538ab6b6feae0ed26156b`. Game/runtime sources and the H5 matrix,
advertising and service build tools are byte-identical to the accepted matrix
source `ff699e184b2c`; subsequent changes concern documentation and validation.
The Shell smoke contract now checks the default free hint directly instead of
requiring a simulated advertisement. CI runs for this exact candidate are
[CI](https://github.com/coffeeeeffoc/small-games/actions/runs/38816118745),
[Pages](https://github.com/coffeeeeffoc/small-games/actions/runs/38816118540), and
[Cocos](https://github.com/coffeeeeffoc/small-games/actions/runs/38816118411).
Cocos completed successfully. The initial CI quality run exposed a test-fixture
error: its unchanged producer files were expected to reject a historical proof,
which happened only with Windows working-tree line endings. The negative cases
now explicitly change each of the six reviewed producer files; the production
classifier and its exact-byte rules are unchanged. Replacement results follow.

Replacement candidate `5cd8d72f42ff70268710049b8b20074df53bf7a3` passed both
[CI](https://github.com/coffeeeeffoc/small-games/actions/runs/38818332328) and
[Pages](https://github.com/coffeeeeffoc/small-games/actions/runs/38818332446).
Its first cloud attempt stopped during Docker build because pnpm 12.6.0 rejects
`--fetch-retries=2`. No service was stopped and no database operation ran; the
existing Runtime, Kart, PostgreSQL, nginx and company site remained healthy.
Both Dockerfile producers now remove that option only from pnpm installation,
retaining npm's supported retry option and all existing lockfile, registry and
script-isolation settings. The exact installer-only change selects its actual
backend consumers; all other deployment and H5 changes retain their gates.
The successful retry used a fresh exact candidate, archive and release directory.

Candidate `724d83c422d5b9b41e5326bb08018b080a23fd21` passed its normal local push
gate, but [CI quality](https://github.com/coffeeeeffoc/small-games/actions/runs/38821852321)
exposed a mismatch between the explicit build plan and Turbo's implicit `^build`
expansion: the backend-only change attempted an unchanged Carding Web build
without its Creator artifact. Cloud execution remained blocked. Incremental
builds now execute the explicit targets with pnpm's workspace topology; full
validation retains its existing Turbo command. An actual isolated workspace
test verifies emitted dependency order across an unselected source-only game,
the exclusion of its Web build, actual backend type/test execution and rejection
when a required emitted build fails. Creator preflight and candidate gates remain.

The deployed implementation is `bef154e3c1a01ba46f7c8a5d50ce87a8f55b5c19`.
The complete local comparison `5cd8d72f..bef154e3` passed, including all four
backend builds and emitted inputs, deployment contracts, Runtime/Management tests,
and two actual Shell mobile-touch/navigation samples. The normal push also passed
against remote `724d83c4`. Both exact-candidate workflows completed successfully:
[CI](https://github.com/coffeeeeffoc/small-games/actions/runs/38824635640) and
[Pages](https://github.com/coffeeeeffoc/small-games/actions/runs/38824635656).

Cloud deployment completed at 2026-10-15 23:54:50 UTC. The active backend pointer
is `/opt/small-games/backend-current`, referring to
`/opt/small-games/backend-releases/runtime-20261015t233713074z-bef154e3`.
Runtime image digest is
`sha256:9519236be6deecb0ab88ad218dee8a8582ecd1b151b9c120ea47ba41c8d2534a`.
Its revision label was separately confirmed. The source archive SHA-256 is
`5eef67e29f93b1755f781edc8fbeda3670ca4389c6edd86ac6fcf1cc87d20edd`.

The whole-database backup remains only on the server at
`/opt/small-games/backups/runtime-20261015t233713074z-bef154e3.dump`, SHA-256
`ac776bb74dbafc08a704d123422bee798c86f2a36c105587b1c647ae2ee1c6c7`.
Its isolated restore matched every original user-table row digest, column,
constraint and index. Migration 012 was first exercised there, then applied
additively to the existing production database. Existing data and role/table
permissions were retained; volume `small-games_postgres-data` was preserved.

Runtime/database/competition health, Kart protocol 2, all three game definitions
and versus leaderboards passed through the existing internal nginx listener.
Cloud checks were read-only and created no test identities, matches or scores.
The nginx, PostgreSQL and company container identities/ports remained unchanged;
the company site's HTTPS returned 200. The static site's original `current`
pointer remains unchanged. The release directory retains immutable previous-image
rollback overrides; rollback does not restore or replace production data.

Public API readiness remains false: the formal HTTPS route and permitted Origin
must be confirmed before public service-enabled H5 packages are produced. Actual
TapTap advertisement playback and physical-device acceptance also remain pending.
Desktop emulation, native build conversion and SDK fixtures do not supply those
acceptances. Local test services are stopped; their data volume and artifacts remain.

Build controls are `H5_ADS_ENABLED=0|1` and `COMPETITION_SERVICE_ENABLED=0|1`.
Both default to off in the H5 matrix tool. Explicit `--with-ads` / `--without-ads`
and `--with-service` / `--without-service` flags select a single package;
`--matrix` builds all four combinations. Service-on builds also require
`COMPETITION_PUBLIC_API_URL`; public packages require HTTPS, while `--local`
permits loopback HTTP for acceptance. The entry point is
`node scripts/h5-taptap.mjs --game all --matrix --local`.
Actual advertising uses the corresponding public placement variable:
`TAPTAP_COPS_ROBBERS_AD_UNIT_ID`, `TAPTAP_COPS_ROBBERS_REALTIME_AD_UNIT_ID`, or
`TAPTAP_XIANGQI_FIVE_AD_UNIT_ID`. A missing SDK or placement does not grant a reward.
The older Cops `--taptap` build retains its advertising-on default when no explicit
advertising environment/flag is supplied; use `H5_ADS_ENABLED=0` or `--without-ads`
to select its free variant.

All twelve ZIPs below exist in
`outputs/h5-taptap/ff699e184b2c-1792098171014/`; their complete SHA-256 values and
file inventories are in `matrix.json`. All ZIP hashes were rechecked after the
successful push. These remain local acceptance packages, not public releases.

| ZIP filename                                  | Ads | Service |   Bytes | SHA-256 prefix |
| --------------------------------------------- | --- | ------- | ------: | -------------- |
| cops-robbers-ads-off-service-off.zip          | off | off     |  935515 | 2526c5ef15ae   |
| cops-robbers-ads-on-service-off.zip           | on  | off     |  935555 | c333607452ac   |
| cops-robbers-ads-off-service-on.zip           | off | on      |  989313 | 1775af0adea9   |
| cops-robbers-ads-on-service-on.zip            | on  | on      |  989351 | f17640c32c4b   |
| cops-robbers-realtime-ads-off-service-off.zip | off | off     | 4090554 | 803f64b07443   |
| cops-robbers-realtime-ads-on-service-off.zip  | on  | off     | 4090594 | 7bc5b351ed3c   |
| cops-robbers-realtime-ads-off-service-on.zip  | off | on      | 4134520 | 1c1c248642fa   |
| cops-robbers-realtime-ads-on-service-on.zip   | on  | on      | 4134559 | 4b70720f50cd   |
| xiangqi-five-ads-off-service-off.zip          | off | off     | 2128886 | 8d401bbf5081   |
| xiangqi-five-ads-on-service-off.zip           | on  | off     | 2128926 | 004e1e060327   |
| xiangqi-five-ads-off-service-on.zip           | off | on      | 2170004 | abb95a2cc656   |
| xiangqi-five-ads-on-service-on.zip            | on  | on      | 2170045 | 7ae586ea3eb4   |
