# Bullet Garden module contract

Native ES modules and Canvas 2D; no runtime dependencies. `WORLD` is1440×900, default arena x100..1340/y150..750. Stable IDs and `order` drive the campaign; neither completion nor unlock logic hardcodes11.

## Data and extension

`config.mjs` exports `LEVELS`, `ENEMIES`, `SEEDS`, `WEATHER`, `WEATHER_MODIFIERS`, `BOONS`, `SKILLS`, `UPGRADES`, `WEAPONS`, and `registerContentPack`. SEEDS describe plant behavior and artwork; they are not manually selectable ammunition. BOONS grant ownership only through an offered run-XP upgrade.

Levels have `{id,order,name,duration,waveDuration,waves,world,bounds,playerStart,plantCap,spawn,progression,terrain,weather,rewards,encounter,visual}`. Terrain is circular `{id,kind:'wall'|'mud'|'slope',x,y,radius,...}`. Weather is `{kind,wind,thunder}`; wind and thunder overlay one base weather. Encounter is null or `{kind,rank,atWave,required:true}`; required enemies must die before a victory.

`registerContentPack({version:1, levels:[], enemies:[], plants:[], weather:[], buffs:[]})` validates the complete append-only JSON pack before changing stable catalogue containers. Definitions are frozen; IDs/order cannot replace existing content. `validateContentPack` in content-schema.mjs checks references, supported handlers, finite bounded values, art references, safe player spawn and connected traversable arena. Register before creating a run. A new behavior requires a source handler; JSON cannot execute code.

Enemy definitions combine hp/radius/speed/damage/xp/coins, rank, armor, controlResistance, shield, unlockStage and `abilities:[{type,...}]`. Supported abilities are controlResist/charger/brood/burrower/glider/spitter/shield/shieldBreakStun/bossPhases. Plants use effects slowAura/damageAura/block/explode/healAura/chainLightning/shoot. Visuals consume the same geometry as collisions.

## Permanent progression

`progression.mjs` exports createProfile, levelFromXp, profileStats, upgradeCost, purchaseUpgrade, isLevelUnlocked, settleLevel, registerGrowthDefinitions, PERMANENT_UPGRADES and UPGRADE_DEFINITIONS. The registry powers shop, validation, saves and stat aggregation. Permanent profile and run XP remain separate.

Profile is `{version:1,xp,coins,completed:[],settledRuns:[],upgrades:{},equippedWeapon,equippedPet,selectedLevelId}`. Purchases mutate only after all guards pass. Terminal runs settle once by a nonempty `runId`. First clear earns full rewards; replay35%; loss25% partial rewards. The last128 receipt IDs persist; active runs are not saved or restored. A profile cannot be used as a saved combat session.

Stats include damage/fireInterval/maxHp/armor/seedPower/pierce/level/petUnlocked/petRank/petDamage/petInterval. Player level5 unlocks the helper; new plants require2/4/6 and their run boon remains acquisition gated. Main handles localStorage and visible save failure; the model never reads storage, wall clock or DOM.

## Simulation

`createGame(levelId='ruins',seed=42,profile=null)` creates a serializable ready preview. `startGame(state)` resets combat and run XP/energy/boons while preserving profile, configured skill pair and caller-injected runId. Main assigns a fresh UUID for every start. `configureLoadout(state,{skills})` accepts two distinct known skills outside combat.

`selectSkill(state,index)`, `castSkill(state,target,index=state.selectedSkill)`, step, chooseUpgrade, pauseGame, resumeGame and dash retain dev behavior. Legacy selectSeed/castSeed return false. Each run starts without acquired terrain. Kill XP offers3 choices, expanding to4 at run level5, with weighted categories, prerequisites and bounded ranks; wave transitions do not award upgrades.

Ordinary bullets never grow terrain. Weapons retain multishot/burst/ricochet/ice/fire/explosive/split upgrades. `source` distinguishes normal/seed/pet/plant/skill/enemy damage. `layer:'ground'|'air'|'underground'` controls legal targets; burrowing and flight expire and have visible transitions. Shields precede armor; contact damage uses player armor. Piercing bullets record hit IDs to avoid repeating a hit across frames. All entities have caps; a required encounter has a reserved spawn slot.

State includes phase ready/playing/paused/upgrade/won/lost, time/duration/wave, profile/permanent, loadout/skillSlots/selectedSkill/skillCooldown/skillEffects, boons/boonTimers, progression, player/pet, enemies/plants/bullets/particles/floaters/telegraphs, terrain/weather/encounter, upgrades/upgradeChoices/stats/events, randomState and runId. Skills/statuses/weather/terrain freeze outside playing. Renderer never consumes battle RNG.

`world.mjs` exposes terrainSolids, terrainPointBlocked, terrainMovement and weatherStats. terrainMovement returns speedMultiplier and optional slip displacement; all displacement passes through common collision movement. Slip RNG is evaluated at slope entry, not every frame. Weather hazards have timed visible circles before damage.

## Renderer and controls

GardenRenderer exposes resize, render, screenToWorld, worldToScreen. `planting` means an armed skill. drawSeedIcon supports skills, boons, plants and shop icons; drawPortrait draws the gardener. Canvas context loss pauses play and cache restoration invalidates textures. Artwork caches are bounded; offscreen culling never alters simulation.

Stable dev selectors remain start/pause/resume/restart/arena/joystick/loadout-skill-0/loadout-skill-1, `[data-skill-slot]`, `[data-upgrade]`, cast/dash/game-speed. Speed values1/2/3/5 are app timing multipliers, recorded in read-only snapshot.controls.speed. New selectors ready-campaign/ready-shop/result-campaign/result-shop/next-level, `[data-level]`, `[data-purchase]`, close-campaign/close-shop, reward-coins/reward-xp/reward-note/save-status. Campaign pages render at most12 rows.

Touch follows arm→target→pointerup; unarmed field touch only aims, cancellation never spends energy. Joystick and target use independent pointers. Keyboard1/2 selects skills, E/right-click confirms, Escape cancels aiming before pause, Space dashes. Focus/visibility loss clears controls. Pause uses two separate filled SVG rectangles with aria-label="暂停". Restart returns to preparation with permanent growth retained.

window.\_\_bulletGarden.snapshot() returns a deep copy only; no mutable test shortcuts. Tests may import pure modules for controlled fixtures, while public browser flow uses native input.

## Verification boundaries

Simulation, content, progression and combat tests verify effects and lifecycle. Browser campaign fixtures inspect already-unlocked content; a separate normal-resource first-level challenge verifies actual victory→reward→purchase→next-level. Rendering fixtures inspect maximum load and restoration without modifying the public game. Desktop touch emulation is not Android/iOS performance testing; injected canvas loss is not a physical GPU reset. Reports retain validation environment and these limits.
