import * as cc from 'cc';
import { DISTRICTS, DISTRICT_NAMES } from './core/route.ts';
export type Control = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  disabled?: boolean;
};
const color = (hex: string) => new cc.Color().fromHEX(hex);
export class Hud {
  root: cc.Node;
  camera: cc.Camera;
  g: cc.Graphics;
  live: cc.Graphics;
  labels = new Map<string, cc.Label>();
  controls: Control[] = [];
  width = 390;
  height = 844;
  screen = '';
  key = '';
  pressed = '';
  constructor(scene: cc.Scene) {
    this.root = new cc.Node('City UI');
    this.root.layer = cc.Layers.Enum.UI_2D;
    scene.addChild(this.root);
    this.root.addComponent(cc.UITransform).setContentSize(this.width, this.height);
    this.root.setPosition(this.width / 2, this.height / 2, 0);
    const canvas = this.root.addComponent(cc.Canvas);
    const cn = new cc.Node('UI Camera');
    scene.addChild(cn);
    this.camera = cn.addComponent(cc.Camera);
    this.camera.projection = cc.Camera.ProjectionType.ORTHO;
    this.camera.orthoHeight = this.height / 2;
    this.camera.near = 0.1;
    this.camera.far = 2000;
    this.camera.visibility = cc.Layers.Enum.UI_2D;
    this.camera.priority = 10;
    this.camera.clearFlags = cc.Camera.ClearFlag.DEPTH_ONLY;
    cn.setPosition(this.width / 2, this.height / 2, 1000);
    canvas.cameraComponent = this.camera;
    const base = new cc.Node('Panels');
    base.layer = cc.Layers.Enum.UI_2D;
    this.root.addChild(base);
    this.g = base.addComponent(cc.Graphics);
    const live = new cc.Node('Stamina and pause');
    live.layer = cc.Layers.Enum.UI_2D;
    this.root.addChild(live);
    this.live = live.addComponent(cc.Graphics);
  }
  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.root.getComponent(cc.UITransform)!.setContentSize(w, h);
    this.root.setPosition(w / 2, h / 2, 0);
    this.camera.node.setPosition(w / 2, h / 2, 1000);
    this.camera.orthoHeight = h / 2;
    this.key = '';
  }
  panel(x: number, y: number, w: number, h: number, fill: string, r = 18, g = this.g) {
    g.fillColor = color(fill);
    g.roundRect(x - this.width / 2, this.height / 2 - y - h, w, h, r);
    g.fill();
  }
  text(
    id: string,
    value: string,
    x: number,
    y: number,
    size = 20,
    tint = '#f9efd8',
    w = 350,
    align = cc.Label.HorizontalAlign.CENTER,
  ) {
    let l = this.labels.get(id);
    if (!l) {
      const n = new cc.Node('text:' + id);
      n.layer = cc.Layers.Enum.UI_2D;
      this.root.addChild(n);
      n.addComponent(cc.UITransform);
      l = n.addComponent(cc.Label);
      l.fontFamily = 'Noto Sans CJK SC';
      l.useSystemFont = true;
      l.isBold = true;
      l.overflow = cc.Label.Overflow.SHRINK;
      l.verticalAlign = cc.Label.VerticalAlign.CENTER;
      this.labels.set(id, l);
    }
    l.node.active = true;
    l.string = value;
    l.fontSize = size;
    l.lineHeight = size * 1.3;
    l.color = color(tint);
    l.horizontalAlign = align;
    l.node.getComponent(cc.UITransform)!.setContentSize(w, size * 2.8);
    l.node.setPosition(x - this.width / 2, this.height / 2 - y, 0);
    return l;
  }
  button(id: string, label: string, x: number, y: number, w: number, h = 54, primary = false) {
    this.panel(x, y + 4, w, h, '#172b2b88');
    this.panel(x, y, w, h, primary ? '#b8562d' : '#f2e4c9');
    this.text(
      'button:' + id,
      label,
      x + w / 2,
      y + h / 2,
      primary ? 24 : 20,
      primary ? '#fff7e5' : '#244641',
      w - 14,
    );
    this.controls.push({ id, label, x, y, w, h });
  }
  at(x: number, y: number) {
    return [...this.controls]
      .reverse()
      .find((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h && !c.disabled);
  }
  draw(state: any) {
    const { screen, progress, run } = state,
      h = this.height;
    const key = [
      screen,
      h,
      progress.selected,
      progress.sound,
      progress.haptics,
      progress.reducedMotion,
      progress.touchButtons,
      state.resultNewRecord,
      state.legacyLink,
      state.rewardPending,
      state.rewardMessage,
      run.rewardProtectionUsed,
    ].join(':');
    if (this.key !== key) {
      this.key = key;
      this.screen = screen;
      this.controls = [];
      this.g.clear();
      this.live.clear();
      for (const l of this.labels.values()) l.node.active = false;
      if (screen === 'home') {
        this.panel(22, 64, 262, 148, '#153e3dcc', 22);
        this.text('title1', '追贼', 144, 106, 45, '#fcf0cf', 232);
        this.text('title2', '别撞墙', 154, 162, 43, '#f6ca83', 245);
        this.text('subtitle', '穿街过巷 · 一路追下去', 180, 237, 17, '#fff4db', 330);
        this.panel(20, h - 245, 350, 222, '#173c39dd', 23);
        this.button('start', '开始追逐  ›', 38, h - 225, 314, 64, true);
        const best = Math.max(0, ...Object.values(progress.best).map((b: any) => b.distance));
        this.text('record', '最远纪录  ' + best + ' m', 195, h - 139, 18, '#ead9b4');
        this.button('districts', '街区出发点', 38, h - 113, 151, 52);
        this.button('settings', '设置', 201, h - 113, 151, 52);
        this.text(
          'district',
          '当前：' + DISTRICT_NAMES[progress.selected],
          195,
          h - 38,
          14,
          '#d5d8c0',
        );
        this.button('help', '?', 326, 32, 44, 44);
        if (state.legacyLink)
          this.text(
            'legacy',
            '旧版限时挑战已结束 · 开始新版无尽追逐',
            195,
            286,
            13,
            '#fff4db',
            360,
          );
      } else if (screen === 'running') {
        this.panel(16, 30, 142, 60, '#173e3de6', 16);
        this.panel(222, 30, 94, 60, '#173e3de6', 16);
        this.panel(330, 30, 44, 60, '#173e3de6', 14);
        this.controls.push({ id: 'pause', label: '暂停', x: 326, y: 28, w: 52, h: 64 });
        if (progress.touchButtons) {
          this.button('left', '‹', 22, h - 88, 65, 58);
          this.button('jump', '跳', 98, h - 88, 65, 58);
          this.button('slide', '滑', 174, h - 88, 65, 58);
          this.button('right', '›', 250, h - 88, 65, 58);
        }
      } else {
        this.panel(0, 0, this.width, h, '#15332dc9', 0);
        if (screen === 'districts') {
          this.text('title', '从哪里出发', 195, 88, 32);
          this.text('intro', '选择街区，开始新的追逐', 195, 132, 16, '#d4d4b7');
          const names = ['骑楼长街 · 宽阔缓弯', '居民小巷 · 曲折有高差', '热闹集市 · 摊位与推车'];
          DISTRICTS.forEach((id, i) => {
            const y = 184 + i * 112;
            this.panel(28, y, 334, 94, progress.selected === id ? '#d9be81' : '#f2e4c9', 18);
            this.text('district:' + id, DISTRICT_NAMES[id], 194, y + 28, 26, '#244641');
            this.text('desc:' + id, names[i], 194, y + 65, 15, '#52645a');
            this.controls.push({
              id: 'choose:' + id,
              label: DISTRICT_NAMES[id],
              x: 28,
              y,
              w: 334,
              h: 94,
            });
          });
          this.button('start', '出发  ›', 38, Math.max(546, h - 150), 314, 60, true);
          this.button('home', '返回', 125, Math.max(608, h - 76), 140, 48);
        } else if (screen === 'paused') {
          const y = Math.max(120, h / 2 - 210);
          this.panel(24, y, 342, 480, '#f5e9d1', 24);
          this.text('title', '歇一口气', 195, y + 50, 33, '#244641');
          this.text(
            'pause-distance',
            Math.floor(run.s) + ' m · 追逐仍在继续',
            195,
            y + 100,
            18,
            '#697366',
          );
          this.button('resume', '继续追逐', 46, y + 143, 298, 58, true);
          this.button('retry', '重新开始', 46, y + 216, 298, 50);
          this.button('settings', '设置', 46, y + 282, 140, 50);
          this.button('home', '返回街区', 204, y + 282, 140, 50);
          if (state.rewardPending || !run.rewardProtectionUsed)
            this.button(state.rewardPending ? 'reward-cancel' : 'reward-protection',
              state.rewardPending ? '取消保护' : '观看后保护5秒 · 本局一次', 46, y + 346, 298, 50);
          this.text('pause-note', state.rewardMessage || (run.rewardProtectionUsed
            ? '保护已使用 · 本局不计纪录' : '完整观看领取 · 沟壑仍需跳跃'), 195, y + 424, 14, '#697366', 320);
          this.text('reward-record', '补给局不计纪录 · 暂停不消耗保护', 195, y + 451, 13, '#697366', 320);
        } else if (screen === 'settings') {
          this.text('title', '设置', 195, 85, 32);
          for (const [i, item] of [
            ['sound', '声音'],
            ['haptics', '震动'],
            ['reducedMotion', '减弱镜头动态'],
            ['touchButtons', '显示触控按钮'],
          ].entries()) {
            const [id, name] = item;
            this.button(
              'toggle:' + id,
              name + '    ' + (progress[id] ? '开' : '关'),
              30,
              150 + i * 78,
              330,
              58,
            );
          }
          this.button('back', '返回', 112, Math.max(552, h - 100), 166, 54, true);
          if (!progress.writable)
            this.text('save-note', '旧存档读取异常，本次可继续游玩', 195, h - 31, 12, '#e6d4b3');
        } else if (screen === 'help') {
          this.text('title', '一路追下去', 195, 83, 32);
          const rows = [
            ['左右滑', '选择通道，绕开箱堆和推车'],
            ['上滑跳', '整排矮栏必须跳，沟壑要跨过断口'],
            ['下滑铲', '整排横杆必须滑铲，换道绕不过'],
            ['看路口', '提前选左右，绕过中央花坛'],
          ];
          rows.forEach(([title, desc], i) => {
            const y = 158 + i * 94;
            this.panel(24, y - 29, 342, 78, '#f2e4c9');
            this.text('help-title' + i, title, 195, y - 4, 22, '#244641');
            this.text('help-text' + i, desc, 195, y + 26, 15, '#626f60', 330);
          });
          this.text(
            'rule',
            '三次碰撞或跌入沟壑结束追逐。\n追回掉落物、跑远一点，就是新的纪录。',
            195,
            567,
            16,
            '#f7ecd2',
            350,
          );
          this.button('back', '知道了', 100, Math.max(596, h - 98), 190, 55, true);
        } else if (screen === 'result') {
          const y = Math.max(110, h / 2 - 205);
          this.panel(22, y, 346, 435, '#f6e8cc', 24);
          this.text('title', '追逐结束', 195, y + 47, 31, '#244641');
          this.text('result-distance', Math.floor(run.s) + ' m', 195, y + 119, 51, '#ae4c28');
          this.text(
            'result-new',
            run.practice
              ? '开发试玩 · 不记录成绩'
              : run.rewardProtectionUsed
                ? '辅助追逐 · 不记录成绩'
              : state.resultNewRecord
                ? '新的最远纪录'
                : '下一次，再追远一点',
            195,
            y + 177,
            17,
            '#846a3d',
          );
          this.text(
            'result-stats',
            '追回 ' + run.coins + '  ·  连续动作 ' + run.bestCombo,
            195,
            y + 219,
            17,
            '#36534b',
          );
          this.text('result-reason', run.reason, 195, y + 254, 15, '#806d55');
          this.button('retry', '再追一次', 43, y + 288, 304, 58, true);
          this.button('home', '返回街区', 43, y + 360, 304, 50);
        }
      }
    }
    if (screen === 'running') {
      this.text('metres', Math.floor(run.s) + ' m', 86, 60, 27, '#fff4d8', 132);
      this.text('coins', '◆ ' + run.coins, 268, 60, 23, '#f8ce65', 86);
      this.live.clear();
      for (let i = 0; i < 3; i++) {
        this.live.fillColor = color(i < run.health ? '#f4ca73' : '#536e65');
        this.live.circle(30 + i * 25 - this.width / 2, this.height / 2 - 111, 7);
        this.live.fill();
      }
      for (const x of [344, 354]) this.panel(x, 48, 5, 25, '#fff4d8', 1, this.live);
      this.text('district-live', DISTRICT_NAMES[state.district], 295, 111, 14, '#f9efd8', 155);
      const hint = run.rewardProtectionUsed && run.protection > 0
        ? `碰撞保护 ${run.protection.toFixed(1)}秒 · 沟壑仍需跳跃`
        : state.toast || run.hint;
      if (hint) {
        this.panel(29, 151, 332, 44, '#173e3ddd', 14, this.live);
        this.text('hint', hint, 195, 173, 16, '#fff1d1', 324);
      } else if (this.labels.has('hint')) this.labels.get('hint')!.node.active = false;
      if (run.practice) this.text('practice', '开发试玩', 195, 136, 12, '#ffdc9c', 200);
      else if (this.labels.has('practice')) this.labels.get('practice')!.node.active = false;
    }
  }
  destroy() {
    this.camera.node.destroy();
    this.root.destroy();
  }
}
