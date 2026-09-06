import {
  assertHostCapabilities,
  HostError,
  type GameDefinition,
} from '@coffeeeeffoc/game-contract';
import { validateContentEnvelope } from '@coffeeeeffoc/content-schema';
import { createCanvasSurface, type CanvasGameTarget } from '@coffeeeeffoc/canvas-game-adapter';
import { arenaManifest } from './manifest.js';
export { arenaManifest } from './manifest.js';
import { arenaContentSchema } from './content/schema.js';
import { loadArenaSave, writeArenaSave } from './adapter/save.js';
import {
  advanceLeague,
  chooseMutation,
  createArenaState,
  hatchArena,
  rewardedMutation,
  settleBattle,
  startBattle,
} from './domain/state.js';
import { mutationOptions, power } from './domain/model.js';

export { defaultArenaEnvelope } from './content/data.js';

export const arenaCanvasDefinition: GameDefinition<CanvasGameTarget> = {
  manifest: { ...arenaManifest, entry: 'arena/game.js', loadModes: ['bilibili-subpackage'] },
  async mount(target, host) {
    assertHostCapabilities(['content', 'storage'], host.session.capabilities);
    if (host.session.gameId !== 'arena')
      throw new HostError({ code: 'INVALID_INPUT', message: 'Game Session identity mismatch' });
    const envelope = validateContentEnvelope(arenaContentSchema, await host.content.load());
    if (!envelope.success)
      throw new HostError({ code: 'CONTENT_INCOMPATIBLE', message: 'Invalid arena content' });
    const content = envelope.data.payload;
    let stored = await loadArenaSave(host);
    let state = createArenaState();
    let paused = false;
    let disposed = false;
    let operation: Promise<void> | null = null;
    const surface = createCanvasSurface(target);
    const act = (work: () => Promise<void> | void) => {
      if (paused || disposed || operation) return;
      operation = Promise.resolve(work()).finally(() => {
        operation = null;
        render();
      });
      render();
    };
    const render = () => {
      if (disposed) return;
      const creature = state.creature;
      const options = creature
        ? mutationOptions(content, creature.attack + state.pickRound + state.tier)
        : [];
      const actions =
        state.phase === 'egg'
          ? [
              {
                label: '敲开这颗蛋',
                run: () =>
                  act(() => {
                    state = hatchArena(content, Math.random());
                  }),
              },
            ]
          : state.phase === 'mutate'
            ? options.map((trait) => ({
                label: `${trait.icon} ${trait.name}`,
                run: () =>
                  act(() => {
                    state = chooseMutation(state, trait);
                  }),
              }))
            : state.phase === 'ready'
              ? [
                  {
                    label: `自动挑战 ${content.ranks[state.tier]}`,
                    run: () =>
                      act(async () => {
                        state = startBattle(state, content);
                      }),
                  },
                ]
              : state.phase === 'result'
                ? [
                    {
                      label: state.win ? '进化并晋级' : '孵下一只',
                      run: () =>
                        act(() => {
                          state = state.win ? advanceLeague(state) : createArenaState();
                        }),
                    },
                    ...(!state.win && host.session.capabilities.includes('advertising') && creature
                      ? [
                          {
                            label: '赛后突变',
                            run: () =>
                              act(async () => {
                                if (
                                  (
                                    await host.ads.offer({
                                      id: 'arena.post-match-mutation',
                                      reward: { mutation: 1 },
                                    })
                                  ).status === 'completed'
                                )
                                  state = rewardedMutation(
                                    state,
                                    content.traits[
                                      Math.floor(Math.random() * content.traits.length)
                                    ],
                                  );
                              }),
                          },
                        ]
                      : []),
                  ]
                : [];
      surface.draw({
        title: '电子斗蛐蛐',
        lines: paused
          ? ['联赛已暂停']
          : [
              `${content.ranks[state.tier]} · ${state.phase}`,
              creature
                ? `${creature.emoji} ${creature.species} · 战力 ${power(creature)}`
                : '联赛入场券，就在蛋里',
              `总胜场 ${stored.save.arenaWins} · 游戏币 ${stored.save.coins}`,
              ...(operation ? ['正在处理…'] : []),
            ],
        actions: paused || operation ? [] : actions,
      });
    };
    const timer = setInterval(() => {
      if (paused || disposed || operation || state.phase !== 'battle') return;
      if (state.battleStep < 8) {
        state = { ...state, battleStep: state.battleStep + 1 };
        render();
        return;
      }
      act(async () => {
        const next = settleBattle(state, stored.save, content);
        state = next.state;
        stored = await writeArenaSave(host, stored.save, next.save, stored.version);
      });
    }, 260);
    render();
    return {
      pause() {
        paused = true;
        render();
      },
      resume() {
        paused = false;
        render();
      },
      async dispose() {
        disposed = true;
        clearInterval(timer);
        surface.dispose();
        await operation;
      },
    };
  },
};
