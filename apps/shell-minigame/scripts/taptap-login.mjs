import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tapTapTarget } from './taptap-targets.mjs';
import { tapTapApiBase } from '@coffeeeeffoc/platform-taptap/login';
import { serviceGames } from '../../../scripts/competition-service-config.mjs';

const helper = new URL(import.meta.resolve('@coffeeeeffoc/platform-taptap/login'));
const identityClient = new URL('../../../platforms/competition/client.js', import.meta.url);
const helperSource = async () =>
  Buffer.from(
    (await readFile(identityClient, 'utf8')).replaceAll('\r\n', '\n') +
      '\n' +
      (await readFile(helper, 'utf8')).replaceAll('\r\n', '\n'),
  );
const marker = '// TapTap login bootstrap: install before the official packing step.\n';

export function publicTapTapLoginConfig(config) {
  if (config?.platform !== 'taptap') throw new Error('TapTap login requires the TapTap platform.');
  const selected = tapTapTarget(config.game);
  if (!selected) throw new Error('Unknown TapTap login game.');
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
  const managed = serviceGames.includes(config.game);
  const offline =
    selected.login === 'offline' ||
    (managed && !config.apiUrl && config.competitionEnabled !== true);
  if (selected.login === 'offline' && config.apiUrl)
    throw new Error('This standalone TapTap game has no server login consumer.');
  if (managed && config.competitionEnabled === false && config.apiUrl)
    throw new Error('Disabled competition must not contain an API URL.');
  if (!config.preview && (!config.appId || (!config.apiUrl && !offline)))
    throw new Error('TapTap release requires a MiniApp ID and the server login API URL.');
  return {
    platform: 'taptap',
    game: config.game,
    appId: config.appId || '',
    apiUrl: config.apiUrl ? tapTapApiBase(config.apiUrl) : '',
  };
}

export function publicTapTapAdConfig(config) {
  if (!tapTapTarget(config.game)?.nativeRewards) return null;
  const adUnitId = config.adUnitId || '';
  if (
    typeof adUnitId !== 'string' ||
    (adUnitId && (!/^[\w-]{1,160}$/.test(adUnitId) || /^(YOUR_|REPLACE_|TODO)/i.test(adUnitId)))
  )
    throw new Error('Invalid public TapTap rewarded ad unit.');
  if (config.adsEnabled !== undefined && typeof config.adsEnabled !== 'boolean')
    throw new Error('Invalid public TapTap rewarded enable flag.');
  return { platform: 'taptap', adsEnabled: config.adsEnabled === true, adUnitId };
}

async function creatorAdsSource() {
  // Build the shared advertising-only entry; never instantiate a second Canvas host.
  const { build } = await import('vite');
  const result = await build({
    configFile: false,
    publicDir: false,
    logLevel: 'silent',
    root: fileURLToPath(new URL('../../../', import.meta.url)),
    build: {
      write: false,
      minify: true,
      sourcemap: false,
      lib: {
        entry: fileURLToPath(
          new URL('../../../packages/native-game-shell/src/creator-ads.ts', import.meta.url),
        ),
        formats: ['cjs'],
        fileName: () => 'tap-rewarded-ads.js',
      },
    },
  });
  const chunks = (Array.isArray(result) ? result : [result])
    .flatMap((item) => item.output)
    .filter((item) => item.type === 'chunk');
  if (chunks.length !== 1 || chunks[0].imports.length || chunks[0].dynamicImports.length)
    throw new Error('Creator rewarded bridge must be one self-contained CommonJS file.');
  return Buffer.from(chunks[0].code);
}

export function tapTapLoginPrefix(config) {
  const encoded = JSON.stringify(publicTapTapLoginConfig(config));
  const ads = publicTapTapAdConfig(config);
  const rewarded = ads
    ? `require('./tap-rewarded-ads.js').installCreatorAdBridge(${JSON.stringify(ads)});`
    : '';
  return (
    `${marker}globalThis.__COMPETITION_CONFIG__=Object.assign({},globalThis.__COMPETITION_CONFIG__||{},${encoded});\n` +
    `globalThis.__tapTapLogin=require('./tap-login.js').startTapTapLogin(typeof tap==='undefined'?undefined:tap,${encoded});${rewarded}\n`
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
  await writeFile(path.join(directory, 'tap-login.js'), await helperSource());
  if (publicTapTapAdConfig(config))
    await writeFile(path.join(directory, 'tap-rewarded-ads.js'), await creatorAdsSource());
  await writeFile(entry, tapTapLoginPrefix(config) + source);
  return verifyTapTapLogin(directory, config);
}

export async function verifyTapTapLogin(directory, config) {
  const [entry, expected, actual] = await Promise.all([
    readFile(path.join(directory, 'game.js'), 'utf8'),
    helperSource(),
    readFile(path.join(directory, 'tap-login.js')),
  ]);
  if (!entry.startsWith(tapTapLoginPrefix(config)) || !actual.equals(expected))
    throw new Error(
      'TapTap source login bootstrap differs from the current public config or helper.',
    );
  const ads = publicTapTapAdConfig(config);
  if (
    ads &&
    !(await readFile(path.join(directory, 'tap-rewarded-ads.js'))).equals(await creatorAdsSource())
  )
    throw new Error('TapTap Creator rewarded bridge differs from current shared source.');
  return {
    configured: Boolean(config.apiUrl),
    ...(ads ? { rewarded: ads } : {}),
    platform: 'taptap',
    serverIdentityVerified: false,
    realDeviceVerified: false,
  };
}

export const tapTapLoginHelperPath = fileURLToPath(helper);
