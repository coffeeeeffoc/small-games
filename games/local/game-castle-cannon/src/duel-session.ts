import type { GameHost, JsonValue } from '@coffeeeeffoc/game-contract';
import { activeGun, command } from './duel-actions.js';
import { DuelBot } from './duel-bot.js';
import { DUEL_RULES as R } from './duel-map.js';
import { DuelConnection, serverAddress } from './duel-network.js';
import { newProgress, readProgress } from './progress.js';
import { createDuel, stepDuel } from './duel-simulation.js';
import { type Command } from './duel-types.js';
import { duelInput } from './duel-input.js';
import type { DuelView, DuelScreen } from './duel-view.js';
export type { DuelView } from './duel-view.js';
export async function createDuelSession(
  host: GameHost,
  play: (name: string) => void,
  developer = false,
  configureServer?: (current: string) => Promise<string | null>,
) {
  let p = newProgress(),
    address = '';
  try {
    const record = await host.storage.read('castle-cannon:progress');
    if (record) p = readProgress(record.value);
  } catch {
    /* Local play remains available. */
  }
  try {
    const record = await host.storage.read('castle-cannon:duel-server');
    if (typeof record?.value === 'string') address = record.value;
  } catch {
    /* Optional network setting. */
  }
  const v: DuelView = {
    screen: 'home',
    previous: 'home',
    duel: createDuel(),
    side: 0,
    mode: 'practice',
    p,
    scope: false,
    scopeX: 0,
    scopeY: 0,
    message: '',
    waiting: R.matchWait,
    address,
    developer,
    matchId: '',
  };
  let connection: DuelConnection | null = null,
    bot = new DuelBot(1),
    accumulator = 0,
    disposed = false,
    generation = 0;
  let persisted = '',
    saveQueue = Promise.resolve(),
    lastSound = 0,
    lastImpactSound = 0;
  const save = () => {
    saveQueue = saveQueue.then(async () => {
      try {
        await host.storage.write('castle-cannon:progress', v.p as unknown as JsonValue);
      } catch {
        v.message = '存档暂不可用，本局仍可继续';
      }
    });
  };
  const send = (c: Command) => {
    if (connection) connection.send(c);
    else command(v.duel, v.side, c);
  };
  const controls = duelInput(v, send, action, () => !!connection);
  const cancel = controls.cancel;
  function practice(dev = false) {
    generation++;
    connection?.dispose();
    connection = null;
    cancel();
    v.duel = createDuel();
    v.side = 0;
    v.mode = 'practice';
    v.matchId = `practice:${Date.now()}`;
    v.developer = dev;
    v.screen = 'playing';
    v.scope = false;
    v.scopeX = v.scopeY = 0;
    bot = new DuelBot(1);
    accumulator = 0;
    persisted = '';
    lastSound = lastImpactSound = 0;
  }
  async function match() {
    cancel();
    connection?.dispose();
    const id = ++generation;
    v.screen = 'matching';
    v.waiting = R.matchWait;
    v.message = '';
    v.scope = false;
    v.developer = false;
    try {
      const address = serverAddress(v.address);
      const client = new DuelConnection(
        address,
        (m) => {
          if (disposed || id !== generation) return;
          if (m.kind === 'waiting') v.waiting = m.seconds;
          else {
            if (v.matchId !== m.matchId) {
              lastSound = lastImpactSound = 0;
              persisted = '';
            }
            v.duel = m.state;
            v.side = m.side;
            v.mode = m.mode;
            v.matchId = m.matchId;
            if (v.screen === 'matching') {
              v.screen = 'playing';
              v.message = m.mode === 'bot' ? '暂未匹配真人，机器人已就位' : '已匹配真人';
            }
            finish();
          }
        },
        (message) => {
          if (id === generation) {
            if (message) cancel();
            v.message = message;
          }
        },
      );
      connection = client;
      await client.join();
    } catch {
      if (disposed || id !== generation) return;
      connection?.dispose();
      connection = null;
      practice();
      v.message = '联网服务不可用 · 已进入本地机器人练习';
    }
  }
  function finish() {
    if (!v.duel.result || persisted === v.matchId) return;
    cancel();
    v.screen = 'result';
    persisted = v.matchId;
    if (v.developer) return;
    const matchId = v.matchId,
      mode = v.mode,
      side = v.side,
      result = { ...v.duel.result };
    saveQueue = saveQueue.then(async () => {
      try {
        const key = `castle-cannon:duel-records:${mode}`;
        const old = (await host.storage.read(key))?.value;
        const records = Array.isArray(old)
          ? old.filter((r) => r && typeof r === 'object' && !Array.isArray(r))
          : [];
        if (
          records.some(
            (r) => r && typeof r === 'object' && !Array.isArray(r) && 'id' in r && r.id === matchId,
          )
        )
          return;
        records.push({ id: matchId, winner: result.winner, side, reason: result.reason });
        await host.storage.write(key, records.slice(-50));
      } catch {
        /* Failed optional history does not alter a finished match. */
      }
    });
  }
  function action(id: string) {
    const me = v.duel.fighters[v.side],
      gun = activeGun(me);
    if (id === 'start' || id === 'rematch') {
      void match();
      return;
    }
    if (id === 'practice') {
      v.screen = 'maps';
      return;
    }
    if (id === 'map-ravine') {
      practice();
      return;
    }
    if (id === 'cancel-match' || id === 'home' || id === 'leave-confirm') {
      generation++;
      cancel();
      connection?.dispose();
      connection = null;
      v.screen = 'home';
      v.scope = false;
      v.message = '';
      return;
    }
    if (id === 'pause') {
      cancel();
      v.screen = 'paused';
      return;
    }
    if (id === 'resume') {
      cancel();
      v.screen = 'playing';
      return;
    }
    if (id === 'leave') {
      cancel();
      v.screen = 'confirm';
      return;
    }
    if (id === 'back') {
      v.screen = v.previous;
      return;
    }
    if (id === 'server' && configureServer) {
      void configureServer(v.address).then(async (value) => {
        if (value === null) return;
        try {
          v.address = serverAddress(value);
          await host.storage.write('castle-cannon:duel-server', v.address);
          v.message = '对战服务地址已保存';
        } catch (e) {
          v.message = e instanceof Error ? e.message : '地址保存失败';
        }
      });
      return;
    }
    if (['settings', 'help', 'skins'].includes(id)) {
      v.previous = v.screen;
      v.screen = id as DuelScreen;
      return;
    }
    if (id === 'sound' || id === 'motion' || id === 'lowPower') {
      p[id] = !p[id];
      save();
      return;
    }
    if (id.startsWith('skin:')) {
      const skin = Number(id.slice(5));
      if (skin === 0 || skin === 1 || skin === 2) {
        if (p.owned.includes(skin)) p.skin = skin;
        else if (p.materials >= 40) {
          p.materials -= 40;
          p.owned.push(skin);
          p.skin = skin;
        }
        save();
      }
      return;
    }
    if (v.screen !== 'playing' || v.duel.result) return;
    if (id === 'scope') {
      v.scope = !v.scope;
      return;
    }
    if (id === 'retreat' || id === 'heal') send({ type: id });
    if (id.startsWith('station:')) send({ type: 'station', id: id.slice(8) });
    if ((id === 'solid' || id === 'blast') && gun) send({ type: 'ammo', ammo: id });
  }
  return {
    v,
    action,
    input: controls.input,
    cancel,
    practice,
    tick(dt: number) {
      if (disposed) return;
      if (!connection && v.screen === 'playing') {
        accumulator += Math.min(dt, 0.25);
        while (accumulator >= R.step) {
          accumulator -= R.step;
          bot.tick(v.duel);
          stepDuel(v.duel);
        }
        finish();
      }
      if (p.sound && v.screen === 'playing') {
        for (const s of v.duel.shells)
          if (s.id > lastSound) {
            lastSound = s.id;
            play('shot');
          }
        for (const i of v.duel.impacts)
          if (i.id > lastImpactSound) {
            lastImpactSound = i.id;
            play('impact');
          }
      }
    },
    pause() {
      cancel();
      if (v.screen === 'playing') v.screen = 'paused';
    },
    resume() {
      if (v.screen === 'paused') v.screen = 'playing';
    },
    async dispose() {
      disposed = true;
      generation++;
      cancel();
      connection?.dispose();
      await saveQueue;
    },
  };
}
