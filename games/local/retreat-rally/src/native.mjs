import manifest from './manifest.json' with { type: 'json' };
import { LEVELS, validateLevels } from './levels.mjs';
import { createBattle, step, alive, averageStamina, setRetreat } from './simulation.mjs';
import { emptyProgress, migrateProgress, unlocked, recordVictory } from './progress.mjs';
import { render } from './renderer.mjs';

export const defaultRallyEnvelope = {
  gameId: 'retreat-rally',
  schemaVersion: 1,
  revision: 1,
  payload: { levels: LEVELS },
};

// Canvas-only UI uses the existing Game Host for storage and native lifecycle/input.
// No DOM, backend, SDK calls or browser fullscreen APIs enter this module.
export const rallyCanvasDefinition = {
  manifest,
  async mount(target, host) {
    if (host.session.gameId !== manifest.gameId || host.session.gameVersion !== manifest.version)
      throw new Error('Game identity mismatch');
    const content = await host.content.load();
    if (content.gameId !== manifest.gameId || content.schemaVersion !== 1)
      throw new Error('Invalid rally content');
    const levels = content.payload.levels;
    validateLevels(levels);
    let progress = emptyProgress(),
      message = '';
    try {
      progress = migrateProgress((await host.storage.read('progress'))?.value);
    } catch {
      message = '存档暂不可用，本次仍可游玩';
    }
    const canvas = target.canvas,
      c = canvas.getContext('2d');
    if (!c) throw new Error('Canvas 2D unavailable');
    let screen = 'home',
      battle = null,
      mode = 'campaign',
      selected = 0,
      buttons = [],
      background = null,
      disposed = false,
      hidden = false,
      previous = Date.now(),
      timer,
      elapsed = 0;
    let saving = Promise.resolve();
    const held = new Map();
    target
      .loadImage?.('rally-assets/valley.webp')
      .then((img) => {
        if (!disposed) background = img;
      })
      .catch(() => {});
    function release() {
      held.clear();
      if (battle) battle.retreat = { blue: false, red: false };
    }
    function show(name) {
      release();
      screen = name;
    }
    function start(index, nextMode = mode) {
      if (nextMode === 'campaign' && !unlocked(progress, levels[index])) return;
      selected = index;
      mode = nextMode;
      battle = createBattle(levels[index], mode, Math.floor(Math.random() * 10000));
      show('battle');
      previous = Date.now();
    }
    function save() {
      const value = JSON.parse(JSON.stringify(progress));
      saving = saving
        .then(() => host.storage.write('progress', value))
        .catch(() => {
          message = '进度未保存，本次仍可继续';
        });
    }
    const text = (value, x, y, size = 22, color = '#23484e', align = 'center') => {
      c.fillStyle = color;
      c.font = `${size >= 28 ? 'bold ' : ''}${size}px sans-serif`;
      c.textAlign = align;
      c.fillText(value, x, y);
    };
    function button(label, x, y, w, h, run, side = null) {
      const holding = side && battle?.retreat[side];
      c.fillStyle = holding ? '#538d87' : side === 'red' ? '#a44e37' : side ? '#2a6994' : '#9c7a38';
      if (holding) label = (side === 'blue' ? '青岚' : '赤焰') + ' · 收兵中';
      c.fillRect(x, y, w, h);
      c.strokeStyle = '#e6ce91';
      c.lineWidth = 3;
      c.strokeRect(x + 3, y + 3, w - 6, h - 6);
      text(label, x + w / 2, y + h / 2 + 9, 26, '#fff1cc');
      buttons.push({ x, y, w, h, run, side });
    }
    function menu(title, subtitle = '') {
      c.fillStyle = '#f0e7d8e8';
      c.fillRect(0, 0, 1200, 675);
      text(title, 600, 145, 48);
      if (subtitle) text(subtitle, 600, 190, 21, '#6f765f');
    }
    function draw() {
      if (disposed) return;
      buttons = [];
      const rotated = canvas.height > canvas.width;
      const w = rotated ? canvas.height : canvas.width,
        h = rotated ? canvas.width : canvas.height;
      c.save();
      if (rotated) {
        c.translate(canvas.width, 0);
        c.rotate(Math.PI / 2);
      }
      render(c, battle, { width: w, height: h, time: elapsed, background, home: !battle });
      c.scale(w / 1200, h / 675);
      if (screen === 'home') {
        c.fillStyle = '#f0e7d8d9';
        c.fillRect(0, 0, 625, 675);
        text('收兵再冲', 325, 210, 76);
        text('退一步，赢下一场。', 325, 275, 27);
        text('一枚军令 · 一场逆转', 325, 320, 18);
        button('开始战役', 125, 370, 390, 80, () =>
          start(
            Math.max(
              0,
              levels.findIndex((l) => !progress.medals[l.id]),
            ),
            'campaign',
          ),
        );
        button('战役地图', 125, 475, 185, 76, () => show('levels'));
        button('玩法', 330, 475, 185, 76, () => show('help'));
        button('随机匹配 · 模拟', 655, 560, 250, 78, () => {
          mode = 'random';
          show('prepare');
        });
        button('好友对战 · 同屏', 925, 560, 250, 78, () => {
          mode = 'friend';
          show('prepare');
        });
      } else if (screen === 'levels') {
        menu('山河三关', '保全六人夺旗，获得三枚军功');
        levels.forEach((l, i) => {
          const x = 65 + i * 390;
          text(['山', '追', '弩'][i], x + 145, 295, 76, '#477470');
          text(l.description, x + 145, 350, 19);
          const open = unlocked(progress, l);
          button(open ? l.name : '未解锁', x, 400, 290, 80, () => open && start(i, 'campaign'));
          text('◆'.repeat(progress.medals[l.id] || 0), x + 145, 540, 30, '#a88941');
        });
        button('回营', 70, 35, 140, 70, () => show('home'));
      } else if (screen === 'prepare') {
        const friend = mode === 'friend';
        menu(
          friend ? '好友，来一局' : '随机对阵 · 本地模拟',
          friend ? '蓝方按左下，红方按右下；松手进攻' : '对手由本机控制，不是在线玩家',
        );
        text('青岚军', 310, 330, 42, '#2a6a91');
        text('对阵', 600, 330, 28);
        text('赤焰军', 890, 330, 42, '#a34f36');
        text(friend ? '双方各六人，共用这块屏幕' : '每次抽选不同指挥节奏的模拟对手', 600, 400, 24);
        button('整军出发', 425, 475, 350, 82, () => start(friend ? 0 : 1, mode));
        button('回营', 70, 35, 140, 70, () => show('home'));
      } else if (screen === 'help') {
        menu('一令定进退');
        text('松手进攻，按住收兵；脱离接战范围恢复体力。', 600, 270, 26);
        text('看准橙色箭雨预警，躲过最后一箭再出击。', 600, 330, 26);
        text('阵亡不会复活，收兵不回血；一直退会丢旗。', 600, 390, 26);
        button('领命，回营', 425, 490, 350, 82, () => show('home'));
      } else if (screen === 'battle') {
        c.fillStyle = '#f4ecd9e8';
        c.fillRect(70, 65, 300, 78);
        c.fillRect(830, 65, 300, 78);
        text(
          `青岚 ${alive(battle, 'blue').length}/6 · 旗 ${Math.ceil(battle.flags.blue)}%`,
          220,
          96,
          24,
          '#2e6787',
        );
        text(`体力 ${Math.round(averageStamina(battle, 'blue'))}%`, 220, 126, 18);
        text(
          `赤焰 ${alive(battle, 'red').length}/6 · 旗 ${Math.ceil(battle.flags.red)}%`,
          980,
          96,
          24,
          '#a8563d',
        );
        text(`体力 ${Math.round(averageStamina(battle, 'red'))}%`, 980, 126, 18);
        text(
          mode === 'campaign' ? levels[selected].name : mode === 'friend' ? '好友同屏' : '模拟对手',
          600,
          103,
          27,
        );
        const v = battle.volley;
        const label =
          v.phase === 'warning'
            ? `箭雨将至 ${v.timer.toFixed(1)}秒`
            : v.phase === 'gap'
              ? '还有一轮！'
              : v.phase === 'impact'
                ? '箭雨落下'
                : v.phase === 'silent'
                  ? '弓阵已破，向前夺旗'
                  : `弓兵装填 ${Math.ceil(v.timer)}秒`;
        c.fillStyle = ['warning', 'gap', 'impact'].includes(v.phase) ? '#a74f35' : '#294d49';
        c.fillRect(425, 145, 350, 62);
        text(label, 600, 185, 25, '#fff1d2');
        if (mode === 'friend') button('青岚 · 按住收兵', 80, 555, 330, 90, null, 'blue');
        button(
          mode === 'friend' ? '赤焰 · 按住收兵' : '按住收兵 · 松手进攻',
          815,
          555,
          330,
          90,
          null,
          mode === 'friend' ? 'red' : 'blue',
        );
        const pause = { x: 1090, y: 135, w: 75, h: 78, run: () => show('paused') };
        buttons.push(pause);
        c.fillStyle = '#f6ead2';
        c.fillRect(pause.x, pause.y, pause.w, pause.h);
        c.fillStyle = '#23494d';
        c.fillRect(1114, 158, 8, 30);
        c.fillRect(1133, 158, 8, 30);
      } else if (screen === 'paused') {
        menu('整军，再出发', '战场已暂停，等你一声令下。');
        button('继续战斗', 425, 270, 350, 82, () => {
          show('battle');
          previous = Date.now();
        });
        button('重新出战', 425, 375, 350, 82, () => start(selected, mode));
        button('返回营地', 425, 480, 350, 82, () => {
          battle = null;
          show('home');
        });
      } else if (screen === 'result') {
        menu(
          battle.status === 'draw'
            ? '鸣金，各自收兵'
            : battle.status === 'won'
              ? '青岚军胜'
              : '赤焰军胜',
          battle.reason,
        );
        text(
          `用时 ${Math.ceil(battle.time)}秒 · 蓝方存活 ${alive(battle, 'blue').length}/6 · 避开齐射 ${battle.dodged}`,
          600,
          280,
          25,
        );
        if (mode === 'campaign' && battle.status === 'won' && selected < levels.length - 1)
          button('下一关', 425, 350, 350, 80, () => start(selected + 1, 'campaign'));
        button('再战一局', 265, 470, 300, 80, () => start(selected, mode));
        button('返回营地', 625, 470, 300, 80, () => {
          battle = null;
          show('home');
        });
      }
      if (message) text(message, 600, 658, 18, '#944b37');
      c.restore();
    }
    function point(x, y) {
      return canvas.height > canvas.width
        ? { x: (y / canvas.height) * 1200, y: ((canvas.width - x) / canvas.width) * 675 }
        : { x: (x / canvas.width) * 1200, y: (y / canvas.height) * 675 };
    }
    const hit = (p) =>
      buttons.find((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
    const sync = () => {
      if (battle)
        for (const side of ['blue', 'red'])
          setRetreat(
            battle,
            side,
            [...held.values()].some((b) => b.side === side),
          );
    };
    let stop;
    if (target.onPointer) {
      stop = target.onPointer((e) => {
        if (hidden || disposed) return;
        const p = point(e.x, e.y);
        if (e.phase === 'down') {
          const b = hit(p);
          if (b) held.set(e.pointerId, b);
          sync();
        }
        if (e.phase === 'up' || e.phase === 'cancel') {
          const b = held.get(e.pointerId);
          held.delete(e.pointerId);
          sync();
          const end = hit(p);
          if (e.phase === 'up' && b && !b.side && end?.x === b.x && end?.y === b.y) b.run?.();
        }
      });
    } else {
      stop = target.onTap((x, y) => hit(point(x, y))?.run?.());
      message = '当前宿主缺少多点长按能力，请升级宿主后游玩';
    }
    timer = setInterval(() => {
      if (hidden || disposed) return;
      const now = Date.now(),
        dt = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      elapsed += dt;
      if (screen === 'battle') {
        step(battle, dt);
        if (battle.status !== 'playing') {
          if (recordVictory(progress, battle)) save();
          show('result');
        }
      }
      draw();
    }, 1000 / 30);
    draw();
    return {
      pause() {
        hidden = true;
        release();
        if (screen === 'battle') show('paused');
      },
      resume() {
        hidden = false;
        previous = Date.now();
        draw();
      },
      async dispose() {
        disposed = true;
        clearInterval(timer);
        release();
        stop?.();
        await saving;
      },
    };
  },
};
