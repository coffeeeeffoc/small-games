import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nightStorageFiles } from '../platforms/competition/night-storage/manifest.mjs';
import { competitionService } from './competition-service-config.mjs';

export const h5BasicServiceGames = [
  'carding-car',
  'vibeJam-myself-history-guess',
  'wulong-city',
  'night-overwatch',
  'letters-words2',
  'tetracube',
];

// Shared service sources use modern syntax that older Android WebViews reject before any
// fallback can run. Lower syntax here; runtime APIs come from legacy-polyfills.js.
export const legacySyntaxTarget = 'es2018';
async function copyLowered(source, target) {
  const file = fileURLToPath(source);
  const { transformWithOxc } = await import('vite');
  const { code } = await transformWithOxc(await readFile(file, 'utf8'), file, {
    target: legacySyntaxTarget,
    lang: 'js',
  });
  if (code.includes('@oxc-project/runtime'))
    throw Error(`Lowering ${path.basename(file)} needs runtime helpers; avoid that syntax`);
  await writeFile(target, code);
}

export async function prepareGameServices(
  game,
  directory,
  { env = process.env, local = false, tapAppId = '' } = {},
) {
  if (!h5BasicServiceGames.includes(game)) throw Error('Unsupported basic service game');
  const config = { game, platform: 'h5', ...competitionService({ env, local }) };
  if (tapAppId && (game !== 'night-overwatch' || !/^tap[A-Za-z0-9_-]{4,96}$/.test(tapAppId)))
    throw Error('Invalid TapTap identity application');
  if (tapAppId) Object.assign(config, { appId: tapAppId, identityProvider: 'taptap' });
  await writeFile(
    path.join(directory, 'game-service-config.js'),
    `globalThis.__COMPETITION_CONFIG__ = Object.freeze(${JSON.stringify(config)});\n`,
  );
  const servicesDir = path.join(directory, 'game-services');
  await mkdir(servicesDir, { recursive: true });
  for (const name of ['legacy-polyfills.js', 'client.js', 'game-services.js', 'game-bootstrap.js'])
    await copyLowered(
      new URL(`../platforms/competition/${name}`, import.meta.url),
      path.join(servicesDir, name),
    );
  if (game === 'night-overwatch')
    for (const file of nightStorageFiles) {
      await mkdir(path.dirname(path.join(servicesDir, file)), { recursive: true });
      await copyLowered(
        new URL('../platforms/competition/' + file, import.meta.url),
        path.join(servicesDir, file),
      );
    }
  if (tapAppId) {
    for (const name of ['competition-identity.mjs', 'calls.mjs'])
      await copyLowered(
        new URL(`../platforms/taptap/${name}`, import.meta.url),
        path.join(servicesDir, name),
      );
    const bootstrap = path.join(servicesDir, 'game-bootstrap.js');
    await writeFile(
      bootstrap,
      `import './client.js';\nimport {installTapCompetitionIdentity} from './competition-identity.mjs';\ninstallTapCompetitionIdentity();\n` +
        (await readFile(bootstrap, 'utf8')),
    );
  }
  const index = path.join(directory, 'index.html');
  let html = await readFile(index, 'utf8');
  html = html.replace(
    /<script[^>]*src="\.\/game-services\/(?:night-storage|legacy-polyfills)\.js"[^>]*><\/script>/g,
    '',
  );
  html = html.replace(
    /<script[^>]*src="\.\/(?:game-service-config\.js|game-services\/game-bootstrap\.js)"[^>]*><\/script>/g,
    '',
  );
  html = html.replace(
    /<head(?:\s[^>]*)?>/i,
    (head) =>
      `${head}<script src="./game-services/legacy-polyfills.js"></script>${game === 'night-overwatch' ? '<script src="./game-services/night-storage.js"></script>' : ''}<script src="./game-service-config.js"></script><script type="module" src="./game-services/game-bootstrap.js"></script>`,
  );
  if (game === 'night-overwatch')
    html = html.replace(
      '<script src="./dev-mode.js"></script>',
      '<script>globalThis.__nightDevModeReady = globalThis.__nightStorageReady?.then(() => import("./dev-mode.js")); void globalThis.__nightDevModeReady?.catch(() => {});</script>',
    );
  await writeFile(index, html);
  return config;
}

export async function reconfigureGameServices(filename, env, local = false) {
  const html = await readFile(filename, 'utf8');
  if (!/<script[^>]*src=["']\.\/game-service-config\.js["'][^>]*><\/script>/.test(html))
    return false;
  const source = await readFile(
    path.join(path.dirname(filename), 'game-service-config.js'),
    'utf8',
  );
  const match = source.match(
    /^globalThis\.__COMPETITION_CONFIG__ = Object\.freeze\((\{[^]*\})\);\s*$/,
  );
  if (!match) throw Error('Invalid basic service configuration');
  const { game, platform, appId, identityProvider } = JSON.parse(match[1]);
  if (platform !== 'h5') throw Error('Unsupported basic service platform');
  await prepareGameServices(game, path.dirname(filename), {
    env,
    local,
    tapAppId: identityProvider === 'taptap' ? appId : '',
  });
  return true;
}
