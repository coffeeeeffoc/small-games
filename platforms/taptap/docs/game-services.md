# Three-game TapTap services

The three games expose **TapTap 小站** from their actual H5 home pages. The page connects to the host account, uploads/list/previews/restores a cloud save, and opens the platform leaderboard. Submitting local progress requires a separate confirmation; login never automatically transfers local or guest scores. These features are independent of the repository competition backend switch.

`game-build.local.mjs` contains the three H5 public application mappings, each with its own `appConsoleId`, MiniApp `appId`, and `leaderboardId`. The applications have separate TapTap cloud data and rankings. `targets[].tapServices[game]` is explicitly enabled per target. Disabled or missing configuration does not expose an entry. Templates contain placeholders rather than account credentials.

| Game                  | H5 console | Ranking rule                                                                                                                      |
| --------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| cops-robbers          | 982507     | Normal completed campaign/relay/quick levels, including use of the game's hints                                                   |
| cops-robbers-realtime | 980554     | New verified, unassisted standard cop challenge completions; assisted, developer and ambiguous old native best times do not count |
| xiangqi-five          | 982449     | Tactical exercises completed with two stars, excluding hinted one-star completions                                                |

All three H5 boards use descending numeric **best**, not sum. Developer-mode uploads and submissions are rejected. Normal local gameplay and old records remain available. Existing ambiguous realtime records remain visible locally; a new `verifiedBest` field records future unassisted wins.

## Identity and backend coexistence

The host injects `tap`; no client npm SDK or embedded secret is needed. With the backend disabled, `tap.login` confirms access and its temporary code is discarded. The code is never an account ID or a saved credential. Cloud and leaderboard managers operate under the current Tap host account.

With the backend enabled, the optional three-game factory adapter sends the code to the existing `/sessions/platform` endpoint with the actual target MiniApp ID. The cache authority has a distinct `tap-platform-v1:` namespace, which is never used as the actual AppID. A new runtime clears a cached backend session and exchanges a fresh host code before exposing an account, avoiding reuse of account A's backend session under account B's Tap host. Within the runtime, canonical refresh, concurrent requests, owner checks, cross-tab storage handling and logout are reused. Guest responses and SDK absence fail explicitly, with no guest fallback. Old guest caches are not migrated. Reopening under a changed host account should relaunch the application.

The managed H5 builder installs the optional identity adapter before mounting competition. Backend deployment needs the corresponding server-side Tap credentials for all enabled application IDs; client packages do not embed them.

## Cloud save contract

Game-owned adapters export only validated progression. Cops and realtime transfer completion records; their current local unfinished game and preferences are retained. Chess additionally transfers a local game reconstructed by replaying real rules, preserving committed draw/history and first-free-undo use. Room credentials, backend tokens and live multiplayer games never enter an archive. Completion records merge monotonically. Cloud restore requires the safe home/service entry; pending AI/hints and the parent Canvas input/draw lifecycle are stopped first. Chess late worker messages must still match the current state and inactive portal before acting.

Uploads are manual. Each installation has its own slot to avoid replacing another device's archive without an API compare-and-swap. The application lists the current server archives before update/download, validates UUID plus current fileId, checks game/application/schema, previews the summary and requires confirmation. A local `tap-backup:<game>:<consoleId>` snapshot is written before restoring; backup failure prevents restore. Chess rolls back a partial two-key write where storage permits. Restore does not delete cloud archives.

The cloud manager is serialized. Create/update share a 60-second budget retained in local storage, with an additional 2 MB application payload limit under TapTap's documented 10 MB maximum. Names are ASCII, without spaces and under 60 bytes. SDK errors retain documented numeric codes but show fixed local messages. Leaving the page is possible during network requests; callbacks cannot update the stopped page or local save afterward.

Official references checked against the live JavaScript API documentation:

