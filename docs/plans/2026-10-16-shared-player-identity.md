# Shared competition identity and player profile — 2026-10-16

## Product and compatibility contract

The three requested H5 games share one competition identity authority and one
profile model. The existing server UUID remains userId (playerId/id aliases stay
compatible), so names, matches, scores and foreign keys retain their owner.
Catalog/cloud saves use a separate credential system and are not automatically
merged in this change.

Platform identity is scoped by platform + AppID + server-verified subject. A
client-provided platform ID, nickname, installation UUID or public userId is never
an authentication credential. Missing platform configuration remains explicitly
unavailable; H5 continues with a server-issued anonymous account. The current
production Runtime has no COMPETITION_PLATFORM_CONFIG; no platform credentials
are created by this work.

Anonymous browsers generate a random installation UUID when secure randomness
is available; only a server-issued secret can restore the UUID. Access credentials
and refresh secrets are hashed at rest. Refresh and explicit anonymous upgrade
serialize on the player row. Upgrade to an unbound verified platform preserves
the UUID and scores and revokes every old anonymous credential. A platform tuple
owned by another user returns a conflict, with no merge or score overwrite.
A platform user cannot silently bind a second account/provider.

Guest clients explicitly send `identityVersion: 2` to request one-day access and
180-day refresh. Old clients that do not declare refresh support retain their
original 180-day access lifetime. Existing token rows are never shortened.

Credentials are shared by the competition client and game-services, scoped to
the exact API authority and platform application, and observe storage changes.
In-flight runs/rooms retain their original user. A refreshed/upgraded credential
can replace an owner token only when its confirmed userId matches. Delayed
anonymous responses cannot overwrite an upgraded platform session. Ambiguous old
unscoped credentials remain stored and are not sent to a new foreign API.

## Profile and interface

The reusable profile contains nickname/name, avatarUrl, optional country/province,
source and update time. Empty avatar uses a neutral initial; unavailable/failed
images use the same fallback. Missing public region is hidden. Own profile
explains an unknown region and the source. No precise location or third-party IP
lookup is requested. Public lists never contain platform subject/AppID, secrets,
installation IDs, raw IP or precise location.

Nickname rendering uses text nodes. Avatar URLs require bounded HTTPS URLs with
no credentials, custom port, fragment or secret-bearing query, and an exact reviewed
platform-CDN origin. The client omits credentials/referrers, refuses redirects,
checks raster content types and limits downloads to 1 MiB; failed or unsupported
CORS loads retain the default avatar. The service does not fetch images. Platform-client profile data is user-
authorized display input, not platform-verified identity.

TapTap official UserInfo currently says country/province/city are no longer
returned; do not invent a region. Sources checked 2026-10-16:

- https://developer.taptap.cn/minigameapidoc/dev/server/login/code2Session/
- https://developer.taptap.cn/minigameapidoc/dev/api/open-api/user-info/tap.getUserInfo/
- https://developer.taptap.cn/minigameapidoc/dev/api/open-api/user-info/UserInfo/

Keep the three games' existing portrait page adaptation and themes. Update only
the existing profile, room-player and ranking rows; keep gameplay HUDs sparse.
Profile editing remains a simple page/card with a 44px or larger save button.
Platform synchronization appears only when its actual capability is available.
No unfinished platform-login menu is added. Root-owned Xiangqi integration uses
platforms/competition/xiangqi-five/docs/design; no child-repository fork is needed.

## Designs before interface implementation

The following shared-identity-2026-10-16 directories hold 390x844 concept HTML and
three phone screenshots (profile, room and leaderboard) in each established
game design area:

- games/local/cops-robbers/docs/design/
- games/local/cops-robbers-realtime/docs/design/
- platforms/competition/xiangqi-five/docs/design/

Concept data is illustrative. Runtime screenshots and evidence will be saved
separately and compared after implementation. Desktop touch emulation is not
physical-device verification.

## Acceptance and approved deployment boundary

Use the existing task-owned local PostgreSQL/Runtime to verify migration twice,
preserved old rows/ACL, stable identity across reload and games, independent
players, real touch matches and natural settlement, board persistence and
identical-action retries. Exercise spoofed userId/platformId, malformed profiles,
refresh/upgrade races, conflicting platform ownership and revoked credentials.
Platform exchange fixtures are labeled fixtures and never count as real platform
login or advertisement playback.

