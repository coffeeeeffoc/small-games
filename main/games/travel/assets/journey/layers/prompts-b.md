# Transparent journey midground layers · set B

Created by editing the existing journey images using the built-in `image_gen__imagegen` tool. Exact edit prompts follow. No programmatic background removal is used.

First village/cafe attempts failed alpha validation (`hasAlpha: false`, 3 channels; their apparent transparency was painted). They are rejected and are not final layer assets.

The first pier attempt also failed alpha validation (`hasAlpha: false`, 3 channels) and is rejected.

### pier alpha retry prompt

```text
Edit the attached Longkan pier illustration into a PNG asset with a TRANSPARENT BACKGROUND. The output file must contain a real alpha channel: background pixels are alpha 0, not RGB colors. Keep exactly the centered wooden pier, posts, rope rails, near small boats and nearby red/orange water-sequoia trees. Remove all sky, sun, distant mountains/buildings, horizon, ALL lake water and reflections. Preserve the original fine geometry and illustration style. Change only the sunset color cast on wood/boats to gentle warm afternoon daylight; keep natural autumn foliage red-orange. Same 1024x1536 canvas and center-object scale; top 25% completely transparent. Natural intricate alpha edges, including holes between ropes, posts, leaves and branches. No water patch or rectangular base. Export actual RGBA PNG transparency, not a visual representation of transparency. No text, no labels.
```

### village alpha retry prompt

```text
Edit the attached Xizhou illustration into a PNG asset with a TRANSPARENT BACKGROUND. The output file must contain a real alpha channel: background pixels are alpha 0, not RGB colors. Keep the exact central Bai courtyard houses, their roofs/doors/gardens, the close rice patch, stone bridge, paths and narrow stream as one compact connected landscape cutout. Remove the entire sky, mountains, horizon, remote villages, broad distant fields and lake. Preserve the original fine architectural identity and gentle warm-afternoon illustration lighting. Same 1024x1536 canvas, same center landmark scale; top 25% is completely transparent. The left/right silhouette must follow plants and buildings with natural alpha edges; small local ground only, no rectangular backdrop. Transparent holes remain between foliage and structures. Export actual RGBA PNG transparency, not a visual representation of transparency. No text, no labels.
```

### cafe alpha retry prompt

```text
Edit the attached Erhai coffee illustration into a PNG asset with a TRANSPARENT BACKGROUND. The output file must contain a real alpha channel: background pixels are alpha 0, not RGB colors. Keep exactly the central cream parasol, coffee table/cups, wicker chairs, their wooden terrace, close potted plants/flowers and the small supporting stone-ground island. Remove all sky, mountains, lake water, boats, background buildings, distant terraces and upper hanging foliage. Preserve the original fine furniture/architecture shapes and gentle warm-afternoon illustration lighting. Same 1024x1536 canvas and center object scale; top 25% completely transparent. Let the silhouette follow individual plants and terrace supports with irregular alpha edges. Transparent holes remain between furniture and railings. Export actual RGBA PNG transparency, not a visual representation of transparency. No text, no labels.
```


## village

Edit target: `F:/playground/playground-ai/travel/assets/journey/village.webp`

Planned transparent asset (not delivered): `F:/playground/playground-ai/travel/assets/journey/layers/village.webp`

```text
Use case: background-extraction.
Asset type: a transparent midground landscape cutout layer for a continuous scrolling illustrated travel world.
Input image: the attached existing scene is the EDIT TARGET. Preserve its exact center landmark identity, architecture, delicate materials, paths, trees and intricate illustration style. Keep the same elevated three-quarter camera, same relative landmark size and placement, and the original 1024 x 1536 portrait canvas. Do not redesign the landmark or turn it into a toy.
Primary edit: remove ALL sky, distant mountains, background horizon, remote scenery and open lake. Replace every removed region with GENUINELY TRANSPARENT alpha. This must be an RGBA cutout, not an opaque white or colored background, not a checkerboard pattern painted into the image.
Composition: main object remains centered at the original scale through the middle/lower 65% of the canvas. The top quarter of the canvas must be entirely empty transparent alpha. Keep only a small connected local ground island under the retained landmark; use organic irregular edges on the left and right, with transparent gaps around fine foliage and structures. No solid rectangular backdrop, no horizon band, no full-width ground sheet. The foreground/lower edge may reach the bottom of the canvas naturally.
Lighting: unified gentle warm afternoon daylight, cream highlights and natural botanical colors, suitable for compositing over a shared sky, Cangshan mountain backdrop and jade-teal lake.
Constraints: maintain the source's precise architectural identity and polished intricate editorial miniature-illustration character. No new text, UI, labels, border or watermark. Produce a real transparent-alpha output.
Keep: the central cluster of ornate ivory Bai courtyard houses with grey curving tiled roofs and carved wood doors, their close flowering trees and garden plants, stone paths and the small bridge, a close golden-rice patch and the narrow local stream winding through a compact connected ground island. Preserve the visible courtyard and bridge shapes. Remove: the entire distant village, broad remote rice fields, lake, mountain range and sky. Only the retained compact village-and-stream island is opaque; all outside scenery becomes transparent.
```

