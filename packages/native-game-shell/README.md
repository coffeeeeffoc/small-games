# Creator rewarded advertising

Shared product requirements and integration boundaries live in the [game guidelines](../../docs/game-development.md) and [advertising guide](../../docs/operations/taptap-rewarded-ads.md). This file documents the bridge API; selecting an adapter does not establish per-game build integration or device acceptance.

`@coffeeeeffoc/native-game-shell/creator-ads` is the lightweight entry for an existing Creator game. It creates no Canvas, browser shim, touch handler or game lifecycle. It composes the shared `createAdRuntime` policy with `createNativeAdProvider` and exposes the normal `AdvertisingPort.offer({ id, reward })` contract.

```ts
import { installCreatorAdBridge } from '@coffeeeeffoc/native-game-shell/creator-ads';

installCreatorAdBridge({
  platform: 'taptap',
  adsEnabled: true,
  adUnitId: publicNativeAdUnitId,
});
```

The installed `globalThis.SmallGamesRewardAds` is compatible with games that consume the optional reward port. Games own reward eligibility and grant only on `status === 'completed'`. The bridge also exposes `available`, `pending`, `cancel()` and `dispose()`. Cancellation invalidates the request immediately, but an open SDK ad retains its physical lease until its close callback or confirmed asynchronous destruction. An unconfirmed timeout disables further playback for that SDK rather than overlapping ads. Do not dispose on ordinary background events caused by the advertisement itself; game navigation and actual host disposal own cancellation.

The target must be explicit: `taptap → tap`, `wechat → wx`, `douyin → tt`, `bilibili → bl`. Missing SDKs, disabled ads, empty or placeholder placements return `unavailable`. There is no fallback to a different platform, H5 placement, or mock. For TapTap native builds use `MINIGAME_<GAME>_TAPTAP_AD_UNIT_ID`; this is separate from H5 advertising configuration.

Bundle a small entry containing the call above with esbuild (`bundle: true`, `format: 'cjs'`, `platform: 'neutral'`, `target: 'es2020'`). Use the repository as `stdin.resolveDir` when generating the entry in memory. Require the generated file before Creator's `game.js` boots, after any official adapter has installed the selected native global. Inject only the public configuration; never copy environment variables or server secrets wholesale. Include the bundle and configuration in the build source fingerprint, converted resource inventory and official package verification. The bridge does not perform platform conversion or package signing.
