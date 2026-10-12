import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const deploymentUrl = new URL('../../../scripts/deploy-tencent.mjs', import.meta.url).href;
const { prepareBackend } = await import(deploymentUrl);

it('packages an executable carrom rule with its engine and content, without shipping its UI', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'carrom-deployment-'));
  const workspace = path.join(temporary, 'workspace');
  const destination = path.join(temporary, 'backend');
  const writeFixture = async (name: string, contents = 'fixture') => {
    const target = path.join(workspace, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  };
  try {
    // Only unrelated backend files are stubs. The rule and shared game modules below
    // use production bytes, so an incomplete release fails when Node loads the result.
    await Promise.all([
      writeFixture('package.json', JSON.stringify({ name: 'deployment-fixture', type: 'module' })),
      writeFixture('pnpm-lock.yaml', 'lockfileVersion: 9.0\n'),
      writeFixture('pnpm-workspace.yaml', 'packages: []\n'),
      ...[
        'ad-config',
        'content-schema',
        'game-artifact',
        'game-contract',
        'release-contract',
        'service-kit',
      ].map((name) => writeFixture(`packages/${name}/dist/index.js`, 'export {};\n')),
      ...[
        'services/runtime-api/dist/main.js',
        'services/kart-server/src/main.ts',
        'games/local/three-choose-two/src/engine.js',
        'games/local/flick-arena/src/engine.mjs',
        'games/local/carding-car/assets/scripts/main.ts',
        'games/local/cops-robbers/src/engine.js',
        'games/local/cops-robbers-realtime/src/engine.js',
        'games/local/letters-words2/engine.js',
        'games/local/vibeJam-myself-history-guess/src/engine.js',
        'games/local/vibeJam-myself-history-guess/public/data.json',
        'games/submodules/xiangqi-five/game.js',
      ].map((name) => writeFixture(name)),
      writeFixture(
        'games/local/carrom-club/package.json',
        JSON.stringify({ name: 'carrom-club', type: 'module' }),
      ),
      writeFixture('games/local/carrom-club/index.html', '<html>UI must stay out</html>'),
      writeFixture(
        'games/local/carrom-club/src/render.mjs',
        'throw new Error("UI must stay out");',
      ),
      writeFixture('games/local/carrom-club/public/board.svg', '<svg/>'),
    ]);
    for (const name of [
      'services/runtime-api/rules/carrom.mjs',
      'services/runtime-api/rules/ranked-games.mjs',
      'games/local/cage-rescue/src/core.mjs',
      'games/local/cage-rescue/src/levels.mjs',
      'games/local/tower-brake/engine.mjs',
      'games/local/tower-brake/levels.mjs',
      'games/local/carrom-club/src/core.mjs',
      'games/local/carrom-club/src/content.mjs',
      'games/local/carrom-club/src/friends-core.mjs',
      'games/local/carrom-club/src/friends-content.mjs',
    ]) {
      const target = path.join(workspace, name);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(path.join(workspaceRoot, name), target);
    }

    await prepareBackend(destination, workspace);

    const rankedUrl = pathToFileURL(
      path.join(destination, 'services/runtime-api/rules/ranked-games.mjs'),
    ).href;
    const { rankedRules } = await import(rankedUrl);
    expect(rankedRules.map((item: { id: string }) => item.id)).toEqual([
      'cage-rescue',
      'tower-brake',
    ]);
    for (const item of rankedRules) expect(item.create('endless', 123).game.mode).toBe('endless');

    const carromDirectory = path.join(destination, 'games/local/carrom-club');
    expect((await readdir(carromDirectory)).sort()).toEqual(['package.json', 'src']);
    expect((await readdir(path.join(carromDirectory, 'src'))).sort()).toEqual([
      'content.mjs',
      'core.mjs',
      'friends-content.mjs',
      'friends-core.mjs',
    ]);
    const packagedRuleUrl = pathToFileURL(
      path.join(destination, 'services/runtime-api/rules/carrom.mjs'),
    ).href;
    const { default: rule } = await import(packagedRuleUrl);
    const initial = rule.initial();
    expect(rule.id).toBe('carrom-club');
    expect(initial.game.coins).toHaveLength(19);
    expect(initial.game.queen).toBe('board');
    expect(rule.view(initial, 0).scores).toEqual([0, 0]);
    const next = rule.action(
      initial,
      { type: 'shoot', x: 500, dx: 1, dy: 0, power: 0.05, expectedShot: 0 },
      100,
      0,
    );
    expect(next.game.shots).toBe(1);
    expect(next.game.phase).toBe('ready');
    expect(next.game.turn).toBe(1);
    const friendsUrl = pathToFileURL(path.join(carromDirectory, 'src/friends-core.mjs')).href;
    const friends = await import(friendsUrl);
    const four = friends.createMultiplayerMatch({
      mode: 'colors',
      players: ['a', 'b', 'c', 'd'].map((id) => ({ id })),
    });
    expect(four.players).toHaveLength(4);
    expect(
      friends.applyMultiplayerShot(four, {
        playerId: 'a',
        position: 500,
        dx: 0,
        dy: -1,
        power: 0.2,
      }).state.shots,
    ).toBe(1);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