## cafe

Edit target: `F:/playground/playground-ai/travel/assets/journey/cafe.webp`

Planned transparent asset (not delivered): `F:/playground/playground-ai/travel/assets/journey/layers/cafe.webp`

```text
Use case: background-extraction.
Asset type: a transparent midground landscape cutout layer for a continuous scrolling illustrated travel world.
Input image: the attached existing scene is the EDIT TARGET. Preserve its exact center landmark identity, architecture, delicate materials, paths, trees and intricate illustration style. Keep the same elevated three-quarter camera, same relative landmark size and placement, and the original 1024 x 1536 portrait canvas. Do not redesign the landmark or turn it into a toy.
Primary edit: remove ALL sky, distant mountains, background horizon, remote scenery and open lake. Replace every removed region with GENUINELY TRANSPARENT alpha. This must be an RGBA cutout, not an opaque white or colored background, not a checkerboard pattern painted into the image.
Composition: main object remains centered at the original scale through the middle/lower 65% of the canvas. The top quarter of the canvas must be entirely empty transparent alpha. Keep only a small connected local ground island under the retained landmark; use organic irregular edges on the left and right, with transparent gaps around fine foliage and structures. No solid rectangular backdrop, no horizon band, no full-width ground sheet. The foreground/lower edge may reach the bottom of the canvas naturally.
Lighting: unified gentle warm afternoon daylight, cream highlights and natural botanical colors, suitable for compositing over a shared sky, Cangshan mountain backdrop and jade-teal lake.
Constraints: maintain the source's precise architectural identity and polished intricate editorial miniature-illustration character. No new text, UI, labels, border or watermark. Produce a real transparent-alpha output.
Keep: the centered main wooden coffee terrace with its cream parasol, coffee table and cups, wicker chairs, nearby potted plants and flowers, wood support structure and only the small connected stone/ground edge immediately supporting this terrace. Preserve the original parasol, chair, table and deck geometry and their delicate details. Remove: ALL lake water, sailboats, mountain range, sky, remote shoreline/buildings, secondary distant terraces and the overhanging flowers in the upper quarter. Keep genuine transparent holes around the furniture, railings and fine foliage rather than filling them with sky/water.
```

## pier

Edit target: `F:/playground/playground-ai/travel/assets/journey/pier.webp`

Planned transparent asset (not delivered): `F:/playground/playground-ai/travel/assets/journey/layers/pier.webp`