The user explicitly approved the API hostname, automatic HTTPS, a dedicated
Caddy/nginx network and a restricted trusted-proxy chain on existing 80/443,
without CORS/firewall changes or database exposure. Implement it only after local
identity acceptance, with exact-candidate checks and protected backup/restore
verification. Production identity migration is additive; never merge accounts
or restore over the existing database. Reuse localhost:8080 for browser-to-public-
API acceptance under the existing Origin whitelist.

After local acceptance, normally push dev and verify CI/Pages for the exact
candidate SHA before the protected cloud rollout. Then build six H5 ZIPs with the
actual HTTPS API and no --local and run their actual browser flows.
Group the two modes per game below 16.5MB and save the new artifacts to Library.
Real platform AppID/key/SDK, advertisement placement/playback and devices remain
explicitly unverified where unavailable.

## Current safe checkpoint

Implementation was recorded locally in `151e6e49d1d35a14ca73cccca285e5e62da85461`; it has not been pushed or deployed. The [compatibility record](2026-10-16-shared-player-identity/compatibility.md)
distinguishes fixed-source HTTP contract fixtures from PostgreSQL and unknown
APK acceptance. The initial no-database checkpoint had 162 passes and 18 skips;
the real PostgreSQL results below supersede those skips. Runtime type/lint and
the client/identity/gateway suites passed (54 client tests). Shared UI
fixtures passed five desktop/mobile flows and the letters mobile flow at
320x568, 390x844 and 844x390; these are desktop touch emulation with fixture
identity/network, not real multiplayer or device acceptance.

Automatic approval initially rejected starting the existing isolated PostgreSQL
container twice. The parent then supplied the original user's exact local/API
test instructions; one review of the same guarded action was approved and the
existing container started. The async permission call had returned accepted,
but its current panel state could not be queried; it is not evidence of approval.
The real PG suite now has 180 unique passing tests across the original run and
two targeted reruns, including all 18 database cases. See
[test receipts](2026-10-16-shared-player-identity/local-postgres-tests.json) and
[migration preservation](2026-10-16-shared-player-identity/local-postgres-migration.json).
No cloud rollout or formal package upload has been performed.
Migration 013 grants only SELECT/INSERT/DELETE on its new refresh table; it does
not change original table privileges or owners.

## Latest local checkpoint

The complete current Runtime suite passed 183 tests in 27 files, with zero
skips, against the existing real PostgreSQL. New ingress/packaging contracts
passed 21 tests, including six Python transaction mock cases. Existing company
contracts passed all nine checks using Linux/WSL, including private backup
restore and both prior rollback fixtures. These do not yet prove actual cached
proxy-image syntax or production activation. The two Runtime proxy-default
producers now start safely with forwarding trust disabled; the approved
production override must specify its precise trusted Nginx address.

## Deferred admin handoff

Complete this identity/API task before integrating the independent admin work.
The parent supplied repository
`C:/Users/15211/Documents/Codex/2026-10-16/task/small-games-admin`, branch
`feat/admin-console-20261016`, commit
`1c63a1af8bfc0fec650f3ae2996ca822d3145ff4` supersedes the old handoff.
Integrate its complete implementation lineage, not only the final correction.
Its declared scope is
`apps/admin-web`, `services/admin-api`, `infra/admin-console` and
`docs/admin-console`. The new `docs/admin-console/handoff.md` was read and the
independent repository's exact HEAD and clean state were verified read-only.
Preserve both workspaces, then integrate dependencies/lockfile and the appropriate
incremental gates before pushing dev. Parent-reported checks do not replace
integration acceptance; admin PostgreSQL validation is still pending.

The intended admin domain is `admin.nenggongzhiren.cn`, with exact permitted
email `1521152077@qq.com` (corrected by the user). Reuse the existing database
with a dedicated `admin_console` schema, independent tables and migration ledger; do not
create a separate database, database container or volume. Production roles,
credentials, networking and Caddy changes
remain separately pending authorization. This task keeps sole ownership of the
main workspace and shared server writes; no admin integration or server action
has been performed at this checkpoint.
