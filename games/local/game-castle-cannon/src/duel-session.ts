import type { GameHost, JsonValue } from '@coffeeeeffoc/game-contract';
import { activeGun, command } from './duel-actions.js';
import { DuelBot } from './duel-bot.js';
import { DUEL_RULES as R } from './duel-map.js';
import { competitionEnabled, DuelConnection, serverAddress } from './duel-network.js';
import { newProgress, readProgress } from './progress.js';
import { beginCampaign, campaignAction, settleCampaign } from './campaign-session.js';
import { preferenceAction, saveDuelRecord } from './duel-progress.js';
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
    campaignLevel: null,
    chapterPage: Math.floor(p.unlocked / 10),
  };
  let connection: DuelConnection | null = null,
    bot = new DuelBot(1),
    accumulator = 0,
    disposed = false,
    generation = 0,
    suspended = false,
    autoPaused = false;
  let persisted = '',
    saveQueue = Promise.resolve(),
    lastSound = 0,
    lastImpactSound = 0;
  const save = () => {
    const value = JSON.parse(JSON.stringify(v.p)) as JsonValue;
    saveQueue = saveQueue.then(async () => {
      try {
        await host.storage.write('castle-cannon:progress', value);
      } catch {
        v.message = '存档暂不可用，本局仍可继续';
      }
    });
  };
  const send = (c: Command) => {
    if (connection) connection.send(c);
    else {
      const shots = v.duel.nextId;
      command(v.duel, v.side, c);
      if (v.campaignLevel !== null && v.duel.nextId > shots) v.message = '';
    }
  };
  const { input, cancel } = duelInput(v, send, action, () => !!connection);
  function practice(dev = false) {
    generation++;
    connection?.dispose();
    connection = null;
    cancel();
    v.duel = createDuel();
    v.side = 0;
    v.mode = 'practice';
    v.campaignLevel = null;
    v.matchId = `practice:${Date.now()}`;
    v.developer = dev;
    v.screen = 'playing';
    v.scope = false;
    v.scopeX = v.scopeY = 0;
    v.message = '';
    bot = new DuelBot(1);
    accumulator = 0;
    persisted = '';
    lastSound = lastImpactSound = 0;
  }
  function startCampaign(index: number, preview = false) {
    const next = beginCampaign(v, index, () => practice(preview), preview);
    if (next) bot = next;
  }
  async function match() {
    if (!competitionEnabled()) return practice();
    cancel();
    connection?.dispose();
    const id = ++generation;
    v.screen = 'matching';
    v.waiting = R.matchWait;
    v.message = '';
    v.scope = false;
    v.developer = false;
    v.campaignLevel = null;
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
          if (id !== generation) return;
          if (message && v.screen === 'matching') return practice();
          if (message) cancel();
          v.message = message;
        },
      );
      connection = client;
      await client.join();
    } catch {
      if (disposed || id !== generation) return;
      practice();
    }
  }
  function finish() {
    if (!v.duel.result || persisted === v.matchId) return;
    cancel();
    v.screen = 'result';
    persisted = v.matchId;
    if (v.developer) return;
    if (settleCampaign(v, save)) return;
    const mode = v.mode,
      record = { id: v.matchId, side: v.side, ...v.duel.result };
    saveQueue = saveQueue.then(() => saveDuelRecord(host, mode, record));
  }
  function action(id: string) {
    if (disposed) return;
    if (campaignAction(v, id, startCampaign, cancel)) return;
    const me = v.duel.fighters[v.side],
      gun = activeGun(me);
    if (id === 'start' || id === 'rematch') {
      if (id === 'rematch' && v.mode === 'practice') practice();
      else void match();
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
      v.campaignLevel = null;
      return;
    }
    if (id === 'pause' || id === 'leave') {
      if (v.screen !== 'playing' && !(id === 'leave' && v.screen === 'paused')) return;
      cancel();
      autoPaused = false;
      v.screen = id === 'leave' ? 'confirm' : 'paused';
      return;
    }
    if (id === 'resume') {
      if (v.screen !== 'paused' && v.screen !== 'confirm') return;
      cancel();
      autoPaused = false;
      v.screen = 'playing';
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
    if (preferenceAction(p, id, save)) return;
    if (v.screen !== 'playing' || v.duel.result) return;
    if (id === 'scope') {
      v.scope = !v.scope;
      return;
    }
    if (id === 'retreat' || id === 'heal' || id.startsWith('station:')) {
      cancel();
      v.scope = false;
      if (id.startsWith('station:')) send({ type: 'station', id: id.slice(8) });
      else send({ type: id as 'retreat' | 'heal' });
    }
    if ((id === 'solid' || id === 'blast') && gun) send({ type: 'ammo', ammo: id });
  }
  return {
    v,
    action,
    input,
    cancel,
    get online() {
      return !!connection;
    },
    practice,
    previewCampaign(index: number) {
      if (developer) startCampaign(index, true);
    },
    tick(dt: number) {
      if (disposed || suspended || !Number.isFinite(dt) || dt < 0) return;
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
      suspended = true;
      if (v.screen === 'playing') {
        autoPaused = true;
        v.screen = 'paused';
      }
    },
    resume() {
      suspended = false;
      if (autoPaused && v.screen === 'paused') v.screen = 'playing';
      autoPaused = false;
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
