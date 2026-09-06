import {
  assertHostCapabilities,
  HostError,
  type GameDefinition,
} from '@coffeeeeffoc/game-contract';
import { validateContentEnvelope } from '@coffeeeeffoc/content-schema';
import { createCanvasSurface, type CanvasGameTarget } from '@coffeeeeffoc/canvas-game-adapter';
import { officeManifest } from './manifest.js';
export { officeManifest } from './manifest.js';
import { officeContentSchema } from './content/schema.js';
import { loadOfficeSave, writeOfficeSave } from './adapter/save.js';
import {
  advanceOfficeTick,
  buyPrivacyScreen,
  createOfficeState,
  finishOfficeDay,
  rescueOfficeRun,
  restartOfficeRun,
} from './domain/state.js';

export { defaultOfficeEnvelope } from './content/data.js';

export const officeCanvasDefinition: GameDefinition<CanvasGameTarget> = {
  manifest: { ...officeManifest, entry: 'office/game.js', loadModes: ['bilibili-subpackage'] },
  async mount(target, host) {
    assertHostCapabilities(['content', 'storage'], host.session.capabilities);
    if (host.session.gameId !== 'office')
      throw new HostError({ code: 'INVALID_INPUT', message: 'Game Session identity mismatch' });
    const envelope = validateContentEnvelope(officeContentSchema, await host.content.load());
    if (!envelope.success)
      throw new HostError({ code: 'CONTENT_INCOMPATIBLE', message: 'Invalid office content' });
    const content = envelope.data.payload;
    let stored = await loadOfficeSave(host);
    let state = createOfficeState(content);
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
      const day = content.days[state.day];
      const actions = state.intro
        ? [
            {
              label: '打卡上班',
              run: () =>
                act(() => {
                  state = { ...state, intro: false };
                }),
            },
          ]
        : state.caught
          ? [
              {
                label: '从周一重来',
                run: () =>
                  act(() => {
                    state = restartOfficeRun(state, content);
                  }),
              },
              ...(host.session.capabilities.includes('advertising')
                ? [
                    {
                      label: '销毁浏览记录',
                      run: () =>
                        act(async () => {
                          if (
                            (
                              await host.ads.offer({
                                id: 'office.rescue',
                                reward: { suspicion: -85 },
                              })
                            ).status === 'completed'
                          )
                            state = rescueOfficeRun(state);
                        }),
                    },
                  ]
                : []),
            ]
          : state.done
            ? [
                {
                  label: '再过一周',
                  run: () =>
                    act(() => {
                      state = restartOfficeRun(state, content);
                    }),
                },
              ]
            : [
                {
                  label: state.slacking ? '松手！切回表格' : '按住摸鱼',
                  press: () => {
                    state = { ...state, slacking: true };
                    render();
                  },
                  release: () => {
                    state = { ...state, slacking: false };
                    render();
                  },
                },
                {
                  label: `升级防窥屏 Lv.${state.shieldLevel}`,
                  run: () =>
                    act(async () => {
                      const next = buyPrivacyScreen(state, stored.save);
                      state = next.state;
                      stored = await writeOfficeSave(host, stored.save, next.save, stored.version);
                    }),
                },
              ];
      surface.draw({
        title: '打工人摸鱼记',
        color: day.color,
        lines: paused
          ? ['摸鱼暂停中']
          : [
              `${day.name} · 剩余 ${state.time} 秒`,
              `快乐 ${state.joy} · 疑心 ${state.suspicion}%`,
              `游戏币 ${stored.save.coins} · 最佳快乐 ${stored.save.bestOffice}`,
              ...(operation ? ['正在处理…'] : []),
            ],
        actions: paused || operation ? [] : actions,
      });
    };
    const timer = setInterval(() => {
      if (paused || disposed || state.intro || state.caught || state.done) return;
      state = advanceOfficeTick(state, Math.random() < content.days[state.day].inspectionChance);
      if (state.time === 0)
        act(async () => {
          const next = finishOfficeDay(state, stored.save, content);
          state = next.state;
          stored = await writeOfficeSave(host, stored.save, next.save, stored.version);
        });
      else render();
    }, 1_000);
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
