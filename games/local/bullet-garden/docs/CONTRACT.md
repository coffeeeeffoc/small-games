# Module contract

Game uses native ES modules, Canvas 2D, CSS/HTML UI; no runtime dependencies.

Simulation exports from `src/simulation.mjs`: `createGame(levelId = 'ruins', seed = 42)`, `startGame(state)`, `step(state, dt, input)`, `selectSeed(state, kind)`, `chooseUpgrade(state, id)`, `pauseGame(state)`, `resumeGame(state)`, `castSeed(state, target)`, `dash(state, direction)`. Configuration exports `LEVELS`, `SEEDS`, `UPGRADES` from `src/config.mjs`.

World is 1440 x 900, playable bounds x=100..1340, y=150..750. Coordinates locate ground contact. State is mutable and JSON serializable:

```
{levelId, phase:'ready'|'playing'|'paused'|'upgrade'|'won'|'lost', time:0, duration:300,
 wave:1, waveProgress:0, coins:0, kills:0, selectedSeed:'thorn',
 player:{x:720,y:470,hp:100,maxHp:100,radius:18,angle:0,invulnerable:0,dashCooldown:0},
 seeds:{thorn:5,ice:4,mushroom:3}, seedCooldown:0, plantCap:18,
 enemies:[{id,kind:'sprout'|'runner'|'brute',x,y,hp,maxHp,radius,angle,hit:0}],
 plants:[{id,kind:'thorn'|'ice'|'mushroom',x,y,radius,age,life,hp,maxHp}],
 bullets:[{id,kind:'normal'|'thorn'|'ice'|'mushroom'|'enemy',x,y,vx,vy,targetX,targetY}],
 particles:[{x,y,vx,vy,life,maxLife,color,size}],
 floaters:[{x,y,text,color,life}], telegraphs:[{x,y,radius,life,kind}],
 stats:{shots:0,seedShots:0,plantsGrown:0,plantKills:0,terrainDamage:0},
 upgradeChoices:[], upgrades:[], events:[] }
```

`input = {moveX:0,moveY:0,aimX:900,aimY:470,firing:false,autoFire:true}`. Auto fire targets nearest enemy in range; manual held fire aims at input point. `castSeed` launches finite seed projectile toward an exact ground point, grows if no direct enemy hit; normal bullets never grow. `step` only advances playing phase. Events are short array for audio/UI and drained by app each frame. Ten 30s waves, pause for upgrade at wave 3, 6, 9; survive 300 seconds to win. Seed resources regenerate / wave replenish; clear readable cooldowns. Dash accepts `{x,y}` vector. Configuration/units are game-owned and extensible.

Renderer exports `class GardenRenderer` from `src/renderer.mjs`: constructor(canvas), resize(), render(state, {aim, planting, time} = {}), screenToWorld(clientX,clientY), worldToScreen(x,y); methods return local CSS coordinates for worldToScreen and world coordinates for screenToWorld. Renderer handles DPR/fit/camera. It renders the entire scene, UI is separate HTML overlay. Portrait camera follows player, desktop whole world with sensible crop; reserve approximately 100px top and 180px bottom UI in desktop composition. Export `drawSeedIcon(canvas, kind)` and `drawPortrait(canvas)` for UI illustrated cards/portrait. Renderer accepts ready state as populated preview garden, implementation may render decorative plants independently of simulation.

App entry `src/main.mjs`, `index.html`, `style.css` owned by main agent. Required stable selectors: `#start`, `#pause`, `#resume`, `#restart`, `#arena`, `#joystick`, `[data-seed="thorn|ice|mushroom"]`, `#cast`, `#dash`. Readonly test observability: `window.__bulletGarden.snapshot()` returns deep-cloned state. Gameplay phase mirrored on `document.body.dataset.phase`. App must support dual touch move + field target/cast, WASD + mouse, 1/2/3 seed selection, right click/E cast, Space dash, Escape pause. Full game flow including ready/pause/upgrades/results. No mutable debug shortcuts.
