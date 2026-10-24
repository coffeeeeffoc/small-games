# Cocos artifact publication repair — 2026-10-23

Base: `f6fd892b64ddda057797746fc08233746ce9d38a`.

## Reproduced causes

- Three Choose Two: `src/engine.d.mts` participates in sourceHash, but `.mts` was omitted from text newline normalization. Windows CRLF hash `1f07c085e48522e272c606ef76fbb6266dcd733e38c254a5b1a45291c77b9df3` exactly matches the downloaded CI artifact and provenance from [run 39853613177](https://github.com/coffeeeeffoc/small-games/actions/runs/39853613177). Changing only that file to LF produces `10f25233f5ab87552dab483deaaec40013a9b4a69421fcb96dba26e0cb97bbf2`. Generated core files are excluded and the generated directory meta is tracked; they did not explain the mismatch.
- Tower Brake: `tower-surface.mtl` was also omitted from text normalization. LF/empty API gives `1b6c1e1c815806623a1a27a9ace60257ee2baaaa75c2a1fc4cd06b89b67e28cc`; CRLF/empty API gives `82b7a4326e2cb0607f3eaed279eb529b1120d461f35f50f937147e83af595300`, exactly matching the downloaded [Pages artifact](https://github.com/coffeeeeffoc/small-games/actions/runs/39853613203).
- Tower additionally fingerprints the effective `competitionBootstrapSource()`. The reusable Creator producer had no API URL, whereas Pages build/logic set `https://api.nenggongzhiren.cn/small-games/v1`. LF/production API gives `479d4373aab31fcf606e1b258b93e38a5936a8537ded08819a5baa3b79651e5e`; CRLF/production API gives `6dcd26e09ba3d571aa5fcd4270b030cb4e428c9535fedfc14ec3bf9a45db8d56`.

The downloaded source/provenance records identify the same source commit and Windows producer. These are reproducible input differences, not evidence of transfer corruption.

## Repair and scope

Normalize only the additional text extensions; binary input remains byte-sensitive. Add a reusable workflow API URL input, passed by Pages and inherited by reuse verification and only the Tower Creator matrix entry. CI/mobile retain the empty default. Pages rejects a CI artifact built for a different API configuration and uses the existing Creator fallback.

The scope proof strips exactly these workflow additions and binds the remaining complete bytes to the existing migration review. The immediate base selects Tower; the cumulative Pages base retains the existing Three/Tower/Tetracube consumers. Permissions, credentials, gameplay, platform targets and strict source/runtime checks are unchanged.

## Validation evidence

The two new newline regressions failed on the unmodified code and passed after the patch. Content changes and binary-byte changes still change sourceHash; the existing Tower artifact tests retain runtime tamper, path-boundary and API configuration rejection checks. Exact candidate, real Creator, browser and remote deployment evidence will be recorded after completion.

## Production-config browser follow-up

The first exact candidate (697d1a1d40901c167be385c6f2596c26a665549d) passed real Creator builds, static checks and Three Choose Two browser checks. Tower reached five gameplay groups, then its delayed-connect test timed out: the test mocked only /api/competition/, while the production artifact calls /small-games/v1. The test now reads the generated competition-config.js and intercepts that exact API base, preserving the emitted production configuration and all connecting/blur/timer assertions. A request-count assertion proves that starting a run actually reaches the delayed mock. No gameplay code changed.

The production browser run also exposed a timing-sensitive failure helper after endless floor 80: one drag could use a landing sampled before the next floor was reached. The helper now re-reads the actual landing and physically aims at its danger area within the original 30-second bound, including shield consumption, and still requires a lost result. Runtime rules are unchanged.

A later full candidate exposed an intermittent shared-route driver loss while the same unchanged artifact passed twelve focused route runs. Coordinate conversion previously made four additional browser round trips per drag after sampling the landing. The test now records the visible canvas geometry in ready() (also called after every viewport change), preserving physical CDP touches and all state assertions while reducing stale-input latency. Win assertions now identify the route, floor and simulation time on failure.

The final isolated run reproduced a narrower delayed-connect race: initialization and start share authentication, so a fixed 500 ms delay can expire before the click. The test now holds intercepted responses behind an explicit gate until connecting is observed and blur is dispatched, then releases them before checking paused state and zero elapsed time. This tests the same pending-request behavior without relying on machine speed.

After a second captured route-8/floor-10 driver loss, the win driver keeps a physical touch down while steering instead of starting and ending a gesture for every sample. It re-samples after re-anchoring within the canvas, retains the 500-iteration limit and strict won assertion, and makes no calls to game-state mutation or developer controls.
