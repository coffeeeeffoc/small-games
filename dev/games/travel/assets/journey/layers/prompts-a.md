# Journey midground layers — edit provenance

## Transparent midground edit attempts — 2026-09-12

Tool: built-in `image_gen.imagegen`; each existing source was inspected before editing. Required: actual PNG RGBA transparency, then quality-90 WebP. Validation: all three first-pass PNGs were 1024×1536 RGB (`channels: 3`, `hasAlpha: false`), with a rendered checkerboard instead of alpha. They are rejected for runtime use. No background removal was performed in code and no layer WebP was produced from these invalid inputs.

### oldtown

- Source: `F:/playground/playground-ai/travel/assets/journey/oldtown.webp`
- Generated draft, rejected alpha: `C:/Users/15211/.codex/generated_images/01a09551-3228-7432-a182-cd16144bad36/exec-b594d50b-b1d9-45c4-9d4f-6879031808d5.png`
- Intended delivery, not yet produced: `assets/journey/layers/oldtown.webp`

Exact edit prompt:

```text
Use case: background-extraction. This is an EDIT of the supplied image, not a new scene. Produce a PNG with GENUINELY TRANSPARENT RGBA background and clean antialiased alpha, on the same 1024 x 1536 portrait canvas. Remove all sky, clouds, distant mountains, far background town and distant horizon to transparent pixels. Retain the exact existing central landmark architecture, perspective, fine texture and painterly dimensional miniature illustration style; do not invent any architecture. Keep its existing scale and relationships. Retain a connected limited near-ground and vegetation island, not a full rectangular background sheet. Outer left and right boundaries must follow organic silhouettes of individual plants, stone and roof edges, with empty transparent space around them. No solid white, cream, grey, checkerboard or colored background: all empty background is true alpha. The upper quarter of the canvas must be entirely transparent. Keep warm gentle afternoon light with creamy ivory and natural green foliage, not an orange sunset. No text, UI, border, logos or watermark. This transparent midground layer will be composited over a shared sky, mountains and lake in a continuous scrolling world.
Preserve the existing central Dali city gate, its exact tower roofs, arched stone doorway and the curving street leading toward it. Keep the connected near Bai courtyard houses immediately around that street, their detailed wooden doors and grey tiles, flowering trees and tiny people. Remove all distant townscape behind the main gate. Trim the left and right farthest foreground houses and ground down to a cohesive organic street-and-garden island centered in the image with transparent edges; avoid cutting architectural details in half. Keep the street reaching the bottom center if needed. Do not alter the gate or add towers. No distant landscape of any kind.
```

### pagodas

- Source: `F:/playground/playground-ai/travel/assets/journey/pagodas.webp`
- Generated draft, rejected alpha: `C:/Users/15211/.codex/generated_images/01a09551-3228-7432-a182-cd16144bad36/exec-033a8977-1bbd-48bc-861a-573656dcbf9f.png`
- Intended delivery, not yet produced: `assets/journey/layers/pagodas.webp`

Exact edit prompt:

```text
Use case: background-extraction. This is an EDIT of the supplied image, not a new scene. Produce a PNG with GENUINELY TRANSPARENT RGBA background and clean antialiased alpha, on the same 1024 x 1536 portrait canvas. Remove all sky, clouds, distant mountains, far background town and distant horizon to transparent pixels. Retain the exact existing central landmark architecture, perspective, fine texture and painterly dimensional miniature illustration style; do not invent any architecture. Keep its existing scale and relationships. Retain a connected limited near-ground and vegetation island, not a full rectangular background sheet. Outer left and right boundaries must follow organic silhouettes of individual plants, stone and roof edges, with empty transparent space around them. No solid white, cream, grey, checkerboard or colored background: all empty background is true alpha. The upper quarter of the canvas must be entirely transparent. Keep warm gentle afternoon light with creamy ivory and natural green foliage, not an orange sunset. No text, UI, border, logos or watermark. This transparent midground layer will be composited over a shared sky, mountains and lake in a continuous scrolling world.
Preserve exactly the THREE existing pagodas: tall central square dense-eaves pagoda plus the two smaller flanking pagodas, their exact architecture and relative sizes, with the connected nearer temple buildings and lush garden around their bases. Remove distant mountains, distant town, all sky, far lake and the wide foreground pond/reflections to transparency. Keep only a small connected garden and rocky shoreline ground island beneath the pagodas, with organic vegetation edges, no rectangular pond. Shift the retained composition downward only enough (about 150 pixels) for the central spire to begin below the top 25% transparent margin, keeping the towers' original sizes and relative geometry. Do not introduce any extra tower, gate or building.
```

