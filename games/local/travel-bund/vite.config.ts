import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  base: './',
  // One source of truth: Vite serves the submodule directly, and packages it only in dist.
  publicDir: fileURLToPath(new URL('../../../assets/bund/runtime', import.meta.url)),
  plugins: [react()],
  build: {
    // Rapier's WASM is embedded in its JS module; cache that payload independently.
    chunkSizeWarningLimit: 2500,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'physics', test: /@dimforge[\\/]/, includeDependenciesRecursively: false },
          ],
        },
      },
    },
  },
});
