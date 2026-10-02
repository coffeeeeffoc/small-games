# Dali travel world map

Mode: built-in `image_gen.imagegen`, new image generation. No input images or postprocessing.

Asset: `assets/dali-map.png`, 1536 × 1024 pixels, original PNG.

Delivery derivative: `assets/dali-map.webp`, 1536 × 1024 pixels, 643742 bytes. Encoded with existing sharp 0.34.5 at WebP quality 88; no resampling or cropping. Original PNG preserved.

Observed landmark centers (normalized from top-left): pagoda 20%, 25%; flower meadow 47%, 22%; Bai village 77%, 24%; old town 25%, 49%; lakeside cafe 82%, 56%; wooden pier 52%, 71%; starting path 47%, 85%. These are visual anchor estimates for placing interaction markers.

## Final prompt

Use case: illustration-story.
Asset type: the playable world-map background of a mobile H5 travel exploration game; landscape aspect ratio 3:2, ideally 1536 by 1024 pixels.
Primary request: A beautiful, richly detailed hand-illustrated isometric travel map inspired by Dali, Yunnan, China, using painterly gouache on warm ivory paper with fine organic grain and exquisite miniature landscape details.
Scene and composition: full-bleed landscape with a soft turquoise Erhai lake in the center and lower-right. Rolling sage green Cangshan mountains with lightly snowy peaks in the upper-left, picturesque trails winding across the land and along the shoreline. A coherent explorable landscape, imagined rather than a geographically exact map. View the land from a gently elevated isometric perspective; friendly premium illustrated travel-journal aesthetic, collectible storybook feel. Sunny, peaceful, inviting, refined and sophisticated.
The six clearly distinct destinations must appear at these image percentages measured from top-left: a cluster of three elegant pale pagoda towers centered at x21% y29%; a wildflower mountain meadow centered at x47% y24%; a Bai traditional village with white walls, elegant gray roof tiles and a few terracotta accents at x71% y28%; a densely charming old town of warm terracotta roofs centered x25% y58%; a small lakeside cafe with orange parasols centered x78% y66%; a wooden lakeside pier with one tiny sailboat centered x51% y78%. At x47% y90%, leave an empty inviting starting trail on land, accessible along a continuous winding path to the other places. Ensure the starting trail and landmarks are on connected land around the lake.
Supportive details: individual leafy trees, farm plots, tiny cyclists on a path, subtle puffy clouds near mountains, reeds and shore birds. A few delicate flowers in the foreground. Preserve a little uncluttered open space near each landmark for later interactive UI labels.
Palette: warm ivory, sage green, soft lake turquoise, terracotta, muted mustard pathways. Soft dimensional shadows, gentle sunlight, delicate hand-painted contours. Visually dense and crafted but readable on a phone.
Text: none.
Strict constraints: only the illustrated landscape; no lettering of any language, no legend, no map labels, no compass, no icons, no UI, no interface chrome, no location pins, no numbers, no border, no watermark, no logo, no emojis. Not photorealistic, not 3D plastic, not generic vector clip art.
