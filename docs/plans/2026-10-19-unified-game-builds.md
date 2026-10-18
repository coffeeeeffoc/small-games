# Unified game package builds

**Goal:** Use `pnpm build:games` and `game-build.local.mjs` for explicit H5 and native platform packages, with per-game public AppIDs and an unambiguous upload artifact.

**Architecture:** Keep the existing version 1 H5 configuration working. Version 2 adds `targets`, each specifying `platform`, `type` (`h5` or `minigame`), native `release`, and per-game `appIds` / `adUnits`. The existing global games, ads, backend and API settings determine the batch; targets may override ads/backend. Validate the complete batch before any engine build. Reuse the current H5 builder and Cocos platform builder, sequentially. Copy the official TapTap ZIP unchanged and distinguish preview ZIPs, upload ZIPs, developer-tool projects and conversion sources.

**Tech Stack:** Existing Node ESM scripts, pnpm, Cocos Creator 3.8.8 and the pinned official TapTap converter. No new dependency or runtime framework.

## Scope and implementation

1. Extend `scripts/build-games.mjs` configuration parsing, complete-batch preflight, dry-run and dispatch. Preserve version 1 behavior and reject unknown options, duplicate targets and missing release AppIDs with actionable, non-secret errors.
2. Add `scripts/native-game-build.mjs` to call the existing Cocos builder and archive each result before the next variant overwrites its scratch output. Verify inventories and the official ZIP hash/CRC; never recompress the TapTap package. Output per-target manifests and one batch summary under `outputs/game-builds/<batch>/`.
3. Extend `scripts/build-games.test.mjs` with mixed-target routing, platform/AppID validation, no accidental fallback to environment IDs, preflight-before-build, native ZIP fidelity and developer-project delivery tests. Keep the H5 retention/recovery tests.
4. Use a commented JavaScript `export default` object in the version-controlled `game-build.local.mjs` and reference template `infra/builds/games.example.mjs`, with explicit `.js`/JSON support and missing-default-only legacy JSON fallback. Users edit the latest committed configuration for local trials, commit working choices and revert unsuccessful changes. Update build documentation and exact incremental-validation classification. Explain existing build commands rather than deleting low-level tools or changing unrelated workflows.
5. Run focused Node tests and formatting, required developer-mode checks for build-flow changes, then an actual bounded H5 and native build through the unified entry. All engine builds run serially. Independent review is read-only.

## Acceptance and limits

- Existing version 1 configurations still build only their selected H5 variants.
- Version 2 supports current Cocos targets: TapTap, WeChat, Bilibili, Douyin, Alipay and Kuaishou source preparation. Unsupported platform/type pairs fail before compilation.
- A release target requires each selected game's real public platform AppID. AppSecret is never accepted in this file. Preview output is explicitly labeled and has no release-upload claim.
- TapTap delivery has root `game.js` / `game.json`, matches the official conversion receipt and is copied byte-for-byte. No outer GitHub-style ZIP is offered as the upload file.
- Native and H5 ad IDs remain target-specific. Service-off jobs remove their API URL; missing required configuration cannot silently produce a different variant.
- Source changes already present in `games/minigames/cops-robbers/controller.mjs` belong to other work and remain untouched.
- Local builds and fixture tests do not establish official backend parsing, real-device login/ads, review or publication. Commit the unified build and versioned configuration changes to local `dev` as requested; uploading or pushing is outside this task.
