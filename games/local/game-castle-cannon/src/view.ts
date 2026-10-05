import { C, W, H, box, text, scenery, castle, cannon, flag, projectiles } from './art.js';
import { alive, RELOAD, type Battle, type Ammo } from './rules.js';
import { LEVELS } from './levels.js';
import type { Progress } from './progress.js';
export interface Hit {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  disabled?: boolean;
}
export type Screen =
  | 'home'
  | 'levels'
  | 'playing'
  | 'paused'
  | 'result'
  | 'settings'
  | 'help'
  | 'wardrobe';
export interface View {
  screen: Screen;
  b: Battle;
  p: Progress;
  level: number;
  ammo: Ammo;
  aim: { x: number; y: number } | null;
  message: string;
  practice: boolean;
  ads: boolean;
  adRetry: boolean;
  busy: boolean;
}
export function draw(c: CanvasRenderingContext2D, v: View): Hit[] {
  const hits: Hit[] = [];
  scenery(c);
  const button = (
    id: string,
    label: string,
    x: number,
    y: number,
    w = 180,
    disabled = false,
    primary = false,
  ) => {
    box(c, x, y, w, 60, disabled ? '#c7c4b0' : primary ? C.orange : C.cream, 14);
    text(c, label, x + w / 2, y + 34, 22, disabled ? '#797e72' : C.ink, 'center');
    hits.push({ id, label, x, y, w, h: 60, disabled });
  };
  const heading = (s: string) => {
    box(c, 280, 30, 400, 64, C.cream);
    text(c, s, 480, 74, 32, C.ink, 'center');
  };
  const back = () => button('home', '返回首页', 28, 24, 155);
  if (v.screen === 'playing') {
    castle(c, v.b, v.p.motion, v.p.skin);
    cannon(
      c,
      v.aim ?? v.b.shots.at(-1) ?? null,
      v.b.shots.some((s) => s.remaining > 0.25),
      v.p.skin,
    );
    projectiles(c, v.b, v.aim, v.p.motion);
    box(c, 24, 20, 175, 48, C.cream);
    text(c, `兵力 ${alive(v.b).length}/${v.b.units.length}`, 42, 52, 23);
    box(c, 215, 20, 202, 48, C.cream);
    text(c, `占领 ${Math.round(v.b.capture * 100)}%`, 233, 52, 22);
    text(c, `${v.level + 1} · ${LEVELS[v.level].name}`, 440, 51, 20);
    text(c, `${Math.ceil(v.b.level.duration - v.b.time)}s`, 802, 51, 22);
    box(c, 876, 16, 60, 60, C.ink);
    c.fillStyle = C.cream;
    c.fillRect(894, 29, 7, 27);
    c.fillRect(909, 29, 7, 27);
    hits.push({ id: 'pause', label: '暂停', x: 876, y: 16, w: 60, h: 60 });
    button('solid', '实心弹', 300, 405, 148, false, v.ammo === 'solid');
    button('blast', '爆破弹', 465, 405, 148, false, v.ammo === 'blast');
    box(c, 643, 405, 241, 52, C.cream);
    text(
      c,
      v.b.reload > 0 ? `装填 ${v.b.reload.toFixed(1)}s` : '拖动瞄准 · 松手开炮',
      763,
      437,
      19,
      C.ink,
      'center',
    );
    c.fillStyle = C.orange;
    c.fillRect(652, 448, 222 * (1 - v.b.reload / RELOAD), 4);
    if (v.b.time < 4 || v.b.time - v.b.lastArrow < 1.4 || v.b.shots.length)
      text(c, v.b.notice, 480, 389, 19, C.ink, 'center');
    if (v.practice) text(c, '开发试玩 · 不记录奖励', 480, 89, 17, C.ink, 'center');
  } else if (v.screen === 'home') {
    castle(c, v.b, false, v.p.skin);
    cannon(c, null, false, v.p.skin);
    box(c, 40, 36, 400, 155, C.cream, 24);
    text(c, '一炮拆城', 70, 101, 56);
    text(c, '拆开通路，护送小队夺旗', 73, 150, 22);
    button('start', v.p.cleared.length ? '继续攻城' : '开始攻城', 320, 275, 290, false, true);
    button('levels', '三城地图', 245, 355, 150);
    button('settings', '设置', 411, 355, 125);
    button('help', '帮助', 552, 355, 125);
    button('wardrobe', '旗帜工坊', 693, 355, 170);
  } else if (v.screen === 'levels') {
    heading('三城地图');
    back();
    LEVELS.forEach((l, i) => {
      const x = 185 + i * 255;
      box(c, x - 65, 167, 185, 151, C.stone, 24);
      flag(c, x + 35, 121, i <= v.p.unlocked ? C.blue : C.shadow);
      box(c, x - 14, 230, 48, 88, '#aa7d55', 20);
      text(c, `${i + 1} · ${l.name}`, x + 27, 345, 24, C.ink, 'center');
      button(
        `level:${i}`,
        v.p.cleared.includes(l.id)
          ? '已占领 · 再战'
          : i <= v.p.unlocked
            ? '攻下这座城'
            : '前城通关解锁',
        x - 73,
        368,
        202,
        i > v.p.unlocked,
        i === v.p.unlocked,
      );
    });
  } else if (v.screen === 'paused') {
    heading('暂歇，等你开炮');
    button('resume', '继续攻城', 350, 145, 260, false, true);
    button('retry', '重新开始', 350, 220, 260);
    button('help', '战术帮助', 350, 295, 260);
    button('home', '返回首页', 350, 370, 260);
  } else if (v.screen === 'result') {
    heading(v.b.result === 'won' ? '城堡占领！' : '小队撤离');
    text(c, v.b.notice, 480, 140, 24, C.ink, 'center');
    text(
      c,
      `存活 ${alive(v.b).length} 人  ·  损失 ${v.b.losses} 人  ·  ${v.b.time.toFixed(1)} 秒`,
      480,
      182,
      21,
      C.ink,
      'center',
    );
    text(c, v.message, 480, 220, 20, C.ink, 'center');
    button('retry', '再攻一次', 244, 262, 210, false, true);
    button(
      v.b.result === 'won' && v.level < 2 ? 'next' : 'levels',
      v.b.result === 'won' && v.level < 2 ? '下一座城' : '三城地图',
      484,
      262,
      230,
    );
    if (v.ads)
      button(
        v.b.result === 'won' ? 'ad-bonus' : 'ad-retry',
        v.b.result === 'won' ? '自选广告 · 材料 +2' : '自选广告 · 增援重试',
        285,
        332,
        390,
        v.busy ||
          (v.b.result === 'lost' && v.adRetry) ||
          (v.b.result === 'won' && v.p.bonus.includes(v.b.level.id)),
      );
    else text(c, '广告奖励预留 · 当前未接入广告位', 480, 363, 17, C.ink, 'center');
    button('home', '返回首页', 375, 398, 210);
  } else if (v.screen === 'settings') {
    heading('设置');
    back();
    button('sound', `音效 ${v.p.sound ? '开' : '关'}`, 300, 137, 360);
    button('motion', `碎片动画 ${v.p.motion ? '开' : '简化'}`, 300, 210, 360);
    text(c, '基础瞄准与两种炮弹始终免费', 480, 311, 22, C.ink, 'center');
    text(c, '存档自动保存在当前设备', 480, 350, 20, C.ink, 'center');
  } else if (v.screen === 'help') {
    heading('攻城小册');
    button('back', '返回', 28, 24, 150);
    const lines = [
      '拖动战场瞄准建筑，松手开炮；装填时观察战局。',
      '实心弹：穿透单个目标，伤害 3。爆破弹：附近 84 范围，伤害 2。',
      '门挡通路，箭塔射击；先破门推进快，先拆塔减员少。',
      '小兵自动推进，清除门与障碍后到达旗帜，存活兵越多夺旗越快。',
      '全员撤离或时间耗尽即失败。两种弹药可自由切换。',
      '关卡首胜得材料，重玩不重复领奖；旗帜与头盔仅改变外观。',
    ];
    lines.forEach((s, i) => text(c, s, 65, 145 + i * 45, 20));
  } else {
    heading('旗帜工坊');
    back();
    text(c, `材料 ${v.p.materials} · 仅改变旗帜与头盔`, 480, 128, 23, C.ink, 'center');
    ['蓝天旗', '麦穗旗', '珊瑚旗'].forEach((s, i) => {
      flag(c, 212 + i * 255, 179, [C.blue, '#d5a435', '#cb756c'][i]);
      text(c, s, 235 + i * 255, 280, 25, C.ink, 'center');
      button(
        `skin:${i}`,
        v.p.skin === i ? '已装备' : v.p.owned.includes(i) ? '装备' : '制作 · 6 材料',
        143 + i * 255,
        322,
        190,
        !v.p.owned.includes(i) && v.p.materials < 6,
        v.p.skin === i,
      );
    });
  }
  if (v.screen !== 'playing' && v.screen !== 'result' && v.message)
    text(c, v.message, 480, H - 14, 17, C.ink, 'center');
  return hits;
}
export { W, H };
