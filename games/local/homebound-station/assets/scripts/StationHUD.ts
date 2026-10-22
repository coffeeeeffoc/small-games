import {
  Camera,
  Canvas,
  Color,
  Graphics,
  ImageAsset,
  LabelOutline,
  Sprite,
  SpriteFrame,
  Texture2D,
  resources,
  Label,
  Layers,
  Node,
  ResolutionPolicy,
  UITransform,
  sys,
  view,
} from 'cc';
import type { Simulation } from './core/simulation';
import { LEVELS } from './core/levels';
import { continueIndex, SPEEDS, unlocked, type Progress, type SpeedGate } from './core/session';
import type { StationWorld } from './StationWorld';
export type Page = 'home' | 'levels' | 'playing' | 'pause' | 'settings' | 'help' | 'result' | 'ad';
export interface ButtonRect {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  disabled: boolean;
}
export interface ViewState {
  page: Page;
  chapter: number;
  practice: boolean;
  developer: boolean;
  progress: Progress;
  gate: SpeedGate;
  toast: string;
  resultStars: number;
  elapsed: number;
  invitedLevel?: number;
}
const C = { ink: '#174b4e', cream: '#fff4da', dim: '#6c7a75', gold: '#f9bf37', line: '#d8b780' };
const col = (hex: string) => new Color().fromHEX(hex);
export class StationHUD {
  root: Node;
  camera: Camera;
  g: Graphics;
  marks: Graphics;
  readonly ready: Promise<void>;
  private backdrop: Sprite;
  private art = new Map<string, SpriteFrame>();
  private textures: Texture2D[] = [];
  private disposed = false;
  private pressed = '';
  private labels = new Map<string, Label>();
  private signature = '';
  w = 390;
  h = 844;
  safe = { top: 0, bottom: 0, left: 0, right: 0 };
  buttons: ButtonRect[] = [];
  constructor(parent: Node) {
    this.root = new Node('Station interface');
    parent.addChild(this.root);
    this.root.layer = Layers.Enum.UI_2D;
    this.root.addComponent(UITransform);
    const canvas = this.root.addComponent(Canvas),
      cn = new Node('Interface camera');
    parent.addChild(cn);
    this.camera = cn.addComponent(Camera);
    this.camera.projection = Camera.ProjectionType.ORTHO;
    this.camera.near = 0.1;
    this.camera.far = 2000;
    this.camera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
    this.camera.visibility = Layers.Enum.UI_2D;
    this.camera.priority = 10;
    canvas.cameraComponent = this.camera;
    this.backdrop = this.node('Illustrated town').addComponent(Sprite);
    this.backdrop.sizeMode = Sprite.SizeMode.CUSTOM;
    this.ready = Promise.all(
      ['home', 'levels'].map(
        (name) =>
          new Promise<void>((resolve, reject) => {
            resources.load(`art/${name}`, ImageAsset, (error, asset) => {
              if (error || !asset) return reject(error || new Error(`Missing artwork: ${name}`));
              if (this.disposed) return resolve();
              const texture = new Texture2D();
              texture.image = asset;
              const frame = new SpriteFrame();
              frame.texture = texture;
              this.textures.push(texture);
              this.art.set(name, frame);
              this.signature = '';
              resolve();
            });
          }),
      ),
    ).then(() => undefined);
    this.g = this.node('Panels').addComponent(Graphics);
    this.marks = this.node('Road direction badges').addComponent(Graphics);
    this.resize();
  }
  private node(name: string) {
    const n = new Node(name);
    this.root.addChild(n);
    n.layer = Layers.Enum.UI_2D;
    n.addComponent(UITransform);
    return n;
  }
  resize() {
    const frame = view.getFrameSize();
    this.w = frame.width;
    this.h = frame.height;
    view.setDesignResolutionSize(this.w, this.h, ResolutionPolicy.EXACT_FIT);
    const r = sys.getSafeAreaRect();
    this.safe = {
      left: Math.max(0, r.x),
      right: Math.max(0, this.w - r.x - r.width),
      top: Math.max(0, this.h - r.y - r.height),
      bottom: Math.max(0, r.y),
    };
    this.root.getComponent(UITransform)!.setContentSize(this.w, this.h);
    this.root.setPosition(this.w / 2, this.h / 2);
    this.camera.node.setPosition(this.w / 2, this.h / 2, 1000);
    this.camera.orthoHeight = this.h / 2;
    this.signature = '';
  }
  private rect(g: Graphics, x: number, y: number, w: number, h: number, fill: string, r = 12) {
    g.fillColor = col(fill);
    g.roundRect(x - this.w / 2, this.h / 2 - y - h, w, h, r);
    g.fill();
  }
  private text(
    id: string,
    text: string,
    x: number,
    y: number,
    size = 16,
    width = 200,
    height = 44,
    hex = C.ink,
  ) {
    let l = this.labels.get(id);
    if (!l) {
      const n = this.node(id);
      l = n.addComponent(Label);
      l.fontFamily = 'Microsoft YaHei, sans-serif';
      l.horizontalAlign = Label.HorizontalAlign.CENTER;
      l.verticalAlign = Label.VerticalAlign.CENTER;
      l.overflow = Label.Overflow.CLAMP;
      this.labels.set(id, l);
    }
    l.node.active = true;
    l.node.setPosition(x - this.w / 2, this.h / 2 - y);
    l.node.getComponent(UITransform)!.setContentSize(width, height);
    l.fontSize = size;
    l.lineHeight = size * 1.4;
    l.color = col(hex);
    l.string = text;
    return l;
  }
  private button(
    id: string,
    label: string,
    x: number,
    y: number,
    w: number,
    h = 48,
    primary = false,
    disabled = false,
  ) {
    this.buttons.push({ id, label, x, y, w, h, disabled });
    const down = this.pressed === id;
    const radius = Math.min(20, h / 2);
    this.rect(
      this.g,
      x,
      y + 4,
      w,
      h,
      disabled ? '#a6b3a9' : primary ? '#bd772b' : '#9e805c',
      radius,
    );
    this.rect(
      this.g,
      x,
      y + (down ? 3 : 0),
      w,
      h,
      disabled ? '#dce4d9' : primary ? C.gold : C.cream,
      radius,
    );
    if (!disabled)
      this.rect(this.g, x + 3, y + (down ? 5 : 2), w - 6, 3, primary ? '#ffeb93' : '#fffef0', 2);
    this.text(
      `button:${id}`,
      label,
      x + w / 2,
      y + h / 2,
      16,
      w - 12,
      h,
      disabled ? '#7e9088' : C.ink,
    );
  }
  private circle(g: Graphics, x: number, y: number, r: number, fill: string) {
    g.fillColor = col(fill);
    g.circle(x - this.w / 2, this.h / 2 - y, r);
    g.fill();
  }
  private pauseMark(x: number, y: number) {
    for (const dx of [-5, 5]) this.rect(this.g, x + dx - 2, y - 8, 4, 16, C.ink, 1);
  }
  hit(x: number, y: number) {
    return this.buttons.find(
      (b) => !b.disabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h,
    );
  }
  render(s: Simulation, v: ViewState, world: StationWorld) {
    const width = Math.min(480, this.w - this.safe.left - this.safe.right - 32),
      left = this.safe.left + (this.w - this.safe.left - this.safe.right - width) / 2,
      top = this.safe.top + 16,
      bottom = this.h - this.safe.bottom - 16;
    const short = this.h < 560;
    const key = [
      v.page,
      this.pressed,
      v.invitedLevel,
      v.chapter,
      v.practice,
      v.developer,
      v.gate.speed,
      Array.from(v.gate.unlocked).join(),
      v.progress.sound,
      v.progress.stars.join(),
      this.w,
      this.h,
    ].join(':');
    if (key !== this.signature) {
      this.signature = key;
      this.g.clear();
      this.buttons = [];
      for (const l of this.labels.values()) l.node.active = false;
      this.backdrop.node.active = v.page === 'home' || v.page === 'levels';
      if (this.backdrop.node.active) {
        const frame = this.art.get(v.page)!;
        this.backdrop.spriteFrame = frame;
        const scale = Math.max(
          this.w / frame.originalSize.width,
          this.h / frame.originalSize.height,
        );
        this.backdrop.node
          .getComponent(UITransform)!
          .setContentSize(frame.originalSize.width * scale, frame.originalSize.height * scale);
      }
      if (['settings', 'help', 'result', 'ad'].includes(v.page))
        this.rect(this.g, 0, 0, this.w, this.h, C.cream, 0);
      else if (v.page === 'pause') this.rect(this.g, 0, 0, this.w, this.h, '#fcf4e2ed', 0);
      if (v.page === 'home') {
        this.rect(this.g, left, top + (short ? 1 : 24), width, short ? 88 : 146, '#144b5726', 28);
        this.text(
          'home-title',
          '归途站',
          this.w / 2,
          top + (short ? 22 : 65),
          short ? 38 : 64,
          width,
          90,
          '#fff3ce',
        );
        const title = this.labels.get('home-title')!;
        title.isBold = true;
        const outline = (title.getComponent(LabelOutline) ??
          title.node.addComponent(LabelOutline))!;
        outline.color = col('#275e68');
        outline.width = 3;
        this.text(
          'home-en',
          'H O M E B O U N D  S T A T I O N',
          this.w / 2,
          top + (short ? 57 : 115),
          11,
          width,
          30,
          '#fff7e2',
        );
        this.rect(
          this.g,
          left - 8,
          bottom - (short ? 116 : 152),
          width + 16,
          short ? 124 : 160,
          '#123f4a42',
          26,
        );
        this.button(
          'continue',
          v.invitedLevel
            ? `接受邀请  ›  第 ${v.invitedLevel} 关`
            : `继续接班  ›  第 ${continueIndex(v.progress) + 1} 关`,
          left,
          bottom - 112,
          width,
          56,
          true,
        );
        this.button('levels', '关卡手记', left, bottom - 48, (width - 12) / 2);
        this.button('settings', '设置', left + (width + 12) / 2, bottom - 48, (width - 12) / 2);
        if (v.developer)
          this.text(
            'dev',
            '开发试玩 · 任意选关',
            this.w / 2,
            bottom - 138,
            13,
            width,
            26,
            '#aa7244',
          );
      } else if (v.page === 'levels') {
        this.rect(this.g, left - 6, top - 4, width + 12, short ? 58 : 86, '#fff4dae8', 26);
        this.text('levels-title', '归途手记', this.w / 2, top + 28, 32, width, 55);
        if (!short)
          this.text(
            'levels-count',
            v.developer
              ? '开发试玩 · 100 关自由选择'
              : `已完成 ${v.progress.stars.filter((n) => n > 0).length} / 100 关`,
            this.w / 2,
            top + 65,
            13,
            width,
            30,
            C.dim,
          );
        const tabsY = top + (short ? 62 : 92),
          tabW = (width - 16) / 5;
        if (short) {
          this.button(
            `chapter:${Math.max(0, v.chapter - 1)}`,
            '‹',
            left,
            tabsY,
            48,
            44,
            false,
            v.chapter === 0,
          );
          this.text(
            'chapter-name',
            `第 ${v.chapter + 1} 章`,
            this.w / 2,
            tabsY + 22,
            18,
            width - 120,
            44,
          );
          this.button(
            `chapter:${Math.min(9, v.chapter + 1)}`,
            '›',
            left + width - 48,
            tabsY,
            48,
            44,
            false,
            v.chapter === 9,
          );
        }
        if (!short)
          for (let i = 0; i < 10; i++)
            this.button(
              `chapter:${i}`,
              `${i + 1}章`,
              left + (i % 5) * (tabW + 4),
              tabsY + Math.floor(i / 5) * 48,
              tabW,
              44,
              v.chapter === i,
            );
        const mapTop = tabsY + (short ? 56 : 110),
          mapBottom = bottom - 64,
          rows = this.h < 740 ? 2 : 5,
          cols = this.h < 740 ? 5 : 2;
        const stepY = (mapBottom - mapTop) / rows,
          stepX = width / cols;
        // Paths end outside each button and status label, keeping every stop legible.
        if (rows === 5) {
          this.g.strokeColor = col('#fff1c9');
          this.g.lineWidth = 8;
          for (let i = 0; i < 9; i++) {
            const point = (n: number) => {
              const row = Math.floor(n / cols);
              const column = row % 2 === 0 ? n % cols : cols - 1 - (n % cols);
              return { x: left + stepX * (column + 0.5), y: mapTop + stepY * (row + 0.5) };
            };
            const from = point(i),
              to = point(i + 1);
            const horizontal = from.y === to.y;
            const direction = Math.sign(to.x - from.x);
            this.g.moveTo(
              from.x + (horizontal ? direction * 28 : 0) - this.w / 2,
              this.h / 2 - from.y - (horizontal ? 0 : 48),
            );
            this.g.lineTo(
              to.x - (horizontal ? direction * 28 : 0) - this.w / 2,
              this.h / 2 - to.y + (horizontal ? 0 : 28),
            );
            this.g.stroke();
          }
        }
        for (let i = 0; i < 10; i++) {
          const index = v.chapter * 10 + i,
            l = LEVELS[index]!,
            row = Math.floor(i / cols),
            column = row % 2 === 0 ? i % cols : cols - 1 - (i % cols);
          const x = left + stepX * (column + 0.5),
            y = mapTop + stepY * (row + 0.5);
          const enabled = v.developer || unlocked(v.progress, index),
            done = v.progress.stars[index]!;
          this.circle(this.g, x + 1, y + 5, 29, '#866f46');
          this.circle(this.g, x, y, 29, '#fff0c9');
          this.button(`level:${index}`, String(l.id), x - 24, y - 22, 48, 44, enabled, !enabled);
          if (stepY >= 76)
            this.text(
              `level-name:${i}`,
              done ? '★'.repeat(done) : enabled ? '出发' : '未解锁',
              x,
              y + 31,
              12,
              stepX - 8,
              25,
              done ? C.gold : C.dim,
            );
        }
        this.button('home', '返回首页', left, bottom - 48, width, 48);
      } else if (v.page === 'playing') {
        this.rect(this.g, left, top + 3, width - 58, 44, '#a88451', 22);
        this.rect(this.g, left, top, width - 58, 44, C.cream, 22);
        this.text('level', `第 ${s.config.id} 关`, left + 48, top + 22, 16, 88, 35);
        this.button('pause', '', left + width - 48, top, 48, 44);
        this.pauseMark(left + width - 24, top + 22);
        this.rect(this.g, left, bottom - 54, width, 54, C.cream, 27);
        for (const [i, speed] of SPEEDS.entries())
          this.button(
            `speed:${speed}`,
            `${speed}×${v.gate.unlocked.has(speed) ? '' : ' ▷'}`,
            left + 4 + (i * (width - 8)) / 4,
            bottom - 50,
            (width - 8) / 4,
            46,
            v.gate.speed === speed,
          );
      } else if (v.page === 'pause' || v.page === 'settings') {
        const settings = v.page === 'settings';
        this.text(
          'panel-title',
          settings ? '调度员设置' : '休息一下',
          this.w / 2,
          top + (short ? 28 : 105),
          32,
          width,
          60,
        );
        const y = short ? top + 65 : Math.max(top + 170, this.h * 0.38);
        this.button(
          settings ? 'home' : 'resume',
          settings ? '返回首页' : '继续接班',
          left,
          y,
          width,
          52,
          true,
        );
        this.button(
          'sound',
          `音效  ${v.progress.sound ? '开启' : '关闭'}`,
          left,
          y + 62,
          (width - 12) / 2,
          48,
        );
        this.button('help', '玩法帮助', left + (width + 12) / 2, y + 62, (width - 12) / 2, 48);
        if (!settings) {
          this.button('retry', '重新开始', left, y + 120, (width - 12) / 2, 48);
          this.button('home', '返回首页', left + (width + 12) / 2, y + 120, (width - 12) / 2, 48);
        }
        if (sys.isBrowser)
          this.button(
            'fullscreen',
            '切换全屏',
            left,
            Math.min(bottom - 48, y + (settings ? 120 : 180)),
            width,
            48,
          );
      } else if (v.page === 'help') {
        this.text('help-title', '一起，好好回家', this.w / 2, top + 40, 28, width, 65);
        this.text(
          'help-copy',
          short
            ? '看箭头，点击前方畅通的车。\n点击时绑定旅客，多车自动并行接客。\n接完旅客，再让所有空车离场。\n1×免费，2×/3×/5×看广告解锁本局。'
            : '看独立箭头，点击前方畅通的出租车。\n\n点击时就分配乘客，多辆车可以同时出发。\n交叉路口会自动让行。\n\n接完所有旅客，再把余下的空车开走。\n\n1×免费；2×、3×、5×分别看广告解锁本局。',
          this.w / 2,
          (top + bottom) / 2,
          16,
          width - 16,
          short ? 190 : 330,
        );
        this.button('back', '明白了', left, bottom - 48, width, 48, true);
      } else if (v.page === 'result') {
        this.text(
          'result-title',
          '这一程，有你真好',
          this.w / 2,
          top + (short ? 30 : 100),
          28,
          width,
          70,
        );
        this.text(
          'result-stars',
          '★'.repeat(v.resultStars) + '☆'.repeat(3 - v.resultStars),
          this.w / 2,
          top + (short ? 78 : 175),
          40,
          width,
          65,
          C.gold,
        );
        this.text(
          'result-stats',
          `已接 ${s.target} 位旅客 · ${Math.round(v.elapsed)} 秒\n${v.practice ? '试玩成绩不写入正常进度' : '所有车辆平安离站'}`,
          this.w / 2,
          top + (short ? 126 : 245),
          16,
          width,
          70,
          C.dim,
        );
        if (sys.isBrowser) this.button('share', '邀请好友接同一班', left, bottom - 164, width, 44);
        this.button(
          !v.practice && s.config.id < LEVELS.length ? 'next' : 'levels',
          !v.practice && s.config.id < LEVELS.length ? '下一关  ›' : '返回关卡',
          left,
          bottom - 110,
          width,
          54,
          true,
        );
        this.button('retry', '再接一班', left, bottom - 48, (width - 12) / 2);
        this.button('home', '返回首页', left + (width + 12) / 2, bottom - 48, (width - 12) / 2);
      } else if (v.page === 'ad') {
        this.text('ad-title', '准备加速', this.w / 2, this.h * 0.34, 30, width, 65);
        this.text(
          'ad-copy',
          '完成激励视频，解锁所选倍速\n仅在本局有效',
          this.w / 2,
          this.h * 0.45,
          17,
          width,
          80,
          C.dim,
        );
        this.button('cancel-ad', '取消并返回游戏', left, bottom - 60, width, 50);
      }
    }
    this.marks.clear();
    for (const [id, l] of this.labels)
      if (id.startsWith('capacity:'))
        l.node.active =
          v.page === 'playing' &&
          s.vehicles.some((car) => car.id === id.slice(9) && car.state === 'holding');
    if (v.page === 'playing') {
      this.text(
        'delivered',
        `已接 ${s.delivered.size}/${s.target}`,
        left + (width - 58 + 88) / 2,
        top + 22,
        14,
        width - 154,
        35,
      );
      this.text(
        'hint',
        v.practice
          ? v.developer
            ? '开发试玩 · 点击车辆即可出发'
            : '受邀试玩 · 点击车辆即可出发'
          : s.config.id < 4
            ? '找一辆箭头前方畅通的车'
            : '有序出发 · 好好团圆',
        this.w / 2,
        bottom - 76,
        13,
        width,
        30,
        C.ink,
      );
      for (const vehicle of s.vehicles) {
        if (vehicle.state !== 'holding') continue;
        const p = world.arrow(vehicle),
          r = 10;
        this.rect(this.marks, p.x + 10, p.y + 3, 16, 17, '#ad8147', 4);
        this.rect(this.marks, p.x + 10, p.y + 2, 16, 16, C.cream, 4);
        this.text(
          `capacity:${vehicle.id}`,
          String(vehicle.passengerCapacity),
          p.x + 18,
          p.y + 10,
          11,
          16,
          16,
          C.ink,
        );
        this.circle(this.marks, p.x, p.y, r, '#fcf4e2');
        this.circle(this.marks, p.x, p.y, r - 1.5, C.ink);
        const a = p.angle,
          dx = Math.cos(a),
          dy = Math.sin(a),
          perp = { x: -dy, y: dx };
        const points = [
          [-6, -2],
          [1, -2],
          [1, -5],
          [7, 0],
          [1, 5],
          [1, 2],
          [-6, 2],
        ];
        this.marks.fillColor = col(C.cream);
        points.forEach(([x, y], i) => {
          const xx = p.x + dx * x! + perp.x * y! - this.w / 2,
            yy = this.h / 2 - (p.y + dy * x! + perp.y * y!);
          if (i === 0) this.marks.moveTo(xx, yy);
          else this.marks.lineTo(xx, yy);
        });
        this.marks.close();
        this.marks.fill();
      }
    }
    if (v.toast) {
      this.rect(this.marks, left, Math.max(top + 54, bottom - 128), width, 42, C.ink, 16);
      this.text(
        'toast',
        v.toast,
        this.w / 2,
        Math.max(top + 54, bottom - 128) + 21,
        14,
        width - 20,
        38,
        C.cream,
      );
    } else {
      const t = this.labels.get('toast');
      if (t) t.node.active = false;
    }
  }
  setPressed(id: string) {
    this.pressed = id;
  }
  invalidate() {
    this.signature = '';
  }
  dispose() {
    this.disposed = true;
    for (const frame of this.art.values()) frame.destroy();
    for (const texture of this.textures) texture.destroy();
    this.root.destroy();
    this.camera.node.destroy();
  }
}
