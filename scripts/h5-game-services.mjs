import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
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
  for (const name of ['client.js', 'game-services.js', 'game-bootstrap.js'])
    await copyFile(
      new URL(`../platforms/competition/${name}`, import.meta.url),
      path.join(servicesDir, name),
    );
  if (game === 'night-overwatch')
    for (const file of nightStorageFiles) {
      await mkdir(path.dirname(path.join(servicesDir, file)), { recursive: true });
      await copyFile(
        new URL('../platforms/competition/' + file, import.meta.url),
        path.join(servicesDir, file),
      );
    }
  if (tapAppId) {
    for (const name of ['competition-identity.mjs', 'calls.mjs'])
      await copyFile(
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
    /<script[^>]*src="\.\/game-services\/night-storage\.js"[^>]*><\/script>/g,
    '',
  );
  html = html.replace(
    /<script[^>]*src="\.\/(?:game-service-config\.js|game-services\/game-bootstrap\.js)"[^>]*><\/script>/g,
    '',
  );
  html = html.replace(
    /<head(?:\s[^>]*)?>/i,
    (head) =>
      `${head}${game === 'night-overwatch' ? '<script src="./game-services/night-storage.js"></script>' : ''}<script src="./game-service-config.js"></script><script type="module" src="./game-services/game-bootstrap.js"></script>`,
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
  const { game, platform, appId, identityProvider, release } = JSON.parse(match[1]);
  if (platform !== 'h5') throw Error('Unsupported basic service platform');
  await prepareGameServices(game, path.dirname(filename), {
    env,
    local,
    tapAppId: identityProvider === 'taptap' ? appId : '',
  });
  if (game === 'night-overwatch') await stampNightBuild(path.dirname(filename), release?.channel);
  return true;
}

/** Stamp after all public channel/configuration edits; ZIP integrity remains a separate hash. */
export async function stampNightBuild(directory, channel = 'web-h5') {
  if (!['web-h5', 'taptap-h5'].includes(channel)) throw Error('Invalid Night build channel');
  const filename = path.join(directory, 'game-service-config.js');
  const source = await readFile(filename, 'utf8');
  const match = source.match(
    /^globalThis\.__COMPETITION_CONFIG__ = Object\.freeze\((\{[^]*\})\);\s*$/,
  );
  if (!match) throw Error('Invalid basic service configuration');
  const config = JSON.parse(match[1]);
  if (config.game !== 'night-overwatch' || config.platform !== 'h5')
    throw Error('Invalid Night build');
  const versions = {};
  for (const [kind, file, symbol] of [
    ['ranked', 'Replay', 'RANKED_RULE_VERSION'],
    ['multiplayer', 'Duel', 'DUEL_VERSION'],
  ]) {
    const code = await readFile(
      new URL(`../games/local/night-overwatch/assets/scripts/core/${file}.ts`, import.meta.url),
      'utf8',
    );
    const version = code.match(new RegExp(`export const ${symbol} = '([A-Za-z0-9._-]+)'`))?.[1];
    if (!version) throw Error('Missing Night rule version');
    versions[kind] = version;
  }
  config.release = { channel, ...versions };
  const serialize = () =>
    `globalThis.__COMPETITION_CONFIG__ = Object.freeze(${JSON.stringify(config)});\n`;
  const files = [];
  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (entry.isDirectory()) continue;
    if (!entry.isFile()) throw Error('Night build cannot contain linked files');
    files.push(
      path.relative(directory, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/'),
    );
  }
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    const bytes =
      file === 'game-service-config.js'
        ? Buffer.from(serialize())
        : await readFile(path.join(directory, file));
    hash.update(file + '\0' + bytes.length + '\0').update(bytes);
  }
  config.release.buildId = 'night-' + hash.digest('hex');
  await writeFile(filename, serialize());
  return config.release;
}
