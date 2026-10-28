import {
  Camera,
  Canvas,
  Color,
  Graphics,
  Label,
  Layers,
  Node,
  ResolutionPolicy,
  UITransform,
  macro,
  view,
} from 'cc';
import { DT, distance, targetInCone, terrainHeight } from './core/rules';
import type { State } from './core/rules';
import type { Progress } from './core/progress';
export type Screen =
  | 'home'
  | 'missions'
  | 'playing'
  | 'paused'
  | 'result'
  | 'settings'
  | 'help'
  | 'online';
export type Control = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  disabled: boolean;
};
const C = {
  navy: '#102538',
  cyan: '#5ed5ce',
  amber: '#f6bb69',
  white: '#eef3e5',
  muted: '#a9c3ce',
  red: '#ff8a70',
};
const color = (hex: string) => new Color().fromHEX(hex);
export class UI {
  root: Node;
  camera: Camera;
  graphics: Graphics;
  width = 844;
  height = 390;
  scale = 1;
  margin = 28;
  controls: Control[] = [];
  labels = new Map<string, Label>();
  seen = new Set<string>();
  pressed = new Set<string>();
  stick = { x: 0, y: 0 };
  constructor(parent: Node) {
    this.root = new Node('FlightUI');
    this.root.layer = Layers.Enum.UI_2D;
    parent.addChild(this.root);
    const canvas = this.root.addComponent(Canvas),
      cn = new Node('UICamera');
    parent.addChild(cn);
    this.camera = cn.addComponent(Camera);
    this.camera.projection = Camera.ProjectionType.ORTHO;
    this.camera.priority = 2;
    this.camera.visibility = Layers.Enum.UI_2D;
    this.camera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
    this.camera.near = 0.1;
    this.camera.far = 2000;
    canvas.cameraComponent = this.camera;
    const drawing = new Node('Instruments');
    drawing.layer = Layers.Enum.UI_2D;
    this.root.addChild(drawing);
    drawing.addComponent(UITransform);
    this.graphics = drawing.addComponent(Graphics);
    this.resize();
  }
  resize() {
    view.setOrientation(macro.ORIENTATION_LANDSCAPE);
    const f = view.getFrameSize(),
      short = Math.min(f.width, f.height),
      long = Math.max(f.width, f.height);
    this.width = (390 * long) / short;
    this.scale = short / 390;
    this.margin = Math.max(28, 24 / this.scale);
    view.setDesignResolutionSize(this.width, this.height, ResolutionPolicy.SHOW_ALL);
    this.root.getComponent(UITransform)!.setContentSize(this.width, this.height);
    this.root.setPosition(this.width / 2, this.height / 2);
    this.camera.node.setPosition(this.width / 2, this.height / 2, 1000);
    this.camera.orthoHeight = this.height / 2;
  }
  rect(x: number, y: number, w: number, h: number, fill: string, stroke = '') {
    const g = this.graphics;
    g.fillColor = color(fill);
    g.rect(x - this.width / 2, this.height / 2 - y - h, w, h);
    g.fill();
    if (stroke) {
      g.strokeColor = color(stroke);
      g.lineWidth = 1;
      g.stroke();
    }
  }
  line(x: number, y: number, tx: number, ty: number, stroke = C.cyan, width = 1) {
    const g = this.graphics;
    g.strokeColor = color(stroke);
    g.lineWidth = width;
    g.moveTo(x - this.width / 2, this.height / 2 - y);
    g.lineTo(tx - this.width / 2, this.height / 2 - ty);
    g.stroke();
  }
  circle(x: number, y: number, r: number, fill: string, stroke = C.cyan) {
    const g = this.graphics;
    g.fillColor = color(fill);
    g.strokeColor = color(stroke);
    g.lineWidth = 1.5;
    g.circle(x - this.width / 2, this.height / 2 - y, r);
    g.fill();
    g.stroke();
  }
  text(
    id: string,
    value: string,
    x: number,
    y: number,
    size = 16,
    fill = C.white,
    w = 300,
    align = Label.HorizontalAlign.LEFT,
  ) {
    this.seen.add(id);
    let l = this.labels.get(id);
    if (!l) {
      const n = new Node(id);
      n.layer = Layers.Enum.UI_2D;
      this.root.addChild(n);
      n.addComponent(UITransform);
      l = n.addComponent(Label);
      l.useSystemFont = true;
      l.fontFamily = 'sans-serif';
      l.overflow = Label.Overflow.CLAMP;
      l.enableWrapText = true;
      this.labels.set(id, l);
    }
    l.node.active = true;
    l.string = value;
    l.fontSize = size;
    l.lineHeight = size * 1.4;
    l.color = color(fill);
    l.horizontalAlign = align;
    l.verticalAlign = Label.VerticalAlign.CENTER;
    l.node.getComponent(UITransform)!.setContentSize(w, size * 3.5);
    l.node.setPosition(x + w / 2 - this.width / 2, this.height / 2 - y);
  }
  button(
    id: string,
    label: string,
    x: number,
    y: number,
    w = 160,
    h = 52,
    accent = false,
    disabled = false,
  ) {
    h = Math.max(h, 44 / this.scale);
    w = Math.max(w, 44 / this.scale);
    this.controls.push({ id, label, x, y, w, h, disabled });
    const down = this.pressed.has(id),
      fill = disabled
        ? '#102538aa'
        : accent
          ? down
            ? '#ffe2a8'
            : C.amber
          : down
            ? '#365362ee'
            : '#102538dd';
    this.rect(x, y, w, h, fill, disabled ? '#65808b' : accent ? C.amber : C.cyan);
    if (id === 'pause') {
      this.rect(x + w / 2 - 9, y + h / 2 - 10, 6, 20, C.white);
      this.rect(x + w / 2 + 3, y + h / 2 - 10, 6, 20, C.white);
    } else
      this.text(
        'button:' + id,
        label,
        x,
        y + h / 2,
        16,
        accent ? C.navy : disabled ? C.muted : C.white,
        w,
        Label.HorizontalAlign.CENTER,
      );
  }
  hit(x: number, y: number) {
    return this.controls.find(
      (c) => !c.disabled && x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h,
    );
  }
  draw(screen: Screen, s: State, p: Progress, practice: boolean) {
    const w = this.width,
      h = this.height,
      m = this.margin;
    this.controls = [];
    this.seen.clear();
    this.graphics.clear();
    if (screen === 'playing' || screen === 'paused') {
      this.rect(m - 8, 12, 210, 94, '#102538cc');
      this.text('shield', `护盾 ${Math.ceil(s.player.shield)} / 70`, m, 30, 15, C.cyan, 190);
      this.text(
        'hull',
        `机体 ${Math.ceil(s.player.hull)}%  ·  能量 ${Math.ceil(s.player.energy)}`,
        m,
        54,
        15,
        C.white,
        240,
      );
      this.text(
        'objective',
        `歼灭入侵无人机  ${s.kills} / ${s.mission.enemies.length}`,
        m,
        83,
        15,
        C.amber,
        260,
      );
      this.text(
        'speed',
        `${Math.round(s.player.speed * 3.6)} km/h   高度 ${Math.round(s.player.y - terrainHeight(s.player.x, s.player.z))}m`,
        w / 2 - 140,
        26,
        14,
        C.white,
        280,
        Label.HorizontalAlign.CENTER,
      );
      const target = targetInCone(s, 25, 900);
      this.text(
        'lock',
        target ? `◇ 锁定 ${Math.round(distance(target, s.player))}m` : '将敌机带入前方锁定框',
        w / 2 - 150,
        72,
        15,
        target ? C.amber : C.white,
        300,
        Label.HorizontalAlign.CENTER,
      );
      this.line(w / 2 - 12, h / 2, w / 2 - 4, h / 2);
      this.line(w / 2 + 4, h / 2, w / 2 + 12, h / 2);
      this.line(w / 2, h / 2 - 12, w / 2, h / 2 - 4);
      this.line(w / 2, h / 2 + 4, w / 2, h / 2 + 12);
      if (target) {
        this.rect(w / 2 - 24, h / 2 - 24, 48, 48, '#00000000', C.amber);
      }
      this.button('pause', '暂停', w - m - 52, 16, 52, 48);
      const joy = { x: m + 64, y: h - 76 };
      this.controls.push({
        id: 'stick',
        label: '飞行摇杆',
        x: joy.x - 60,
        y: joy.y - 60,
        w: 120,
        h: 120,
        disabled: false,
      });
      this.circle(joy.x, joy.y, 54, '#10253888');
      this.circle(joy.x + this.stick.x * 34, joy.y - this.stick.y * 34, 19, '#5ed5ce66');
      this.text(
        'stick-label',
        '转向 / 升降',
        m + 4,
        h - 9,
        12,
        C.white,
        120,
        Label.HorizontalAlign.CENTER,
      );
      this.button(
        'fire',
        s.overheated ? '冷却中' : '开火',
        w - m - 82,
        h - 96,
        82,
        74,
        true,
        s.overheated,
      );
      this.button(
        'missile',
        `导弹 ${s.missiles}`,
        w - m - 166,
        h - 80,
        72,
        58,
        false,
        s.missiles === 0 || s.missileCooldown > 0,
      );
      this.button('boost', '加速', w - m - 72, h - 164, 72, 54);
      this.button(
        'scan',
        s.scanTime > 0 ? '扫描中' : '扫描',
        w - m - 156,
        h - 148,
        72,
        54,
        false,
        s.scanCooldown > 0,
      );
      this.rect(w / 2 - 90, h - 32, 180, 5, '#102538cc');
      this.rect(w / 2 - 90, h - 32, 180 * s.heat, 5, s.overheated ? C.red : C.amber);
      this.text(
        'heat',
        `热量 ${Math.round(s.heat * 100)}%${practice ? ' · 开发试玩' : ''}`,
        w / 2 - 120,
        h - 13,
        12,
        C.white,
        240,
        Label.HorizontalAlign.CENTER,
      );
      if (s.noticeTime > 0)
        this.text(
          'notice',
          s.notice,
          w / 2 - 210,
          h - 65,
          15,
          C.amber,
          420,
          Label.HorizontalAlign.CENTER,
        );
      else if (s.tick * DT < 8)
        this.text(
          'notice',
          '左拇指驾驶 · 右拇指开火 · 松手回平',
          w / 2 - 210,
          h - 65,
          15,
          C.white,
          420,
          Label.HorizontalAlign.CENTER,
        );
    }
    if (screen === 'home') {
      this.rect(0, 0, w * 0.43, h, '#102538a8');
      this.text('brand', '零 域', m, 92, 58, C.white, 280);
      this.text('latin', 'N U L L   R A N G E', m + 4, 144, 17, C.cyan, 300);
      this.text('subtitle', '低空巡航 / 追击 / 回收', m + 4, 188, 16, C.white, 300);
      this.text('best', `本机最高分  ${p.best}`, m + 4, 228, 16, C.amber, 300);
      this.button('missions', '单机任务', w - m - 200, 210, 200, 56, true);
      this.button('online', '玩家对战 · 待开放', w - m - 200, 280, 200, 56);
      this.button('settings', '设置', m, h - 78, 92, 50);
      this.button('help', '帮助', m + 108, h - 78, 92, 50);
    } else if (screen !== 'playing') {
      this.rect(0, 0, w, h, '#102538c9');
      const title = {
        missions: '任务选择',
        paused: '暂 停',
        result: s.status === 'won' ? '任务完成' : '行动结束',
        settings: '飞行设置',
        help: '飞行手册',
        online: '玩家对战',
      }[screen];
      this.text('title', title, w / 2 - 240, 58, 30, C.white, 480, Label.HorizontalAlign.CENTER);
      this.line(m, 92, w - m, 92, C.amber);
      if (screen === 'missions') {
        this.text(
          'mission-title',
          `01  ${s.mission.title}`,
          m + 20,
          142,
          25,
          C.amber,
          w - 2 * m - 40,
        );
        this.text('brief', s.mission.briefing, m + 20, 205, 17, C.white, w - 2 * m - 40);
        this.text(
          'mission-meta',
          '巡航机 · 6枚导弹 · 单机本地成绩',
          m + 20,
          260,
          16,
          C.cyan,
          w - 2 * m - 40,
        );
        this.button('start', '部署任务', w - m - 190, h - 76, 190, 52, true);
        this.button('home', '返回', m, h - 76, 110);
      } else if (screen === 'paused') {
        this.button('resume', '继续行动', w / 2 - 110, 116, 220, 52, true);
        this.button('settings', '设置', w / 2 - 110, 186, 220);
        this.button('home', '返回机库', w / 2 - 110, 256, 220);
      } else if (screen === 'result') {
        this.text(
          'reason',
          s.reason,
          w / 2 - 250,
          138,
          21,
          C.amber,
          500,
          Label.HorizontalAlign.CENTER,
        );
        this.text(
          'result',
          `得分 ${s.score}    击落 ${s.kills}    回收 ${s.recovered}\n飞行 ${Math.round(s.tick * DT)}秒${practice ? ' · 开发试玩不记成绩' : ''}`,
          w / 2 - 260,
          214,
          19,
          C.white,
          520,
          Label.HorizontalAlign.CENTER,
        );
        this.button('restart', '再次出击', w / 2 + 12, h - 90, 180, 54, true);
        this.button('home', '返回机库', w / 2 - 192, h - 90, 180, 54);
      } else if (screen === 'settings') {
        this.button('sound', `音效 ${p.muted ? '关闭' : '开启'}`, w / 2 - 220, 120, 200);
        this.button('reduced', `减弱动态 ${p.reduced ? '开启' : '关闭'}`, w / 2 + 20, 120, 200);
        this.button('sensitivity', `灵敏度 ${p.sensitivity.toFixed(1)}`, w / 2 - 120, 202, 240);
        this.button('back', '返回', w / 2 - 90, h - 76, 180, 52, true);
      } else {
        const body =
          screen === 'online'
            ? '玩家对战尚未开放\n后续接入两名真实玩家的服务端权威对战\n当前单机任务可离线游玩，不匹配模拟玩家'
            : '左摇杆驾驶，松手回平；按住开火与加速\n目标进入前方25° / 900m范围可发射导弹\n扫描吸引残骸，补充护盾与能量\n键盘 WASD / 方向键驾驶，空格开火，Shift加速\nE导弹 · Q扫描 · Esc暂停';
        this.text('body', body, w / 2 - 300, 190, 17, C.white, 600, Label.HorizontalAlign.CENTER);
        // Multi-line help requires its full intrinsic height, not the standard label box.
        this.labels.get('body')!.node.getComponent(UITransform)!.setContentSize(600, 170);
        this.button('back', '返回', w / 2 - 90, h - 76, 180, 52, true);
      }
    }
    for (const [id, l] of this.labels) if (!this.seen.has(id)) l.node.active = false;
  }
  dispose() {
    this.root.destroy();
    this.camera.node.destroy();
  }
}