### meadow

- Source: `F:/playground/playground-ai/travel/assets/journey/meadow.webp`
- Generated draft, rejected alpha: `C:/Users/15211/.codex/generated_images/01a09551-3228-7432-a182-cd16144bad36/exec-cb9bb050-8ac9-4dad-9bbd-4901017aeab3.png`
- Intended delivery, not yet produced: `assets/journey/layers/meadow.webp`

Exact edit prompt:

```text
Use case: background-extraction. This is an EDIT of the supplied image, not a new scene. Produce a PNG with GENUINELY TRANSPARENT RGBA background and clean antialiased alpha, on the same 1024 x 1536 portrait canvas. Remove all sky, clouds, distant mountains, far background town and distant horizon to transparent pixels. Retain the exact existing central landmark architecture, perspective, fine texture and painterly dimensional miniature illustration style; do not invent any architecture. Keep its existing scale and relationships. Retain a connected limited near-ground and vegetation island, not a full rectangular background sheet. Outer left and right boundaries must follow organic silhouettes of individual plants, stone and roof edges, with empty transparent space around them. No solid white, cream, grey, checkerboard or colored background: all empty background is true alpha. The upper quarter of the canvas must be entirely transparent. Keep warm gentle afternoon light with creamy ivory and natural green foliage, not an orange sunset. No text, UI, border, logos or watermark. This transparent midground layer will be composited over a shared sky, mountains and lake in a continuous scrolling world.
Preserve the winding foreground stone-and-earth footpath, fine wildflowers, nearby mossy rocks, the tiny hikers and the nearer grass-covered ridge bushes. Remove every distant blue-green mountain, background valley, cloud, mist sky and far horizon to transparent alpha. The remaining subject is a connected organic flower-meadow and path island, with near plants forming irregular edges on both sides; the path may reach the bottom center of the canvas. Retain only nearby foliage and the near meadow ridge. Keep all texture and intricate flower detail from the original. Do not add a gate, urban architecture, pagodas, or any new subject.
```

### RGBA correction retry

The following exact prompt was sent using the rejected oldtown and pagodas PNG drafts as reference. Oldtown retry `C:/Users/15211/.codex/generated_images/01a09551-3228-7432-a182-cd16144bad36/exec-c55c5fbc-23fd-4ffd-ad3c-7be223e97a0d.png` again returned RGB (`channels: 3`, `hasAlpha: false`) and was rejected. Pagodas retry is being verified separately.

```text
EDIT the supplied cutout. The checkerboard visible in the supplied image is a failed transparency preview that was accidentally baked into RGB. Erase that checkerboard completely and return the retained subject on an ACTUAL transparent PNG alpha channel, NOT an RGB image containing a transparency pattern. Set output background to transparent. The result must be an RGBA PNG, where empty background pixels have alpha=0. Do not draw any checkerboard, white matte, grey matte, colored backdrop or backdrop of any kind. Every pixel outside the miniature subject silhouette, including the upper empty space and gaps between leaves, must have zero alpha. Preserve the subject exactly: the same architecture, organic ground island, individual plants and people, warm light, exact scale, framing and 1024x1536 portrait canvas. Change only the actual background transparency and no artistic content.
```



### Final retry validation and retained RGB cutout sources

Pagodas correction retry `C:/Users/15211/.codex/generated_images/01a09551-3228-7432-a182-cd16144bad36/exec-043bcffb-1cec-4022-9716-180a15f24149.png` also returned RGB (`channels: 3`, `hasAlpha: false`). Further transparency retries stopped. The first-pass cutout drafts retain the best organic silhouettes and are copied unchanged for a possible later, separately authorized processing step:

| Scene | RGB source file | Pixels | Bytes | Actual alpha |
| --- | --- | --- | --- | --- |
| oldtown | `assets/journey/layers/source-oldtown.png` | 1024 × 1536 | 2966906 | None |
| pagodas | `assets/journey/layers/source-pagodas.png` | 1024 × 1536 | 2296133 | None |
| meadow | `assets/journey/layers/source-meadow.png` | 1024 × 1536 | 3059339 | None |

These source PNGs visibly contain a baked checkerboard and must not be loaded as transparent runtime layers. Their upper 300 rows are background-only; maximum RGB chroma there is 10/255 for each source, while the checkerboard brightness and square geometry vary across images. Oldtown includes grey stone/roof and ivory walls, and pagodas contains near-white architecture: a global grey/white color key would damage foreground. No pixel masking, background removal or final WebP conversion has been performed for this edit task.
