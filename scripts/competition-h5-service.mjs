import { tapServicesConfig } from './taptap-services-config.mjs';
import { readFile, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { competitionService, serviceEnvironment } from './competition-service-config.mjs';
import { prepareH5Ads } from './h5-ad-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export function h5ServiceConfig(game, { env = process.env, local = false, identityMode } = {}) {
  if (
    identityMode !== undefined &&
    (identityMode !== 'persistent' ||
      !['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five'].includes(game))
  )
    throw new Error('Unknown managed identity mode');
  const tapServices = tapServicesConfig(game, env);
  return {
    tapServices,
    ...(tapServices.enabled ? { appId: tapServices.appId, identityProvider: 'taptap' } : {}),
    game,
    platform: 'h5',
    serviceManaged: true,
    ...competitionService({ env, local }),
    ...(identityMode ? { identityMode } : {}),
  };
}

export function serviceHtml(html, config) {
  const clean = html
    .replace(/<script data-competition-service>[\s\S]*?<\/script>/g, '')
    .replace(/<style data-competition-service>[\s\S]*?<\/style>/g, '')
    .replace(/<script[^>]*src=["']\.\/(?:competition|tap-services)\.js["'][^>]*><\/script>/g, '');
  const encoded = JSON.stringify(config).replaceAll('<', '\\u003c');
  const hiddenEntries = config.game === 'xiangqi-five' ? ['#room-open', '#tools-room'] : [];
  if (!config.competitionEnabled)
    hiddenEntries.push(
      '[data-competition-launch]',
      '[data-competition-entry]',
      '#friends-button',
      '#records-button',
      '.home-shortcuts',
      '#mode-online',
    );
  const serviceStyle = hiddenEntries.length
    ? `<style data-competition-service>${hiddenEntries.join(',')}{display:none!important}</style>`
    : '';
  const result = clean.replace(
    /<head(?:\s[^>]*)?>/i,
    (head) =>
      `${head}${serviceStyle}<script data-competition-service>globalThis.__COMPETITION_CONFIG__=${encoded};</script>`,
  );
  const configured = config.tapServices?.enabled
    ? result.replace('</body>', '<script defer src="./tap-services.js"></script></body>')
    : result;
  return config.competitionEnabled
    ? configured.replace('</body>', '<script defer src="./competition.js"></script></body>')
    : configured;
}

export async function serviceBundle(game) {
  const { build } = await import('vite');
  const directory =
    game === 'xiangqi-five' ? 'games/submodules/xiangqi-five' : `games/local/${game}/src`;
  const source = `import {mountCompetition} from ${JSON.stringify(path.join(root, 'platforms/competition/h5.js'))};
import {createRenderer} from ${JSON.stringify(path.join(root, directory, 'competition-renderer.js'))};
import {installTapCompetitionIdentity} from ${JSON.stringify(path.join(root, 'platforms/taptap/competition-identity.mjs'))};
if(globalThis.__COMPETITION_CONFIG__?.identityProvider==='taptap') installTapCompetitionIdentity();
mountCompetition(${JSON.stringify(game)},createRenderer);`;
  const temporary = await mkdtemp(path.join(tmpdir(), 'competition-entry-'));
  try {
    const entry = path.join(temporary, 'entry.mjs');
    await writeFile(entry, source);
    const result = await build({
      configFile: false,
      publicDir: false,
      logLevel: 'warn',
      build: {
        write: false,
        minify: false,
        lib: { entry, formats: ['iife'], name: 'CompetitionGame' },
      },
    });
    return (Array.isArray(result) ? result.flatMap((item) => item.output) : result.output).find(
      (item) => item.type === 'chunk' && item.isEntry,
    ).code;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function prepareH5Service(game, directory, options = {}) {
  const config = h5ServiceConfig(game, options);
  const index = path.join(directory, 'index.html');
  await writeFile(index, serviceHtml(await readFile(index, 'utf8'), config));
  const tapBundle = path.join(directory, 'tap-services.js');
  if (config.tapServices.enabled) {
    const { build } = await import('vite');
    const temporary = await mkdtemp(path.join(tmpdir(), 'tap-services-'));
    try {
      const entry = path.join(temporary, 'entry.mjs');
      const gameDirectory =
        game === 'xiangqi-five' ? 'games/submodules/xiangqi-five' : `games/local/${game}/src`;
      await writeFile(
        entry,
        `import {mountTapBrowserServices} from ${JSON.stringify(path.join(root, 'platforms/taptap/browser-entry.mjs'))};
import {startTapMultiplayerScreen} from ${JSON.stringify(path.join(root, 'platforms/taptap/multiplayer-screen.mjs'))};
import {tapMultiplayer} from ${JSON.stringify(path.join(root, gameDirectory, 'tap-multiplayer.js'))};
mountTapBrowserServices(globalThis.__COMPETITION_CONFIG__, options => startTapMultiplayerScreen({...options, descriptor:tapMultiplayer}));`,
      );
      const result = await build({
        configFile: false,
        publicDir: false,
        logLevel: 'warn',
        build: {
          write: false,
          minify: false,
          lib: { entry, formats: ['iife'], name: 'TapGameServices' },
        },
      });
      await writeFile(
        tapBundle,
        (Array.isArray(result) ? result.flatMap((part) => part.output) : result.output).find(
          (item) => item.type === 'chunk' && item.isEntry,
        ).code,
      );
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  } else await rm(tapBundle, { force: true });
  const bundle = path.join(directory, 'competition.js');
  if (config.competitionEnabled) await writeFile(bundle, await serviceBundle(game));
  else await rm(bundle, { force: true });
  if (game === 'xiangqi-five') {
    // The pinned standalone game owns an older /api/rooms protocol. This bridge
    // uses Runtime competition exclusively, including when restoring old saves.
    const app = path.join(directory, 'app.js');
    let source = await readFile(app, 'utf8');
    if (
      !source.includes('function roomServiceEnabled()') &&
      !source.includes('// Runtime service bridge')
    ) {
      const replacements = [
        [
          'async function roomRequest(server, path, body, token) {',
          'async function roomRequest(server, path, body, token) {\n  if (globalThis.__COMPETITION_CONFIG__?.serviceManaged) throw new Error("请使用好友挑战入口");',
        ],
        [
          'async function checkRoomService() {',
          'async function checkRoomService() {\n  if (globalThis.__COMPETITION_CONFIG__?.serviceManaged) return;',
        ],
        ['    saved &&', '    !globalThis.__COMPETITION_CONFIG__?.serviceManaged && saved &&'],
        [
          "if (invitation.has('room') && !room) {",
          "if (!globalThis.__COMPETITION_CONFIG__?.serviceManaged && invitation.has('room') && !room) {",
        ],
      ];
      for (const [before, after] of replacements) {
        if (!source.includes(before))
          throw new Error('The xiangqi legacy-room bridge needs updating');
        source = source.replace(before, after);
      }
      await writeFile(app, '// Runtime service bridge\n' + source);
    }
  }
  return config;
}

export async function reconfigureH5Service(filename, env, local = false) {
  const html = await readFile(filename, 'utf8');
  const match = html.match(
    /<script data-competition-service>globalThis\.__COMPETITION_CONFIG__=(\{.*?\});<\/script>/,
  );
  if (!match) return false;
  const { game, identityMode } = JSON.parse(match[1]);
  if (!['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five'].includes(game))
    throw new Error('Unknown managed service game');
  await prepareH5Service(game, path.dirname(filename), { env, local, identityMode });
  await prepareH5Ads(game, path.dirname(filename), { env });
  return true;
}

export { serviceEnvironment };
