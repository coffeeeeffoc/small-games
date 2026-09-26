import { parseArgs } from 'node:util';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'vite';
import { games, platforms } from './games.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const repo = path.resolve(root, '../..');
const { values } = parseArgs({
  options: {
    platform: { type: 'string' },
    game: { type: 'string' },
    'app-id': { type: 'string' },
    'ad-unit-id': { type: 'string' },
    config: { type: 'string' },
    preview: { type: 'boolean' },
    all: { type: 'boolean' },
  },
});
let config = {};
if (values.config) config = JSON.parse(await readFile(path.resolve(values.config), 'utf8'));
if (values.all && (values.platform || values.game || values['app-id'] || values['ad-unit-id']))
  throw new Error('--all uses per-game configuration, not single-target flags');
if (
  !values.all &&
  (!Object.hasOwn(platforms, values.platform) || !Object.hasOwn(games, values.game))
)
  throw new Error(
    `Choose --platform ${Object.keys(platforms).join('|')} --game ${Object.keys(games).join('|')}`,
  );
const targets = values.all
  ? Object.keys(games).flatMap((game) =>
      Object.keys(platforms).map((platform) => ({ game, platform })),
    )
  : [{ game: values.game, platform: values.platform }];
const checked = targets.map(({ game, platform }) => {
  const options = config[game]?.[platform] ?? {};
  const appId = values['app-id'] ?? options.appId ?? '';
  const adUnitId = values['ad-unit-id'] ?? options.adUnitId ?? '';
  if (typeof appId !== 'string' || (appId && !platforms[platform].appId.test(appId)))
    throw new Error(`Invalid ${platform}/${game} AppID`);
  if (!values.preview && !appId)
    throw new Error(`Release needs ${platform}/${game} AppID; use --preview only for local checks`);
  if (typeof adUnitId !== 'string' || (adUnitId && !/^[\w-]+$/.test(adUnitId)))
    throw new Error('Invalid advertising placement');
  return { game, platform, appId, adUnitId };
});

for (const { game, platform, appId, adUnitId } of checked) {
  const selected = games[game],
    adapter = platforms[platform];
  const gameRoot = path.join(repo, 'games/local', `game-${game}`);
  const manifest = JSON.parse(await readFile(path.join(gameRoot, 'src/manifest.json'), 'utf8'));
  const version = manifest.version;
  const outDir = path.join(root, 'dist', platform, game);
  const virtual = '\0standalone-game';
  const entry = path.join(root, 'src/index.ts').replaceAll('\\', '/');
  await build({
    configFile: false,
    root,
    publicDir: false,
    build: {
      outDir,
      emptyOutDir: true,
      minify: false,
      lib: { entry, formats: ['cjs'], fileName: () => 'game.js' },
    },
    plugins: [
      {
        name: 'single-reviewed-game',
        enforce: 'pre',
        resolveId(id) {
          if (id.replaceAll('\\', '/') === entry) return virtual;
        },
        load(id) {
          if (id !== virtual) return;
          return `import { ${adapter.start} } from ${JSON.stringify(adapter.module)};
          import { ${selected.definition} as original, ${selected.content} as content } from '@coffeeeeffoc/game-${game}/canvas';
          const definition = { ...original, manifest: { ...original.manifest, entry: 'game.js', loadModes: ['native-package'] } };
          export const ready = ${adapter.start}(${adapter.sdk}, { definition, content }, ${adapter.entryArguments({ title: selected.title, adUnitId })});
          ready.catch(error => { console.error('小游戏启动失败', error); });`;
        },
        async generateBundle() {
          for (const [fileName, config] of Object.entries(
            adapter.files({ game, appId, version }),
          )) {
            this.emitFile({ type: 'asset', fileName, source: JSON.stringify(config, null, 2) });
          }
          for (const asset of selected.assets) {
            const directory = path.join(gameRoot, asset.source);
            for (const relative of await readdir(directory, { recursive: true })) {
              if (!/\.(wav|aac|mp3|png|webp|jpg)$/i.test(relative)) continue;
              this.emitFile({
                type: 'asset',
                fileName: `${asset.target}/${relative.replaceAll('\\', '/')}`,
                source: await readFile(path.join(directory, relative)),
              });
            }
          }
        },
      },
    ],
  });
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, 'release.json'),
    JSON.stringify(
      {
        platform,
        gameId: game,
        title: selected.title,
        appId,
        version,
        mode: values.preview ? 'preview' : 'release',
        advertisingConfigured: !!adUnitId,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `${platform}/${game}: ${values.preview ? 'PREVIEW (not a release)' : 'release'} -> ${outDir}`,
  );
}
