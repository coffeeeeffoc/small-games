# Carding-car friend multiplayer implementation plan

**Goal:** Play one authoritative race with invited friends and 0–7 optional bots, up to eight participants.

**Architecture:** Add a standalone game-specific runtime under `services/kart-server`. Import the existing simulation through explicit carding-car package exports; keep Cocos rendering out of the server. Use one in-memory process, WebSocket inputs and snapshots, and a native Cocos room panel. Single-player stays available without the service.

**Tech Stack:** Node.js 24.12+, TypeScript, Fastify, ws, Zod, existing Cocos Creator 3.8.8.

1. Generalize `RaceManager` driver count and per-human inputs; preserve single-player finish behavior and verify multiple humans/bots and all-player finishes in `tests/multiplayer.test.ts`.
2. Add shared protocol types and explicit package exports. Implement validated room create/join/configure/ready/load/start/input/reconnect/leave/rematch commands in `services/kart-server`, with capacity, origin, payload, rate, idle, input and race time limits. Run real socket integration tests.
3. Add Cocos room controls and network client, room-code joining, browser invitation links, asset loading barrier, local-player camera/HUD and interpolated server snapshots. Configure deployment endpoint in `assets/resources/multiplayer.json`; localhost development uses port 43003.
4. Exercise two browser contexts through join, different cars, bot counts including zero, start, independent controls, shared positions and disconnect/reconnect. Re-run offline tests, typechecks, dependency checks, Web/WeChat/Bilibili builds.
5. Document local startup and WSS deployment. Rooms are ephemeral and guests use short-lived random reconnect tokens; persistent accounts, public matchmaking and multi-process room routing are outside this first version.

Work stays in the current checkout so the preceding ranking/selection fixes and existing WeChat startup work are preserved. No deployment or remote push is included.

## Completed validation

- Game and service typechecks passed; 77 game tests and 2 real-socket integration tests passed.
- Workspace dependency boundaries and registration checks passed (25 games, 0 issues).
- Two real Cocos browser clients passed desktop/touch joining, zero bots, different player cars, independent inputs, shared state, reload reconnect and return to offline play. The offline ranking/selection browser regression also passed.
- Web, WeChat and Bilibili builds passed. Native package totals were 19,954,049 and 19,948,587 bytes respectively.
- Generic tunnel startup was checked with an exact HTTPS origin and a local WebSocket handshake. Public provider registration/tunnel connection and native-device networking remain unverified.
- Setup and domestic tunnel choices are documented in `services/kart-server/README.md`; ADR-0013 records the optional game service alongside the existing backend topology.

后续按需加载、原生分享与房主统一选择规则见 `2026-09-20-kart-loading-sharing.md`，取代此处最初的逐人选车约定。用户于 2026-09-20 授权完成验证后提交并推送。
