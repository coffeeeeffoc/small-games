import { build } from 'vite';
import { readFile, writeFile, mkdir, stat, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { wechatPlatform } from '../platforms/wechat/build.mjs';
import { bilibiliPlatform } from '../platforms/bilibili/build.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export const competitionGames = {
  'cops-robbers': {
    directory: 'games/local/cops-robbers',
    renderer: 'src/competition-renderer.js',
    title: '围捕小队',
  },
  'cops-robbers-realtime': {
    directory: 'games/local/cops-robbers-realtime',
    renderer: 'src/competition-renderer.js',
    title: '别跑！街区围捕',
  },
  'letters-words2': {
    directory: 'games/local/letters-words2',
    renderer: 'competition-renderer.js',
    title: '词屿 · 字母叠叠乐',
  },
  'vibeJam-myself-history-guess': {
    directory: 'games/local/vibeJam-myself-history-guess',
    renderer: 'competition-renderer.js',
    title: '此时·此地',
  },
  'xiangqi-five': {
    directory: 'games/submodules/xiangqi-five',
    renderer: 'competition-renderer.js',
    title: '象五子棋',
  },
};
export async function buildCompetition({ native = false, only, outputRoot, config = {} } = {}) {
  for (const [game, selected] of Object.entries(competitionGames)) {
    if (only && game !== only) continue;
    const renderer = path.join(root, selected.directory, selected.renderer).replaceAll('\\', '/');
    await stat(renderer); // Missing adapters block builds instead of silently publishing empty targets.
    for (const platform of native ? ['wechat', 'bilibili'] : ['h5']) {
      const platformConfig = config[game]?.[platform] || {};
      const apiUrl = platformConfig.apiUrl || process.env.COMPETITION_PUBLIC_API_URL || '';
      if (apiUrl && !/^https?:\/\//.test(apiUrl))
        throw new Error('Competition API URL must be HTTP(S)');
      const outDir = outputRoot
        ? path.join(outputRoot, game)
        : native
          ? path.join(root, 'apps/shell-minigame/dist', platform, game)
          : path.join(root, selected.directory, 'dist');
      const module = path
        .join(root, 'platforms/competition', native ? 'native.js' : 'h5.js')
        .replaceAll('\\', '/');
      const configValue = { ...platformConfig, game, platform, title: selected.title, apiUrl };
      const source = native
        ? `import {startNativeCompetition} from ${JSON.stringify(module)};import{createRenderer}from ${JSON.stringify(renderer)};startNativeCompetition(${platform === 'wechat' ? 'wx' : 'bl'},${JSON.stringify(configValue)},createRenderer);`
        : `globalThis.__COMPETITION_CONFIG__=Object.assign(${JSON.stringify(configValue)},globalThis.__COMPETITION_CONFIG__||{});import{mountCompetition}from ${JSON.stringify(module)};import{createRenderer}from ${JSON.stringify(renderer)};mountCompetition(${JSON.stringify(game)},createRenderer);`;
      const entry = path.join(root, '.scratch/competition', `${platform}-${game}.js`);
      await mkdir(path.dirname(entry), { recursive: true });
      await writeFile(entry, source);
      await build({
        configFile: false,
        publicDir: false,
        logLevel: 'warn',
        build: {
          outDir,
          emptyOutDir: false,
          minify: false,
          lib: {
            entry,
            formats: [native ? 'cjs' : 'iife'],
            name: 'CompetitionGame',
            fileName: () => (native ? 'game.js' : 'competition.js'),
          },
        },
      });
      if (native) {
        const adapter = platform === 'wechat' ? wechatPlatform : bilibiliPlatform;
        // Reuse the repository's short confirmation sound instead of another audio dependency.
        await cp(
          new URL('../games/local/game-cricket/public/cricket-audio/perfect.wav', import.meta.url),
          path.join(outDir, 'competition-action.wav'),
        );
        if (game === 'vibeJam-myself-history-guess')
          await cp(
            path.join(root, selected.directory, 'public/assets/competition'),
            path.join(outDir, 'assets/competition'),
            { recursive: true },
          );
        if (platformConfig.appId && !adapter.appId.test(platformConfig.appId))
          throw new Error(`Invalid ${platform}/${game} AppID`);
        for (const [name, value] of Object.entries(
          adapter.files({ game, appId: platformConfig.appId || '', version: '1.0.0' }),
        ))
          await writeFile(path.join(outDir, name), JSON.stringify(value, null, 2));
        await writeFile(
          path.join(outDir, 'release.json'),
          JSON.stringify(
            {
              game,
              platform,
              appId: platformConfig.appId || null,
              apiConfigured: !!apiUrl,
              mode: platformConfig.appId ? 'configured-unverified' : 'preview-unverified',
              rendering: 'native Canvas 2D',
              builtAt: new Date().toISOString(),
            },
            null,
            2,
          ),
        );
      } else {
        const index = path.join(outDir, 'index.html');
        let html = await readFile(index, 'utf8');
        if (!html.includes('src="./competition.js"'))
          html = html.replace('</body>', '<script defer src="./competition.js"></script></body>');
        await writeFile(index, html);
      }
      console.log(`Competition ${platform}/${game} -> ${path.relative(root, outDir)}`);
    }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const configPath = process.env.COMPETITION_RELEASE_CONFIG;
  const config = configPath ? JSON.parse(await readFile(configPath, 'utf8')) : {};
  await mkdir(path.join(root, '.scratch/competition'), { recursive: true });
  await buildCompetition({
    native: process.argv.includes('--native'),
    only: process.argv.find((a) => a.startsWith('--game='))?.slice(7),
    config,
  });
}
