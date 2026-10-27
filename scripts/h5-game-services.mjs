import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { competitionService } from './competition-service-config.mjs';

export const h5BasicServiceGames = [
  'carding-car',
  'vibeJam-myself-history-guess',
  'wulong-city',
  'night-overwatch',
  'letters-words2',
];

export async function prepareGameServices(
  game,
  directory,
  { env = process.env, local = false } = {},
) {
  if (!h5BasicServiceGames.includes(game)) throw Error('Unsupported basic service game');
  const config = { game, platform: 'h5', ...competitionService({ env, local }) };
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
  const index = path.join(directory, 'index.html');
  let html = await readFile(index, 'utf8');
  html = html.replace(
    /<script[^>]*src="\.\/(?:game-service-config\.js|game-services\/game-bootstrap\.js)"[^>]*><\/script>/g,
    '',
  );
  html = html.replace(
    /<head(?:\s[^>]*)?>/i,
    (head) =>
      `${head}<script src="./game-service-config.js"></script><script type="module" src="./game-services/game-bootstrap.js"></script>`,
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
  const { game, platform } = JSON.parse(match[1]);
  if (platform !== 'h5') throw Error('Unsupported basic service platform');
  await prepareGameServices(game, path.dirname(filename), { env, local });
  return true;
}
