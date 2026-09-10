import {
  assertHostCapabilities,
  HostError,
  type GameDefinition,
} from '@coffeeeeffoc/game-contract';
import { validateContentEnvelope } from '@coffeeeeffoc/content-schema';
import type { CanvasGameTarget } from '@coffeeeeffoc/canvas-game-adapter';
import { arenaManifest } from './manifest.js';
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
  controlArena,
  tickArena,
} from './domain/state.js';
import { mutationOptions } from './domain/model.js';
import { drawArena } from './view/scene.js';
import { createArenaAudio } from './view/audio.js';
export { arenaManifest } from './manifest.js';
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
    let muted = false;
    let time = 0;
    let played = -1;
    let operation: Promise<void> | null = null;
    let error = '';
    const ctx = target.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    const sound = createArenaAudio(target.createSound);
    type Action = { label: string; run(): void; release?(): void };
    let actions: Action[] = [];
    let held: Action | undefined;
    let pointer: number | null = null;
    function act(work: () => void | Promise<void>) {
      if (paused || disposed || operation) return;
      operation = Promise.resolve()
        .then(work)
        .catch(() => {
          error = '暂时未完成，请再试一次。';
        })
        .finally(() => {
          operation = null;
          render();
        });
    }
    function render() {
      if (disposed || !ctx) return;
      const d = state.duel;
      const control = (input: Parameters<typeof controlArena>[1]) => {
        state = controlArena(state, input);
      };
      actions =
        state.phase === 'egg'
          ? content.species.slice(0, 3).map(([name], i) => ({
              label: name,
              run: () => {
                state = hatchArena(content, (i + 0.2) / content.species.length);
              },
            }))
          : state.phase === 'mutate' && state.creature
            ? mutationOptions(content, state.creature.attack + state.pickRound + state.tier).map(
                (trait) => ({
                  label: trait.name,
                  run() {
                    state = chooseMutation(state, trait);
                  },
                }),
              )
            : state.phase === 'ready'
              ? [
                  {
                    label: '开盆，迎战！',
                    run() {
                      state = startBattle(state, content);
                      played = -1;
                    },
                  },
                ]
              : state.phase === 'battle'
                ? [
                    {
                      label: '按住拨草',
                      run: () => control('tease'),
                      release: () => control('release'),
                    },
                    {
                      label: '闪身避锋',
                      run: () => control('dodge'),
                    },
                    {
                      label: '收势回气',
                      run: () => control('rest'),
                      release: () => control('cancel'),
                    },
                  ]
                : [
                    {
                      label: state.win ? '调养晋级' : '重新挑虫',
                      run() {
                        state = state.win ? advanceLeague(state) : createArenaState();
                      },
                    },
                    ...(!state.win && host.session.capabilities.includes('advertising')
                      ? [
                          {
                            label: '赛后调养',
                            run() {
                              act(async () => {
                                const result = await host.ads.offer({
                                  id: 'arena.post-match-mutation',
                                  reward: { mutation: 1 },
                                });
                                if (!disposed && result.status === 'completed')
                                  state = rewardedMutation(
                                    state,
                                    content.traits[
                                      Math.floor(Math.random() * content.traits.length)
                                    ],
                                  );
                              });
                            },
                          },
                        ]
                      : []),
                  ];
      ctx.save();
      ctx.scale(target.canvas.width / 390, target.canvas.height / 844);
      ctx.fillStyle = '#151912';
      ctx.fillRect(0, 0, 390, 844);
      ctx.fillStyle = '#ecdfb8';
      ctx.font = '25px serif';
      ctx.fillText('电子斗蛐蛐', 20, 45);
      ctx.font = '14px sans-serif';
      ctx.fillText(`秋夜斗场 · ${content.ranks[state.tier]}`, 20, 76);
      ctx.fillText(muted ? '声 ×' : '声 ≋', 320, 42);
      ctx.save();
      ctx.translate(-60, 110);
      drawArena(ctx, 510, 410, d, time);
      ctx.restore();
      ctx.fillStyle = '#e8dab0';
      ctx.font = '15px sans-serif';
      ctx.fillText(
        `${state.creature?.species ?? '提笼候场'}  ${d ? Math.ceil(d.hp) : ''}`,
        16,
        111,
      );
      ctx.fillText(`对手 ${d ? Math.ceil(d.enemyHp) : '候场'}`, 260, 111);
      ctx.fillText(
        d
          ? `体力 ${Math.round(d.stamina)} · 蓄势 ${d.charge.toFixed(1)} / 金区 0.6–1.0`
          : '轻拨草梗，听虫而战。',
        18,
        548,
      );
      ctx.font = '13px sans-serif';
      ctx.fillText(
        error ||
          (d?.message ??
            (state.phase === 'mutate'
              ? `入盆前调养 · 还可选 ${state.mutationsLeft} 次`
              : '选虫 → 调养 → 拨草扑咬，闪身反击')),
        18,
        580,
      );
      ctx.fillText('松手扑咬 · 对手抬头后闪避 · 按住回气', 18, 607);
      actions.forEach((action, i) => {
        const w = 358 / actions.length;
        ctx.fillStyle = i === 0 ? '#b09a5f' : '#353e27';
        ctx.fillRect(16 + i * w, 636, w - 6, 66);
        ctx.fillStyle = i === 0 ? '#192014' : '#ecdfb8';
        ctx.fillText(action.label, 22 + i * w, 674);
      });
      ctx.fillStyle = '#b6b293';
      ctx.fillText(`总胜场 ${stored.save.arenaWins} · 游戏币 ${stored.save.coins}`, 18, 745);
      if (operation) ctx.fillText('正在处理…', 18, 811);
      if (paused) {
        ctx.fillStyle = '#11170ff0';
        ctx.fillRect(0, 0, 390, 844);
        ctx.fillStyle = '#eddfb9';
        ctx.font = '22px serif';
        ctx.fillText('先歇一会，虫也歇一会。', 50, 360);
      }
      ctx.restore();
    }
    function down(x: number, y: number) {
      if (paused || disposed || operation) return;
      sound.unlock();
      x = (x * 390) / target.canvas.width;
      y = (y * 844) / target.canvas.height;
      if (x >= 310 && y < 65) {
        muted = !muted;
        sound.mute(muted);
        render();
        return;
      }
      if (y < 636 || y > 702 || x < 16 || x > 374) return;
      held = actions[Math.floor((x - 16) / (358 / actions.length))];
      held?.run();
      render();
    }
    const up = () => {
      if (!paused && !disposed) held?.release?.();
      held = undefined;
      render();
    };
    const cancel = () => {
      pointer = null;
      held = undefined;
      state = controlArena(state, 'cancel');
    };
    let stop: () => void;
    if (target.onPointer) {
      stop = target.onPointer((event) => {
        if (event.phase === 'down' && pointer === null) {
          pointer = event.pointerId;
          down(event.x, event.y);
        } else if (
          event.pointerId === pointer &&
          (event.phase === 'up' || event.phase === 'cancel')
        ) {
          if (event.phase === 'up') up();
          else cancel();
          pointer = null;
        }
      });
    } else {
      const press = target.onPress?.(down, up);
      const tap = target.onTap((x, y) => {
        if (!press) {
          down(x, y);
          up();
        }
      });
      stop = () => {
        press?.();
        tap();
      };
    }
    const timer = setInterval(() => {
      if (paused || disposed || operation) return;
      time += 0.05;
      state = tickArena(state);
      const d = state.duel;
      if (d && d.event !== played) {
        sound.play(d.cue);
        played = d.event;
      }
      if (state.phase === 'battle' && d?.winner != null) {
        act(async () => {
          const result = settleBattle(state, stored.save);
          state = result.state;
          if (result.save !== stored.save)
            stored = await writeArenaSave(host, stored.save, result.save, stored.version);
        });
      }
      render();
    }, 50);
    render();
    return {
      pause() {
        paused = true;
        cancel();
        sound.mute(true);
        render();
      },
      resume() {
        paused = false;
        sound.mute(muted);
        render();
      },
      async dispose() {
        disposed = true;
        clearInterval(timer);
        stop();
        sound.dispose();
        await operation;
        ctx.clearRect(0, 0, target.canvas.width, target.canvas.height);
      },
    };
  },
};
