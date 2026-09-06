import { defineConfig } from 'vite';
import cultivationManifest from '@coffeeeeffoc/game-cultivation/manifest';
import officeManifest from '@coffeeeeffoc/game-office/manifest';
import arenaManifest from '@coffeeeeffoc/game-arena/manifest';

export default defineConfig({
  define: { BILIBILI_AD_UNIT_ID: JSON.stringify(process.env.BILIBILI_AD_UNIT_ID ?? '') },
  build: {
    minify: false,
    lib: {
      entry: {
        game: 'src/native.ts',
        'cultivation/game': 'src/entry.ts',
        'office/game': 'src/office.ts',
        'arena/game': 'src/arena.ts',
      },
      formats: ['cjs'],
      fileName: (_format, name) => `${name}.js`,
    },
    rollupOptions: {
      external: ['./cultivation/game.js', './office/game.js', './arena/game.js'],
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
              subpackages: [
                { name: 'cultivation', root: 'cultivation/' },
                { name: 'office', root: 'office/' },
                { name: 'arena', root: 'arena/' },
              ],
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
        for (const [name, manifest] of [
          ['office', officeManifest],
          ['arena', arenaManifest],
        ] as const)
          this.emitFile({
            type: 'asset',
            fileName: `${name}/manifest.json`,
            source: JSON.stringify(
              { ...manifest, entry: `${name}/game.js`, loadModes: ['bilibili-subpackage'] },
              null,
              2,
            ),
          });
      },
    },
  ],
});
