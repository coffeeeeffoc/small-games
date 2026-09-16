import {
  HostError,
  assertHostCapabilities,
  type GameDefinition,
} from '@coffeeeeffoc/game-contract';
import type { CanvasSound } from '@coffeeeeffoc/canvas-game-adapter';
import { normalizeCricketContent } from '../content/migration.js';
import { cricketManifest } from '../manifest.js';
import {
  actCricket,
  createMatch,
  opponents,
  startMatch,
  tickCricket,
  type CricketMatch,
} from '../domain/cricket.js';
import { createCricketSurface, type CricketCanvasTarget } from './surface.js';
export type { CricketCanvasTarget } from './surface.js';
export { defaultCricketEnvelope } from '../content/data.js';

/** Native controls and packaged sounds use the same match rules as Web. */
export const cricketCanvasDefinition: GameDefinition<CricketCanvasTarget> = {
  manifest: {
    ...cricketManifest,
    entry: 'cricket/game.js',
    loadModes: ['bilibili-subpackage', 'native-package'],
  },
  async mount(target, host) {
    assertHostCapabilities(['content', 'storage'], host.session.capabilities);
    if (
      host.session.gameId !== cricketManifest.gameId ||
      host.session.gameVersion !== cricketManifest.version
    )
      throw new HostError({ code: 'INVALID_INPUT', message: 'Game Session identity mismatch' });
    if (!normalizeCricketContent(await host.content.load()).success)
      throw new HostError({ code: 'CONTENT_INCOMPATIBLE', message: 'Invalid cricket content' });
    let progress = { round: 0, runs: 0, wins: 0, bestHits: 0 };
    let error = '',
      writable = true;
    try {
      const stored = await host.storage.read('progress');
      if (stored) {
        const value = stored.value as typeof progress | null;
        if (
          !value ||
          !['round', 'runs', 'wins', 'bestHits'].every(
            (key) =>
              Number.isSafeInteger(value[key as keyof typeof progress]) &&
              value[key as keyof typeof progress] >= 0,
          ) ||
          value.round > 2
        )
          throw new Error('Invalid progress');
        progress = {
          round: value.round,
          runs: value.runs,
          wins: value.wins,
          bestHits: value.bestHits,
        };
      }
    } catch {
      writable = false;
      error = '存档暂时不可用，本次仍可游玩。';
    }
    let state = createMatch(progress.round),
      paused = false,
      disposed = false,
      rewarded = false;
    let offering: Promise<void> | null = null;
    let saving = Promise.resolve();
    let previous = Date.now();
    const sounds = new Map<CricketMatch['event'], CanvasSound>();
    const sound = (event: CricketMatch['event']) => {
      if (paused || disposed) return;
      try {
        let clip = sounds.get(event);
        if (!clip && target.createSound) {
          clip = target.createSound(`cricket-audio/${event}.wav`);
          sounds.set(event, clip);
        }
        clip?.play();
      } catch {
        /* A missing audio device never prevents play. */
      }
    };
    const surface = createCricketSurface(target);
    function save() {
      if (!writable) return;
      const value = { ...progress };
      saving = saving.then(async () => {
        if (!writable) return;
        try {
          await host.storage.write('progress', value);
        } catch {
          writable = false;
          error = '成绩未能保存，请稍后重试。';
          render();
        }
      });
    }
    function update(next: CricketMatch) {
      if (next.eventId !== state.eventId) sound(next.event);
      if (state.phase === 'fighting' && (next.phase === 'won' || next.phase === 'lost')) {
        progress.runs++;
        if (next.phase === 'won') progress.wins++;
        progress.bestHits = Math.max(progress.bestHits, next.hits);
        save();
      }
      state = next;
    }
    function retry() {
      if (paused || disposed || offering) return;
      progress.round = state.phase === 'won' && state.round < 2 ? state.round + 1 : state.round;
      state = createMatch(progress.round);
      rewarded = false;
      error = '';
      save();
      render();
    }
    function offer() {
      if (paused || disposed || offering || rewarded || state.phase !== 'lost') return;
      offering = (async () => {
        try {
          const result = await host.ads.offer({ id: 'cricket-revive', reward: { health: 40 } });
          if (disposed) return;
          if (result.status === 'completed') {
            rewarded = true;
            state = {
              ...state,
              phase: 'fighting',
              health: 40,
              time: Math.max(30, state.time),
              holding: false,
              charge: 0,
              enemyPhase: 'watch',
              enemyClock: 1.8,
              message: '调养完成，恢复40斗志。',
            };
            previous = Date.now();
            error = '';
          } else
            error =
              result.status === 'dismissed'
                ? '未完整观看，未获得调养。'
                : '暂时无法播放，仍可直接重试。';
        } catch {
          if (!disposed) error = '暂时无法播放，仍可直接重试。';
        } finally {
          offering = null;
          render();
        }
      })();
      render();
    }
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
              offering
                ? '调养等待中……'
                : error ||
                  (state.holding
                    ? `撩拨 ${Math.floor(state.charge * 100)}% · 55–82% 出击`
                    : state.message),
              `战绩 ${progress.wins}胜 / ${progress.runs}场 · 最佳命中 ${progress.bestHits}`,
            ],
        actions:
          paused || offering
            ? []
            : state.phase === 'ready'
              ? [
                  {
                    label: '揭盖 · 开斗',
                    run() {
                      if (paused || disposed) return;
                      update(startMatch(state));
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
                      run: retry,
                    },
                    ...(state.phase === 'lost' &&
                    !rewarded &&
                    host.session.capabilities.includes('advertising')
                      ? [{ label: '观看视频 · 调养再战（可选）', run: offer }]
                      : []),
                  ],
      });
    }
    function action(value: Parameters<typeof actCricket>[1]) {
      if (paused || disposed || offering) return;
      update(actCricket(state, value));
      render();
    }
    render();
    const timer = setInterval(() => {
      const now = Date.now();
      if (!paused && !offering) {
        update(tickCricket(state, Math.min((now - previous) / 1000, 0.05)));
        render();
      }
      previous = now;
    }, 33);
    return {
      pause() {
        paused = true;
        state = actCricket(state, 'cancel');
        for (const clip of sounds.values()) clip.stop();
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
        for (const clip of sounds.values()) clip.dispose();
        surface.dispose();
        await offering;
        await saving;
      },
    };
  },
};
