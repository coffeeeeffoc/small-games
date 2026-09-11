# Interactive Cultivation Implementation Plan

> Execution: use the available executing-plans skill and verify each task before proceeding.

**Goal:** Deliver the approved three-minute cultivation, exploration and tribulation game with shared Web/native rules, responsive controls, animation, sound, settlement and replay.

**Architecture:** Keep Game Host and both existing entrypoints. A Game-owned mutable simulation advances in bounded fixed steps; one Canvas renderer and input controller serve Web and native surfaces. Versioned content migrates validated legacy campaigns to trial settings; trial records use a separate storage key.

**Tech Stack:** Existing TypeScript, React, Canvas 2D, HTMLAudio/native local audio, Zod, Vitest and Playwright. No new external runtime library.

## 1. Content and simulation

- Modify `apps/game-cultivation/src/content/{schema,data,migration}.ts`; preserve validated legacy content in `legacy.ts` and `legacy-data.ts`.
- Create `src/domain/{trial,world,combat}.ts` and focused `tests/trial.test.ts`.
- Add tests for resource gain/loss, real projectile collision, dodge, stone/pillar interaction, relics, fox protection, three eyes, timeout and basic-ability victory. Run `pnpm --filter @coffeeeeffoc/game-cultivation test` after implementing the rules.
- Update the manifest to the new content and Game version. Check all callers of old exports and versioned envelopes before removing or changing an export.

## 2. Rendering and audio

- Create `src/view/{scene,scenery,actors,sound}.ts`: cave, forest and summit, animated cultivator/enemies/fox/sword, cues and environment response.
- Generate small local sound assets with a reproducible stdlib script, and include them in native packaging.
- Use the frontend-design skill for the jade, ink and warm-gold visual treatment. Keep threatening shapes legible without audio or camera shake.

## 3. Shared controls and UI

- Replace `src/canvas/surface.ts` with the continuous controller; replace `src/view/CultivationGame.tsx` and styles with the playable Canvas and accessible controls.
- Support multitouch movement plus aim/hold/release, keyboard/mouse, interruption, pause, retry and two relic slots.
- Use a fixed-step simulation and cap background time; cancel held actions on all lifecycle exits. Verify the same pointer sequences in native and browser tests.

## 4. Persistence and hosts

- Create `src/adapter/trial-save.ts` for idempotent result records that do not mutate legacy saves. Test offline failure and concurrent-write reconciliation.
- Replace the native definition's choice loop with the shared controller. Refresh package, Shell and migration contract tests to match current content, keeping explicit legacy fixtures.
- Check affected Studio/Management migration consumers and catalog copy. Run typecheck, tests, lint, build and `pnpm check:dependencies` serially for affected packages.

## 5. Playtest and delivery

- Rewrite `scripts/cultivation-playtest.mjs` around real movement, breath, projectile attacks, touch cancellation, audio, settings, scene transitions, victory/failure/retry, persistence and 320/390px screens.
- Run browser playtest, native smoke and remote iframe smoke. Inspect screenshots; fix misleading feedback and blocked interaction paths.
- Review the final diff, document exact verification and remaining real-device limits, commit only this task's changes, and report branch/clean-tree/push status. Do not deploy without a deployment request.

## Completion and verification — 2026-09-12

All five implementation stages are complete. The Game is version 2.0.0 with content schema v3. Web, iframe and native Canvas share the same simulation, input and local audio. Old campaign saves remain intact; result writes retry conflicts and report failures.

- 140 tests passed across cultivation (28), Game Loader (29), Bilibili Shell (25), Web Shell (17), Studio (19) and Management API (22).
- All six affected packages passed typecheck and lint. The serial Turbo build completed 26 tasks, including their dependencies; workspace dependency/cycle validation passed.
- `node scripts/cultivation-playtest.mjs` passed eight browser scenarios with no console/page/network errors: real movement and attacks, breathing and cancellation, simultaneous touch at 320/390px, relic collection and fox rescue, three-eye victory, failure/replay/persistence, pause/audio, and the built production entry. The development snapshot is read-only and absent from production.
- Native packaged-artifact smoke passed for all four Games. Remote iframe smoke verified the actual bundle, parent/cookie isolation, pause/resume/disposal and decoded packaged audio. CSP permits only inline data audio; remote network media remains rejected.
- Screenshots and machine-readable playtest results are local, ignored artifacts in `.scratch/cultivation/`. The local production preview is `http://127.0.0.1:43112/` while its preview process runs.

Verification covers desktop Chrome, mobile viewport/touch emulation and the native adapter harness. Physical phones and the actual Bilibili client have not been tested. Broad player feedback is still needed to judge repeat-play appeal and tune difficulty; automated victory is evidence of a playable path, not a measure of fun. Existing Studio editor chunk-size and Turbo output-pattern warnings remain outside this gameplay rewrite. No release was deployed.
