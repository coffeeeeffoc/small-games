import { readFile, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { competitionService, serviceEnvironment } from './competition-service-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export function h5ServiceConfig(game, { env = process.env, local = false } = {}) {
  return { game, platform: 'h5', serviceManaged: true, ...competitionService({ env, local }) };
}

export function serviceHtml(html, config) {
  const clean = html
    .replace(/<script data-competition-service>[\s\S]*?<\/script>/g, '')
    .replace(/<style data-competition-service>[\s\S]*?<\/style>/g, '')
    .replace(/<script[^>]*src=["']\.\/competition\.js["'][^>]*><\/script>/g, '');
  const encoded = JSON.stringify(config).replaceAll('<', '\\u003c');
  const legacyStyle =
    config.game === 'xiangqi-five'
      ? '<style data-competition-service>#room-open,#tools-room{display:none!important}</style>'
      : '';
  const result = clean.replace(
    /<head(?:\s[^>]*)?>/i,
    (head) =>
      `${head}${legacyStyle}<script data-competition-service>globalThis.__COMPETITION_CONFIG__=${encoded};</script>`,
  );
  return config.competitionEnabled
    ? result.replace('</body>', '<script defer src="./competition.js"></script></body>')
    : result;
}

export async function serviceBundle(game) {
  const { build } = await import('vite');
  const directory =
    game === 'xiangqi-five' ? 'games/submodules/xiangqi-five' : `games/local/${game}/src`;
  const source = `import {mountCompetition} from ${JSON.stringify(path.join(root, 'platforms/competition/h5.js'))};
import {createRenderer} from ${JSON.stringify(path.join(root, directory, 'competition-renderer.js'))};
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
  const bundle = path.join(directory, 'competition.js');
  if (config.competitionEnabled) await writeFile(bundle, await serviceBundle(game));
  else await rm(bundle, { force: true });
  if (game === 'xiangqi-five') {
    // The pinned standalone game owns an older /api/rooms protocol. This bridge
    // uses Runtime competition exclusively, including when restoring old saves.
    const app = path.join(directory, 'app.js');
    let source = await readFile(app, 'utf8');
    if (!source.includes('// Runtime service bridge')) {
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
  const { game } = JSON.parse(match[1]);
  if (!['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five'].includes(game))
    throw new Error('Unknown managed service game');
  await prepareH5Service(game, path.dirname(filename), { env, local });
  return true;
}

export { serviceEnvironment };
