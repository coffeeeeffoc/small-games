import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  installTapTapLogin,
  tapTapLoginPrefix,
  publicTapTapLoginConfig,
} from '../../../apps/shell-minigame/scripts/taptap-login.mjs';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const marker = '// Three-game TapTap platform identity bootstrap.\n';
export function tapServicesLoginPrefix(config) {
  assert(['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five'].includes(config.game));
  const encoded = JSON.stringify({
    ...publicTapTapLoginConfig(config),
    identityProvider: 'taptap',
  });
  return (
    marker +
    `globalThis.__COMPETITION_CONFIG__=Object.assign({},globalThis.__COMPETITION_CONFIG__||{},${encoded});\n` +
    `require('./tap-login.js');require('./tap-identity.js').installTapCompetitionIdentity(globalThis,typeof tap==='undefined'?undefined:tap);\n` +
    `globalThis.__tapTapLogin=require('./tap-login.js').startTapTapLogin(typeof tap==='undefined'?undefined:tap,${encoded});\n`
  );
}
async function identityBundle() {
  const { build } = await import('vite');
  const result = await build({
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: path.join(repo, 'platforms/taptap/competition-identity.mjs'),
        formats: ['cjs'],
      },
    },
  });
  return (Array.isArray(result) ? result.flatMap((part) => part.output) : result.output).find(
    (item) => item.type === 'chunk' && item.isEntry,
  ).code;
}
export async function installGameTapLogin(directory, config) {
  if (config.identityProvider !== 'taptap') return installTapTapLogin(directory, config);
  const entry = path.join(directory, 'game.js');
  let source = await readFile(entry, 'utf8');
  if (source.startsWith(marker)) {
    source = source.split('\n').slice(4).join('\n');
    await writeFile(entry, source);
  }
  await installTapTapLogin(directory, config);
  source = await readFile(entry, 'utf8');
  assert(source.startsWith(tapTapLoginPrefix(config)));
  await writeFile(path.join(directory, 'tap-identity.js'), await identityBundle());
  await writeFile(
    entry,
    tapServicesLoginPrefix(config) + source.slice(tapTapLoginPrefix(config).length),
  );
  return verifyGameTapLogin(directory, config);
}
export async function verifyGameTapLogin(directory, config) {
  const entry = await readFile(path.join(directory, 'game.js'), 'utf8');
  assert(
    entry.startsWith(tapServicesLoginPrefix(config)),
    'TapTap platform bootstrap config or ordering changed',
  );
  assert.equal(
    await readFile(path.join(directory, 'tap-identity.js'), 'utf8'),
    await identityBundle(),
    'TapTap identity adapter differs from current source',
  );
  const expected = Buffer.concat([
    await readFile(path.join(repo, 'platforms/competition/client.js')),
    Buffer.from('\n'),
    await readFile(path.join(repo, 'platforms/taptap/login.cjs')),
  ]);
  assert(
    (await readFile(path.join(directory, 'tap-login.js'))).equals(expected),
    'Canonical identity helper changed',
  );
  return {
    configured: Boolean(config.apiUrl),
    platform: 'taptap',
    identityProvider: 'taptap',
    serverIdentityVerified: false,
    realDeviceVerified: false,
  };
}