- [Cloud manager / list](https://developer.taptap.cn/minigameapidoc/dev/api/open-api/cloudsave/CloudSaveManager.getArchiveList/): `res.saves`, item `uuid`, `fileId`, `extra`, and `modifiedTime` in seconds.
- [Download](https://developer.taptap.cn/minigameapidoc/dev/api/open-api/cloudsave/CloudSaveManager.getArchiveData/): `archiveUUID`, `archiveFileId` → `filePath`, then filesystem `readFile`.
- [Create](https://developer.taptap.cn/minigameapidoc/dev/api/open-api/cloudsave/CloudSaveManager.createArchive/) / [update](https://developer.taptap.cn/minigameapidoc/dev/api/open-api/cloudsave/CloudSaveManager.updateArchive/): `archiveMetaData`, `archiveFilePath`, plus `archiveUUID` for update; callbacks and Promise supported. Cloud support starts at base library 2.0.0.
- [Submit scores](https://developer.taptap.cn/minigameapidoc/dev/api/open-api/leaderboard/LeaderboardManager.submitScores/) / [open leaderboard](https://developer.taptap.cn/minigameapidoc/dev/api/open-api/leaderboard/LeaderboardManager.openLeaderboard/): `callback.onSuccess` / `onFailure(code,message)`; these APIs do not support Promise. `collection:'public'` requires no friends authorization. Leaderboard support starts at 1.8.0.

The tests exercise these exact callback shapes using an explicit fixture, not an offline runtime success substitute. Unsupported real hosts show an unavailable message.

## UI and integration interfaces

`startTapServiceScreen({sdk,canvas,services,savePort,config,onExit,multiplayer})` returns `{stop,getSnapshot}`. `savePort` supplies `export`, `validate`, `restore`, `summary`, `score`, `canRestore`, optional `developer`. The browser port additionally supplies `container`, `pause`, `resume`; the standalone xiangqi game has no parent-workspace runtime import. The managed H5 builder injects `mountTapBrowserServices` and installs the optional identity factory before mounting competition.

The shared browser adapter maps actual pointer IDs, multitouch, cancel, capture, resize, visibility and host safe-area geometry; it resolves late-injected `tap` dynamically. Storage absence does not trap the player in an empty overlay.

The optional `multiplayer` parameter is a factory `({sdk,canvas,services,config,onExit}) => {stop,...}`. All three H5 entries now inject a closure containing only that game's rules/renderer. The portal detaches its input while the child owns the singleton battle manager listeners and reattaches on return. It displays no multiplayer button until a real factory is supplied. The implemented flow covers create/join with the actual room ID, both players ready, deterministic two-player games and explicit interruption/exit. These are casual matches: no local progression, cloud score or backend ranking is written. Friends must use the same version entry and Tap application; the three separate AppIDs do not imply cross-app room support. See the [multiplayer design, protocol and H5 touch evidence](design/multiplayer-2026-10-19/README.md). SDK-fixture two-browser validation is complete; real Tap two-device validation remains outstanding.

Official online-battle facts used by this implementation: base library >=2.7.0; register before connect and unregister the same listener object. `connect` returns `playerId`; rooms use `roomInfo.id`, `ownerId`, `players[].id` (MCP also documents `roomId`). No requested room ID on create. `roomCfg` requires `maxPlayerCount`, `type`, `name`, `matchParams` with string level/score. Ready state is an application property. `sendCustomMessage({data:{msg,type:0}})` excludes self, limits UTF-8 to 2048 bytes, and shares 15/s with room property updates. Modern event names and documented old aliases can be normalized; only `playerId/fromPlayerId`, `msg/message`, with conflicts rejected, are supported. Events do not always include room IDs, so application envelopes must identify room/epoch/version/sequence. Evidence: [official JS APIs](https://developer.taptap.cn/minigameapidoc/dev/api/open-api/tap-battle/OnlineBattleManager.registerListener/) and [official Unity JS bridge](https://github.com/taptap/minigame-sdk-unity/blob/e491afd44549f387aeb8c0e5e78878af1e1f6716/Runtime/Plugins/TapSDK.jslib#L846).

## Ads and remaining validation

All three H5 apps use H5 rewarded position `1054324`; the build explicitly supplies the H5 position. Real advertising still requires host acceptance.

Local tests cover the three production H5 builds and safe-area touch flow with callback fixtures. They do not establish live Tap cloud/leaderboard permission, real account exchange, real ad playback or successful upload/review. Device validation remains required for those external capabilities.
