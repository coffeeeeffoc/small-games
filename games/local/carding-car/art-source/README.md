# Kart source

Generated with Hyper3D Rodin Gen-2.5 Medium, 5,000 triangles, on 2026-09-18.

Result: https://hyper3d.ai/workspace/rodin/4d89eb76-2872-4f96-9062-7e7649b6e6f1

Generation budget used: 1 / 3 tasks. `kart.glb` is the original shaded model. The track, environment and fallback kart are original procedural geometry.

The mobile GLB uses the same mesh with a 512px JPEG instead of the 2048px texture, and an unlit material because lighting is baked into the shaded texture. Reproduce from the repository root with `python games/local/carding-car/scripts/optimize-kart.py` (Pillow required only for asset processing). Normal game builds use the checked-in optimized GLB and do not require Python.

Visual mesh only. Collision stays in `RaceManager` and never uses the generated mesh.
