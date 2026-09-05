import {
  HostError,
  assertHostCapabilities,
  type GameDefinition,
} from '@coffeeeeffoc/game-contract';
import { validateContentEnvelope } from '@coffeeeeffoc/content-schema';
import { cultivationManifest } from '../manifest.js';
import { cultivationContentSchema } from '../content/schema.js';
import { loadCultivationSave, writeCultivationSave } from '../adapter/save.js';
import { chooseCultivation, createCultivationState, reincarnate } from '../domain/state.js';
import { realm, score } from '../domain/model.js';
import { createCultivationSurface, type CultivationCanvasTarget } from './surface.js';

export type { CultivationCanvasTarget } from './surface.js';
export { defaultCultivationEnvelope } from '../content/data.js';

/** Reviewed, DOM-free Canvas entry reusing exactly the Web Game's content, rules and saves. */
export const cultivationCanvasDefinition: GameDefinition<CultivationCanvasTarget> = {
  manifest: {
    ...cultivationManifest,
    entry: 'cultivation/game.js',
    loadModes: ['bilibili-subpackage'],
  },
  async mount(target, host) {
    assertHostCapabilities(['content', 'storage'], host.session.capabilities);
    if (
      host.session.gameId !== cultivationManifest.gameId ||
      host.session.gameVersion !== cultivationManifest.version
    )
      throw new HostError({ code: 'INVALID_INPUT', message: 'Game Session identity mismatch' });
    const envelope = await host.content.load();
    if (
      envelope.gameId !== cultivationManifest.gameId ||
      envelope.schemaVersion !== cultivationManifest.contentSchemaVersion
    )
      throw new HostError({
        code: 'CONTENT_INCOMPATIBLE',
        message: 'Incompatible cultivation content',
      });
    const validated = validateContentEnvelope(cultivationContentSchema, envelope);
    if (!validated.success)
      throw new HostError({ code: 'INVALID_INPUT', message: 'Invalid cultivation content' });
    const content = validated.data.payload;
    let stored = await loadCultivationSave(host);
    let state = createCultivationState();
    let paused = false;
    let disposed = false;
    let operation: Promise<void> | null = null;
    const surface = createCultivationSurface(target);

    function act(work: () => Promise<void>) {
      if (paused || disposed || operation) return;
      operation = work()
        .catch(() => undefined)
        .finally(() => {
          operation = null;
          render();
        });
      render();
    }

    function render() {
      if (disposed) return;
      const event = content.events[state.eventIndex];
      const stats = state.stats;
      const actions = state.ended
        ? [
            {
              label: '直接转世',
              run: () =>
                act(async () => {
                  state = reincarnate(false);
                }),
            },
            ...(host.session.capabilities.includes('advertising')
              ? [
                  {
                    label: '带着福缘转世',
                    run: () =>
                      act(async () => {
                        const result = await host.ads.offer({
                          id: 'cultivation.reincarnate',
                          reward: { luck: 2 },
                        });
                        if (!disposed && result.status === 'completed') state = reincarnate(true);
                      }),
                  },
                ]
              : []),
          ]
        : event.choices.map((choice, index) => ({
            label: choice.text,
            run: () =>
              act(async () => {
                const next = chooseCultivation(state, index, content, stored.save);
                state = next.state;
                stored = await writeCultivationSave(host, stored.save, next.save, stored.version);
              }),
          }));
      surface.draw({
        title: '三分钟修仙',
        lines: paused
          ? ['修行已暂停']
          : [
              `第 ${event.chapter} 章 · ${event.age} 岁 · ${realm(stats)}`,
              `骨 ${stats.body}   灵 ${stats.spirit}   运 ${stats.luck}`,
              state.ended ? `三章已毕 · ${score(stats)} 道行` : event.title,
              state.ended ? state.log : event.text,
              `灵石 ${stored.save.coins} · 最佳道行 ${stored.save.bestCultivation}`,
              ...(operation ? ['正在处理…'] : []),
            ],
        actions: paused || operation ? [] : actions,
      });
    }
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
        try {
          surface.dispose();
        } finally {
          await operation;
        }
      },
    };
  },
};
