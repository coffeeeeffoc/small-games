# Module contract

Native ES modules, Canvas 2D and HTML/CSS; no runtime dependencies. Content and combat are Game-owned. The immutable config exports `LEVELS`, `SEEDS` (the three terrain species), `ENEMIES`, and `UPGRADES`.

## Simulation and state

`src/simulation.mjs` exports `createGame(levelId = 'ruins', seed = 42)`, `startGame(state)`, `step(state, dt, input)`, `chooseUpgrade(state, id)`, `pauseGame(state)`, `resumeGame(state)`, and `dash(state, direction)`.

The manual seed APIs, inventories and cooldowns have been removed. Callers must not call `selectSeed` or `castSeed`. A new run resets progression, miss counts, queued shots, statuses and terrain.

State is mutable and JSON serializable. Relevant public fields:

```js
{
  levelId, phase, time, duration, wave, waveProgress, coins, kills,
  player, enemies, plants, bullets, particles, floaters, telegraphs,
  growth: { misses, threshold, cooldown, nextKind },
  progression: { level, xp, nextXp },
  stats: { shots, misses, autoPlants, plantsGrown, plantKills, terrainDamage,
    reflections, splitShots, damageTaken },
  upgradeChoices: [], // IDs currently offered
  upgrades: [],       // selected IDs; repeated ID means another rank
  events: []
}
```

`phase` is `ready | playing | paused | upgrade | won | lost`. The ready scene is an inert preview. Only `playing` advances; upgrade selection freezes enemies, projectiles, terrain timers and the five-minute clock. `step` subdivides bounded elapsed time to prevent tunnelling. All combat randomness is seeded; identical seeds and inputs replay deterministically.

Input is `{moveX, moveY, aimX, aimY, firing, autoFire}`. Normal UI always enables auto fire; the simulator permits `autoFire:false` for isolated tests. Holding a field pointer temporarily chooses the aim; releasing/cancelling returns to nearest-enemy aiming. With no target, auto fire uses the last heading. Dash accepts `{x,y}`.

## Separate reward loops

A primary projectile that finishes without any hit or reflection adds one miss. Reflected paths and derived split projectiles do not add misses. Impact explosions and damage-over-time do not create new counted projectiles. A projectile is settled once; an enemy death awards XP once, regardless of damage source.

`LEVELS[levelId].growth` owns the miss threshold, minimum threshold, minimum spawn interval, forward distance range, angular sector and terrain species pool. Each threshold schedules automatic terrain in the final miss direction. Placement uses the current player origin and a safe point inside playable bounds; unavailable placement can wait for a valid point. Pending growth is bounded. Species use a shuffled bag; terrain expires and respects `plantCap`. Ice obstructs enemies but never the player. Replacing a mushroom at the cap does not explode it.

Enemy definitions own XP. `progression` config owns initial XP, the per-level increase and the level at which choices expand from 3 to 4. Excess XP is retained across consecutive choices. Wave boundaries do not award upgrades. Death and victory take precedence over opening a new upgrade modal.

`UPGRADES` entries define `id`, `name`, `description`, `category` (`weapon | terrain | survival`), `kind`, `icon`, `maxRank`, `weight`, `effects`, and optional `requires` (IDs requiring at least one rank). The offer pool filters unavailable/maxed/prerequisite-blocked entries, draws without replacement, and includes a weapon and terrain option when available. Empty pools must not deadlock the game. A level can restrict its upgrade pool.

Gunshot modifiers are additive per rank with bounded counts. Split projectiles are terminal children: they cannot split again or inherit recursive explosion triggers. A burn refreshes its duration instead of stacking unbounded instances. Terrain-duration upgrades affect persistent thorn/ice terrain, not the mushroom fuse.

## Rendering and browser contract

`GardenRenderer` exposes `resize()`, `render(state, options)`, `screenToWorld(clientX,clientY)` and `worldToScreen(x,y)`. The latter returns local CSS coordinates. `drawSeedIcon` and `drawPortrait` render illustrations for UI; they do not imply manual planting. World coordinates locate ground contact; portrait camera follows the player with HUD and thumb-control safe areas.

Required selectors: `#start`, `#pause`, `#resume`, `#restart`, `#arena`, `#joystick`, `#dash`, `[data-upgrade]`. Do not depend on the removed `[data-seed]`, `#cast` or `#auto-fire` controls. Pause uses two separated solid SVG bars with `aria-label="暂停"`.

`window.__bulletGarden.snapshot()` returns a deep clone for read-only acceptance checks. No mutable debug controls. `document.body.dataset.phase` mirrors the phase. Input resets on panel opening, blur, pointer cancellation and capture loss. Touch supports simultaneous movement and temporary manual aim.

`tests/browser.mjs` exercises native keyboard/mouse/CDP touch actions plus read-only snapshots. Virtual time accelerates requestAnimationFrame without changing health, enemies, XP or game state. The Shell's standalone check lives in `apps/shell-web/scripts/standalone-game-checks.mjs`.

## Extension checklist

- New level: add a `LEVELS` entry with bounds, player spawn, waves, enemy composition, growth and progression tuning; optionally restrict upgrade IDs, then add an entry point.
- New upgrade using existing stats: add metadata and effects, including ranks and prerequisites. A new effect needs simulation behaviour and readable feedback as well.
- New terrain or enemy: add content, lifecycle/AI behaviour, rendering and meaningful regression coverage. Do not copy the entire simulation per level.
- Keep source attribution for new damage paths so child effects cannot farm misses or duplicate XP. Preserve projectile, enemy, terrain and effect caps.
