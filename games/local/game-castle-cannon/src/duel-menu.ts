import type { DuelView } from './duel-session.js';
import { DUEL_MAP } from './duel-map.js';
import type { Hit } from './view.js';
type Label = (
  s: string,
  x: number,
  y: number,
  size?: number,
  color?: string,
  align?: CanvasTextAlign,
) => void;
type Panel = (x: number, y: number, w: number, h: number, selected?: boolean) => void;
type Button = (
  id: string,
  text: string,
  x: number,
  y: number,
  w: number,
  h?: number,
  selected?: boolean,
  disabled?: boolean,
) => void;
export function drawDuelMenu(
  c: CanvasRenderingContext2D,
  v: DuelView,
  label: Label,
  panel: Panel,
  button: Button,
  hits: Hit[],
) {
  const W = 960,
    H = 540,
    gold = '#d6b578';
  const mode = v.mode === 'human' ? '真人对战' : v.mode === 'bot' ? '在线机器人' : '本地练习',
    me = v.duel.fighters[v.side];
  if (v.screen === 'home') {
    const shade = c.createLinearGradient(0, 280, 0, 540);
    shade.addColorStop(0, '#211a1100');
    shade.addColorStop(1, '#211a11f5');
    c.fillStyle = shade;
    c.fillRect(0, 0, W, H);
    c.save();
    c.shadowColor = '#211a11';
    c.shadowBlur = 12;
    label('一炮拆城', 480, 112, 64, '#f3d3a0');
    label('隔城互轰 · 炮手生存', 480, 152, 19);
    c.restore();
    button('start', '开始对战', 350, 315, 260, 82, true);
    button('practice', '机器人练习', 114, 425, 190);
    button('skins', '外观', 322, 425, 158);
    button('help', '帮助', 498, 425, 158);
    button('settings', '设置', 674, 425, 158);
  } else if (v.screen === 'matching') {
    panel(280, 180, 400, 170);
    label('寻找对手', 480, 228, 32);
    label(`${v.waiting} 秒后安排机器人`, 480, 279, 20);
    button('cancel-match', '取消匹配', 365, 373, 230);
  } else if (v.screen === 'maps') {
    panel(230, 120, 500, 265);
    label('机器人练习', 480, 170, 34);
    label('同样的弹道、装填与补给', 480, 211, 19);
    button('map-ravine', DUEL_MAP.label, 340, 250, 280, 84, true);
    button('home', '返回主页', 370, 414, 220);
  } else if (v.screen === 'paused' || v.screen === 'confirm') {
    panel(260, 142, 440, 270);
    label(v.screen === 'confirm' ? '离开当前对局？' : '对局菜单', 480, 192, 32);
    label(v.mode === 'practice' ? '练习已暂停' : '对局仍在继续，角色仍会受伤', 480, 231, 18);
    button('resume', '返回对局', 300, 263, 360, 74, true);
    if (v.screen === 'confirm') button('leave-confirm', '确认离开', 365, 428, 230);
    else {
      button('settings', '设置', 300, 350, 166, 62);
      button('help', '帮助', 494, 350, 166, 62);
      button('leave', '离开对局', 365, 428, 230);
    }
  } else if (v.screen === 'result') {
    panel(250, 160, 460, 227);
    const r = v.duel.result;
    label(r?.winner === null ? '平局' : r?.winner === v.side ? '胜利' : '战败', 480, 236, 62, gold);
    label(
      `${mode} · ${r?.reason === 'death' ? '炮手生命归零' : r?.reason === 'time' ? '对局时间已到' : r?.reason === 'inactive' ? '长时间未操作' : r?.reason === 'disconnect' ? '断线超时' : '对手或自己离开'}`,
      480,
      290,
      19,
    );
    label(`存活 ${Math.floor(v.duel.time)} 秒 · 我方生命 ${Math.ceil(me.hp)}`, 480, 335, 19);
    button('rematch', '再战', 276, 420, 192, 78, true);
    button('home', '返回主页', 492, 420, 192, 78);
  } else if (v.screen === 'settings' || v.screen === 'help' || v.screen === 'skins') {
    panel(190, 68, 580, 362);
    label(
      v.screen === 'settings' ? '设置' : v.screen === 'help' ? '炮手手册' : '炮手外观',
      480,
      117,
      32,
    );
    if (v.screen === 'settings') {
      button('sound', `音效 ${v.p.sound ? '开' : '关'}`, 225, 150, 155);
      button('motion', `动作 ${v.p.motion ? '开' : '关'}`, 404, 150, 155);
      button('lowPower', v.p.lowPower ? '省电画质' : '标准画质', 583, 150, 155);
      button('server', '对战服务地址', 330, 250, 300);
      label('公网联机需要运行对战服务', 480, 366, 18);
    } else if (v.screen === 'help') {
      for (const [i, line] of [
        '拖动画面调整仰角和水平转角。',
        '按住蓄力，松手发射；根据上一炮修正。',
        '望远镜内拖动只改变观察方向。',
        '点炮位转移/检修；趴下暂停操作。',
        '回地堡消耗有限医疗，生命归零即失败。',
        '城毁后只剩地堡炮，内部仍会受伤。',
      ].entries())
        label(line, 480, 165 + i * 38, 19);
    } else {
      label(`旧材料 ${v.p.materials} · 外观不影响战斗能力`, 480, 172, 20);
      ['蓝衣炮手', '金色纹章', '铜色纹章'].forEach((s, i) =>
        button(
          `skin:${i}`,
          `${s}${v.p.owned.includes(i) ? '' : ' 40材料'}`,
          225 + i * 179,
          220,
          155,
          105,
          v.p.skin === i,
          !v.p.owned.includes(i) && v.p.materials < 40,
        ),
      );
    }
    button('back', '返回', 370, 450, 220, 70);
  }

  if (v.message && v.screen === 'settings') label(v.message, 480, 405, 16);
  return hits;
}
