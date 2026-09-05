# Bilibili Shell

`apps/shell-bilibili` targets the native Bilibili **小游戏** runtime, not a browser page embedded in Bilibili. Its reviewed code uses CommonJS, `bl.loadSubpackage`, a native Canvas and Host SDK ports. No Web iframe loader, remote JavaScript import or browser DOM is included in the production entry.

## Commands and release boundary

- `pnpm --filter @coffeeeeffoc/shell-bilibili dev`: local Canvas preview using an explicitly simulated SDK; ads are unavailable here.
- `pnpm --filter @coffeeeeffoc/shell-bilibili test`: native loading, failure, Host contract, full Cultivation campaign and SDK reward validation.
- `pnpm --filter @coffeeeeffoc/shell-bilibili build`: produces `dist/game.js`, `dist/game.json`, shared reviewed modules, `dist/cultivation/game.js` and its reviewable Manifest.
- `pnpm --filter @coffeeeeffoc/shell-bilibili smoke`: executes those actual CommonJS files in an environment with no DOM or remote transport and enforces local-only require paths.

Import the complete `dist` directory into the official Bilibili developer tool and configure the application's own App ID there. Configure `BILIBILI_AD_UNIT_ID` at build time for a real channel-owned placement. The repository contains no production placement or account credentials. SDK callbacks are tested locally; actual inventory, device compatibility, platform review and publication require the developer's Bilibili account/device checks and are not claimed by the local smoke test.

All code changes require rebuilding and platform review. `game.json` predeclares `cultivation/`; runtime input cannot select a URL or another package. Shared code stays in the reviewed main package. The loader calls the literal local `require` only after successful SDK subpackage loading and validates Game identity/load mode/entry. Dynamic code updates are absent; future dynamic content or assets must pass data schemas and cannot become executable input.

## Game Contract and behavior

GameDefinition now accepts a typed mount target, defaulting to `HTMLElement` for existing Web consumers. Native Cultivation supplies a Canvas/input target. Its entry contains no React and shares the same content schema, state transitions, reincarnation rules and save adapter with the Web Game. The common lifecycle test helper accepts either target type. The Canvas entry waits for initial storage before enabling choices, serializes save/reward actions, disables input during pause and waits for pending work during disposal.

Shell owns storage namespacing, SDK lifecycle subscriptions, native exit navigation and structured SDK logging. Ad Authority defaults to `host`; explicit `none` is available for channel-disabled/test sessions, and `managed` is not accepted. Only an explicit SDK `isEnded === true` yields a completed reward; missing legacy completion data, early close, errors and timeouts do not grant rewards. The Game never receives SDK or placement identifiers.

## Official references

- [Predeclared subpackages](https://miniapp.bilibili.com/small-game-doc/ability/subpackage/)
- [CommonJS module model](https://miniapp.bilibili.com/small-game-doc/guide/module)
- [Native Canvas](https://miniapp.bilibili.com/small-game-doc/api/render/createCanvas/)
- [SDK lifecycle, storage and logging API](https://miniapp.bilibili.com/small-game-doc/api/intro)
- [Rewarded video completion contract](https://miniapp.bilibili.com/small-game-doc/open/ad/IncentiveVideo/)
