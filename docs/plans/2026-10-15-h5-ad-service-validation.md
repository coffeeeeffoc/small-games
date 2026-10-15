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
