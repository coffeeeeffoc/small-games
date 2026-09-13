import {
  HostError,
  assertHostCapabilities,
  type GameDefinition,
} from '@coffeeeeffoc/game-contract';
import { normalizeCricketContent } from '../content/migration.js';
import { cricketManifest } from '../manifest.js';
import { actCricket, createMatch, opponents, startMatch, tickCricket } from '../domain/cricket.js';
import { createCricketSurface, type CricketCanvasTarget } from './surface.js';
import { createCricketSound } from '../view/sound.js';

export type { CricketCanvasTarget } from './surface.js';
export { defaultCricketEnvelope } from '../content/data.js';

/** Native tap controls drive the same real-time match and scene as Web. */
export const cricketCanvasDefinition: GameDefinition<CricketCanvasTarget> = {
  manifest: {
    ...cricketManifest,
    entry: 'cricket/game.js',
    loadModes: ['bilibili-subpackage'],
  },
  async mount(target, host) {
    assertHostCapabilities(['content', 'storage'], host.session.capabilities);
    if (
      host.session.gameId !== cricketManifest.gameId ||
      host.session.gameVersion !== cricketManifest.version
    )
      throw new HostError({ code: 'INVALID_INPUT', message: 'Game Session identity mismatch' });
    const validated = normalizeCricketContent(await host.content.load());
    if (!validated.success)
      throw new HostError({ code: 'CONTENT_INCOMPATIBLE', message: 'Invalid cricket content' });
    let state = createMatch(),
      paused = false,
      disposed = false;
    const surface = createCricketSurface(target),
      sound = createCricketSound();
    let previous = Date.now();
    function render() {
      if (disposed) return;
      surface.draw({
        title: '秋声斗蟋',
        arena: state,
        lines: paused
          ? ['对局已暂停']
          : [
              `第 ${state.round + 1} 擂 · ${opponents[state.round].name} · ${Math.ceil(state.time)} 秒`,
              `斗志 ${state.health} / ${state.enemyHealth}    气力 ${Math.floor(state.stamina)}`,
              state.holding
                ? `撩拨 ${Math.floor(state.charge * 100)}% · 55–82% 出击`
                : state.message,
            ],
        actions: paused
          ? []
          : state.phase === 'ready'
            ? [
                {
                  label: '揭盖 · 开斗',
                  run: () => {
                    void sound.start();
                    state = startMatch(state);
                    render();
                  },
                },
              ]
            : state.phase === 'fighting'
              ? [
                  {
                    label: state.holding ? '松梗 · 出击' : '探梗 · 开始蓄力',
                    run: () => action(state.holding ? 'strike' : 'tease'),
                  },
                  { label: '收梗 · 闪避', run: () => action('dodge') },
                ]
              : [
                  {
                    label: state.phase === 'won' && state.round < 2 ? '下一擂' : '重新上擂',
                    run: () => {
                      state = createMatch(
                        state.phase === 'won' && state.round < 2 ? state.round + 1 : 0,
                      );
                      render();
                    },
                  },
                ],
      });
    }
    function action(value: Parameters<typeof actCricket>[1]) {
      if (paused || disposed) return;
      const next = actCricket(state, value);
      if (next.eventId !== state.eventId) sound.play(next.event);
      state = next;
      render();
    }
    render();
    const timer = setInterval(() => {
      const now = Date.now();
      if (!paused) {
        const next = tickCricket(state, Math.min((now - previous) / 1000, 0.05));
        if (next.eventId !== state.eventId) sound.play(next.event);
        state = next;
        render();
      }
      previous = now;
    }, 33);
    return {
      pause() {
        paused = true;
        state = actCricket(state, 'cancel');
        sound.pause();
        render();
      },
      resume() {
        paused = false;
        previous = Date.now();
        render();
      },
      async dispose() {
        disposed = true;
        clearInterval(timer);
        sound.dispose();
        surface.dispose();
      },
    };
  },
};
