import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { games, platforms } from '../scripts/games.mjs';

describe('building-power release registration', () => {
  it('selects only the public Canvas entry and game audio', () => {
    expect(games['building-power']).toEqual({
      title: '忙碌的电工',
      definition: 'buildingPowerCanvasDefinition',
      content: 'defaultBuildingPowerEnvelope',
      assets: [{ source: 'public/building-power-audio', target: 'building-power-audio' }],
    });
    expect(Object.keys(platforms)).toEqual(['wechat', 'bilibili', 'douyin']);
    expect(platforms.douyin.sdk).toBe('tt');
    expect(platforms.douyin.files({ game: 'building-power', appId: 'tt1234567890abcdef' })).toEqual(
      {
        'game.json': { deviceOrientation: 'portrait' },
        'project.config.json': {
          appid: 'tt1234567890abcdef',
          projectname: 'building-power-douyin',
          compileType: 'game',
          miniprogramRoot: './',
          setting: { es6: true },
        },
      },
    );
  });

  it.each(Object.keys(platforms))(
    'requires an AppID for %s release before reading game code',
    (platform) => {
      const result = spawnSync(
        process.execPath,
        [
          fileURLToPath(new URL('../scripts/build.mjs', import.meta.url)),
          '--platform',
          platform,
          '--game',
          'building-power',
        ],
        { encoding: 'utf8' },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`Release needs ${platform}/building-power AppID`);
    },
  );

  it.each(['wx1234567890abcdef', 'biligame123', 'tt', '../tt123'])(
    'rejects invalid Douyin AppID %s',
    (appId) => {
      expect(platforms.douyin.appId.test(appId)).toBe(false);
    },
  );
});
