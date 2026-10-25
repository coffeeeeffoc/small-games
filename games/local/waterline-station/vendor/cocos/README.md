# Cocos Engine 3.8.8 Web runtime

This is the genuine Cocos Engine runtime compiled from the official source commit
recorded in `provenance.json`, using the source archive's frozen npm dependency
lock and `@cocos/ccbuild` 2.3.16. It is **not a Creator editor export**. Scene,
Node, Camera, Canvas, Graphics, Sprite, Label, tween, input, rendering and the
frame lifecycle are Cocos. The small `materials.mjs` contains original GLSL
programs and Cocos EffectAsset/Material setup; it does not replace the engine.

Normal game builds verify the vendored engine offline:

```sh
node scripts/build-cocos-engine.mjs --check
```

To reproduce the engine, with Node 24.21.0, npm, curl and tar available:

```sh
node scripts/build-cocos-engine.mjs --rebuild
```

The script downloads a checksum-pinned official source archive, verifies its
package-lock, runs `npm ci --ignore-scripts`, generates official engine metadata,
and invokes the official builder for HTML5. It retains build scratch/logs under
the OS temporary directory. Only selected Web modules are built; optional native
physics/WebGPU declarations are absent and emit upstream type-library warnings.
This is not a claim that Creator editor/native exports or full upstream engine
typechecking were validated. Runtime has no external/CDN requests.

`startCocos(canvas, {width,height,background,update})` returns
`{cc,scene,ui,camera,width,height,resize,clientToDesign,pause,resume,destroy}`.
`width`/`height` are live getters. UI child coordinates are centered, Y-up.
`resize(width,height)` preserves nodes and adjusts design resolution, UI origin
and camera. The caller sets the GameDiv CSS stage size before calling resize.
Use a stage whose aspect ratio matches width/height. The
`screen.exactFitScreen:false` setting preserves that stage size. Include
`GameDiv > Cocos3dGameContainer > GameCanvas` in HTML before module import because
Cocos initializes its platform adapters during module evaluation.

Global Cocos touch positions are bottom-left design coordinates; convert with
`{x:event.getUILocation().x, y:height-event.getUILocation().y}`. Node touch handlers
consume handled events before global `cc.input`; use one routing strategy.
Textures may be baked once into `ImageAsset`/`Texture2D` from an offscreen canvas;
the runtime scene is rendered by Cocos WebGL, not a Canvas 2D frame loop.

Smoke verification used Linux Chromium mobile touch emulation, DPR2, WebGL2 and
WebGL1; it covered real Label/Graphics/Sprite rendering, tween, touch, component
update pause/resume and changing portrait/landscape stage sizes. It does not
establish physical device or TapTap native validation.

Waterline Station adaptation: the local bootstrap names its scene and frame loop
for this game and explicitly calls `director.root.resize` after a viewport
change, keeping render targets and camera pixel dimensions in sync. The engine
`cc.js` and LICENSE remain byte-identical to the pinned provenance.
