import { defineConfig } from 'vite';
import cultivationManifest from '@coffeeeeffoc/game-cultivation/manifest';

export default defineConfig({
  define: { BILIBILI_AD_UNIT_ID: JSON.stringify(process.env.BILIBILI_AD_UNIT_ID ?? '') },
  build: {
    minify: false,
    lib: {
      entry: { game: 'src/native.ts', 'cultivation/game': 'src/entry.ts' },
      formats: ['cjs'],
      fileName: (_format, name) => `${name}.js`,
    },
    rollupOptions: {
      external: ['./cultivation/game.js'],
      output: { chunkFileNames: 'shared/[name].js' },
    },
  },
  plugins: [
    {
      name: 'reviewed-package-manifests',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'game.json',
          source: JSON.stringify(
            {
              deviceOrientation: 'portrait',
              subpackages: [{ name: 'cultivation', root: 'cultivation/' }],
            },
            null,
            2,
          ),
        });
        this.emitFile({
          type: 'asset',
          fileName: 'cultivation/manifest.json',
          source: JSON.stringify(
            {
              ...cultivationManifest,
              entry: 'cultivation/game.js',
              loadModes: ['bilibili-subpackage'],
            },
            null,
            2,
          ),
        });
      },
    },
  ],
});