```text
Use case: background-extraction.
Asset type: a transparent midground landscape cutout layer for a continuous scrolling illustrated travel world.
Input image: the attached existing scene is the EDIT TARGET. Preserve its exact center landmark identity, architecture, delicate materials, paths, trees and intricate illustration style. Keep the same elevated three-quarter camera, same relative landmark size and placement, and the original 1024 x 1536 portrait canvas. Do not redesign the landmark or turn it into a toy.
Primary edit: remove ALL sky, distant mountains, background horizon, remote scenery and open lake. Replace every removed region with GENUINELY TRANSPARENT alpha. This must be an RGBA cutout, not an opaque white or colored background, not a checkerboard pattern painted into the image.
Composition: main object remains centered at the original scale through the middle/lower 65% of the canvas. The top quarter of the canvas must be entirely empty transparent alpha. Keep only a small connected local ground island under the retained landmark; use organic irregular edges on the left and right, with transparent gaps around fine foliage and structures. No solid rectangular backdrop, no horizon band, no full-width ground sheet. The foreground/lower edge may reach the bottom of the canvas naturally.
Lighting: unified gentle warm afternoon daylight, cream highlights and natural botanical colors, suitable for compositing over a shared sky, Cangshan mountain backdrop and jade-teal lake.
Constraints: maintain the source's precise architectural identity and polished intricate editorial miniature-illustration character. No new text, UI, labels, border or watermark. Produce a real transparent-alpha output.
Keep: the exact centered long wooden pier and its posts/rope rails, the nearby small wooden boats, and the nearby red/orange water-sequoia foliage/trunks framing the pier. Retain their source geometry and delicate wood/leaf detail; leave natural transparent gaps between posts, boats and tree branches. Remove: ALL lake water and reflections, sun, sky, mountain range and distant buildings or shoreline. Color adjustment only: reduce the strong orange sunset sky-cast on the wood and boats so this cutout shares gentle warm AFTERNOON DAYLIGHT with the other destinations; retain the trees' naturally red-orange autumn foliage. No orange sky glow or rectangular water patch may remain.
```

## Current delivery status and provenance — 2026-09-13

The built-in edit tool returned RGB files with a painted checkerboard rather than actual transparency. All three first attempts and all three already-dispatched retries have 3 channels and `hasAlpha: false`. No transparent layer WebPs were produced. Further image-generation retries were stopped at the parent task request. No local matting or background removal has been performed; that step awaits user authorization.

The first-round edited RGB sources below were copied byte-for-byte without cropping, resizing, or processing. They retain useful landmark geometry for a possible later approved matting step, but **must not be loaded as transparent scene layers**. All are 1024 × 1536 PNGs.

### village retained RGB source

- Original edit target: `F:/playground/playground-ai/travel/assets/journey/village.webp`
- Built-in generation output: `C:/Users/15211/.codex/generated_images/01a09545-c53b-7801-ae6c-df7180078d98/exec-eed61a83-c505-47b2-9fc0-c5f12211ed6b.png`
- Retained source: `F:/playground/playground-ai/travel/assets/journey/layers/source-village.png`
- Verified metadata: 1024 × 1536, 3 channels, hasAlpha=false, 3401271 bytes.
- Already-dispatched retry output (also rejected for missing alpha): `C:/Users/15211/.codex/generated_images/01a09545-c53b-7801-ae6c-df7180078d98/exec-a21813c7-14e0-49a0-bca9-390f3a3c81e8.png`; 3 channels, hasAlpha=false.

### cafe retained RGB source

- Original edit target: `F:/playground/playground-ai/travel/assets/journey/cafe.webp`
- Built-in generation output: `C:/Users/15211/.codex/generated_images/01a09545-c53b-7801-ae6c-df7180078d98/exec-d7c4ab39-ce59-430d-bb7d-062dd0073a26.png`
- Retained source: `F:/playground/playground-ai/travel/assets/journey/layers/source-cafe.png`
- Verified metadata: 1024 × 1536, 3 channels, hasAlpha=false, 2724912 bytes.
- Already-dispatched retry output (also rejected for missing alpha): `C:/Users/15211/.codex/generated_images/01a09545-c53b-7801-ae6c-df7180078d98/exec-8f943033-708c-455c-b32b-eb40adee4abf.png`; 3 channels, hasAlpha=false.

### pier retained RGB source

- Original edit target: `F:/playground/playground-ai/travel/assets/journey/pier.webp`
- Built-in generation output: `C:/Users/15211/.codex/generated_images/01a09545-c53b-7801-ae6c-df7180078d98/exec-9ef1f6ef-d40b-4757-a59e-f61dcefb491a.png`
- Retained source: `F:/playground/playground-ai/travel/assets/journey/layers/source-pier.png`
- Verified metadata: 1024 × 1536, 3 channels, hasAlpha=false, 2694320 bytes.
- Already-dispatched retry output (also rejected for missing alpha): `C:/Users/15211/.codex/generated_images/01a09545-c53b-7801-ae6c-df7180078d98/exec-09417b10-0726-4f48-a113-19d2dcae19f1.png`; 3 channels, hasAlpha=false.
