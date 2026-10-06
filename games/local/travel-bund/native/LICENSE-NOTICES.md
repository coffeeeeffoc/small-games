# Native third-party sources

The generated copies are reproducible build outputs, not newly authored city or physics implementations.

- Original Scene.tsx / StreetLife.tsx / clouds.ts: games/local/travel-bund/src, repository project license.
- Three.js 0.180.0: MIT; package LICENSE copied to assets/licenses/three-MIT.txt.
- React 19.2.8: MIT; package LICENSE copied to assets/licenses/react-MIT.txt.
- @react-three/fiber (version pinned in pnpm-lock.yaml) and @react-three/rapier 2.2.0: MIT; their original module sources are bundled, with source inputs recorded in bundle-metafile.json.
- @dimforge/rapier3d-compat 0.19.2: Apache-2.0; original JS glue and rapier_wasm3d_bg.wasm, with only the host instantiate boundary changed. The package declares Apache-2.0 and does not ship a separate LICENSE file.
- Draco 1.5.7: Apache-2.0; official assets/bund/runtime/draco/draco_decoder.js, pure JS decoder. Original full Apache license copied to assets/licenses/Apache-2.0.txt.
- City runtime models: original pinned assets/bund/runtime, source submodule SHA and per-file hashes recorded in native-assets-manifest.json; remote delivery does not alter original authored geometry/materials.

Scene generation keeps original implementation and rewrites resource/Canvas/audio/diagnostic imports; Rapier generation removes the inline base64 duplicate and routes instantiation to genuine SDK WASM. Draco generation disables filesystem/browser-worker selection and preserves official asm.js decode logic. Run generate-sources.mjs --check after prepareNativeBuild to check canonical copies. All original lock-pinned module inputs remain listed in the esbuild metafile.
