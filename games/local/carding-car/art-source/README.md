# Kart source (legacy)

Generated with Hyper3D Rodin Gen-2.5 Medium, 5,000 triangles, on 2026-09-18.

Result: https://hyper3d.ai/workspace/rodin/4d89eb76-2872-4f96-9062-7e7649b6e6f1

`kart.glb` is the archived first prototype model. Current art comes from the independent [`assets/carding-car`](../../../../assets/carding-car/README.md) submodule.

The expansion library (7 theme references, 10 vehicles, 10 drivers and 12 items) lives exclusively in [`assets/carding-car/expansion`](../../../../assets/carding-car/expansion/README.md). Its source models, concepts, textures, previews and generation scripts are versioned in that asset repository. Run `python assets/carding-car/expansion/check-assets.py --complete` from the small-games root to validate it. The game uses the derived `runtime-expansion` pack; `build-expansion.py` rebuilds it, including the three independent highland props from `build-highland-props.py`. Whole reference dioramas no longer supply the theme layout or driving surface.

Run `python assets/carding-car/build-mobile.py` from the repository root to regenerate reusable mobile models (Pillow required only for this export). Normal game builds copy `assets/carding-car/runtime` into ignored Creator resource files and do not need Python. Creator `.meta` files remain tracked for stable asset identities. Source hashes include the external runtime files.

Visual mesh only. Collision stays in `RaceManager` and never uses the generated mesh.
