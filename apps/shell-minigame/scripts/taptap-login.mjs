import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { nineGames } from './nine-games-targets.mjs';
import { tapTapApiBase } from '../../../platforms/taptap/login.cjs';

const helper = new URL('../../../platforms/taptap/login.cjs', import.meta.url);
const marker = '// TapTap login bootstrap: install before the official packing step.\n';

export function publicTapTapLoginConfig(config) {
  if (config?.platform !== 'taptap') throw new Error('TapTap login requires the TapTap platform.');
  if (!nineGames.some((game) => game.id === config.game))
    throw new Error('Unknown frozen TapTap login game.');
  if (
    typeof config.appId !== 'string' ||
    (config.appId && !/^[A-Za-z0-9_-]{1,100}$/.test(config.appId))
  )
    throw new Error('Invalid public TapTap MiniApp ID.');
  if (typeof config.apiUrl !== 'string') throw new Error('Invalid public TapTap login API URL.');
  if (config.apiUrl) {
    tapTapApiBase(config.apiUrl);
    let url;
    try {
      url = new URL(config.apiUrl);
    } catch {
      throw new Error('TapTap login requires public HTTPS.');
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      throw new Error(
        'TapTap login requires public HTTPS without credentials, query or fragments.',
      );
  }
  if (!config.preview && (!config.appId || !config.apiUrl))
    throw new Error('TapTap release requires a MiniApp ID and the server login API URL.');
  return {
    platform: 'taptap',
    game: config.game,
    appId: config.appId || '',
    apiUrl: config.apiUrl ? tapTapApiBase(config.apiUrl) : '',
  };
}

export function tapTapLoginPrefix(config) {
  const encoded = JSON.stringify(publicTapTapLoginConfig(config));
  return (
    `${marker}globalThis.__COMPETITION_CONFIG__=Object.assign({},globalThis.__COMPETITION_CONFIG__||{},${encoded});\n` +
    `globalThis.__tapTapLogin=require('./tap-login.js').startTapTapLogin(typeof tap==='undefined'?undefined:tap,${encoded});\n`
  );
}

/** Modify a source project before running the official packer, never a supplied ZIP. */
export async function installTapTapLogin(directory, config) {
  const entry = path.join(directory, 'game.js');
  let source = await readFile(entry, 'utf8');
  if (source.startsWith(marker)) {
    const end = source.indexOf('\n', source.indexOf('\n') + 1);
    const thirdLine = source.indexOf('\n', end + 1);
    if (thirdLine < 0) throw new Error('Incomplete previous TapTap login bootstrap.');
    source = source.slice(thirdLine + 1);
  }
  await writeFile(path.join(directory, 'tap-login.js'), await readFile(helper));
  await writeFile(entry, tapTapLoginPrefix(config) + source);
  return verifyTapTapLogin(directory, config);
}

export async function verifyTapTapLogin(directory, config) {
  const [entry, expected, actual] = await Promise.all([
    readFile(path.join(directory, 'game.js'), 'utf8'),
    readFile(helper),
    readFile(path.join(directory, 'tap-login.js')),
  ]);
  if (!entry.startsWith(tapTapLoginPrefix(config)) || !actual.equals(expected))
    throw new Error(
      'TapTap source login bootstrap differs from the current public config or helper.',
    );
  return {
    configured: Boolean(config.appId && config.apiUrl),
    platform: 'taptap',
    serverIdentityVerified: false,
    realDeviceVerified: false,
  };
}

export const tapTapLoginHelperPath = fileURLToPath(helper);
