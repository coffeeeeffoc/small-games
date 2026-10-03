# Module contract

Native ES modules, Canvas 2D and HTML controls, with no runtime dependencies. World coordinates refer to ground contacts in a 1440 × 900 courtyard, bounded by x=100..1340, y=150..750.

## Configuration and simulation

`config.mjs` exports `LEVELS`, `ENEMIES`, `BOONS`, `SKILLS`, `UPGRADES`. Legacy `SEEDS` remains for old artwork/helpers, not a selectable gameplay resource.

- Boon IDs: `shrub`, `trench`, `frost`, `poison`. Terrain kind for shrub is `thorn`; other kinds match IDs. Each definition describes interval, life, radius, color and status rules.
- Skill IDs: `blast`, `gale`, `cart`, `horse`, `laser`. Each definition describes color, shape (`circle`/`line`), range, radius, width, duration and 100-point energy capacity.
- XP-driven upgrade choices can unlock an unowned `boon-*` or strengthen weapons, health, energy or terrain. Preserve progression level/XP overflow, 3 choices expanding to 4 at level 5, rank limits, weights and prerequisites. Wave boundaries do not award upgrades.

Simulation exports:

- `createGame(levelId = 'ruins', seed = 42)` creates a serializable ready state.
- `configureLoadout(state, { skills })` configures two distinct skill IDs outside combat. There is no initial boon selection; legacy `boon` fields never grant terrain.
- `startGame(state)` preserves the configured skills and resets runtime state, including energy and acquired upgrades. Every run begins with empty `boons`, `boonTimers` and `plants`; only selecting an offered `boon-*` XP upgrade unlocks terrain.
- `selectSkill(state, index)` selects slot 0 or 1.
- `castSkill(state, target, index = state.selectedSkill)` validates playing phase, energy, cooldown and target; clamps valid targets to skill range and world bounds; only a successful cast consumes energy.
- `step(state, dt, input)`, `chooseUpgrade(state, id)`, `pauseGame(state)`, `resumeGame(state)`, `dash(state, direction)` own combat and lifecycle.
- Legacy `selectSeed`/`castSeed` no longer provide manual terrain generation.

`input = { moveX, moveY, aimX, aimY, firing, autoFire }`. The app advances a fixed 60 Hz simulation, multiplying accumulated wall time by the selected 1/2/3/5 speed while rendering only once per animation frame; `step` bounds long deltas. Only playing phase advances time, energy, status durations or terrain. Ordinary bullets never generate terrain. Acquired boons alone trigger automatic terrain. Energy accrues over combat time and kills, stays capped, and never casts automatically.

Relevant state:

```js
{
  phase: 'ready', // playing | paused | upgrade | won | lost
  loadout: { skills: ['blast', 'gale'] },
  boons: [], boonTimers: {},
  progression: { level: 1, xp: 0, nextXp: 12, pending: 0, queue: [] },
  skillSlots: [{ kind: 'blast', energy: 0 }, { kind: 'gale', energy: 0 }],
  selectedSkill: 0, skillCooldown: 0,
  player: {}, enemies: [], plants: [], bullets: [],
  skillEffects: [], particles: [], floaters: [], telegraphs: [],
  stats: { shots: 0, plantsGrown: 0, plantKills: 0, terrainDamage: 0,
           skillCasts: 0, skillDamage: 0, skillKills: 0 },
  upgrades: [], upgradeChoices: [], events: []
}
```

Terrain has `{ id, kind, x, y, radius, age, life, hp, maxHp }`; ditch width is its major diameter with minor radius 0.45 × radius. Active effect fields include `{ id, kind, x, y, startX, startY, targetX, targetY, dx, dy, age, life, radius, width, length, hitIds }`. `x/y` follow traveling charges; beam origin remains `startX/startY`. Width denotes full line width. Effects may also carry delay, triggered and travelled bookkeeping.

Weapon upgrades retain multishot, bursts, ricochet, ice/fire/explosive rounds and bounded one-generation splits. Enemy deaths award XP once for weapon, terrain and skill sources; burns cannot recursively spawn bullets. Miss accounting no longer triggers unchosen terrain.

Enemy statuses are remaining-time values: `frozen`, `freezeCooldown`, `poison`, `poisonDps`, `stunned`, `feared`, `fearX`, `fearY`, `vulnerable`. Statuses do not form unbounded stacks. Frozen/stunned enemies cannot move or attack; fear retreats from its impact origin. Effects, terrain, particles, enemies and projectiles have explicit caps.

## Renderer and app

`GardenRenderer(canvas)` exposes `resize()`, `render(state, { aim, planting, time })`, `screenToWorld(clientX, clientY)` and `worldToScreen(x, y)`. The legacy render option `planting` now means an armed energy skill; its range preview uses the selected skill. `drawSeedIcon(canvas, kind)` remains the shared illustrated-icon export, including new boon/skill kinds. Attribute projectiles and burn/chill statuses retain their visual feedback. `drawPortrait(canvas)` draws the gardener.

The renderer owns camera/fit/DPR and bounded artwork atlases. It culls offscreen drawing without culling simulation. Main and offscreen canvas restoration invalidate raster caches. The app pauses combat during context loss and prevents premature resume until restoration.

Stable selectors: `#start`, `#pause`, `#resume`, `#restart`, `#arena`, `#joystick`, `[data-upgrade]`, `#loadout-skill-0`, `#loadout-skill-1`, `[data-skill-slot="0|1"]`, `#cast`, `#dash`, `#game-speed`. The speed selector uses values `1`, `2`, `3`, `5`; read-only `snapshot().controls.speed` records its current multiplier. Ready allows starting immediately with the default skills and no terrain. Skill loadout changes occur before combat; passive terrain boons are selected exclusively in XP upgrade choices. Restart returns to preparation. `body.dataset.phase` mirrors simulation phase. `window.__bulletGarden.snapshot()` returns a deep copy only.

Touch interaction is arm → target → pointerup to cast, with joystick and targeting as independent pointers. A cancelled gesture never spends energy; an unarmed field touch only aims. Keyboard 1/2 arms slots, E/right click confirms, Escape cancels aiming before toggling pause, Space dashes. Loss of focus, visibility or canvas clears held inputs. Keep two parallel filled SVG rectangles for the pause icon.

## Acceptance

Simulation tests cover acquisition-gated terrain, energy guards/lifecycle, spatial skill hits, status expiry, bounded entities and deterministic replay. Browser tests use actual controls and read-only snapshots for preparation, skill charging/casting/cancelling, dual touch, pause, upgrades and the full challenge. `tests/rendering.mjs` imports modules on an independent canvas for deterministic maximum-load raster and restoration checks; it does not modify the public game's state.

Canvas-loss event injection verifies recovery handlers, not a physical GPU reset. Synchronous readback timings and desktop touch emulation must not be described as real-phone performance or validation. Run reports are generated in `QA_OUTPUT`; the current browser, balance and rendering reports are archived in `docs/qa`.
