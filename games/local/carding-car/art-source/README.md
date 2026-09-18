# Kart source (legacy)

Generated with Hyper3D Rodin Gen-2.5 Medium, 5,000 triangles, on 2026-09-18.

Result: https://hyper3d.ai/workspace/rodin/4d89eb76-2872-4f96-9062-7e7649b6e6f1

`kart.glb` is the archived first prototype model. Current art comes from the independent [`assets/carding-car`](../../../../assets/carding-car/README.md) submodule.

Run `python assets/carding-car/build-mobile.py` from the repository root to regenerate reusable mobile models (Pillow required only for this export). Normal game builds copy `assets/carding-car/runtime` into ignored Creator resource files and do not need Python. Creator `.meta` files remain tracked for stable asset identities. Source hashes include the external runtime files.

Visual mesh only. Collision stays in `RaceManager` and never uses the generated mesh.
