import { defineConfig } from 'vite';
import { readFile, readdir } from 'node:fs/promises';
import cultivationManifest from '@coffeeeeffoc/game-cultivation/manifest';
import cricketManifest from '@coffeeeeffoc/game-cricket/manifest';
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
        'cricket/game': 'src/cricket.ts',
      },
      formats: ['cjs'],
      fileName: (_format, name) => `${name}.js`,
    },
    rollupOptions: {
      external: [
        './cultivation/game.js',
        './office/game.js',
        './arena/game.js',
        './cricket/game.js',
      ],
      output: { chunkFileNames: 'shared/[name].js' },
    },
  },
  plugins: [
    {
      name: 'reviewed-package-manifests',
      async generateBundle() {
        const arenaAudio = new URL('../game-arena/public/arena-audio/', import.meta.url);
        for (const file of await readdir(arenaAudio)) {
          this.emitFile({
            type: 'asset',
            fileName: `arena/arena-audio/${file}`,
            source: await readFile(new URL(file, arenaAudio)),
          });
        }
        const assets = new URL('../game-office/public/office-scene/', import.meta.url);
        for (const file of await readdir(assets, { recursive: true })) {
          if (!/\.(png|jpe?g|webp|mp3|aac|wav)$/i.test(file)) continue;
          const relative = file.replaceAll('\\', '/');
          this.emitFile({
            type: 'asset',
            fileName: `office/office-scene/${relative}`,
            source: await readFile(new URL(relative, assets)),
          });
        }
        this.emitFile({
          type: 'asset',
          fileName: 'game.json',
          source: JSON.stringify(
            {
              deviceOrientation: 'portrait',
              subpackages: [
                { name: 'cultivation', root: 'cultivation/' },
                { name: 'office', root: 'office/' },
                { name: 'cricket', root: 'cricket/' },
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
          ['cricket', cricketManifest],
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
