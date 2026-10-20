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
