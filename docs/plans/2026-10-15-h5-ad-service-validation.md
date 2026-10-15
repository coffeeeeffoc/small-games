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

Cloud rollout follows local interface acceptance and exact candidate checks. The
existing server has an internal nginx listener at 127.0.0.1:8080 and a separate
company site on 80/443. Its current database lacks migration 012, which the new
Runtime health check requires. The prepared rollout performs whole-database
backup, isolated restore/content/schema validation and an additive migration,
then changes only Runtime's image and recreates Kart with its previous immutable
image in the new network namespace. No production data restore, volume replacement,
new credentials, public route or firewall change is authorized by this procedure.
Cloud execution and final candidate/CI evidence are recorded after they complete.

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
classifier and its exact-byte rules are unchanged. Replacement candidate CI and
the cloud rollout result are recorded after they complete.

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
