import { activeGun, available, selectable } from './duel-actions.js';
import { DUEL_RULES as R } from './duel-map.js';
import type { DuelView } from './duel-session.js';
import { direction } from './duel-types.js';
import type { Hit } from './view.js';
import { drawDuelMenu } from './duel-menu.js';
export const W = 960,
  H = 540;
const cream = '#f5e8cb',
  gold = '#d6b578';
export function drawDuel(
  c: CanvasRenderingContext2D,
  v: DuelView,
  image: CanvasImageSource | true | null,
): Hit[] {
  const hits: Hit[] = [];
  if (image && image !== true) c.drawImage(image, 0, 0, W, H);
  if (!image) fallback(c, v);
  const label = (
    s: string,
    x: number,
    y: number,
    size = 20,
    color = cream,
    align: CanvasTextAlign = 'center',
  ) => {
    c.font = `600 ${size}px system-ui, sans-serif`;
    c.textAlign = align;
    c.fillStyle = color;
    c.fillText(s, x, y);
  };
  const panel = (x: number, y: number, w: number, h: number, selected = false) => {
    c.fillStyle = selected ? '#654c2de8' : '#211c17df';
    c.strokeStyle = selected ? '#f5cb7f' : '#ab916a';
    c.lineWidth = selected ? 3 : 1.5;
    c.beginPath();
    c.roundRect(x, y, w, h, 8);
    c.fill();
    c.stroke();
  };
  const button = (
    id: string,
    text: string,
    x: number,
    y: number,
    w: number,
    h = 72,
    selected = false,
    disabled = false,
  ) => {
    c.save();
    if (disabled) c.globalAlpha = 0.45;
    panel(x, y, w, h, selected);
    label(text, x + w / 2, y + h / 2 + 7, 20);
    c.restore();
    hits.push({ id, label: text, x, y, w, h, disabled });
  };
  const bar = (value: number, max: number, x: number, y: number, w: number, color: string) => {
    c.fillStyle = '#1d1b18b8';
    c.fillRect(x, y, w, 10);
    c.fillStyle = color;
    c.fillRect(x, y, w * Math.max(0, value / max), 10);
  };
  const me = v.duel.fighters[v.side],
    enemy = v.duel.fighters[v.side === 0 ? 1 : 0],
    g = activeGun(me);
  const mode = v.mode === 'human' ? '真人对战' : v.mode === 'bot' ? '在线机器人' : '本地练习';
  if (['playing', 'paused', 'confirm', 'result'].includes(v.screen) || v.previous === 'paused') {
    if (v.scope) {
      c.save();
      c.fillStyle = '#100e0bea';
      c.beginPath();
      c.rect(0, 0, W, H);
      c.arc(480, 248, 200, 0, Math.PI * 2, true);
      c.fill('evenodd');
      c.strokeStyle = gold;
      c.lineWidth = 8;
      c.beginPath();
      c.arc(480, 248, 201, 0, Math.PI * 2);
      c.stroke();
      c.lineWidth = 1;
      c.strokeStyle = '#332d22cc';
      c.beginPath();
      c.moveTo(445, 248);
      c.lineTo(515, 248);
      c.moveTo(480, 213);
      c.lineTo(480, 283);
      c.stroke();
      c.restore();
    }
    panel(22, 18, 234, 61);
    panel(686, 18, 180, 61);
    label(`我方  ${Math.ceil(me.hp)} / 100`, 38, 42, 18, cream, 'left');
    bar(me.hp, R.hp, 38, 53, 200, me.hp < 35 ? '#c75040' : '#5c9dc5');
    label(
      `${v.mode === 'human' ? '对手' : '机器人'}  ${Math.ceil(enemy.hp)}`,
      702,
      42,
      18,
      cream,
      'left',
    );
    bar(enemy.hp, R.hp, 702, 53, 146, '#bb5948');
    for (const p of [me, enemy]) {
      const city = v.duel.structures.filter((s) => s.side === p.side),
        hp = city.reduce((sum, s) => sum + s.hp, 0),
        max = city.reduce((sum, s) => sum + s.maxHp, 0);
      label(
        p.destroyed ? '城毁 · 地堡暴露' : `城池 ${Math.ceil((hp / max) * 100)}%`,
        p === me ? 38 : 702,
        96,
        15,
        cream,
        'left',
      );
    }
    label(mode, 480, 32, 16);
    button('pause', '', 882, 18, 56, 62);
    c.fillStyle = cream;
    c.fillRect(900, 36, 6, 25);
    c.fillRect(915, 36, 6, 25);
    hits.at(-1)!.label = '暂停';
    if (me.hp < 35 && me.hp > 0) {
      const vignette = c.createRadialGradient(480, 270, 175, 480, 270, 530);
      vignette.addColorStop(0, '#9e172000');
      vignette.addColorStop(1, me.hp < 15 ? '#9e1720d9' : '#9e17206b');
      c.fillStyle = vignette;
      c.fillRect(0, 0, W, H);
    }
    if (v.screen === 'playing') {
      button('scope', v.scope ? '收起望远镜' : '望远镜', 768, 112, 170, 64, v.scope);
      button('retreat', me.medicines ? '回地堡' : '回地堡 · 无补给', 22, 442, 158, 76, me.hp < 35);
      button(
        'crouch',
        me.crouched ? '松手起身' : '按住趴下',
        192,
        442,
        142,
        76,
        me.crouched,
        !g || !!me.route.length,
      );
      const guns = me.guns.filter((gun) => gun.bunker === me.destroyed);
      for (const [i, gun] of guns.entries())
        button(
          `station:${gun.id}`,
          gun.hp <= 0 ? `${gun.label} · 检修` : gun.label,
          351 + i * 136,
          442,
          124,
          76,
          gun.id === me.station,
          !selectable(me, gun),
        );
      if (me.node === 'shelter' && !me.route.length) {
        panel(330, 302, 300, 120);
        label(
          me.healing !== null
            ? `恢复中  +${Math.floor((me.healing * R.heal) / R.healSeconds)} / 35`
            : '地堡补给',
          480,
          335,
          23,
        );
        label(`剩余医疗 ${me.medicines} 份`, 480, 367, 18);
        if (me.healing !== null) bar(me.healing, R.healSeconds, 360, 385, 240, '#79ab85');
        else
          button(
            'heal',
            me.hp >= 100 ? '生命已满' : me.medicines ? '使用医疗' : '补给耗尽',
            670,
            348,
            155,
            70,
            false,
            me.hp >= 100 || !me.medicines,
          );
      }
      if (g) {
        const ready = available(me, g) && g.reload >= 1 && !me.crouched && !me.route.length;
        const charge =
          g.charge === null ? 0 : Math.min(1, (v.duel.time - g.charge) / R.chargeSeconds);
        panel(22, 120, 216, 74);
        label(`仰角 ${g.pitch.toFixed(1)}°  转角 ${g.yaw.toFixed(1)}°`, 130, 149, 16);
        label(
          g.repair !== null
            ? `检修 ${Math.round((g.repair / R.repairSeconds) * 100)}%`
            : ready
              ? '拖动画面调炮'
              : `装填 ${Math.round(g.reload * 100)}%`,
          130,
          179,
          16,
        );
        button('solid', '实心弹', 650, 442, 110, 76, g.ammo === 'solid');
        button('blast', '爆破弹', 650, 356, 110, 76, g.ammo === 'blast');
        button(
          'fire',
          ready
            ? g.charge !== null
              ? `松手发射 ${Math.round(charge * 100)}%`
              : '按住蓄力'
            : me.crouched
              ? '趴下中'
              : g.repair !== null
                ? '检修中'
                : '装填中',
          777,
          410,
          161,
          108,
          g.charge !== null,
          !ready && g.charge === null,
        );
        bar(g.charge === null ? g.reload : charge, 1, 790, 500, 136, gold);
      }
      if (me.lastShot) {
        const s = me.lastShot,
          delta = s.impact ? direction(me.side) * (s.impact.x - enemy.position.x) : null;
        label(
          `上一炮 ${s.pitch.toFixed(1)}° / ${Math.round(s.power * 100)}%${delta === null ? ' · 飞行中' : Math.abs(delta) < 4 ? ' · 目标附近' : delta < 0 ? ` · 偏近 ${Math.abs(delta).toFixed(0)}m` : ` · 偏远 ${delta.toFixed(0)}m`}`,
          480,
          124,
          15,
        );
      }
      const notice = me.route.length
        ? '沿路线转移中'
        : me.hp < 15
          ? '濒死！尽快回地堡'
          : me.hp < 35
            ? '重伤 · 可回地堡恢复'
            : me.hp < 100
              ? '受伤 · 可回地堡恢复'
              : '';
      if (notice || v.message) {
        panel(278, 205, 404, 39);
        label(me.hp < 35 ? notice : v.message || notice, 480, 232, 16);
      }
    }
  }
  drawDuelMenu(c, v, label, panel, button, hits);
  return hits;
}
function fallback(c: CanvasRenderingContext2D, v: DuelView) {
  c.fillStyle = '#b9d4db';
  c.fillRect(0, 0, W, H);
  c.fillStyle = '#7c9465';
  c.fillRect(0, 305, W, 235);
  const project = (x: number, y: number) => ({
    x: 480 + x * direction(v.side) * 4.8,
    y: 338 - y * 7,
  });
  for (const s of v.duel.structures) {
    const p = project(s.position.x, s.position.y);
    c.fillStyle = s.hp > 0 ? '#cbb78e' : '#897b62';
    c.fillRect(
      p.x - s.size.x * 2.4,
      s.hp > 0 ? p.y - s.size.y * 3.5 : 331,
      s.size.x * 4.8,
      s.hp > 0 ? s.size.y * 7 : 7,
    );
  }
  for (const p of v.duel.fighters) {
    const at = project(p.position.x, p.position.y);
    c.fillStyle = p.side === v.side ? '#3077a0' : '#a94935';
    c.fillRect(at.x - 4, at.y - (p.crouched ? 5 : 16), 8, p.crouched ? 5 : 16);
    for (const g of p.guns)
      if (available(p, g)) {
        const at = project(g.position.x, g.position.y);
        c.strokeStyle = '#37332c';
        c.lineWidth = 6;
        c.beginPath();
        c.moveTo(at.x, at.y - 9);
        c.lineTo(at.x + direction(p.side) * 16, at.y - 17);
        c.stroke();
      }
  }
  for (const s of v.duel.shells) {
    const p = project(s.position.x, s.position.y);
    c.fillStyle = '#242320';
    c.beginPath();
    c.arc(p.x, p.y, 3, 0, Math.PI * 2);
    c.fill();
  }
}
