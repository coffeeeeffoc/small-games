import type { GameHost, JsonValue } from '@coffeeeeffoc/game-contract';
import { LEVELS } from './levels.js';
import { createBattle, shoot, step } from './rules.js';
import { newProgress, readProgress, settle } from './progress.js';
import type { View, Screen } from './view.js';
export async function createSession(
  host: GameHost,
  sound: (name: string) => void,
  dev = false,
  advertisingConfigured = false,
) {
  const v: View = {
    screen: 'home',
    b: createBattle(LEVELS[0]),
    p: newProgress(),
    level: 0,
    ammo: 'solid',
    aim: null,
    message: '',
    feedback: '',
    feedbackUntil: 0,
    practice: false,
    ads:
      advertisingConfigured &&
      host.session.adAuthority !== 'none' &&
      host.session.capabilities.includes('advertising'),
    adRetry: false,
    busy: false,
  };
  let saving = Promise.resolve(),
    disposed = false,
    hidden = false,
    returnTo: Screen = 'home',
    pointer: { id: number; hit: string | null } | null = null;
  try {
    const raw = await host.storage.read('castle-cannon:progress');
    if (raw) v.p = readProgress(raw.value);
  } catch {
    v.message = '存档暂不可用，本次仍可游玩';
  }
  v.level = v.p.unlocked;
  v.b = createBattle(LEVELS[v.level]);
  const save = () => {
    const value = JSON.parse(JSON.stringify(v.p)) as JsonValue;
    saving = saving.then(async () => {
      try {
        await host.storage.write('castle-cannon:progress', value);
      } catch {
        v.message = '存档未保存，本次仍可游玩';
      }
    });
  };
  const playSound = (name: string) => {
    if (v.p.sound && !hidden && !disposed) sound(name);
  };
  function start(index = v.level, bonus = 0, practice = false, keepAd = false) {
    if (index < 0 || index >= LEVELS.length || (!practice && index > v.p.unlocked)) return;
    v.level = index;
    v.b = createBattle(LEVELS[index], bonus);
    v.screen = 'playing';
    v.practice = practice;
    v.aim = null;
    pointer = null;
    v.message = '';
    v.feedback = '';
    v.feedbackUntil = 0;
    if (!keepAd) v.adRetry = false;
  }
  function action(id: string) {
    if (disposed || v.busy) return;
    if (id === 'solid' || id === 'blast') {
      v.ammo = id;
      return;
    }
    v.aim = null;
    pointer = null;
    if (id === 'start') start(v.p.unlocked);
    else if (id === 'home') {
      v.screen = 'home';
      v.b = createBattle(LEVELS[v.p.unlocked]);
      v.level = v.p.unlocked;
    } else if (id === 'levels') v.screen = 'levels';
    else if (id.startsWith('level:')) start(Number(id.split(':')[1]));
    else if (id === 'next') start(v.level + 1);
    else if (id === 'retry') start(v.level, 0, v.practice);
    else if (id === 'pause' && v.screen === 'playing') v.screen = 'paused';
    else if (id === 'resume' && v.screen === 'paused') v.screen = 'playing';
    else if (id === 'settings' || id === 'wardrobe') v.screen = id;
    else if (id === 'help') {
      returnTo = v.screen === 'paused' ? 'paused' : 'home';
      v.screen = 'help';
    } else if (id === 'back') v.screen = returnTo;
    else if (id === 'sound') {
      v.p.sound = !v.p.sound;
      save();
    } else if (id === 'quality') {
      v.p.lowPower = !v.p.lowPower;
      save();
    } else if (id === 'motion') {
      v.p.motion = !v.p.motion;
      save();
    } else if (id.startsWith('skin:')) {
      const skin = Number(id.split(':')[1]);
      if (skin !== 0 && skin !== 1 && skin !== 2) return;
      if (!v.p.owned.includes(skin)) {
        if (v.p.materials < 6) return;
        v.p.materials -= 6;
        v.p.owned.push(skin);
      }
      v.p.skin = skin;
      save();
    } else if (id === 'ad-retry' || id === 'ad-bonus') void reward(id);
  }
  async function reward(id: string) {
    if (!v.ads || v.practice || v.screen !== 'result' || v.busy) return;
    const retry = id === 'ad-retry';
    if (
      retry
        ? v.b.result !== 'lost' || v.adRetry
        : v.b.result !== 'won' || v.p.bonus.includes(v.b.level.id)
    )
      return;
    v.busy = true;
    try {
      const outcome = await host.ads.offer({
        id: `castle-cannon:${retry ? 'retry' : 'materials'}`,
        reward: retry ? { reinforcements: 3 } : { materials: 2 },
      });
      if (disposed) return;
      if (outcome.status === 'completed') {
        if (retry) {
          v.adRetry = true;
          start(v.level, 3, false, true);
        } else {
          v.p.bonus.push(v.b.level.id);
          v.p.materials += 2;
          v.message = '额外获得 2 材料';
          save();
        }
      } else
        v.message =
          outcome.status === 'dismissed' ? '已取消，可正常重试' : '广告暂不可用，可正常重试';
    } catch {
      v.message = '广告暂不可用，可正常重试';
    } finally {
      v.busy = false;
    }
  }
  function tick(seconds: number) {
    if (hidden || disposed || v.screen !== 'playing' || v.busy) return;
    const destroyed = v.b.modules.filter((m) => m.hp === 0).length;
    const losses = v.b.losses;
    step(v.b, seconds);
    if (v.b.modules.filter((m) => m.hp === 0).length > destroyed) playSound('break');
    if (v.b.losses > losses) playSound('arrow');
    if (v.b.result !== 'playing') {
      v.screen = 'result';
      v.aim = null;
      pointer = null;
      if (v.b.result === 'won') {
        const reward = settle(v.p, v.level, v.practice);
        v.message = v.practice
          ? '开发试玩，不记录进度'
          : reward
            ? `首次占领 · 获得 ${reward} 材料`
            : '已通关重玩 · 材料已领取';
        save();
      } else v.message = '先拆箭塔留住兵力，再打开通路';
      playSound(v.b.result === 'won' ? 'win' : 'lose');
    }
  }
  function input(
    phase: 'down' | 'move' | 'up' | 'cancel',
    id: number,
    x: number,
    y: number,
    hit: string | null,
  ) {
    if (hidden || disposed || v.busy) return;
    if (phase === 'down') {
      if (pointer) return;
      pointer = { id, hit };
      if (!hit && v.screen === 'playing') v.aim = { x, y };
    } else if (pointer?.id === id) {
      if (phase === 'move' && !pointer.hit && !hit && v.screen === 'playing') v.aim = { x, y };
      if (phase === 'up') {
        const from = pointer.hit;
        pointer = null;
        const aim = hit && v.aim ? v.aim : { x, y };
        v.aim = null;
        if (from) {
          if (from === hit) action(from);
        } else if (v.screen === 'playing') {
          if (shoot(v.b, v.ammo, aim.x, aim.y)) {
            playSound('fire');
            v.feedback = '炮弹出膛';
          } else
            v.feedback =
              v.b.reload > 0
                ? `正在装填 · ${v.b.reload.toFixed(1)} 秒后可开炮`
                : '请瞄准战场内的目标';
          v.feedbackUntil = v.b.time + 1.5;
        }
      }
      if (phase === 'cancel') {
        if (!pointer?.hit && v.screen === 'playing') {
          v.feedback = '瞄准已取消 · 重新拖动';
          v.feedbackUntil = v.b.time + 1.5;
        }
        pointer = null;
        v.aim = null;
      }
    }
  }
  return {
    v,
    action,
    tick,
    input,
    practice(index: number) {
      if (dev) start(index, 0, true);
    },
    pause() {
      hidden = true;
      pointer = null;
      v.aim = null;
    },
    resume() {
      hidden = false;
    },
    async dispose() {
      disposed = true;
      pointer = null;
      v.aim = null;
      await saving;
    },
  };
}
