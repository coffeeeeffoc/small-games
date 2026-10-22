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
  speedExpanded: boolean;
  demoTime: number;
  toast: string;
  resultStars: number;
  elapsed: number;
  invitedLevel?: number;
}
const C = {
  ink: '#173d43',
  teal: '#144b53',
  cream: '#fff4df',
  dim: '#6a7772',
  gold: '#ffc344',
  line: '#ddc8a2',
};
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
  private roadLabels: Node;
  private baseLabels: Node;
  private modalLabels: Node;
  private toastLabels: Node;
  private modal: Graphics;
  private toastInk: Graphics;
  private surface: Graphics;
  private textParent: Node;
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
    this.backdrop = this.node('Chapter illustration').addComponent(Sprite);
    this.backdrop.sizeMode = Sprite.SizeMode.CUSTOM;
    // Home uses StationWorld's live demonstration, not a second poster/board.
    this.ready = new Promise<void>((resolve, reject) => {
      resources.load('art/levels', ImageAsset, (error, asset) => {
        if (error || !asset) return reject(error || new Error('Missing chapter artwork'));
        if (this.disposed) return resolve();
        const texture = new Texture2D();
        texture.image = asset;
        const frame = new SpriteFrame();
        frame.texture = texture;
        this.textures.push(texture);
        this.art.set('levels', frame);
        this.signature = '';
        resolve();
      });
    });
    // Sibling order matters: paused cars, arrows and top HUD all sit under the shade.
    this.marks = this.node('Road direction badges').addComponent(Graphics);
    this.roadLabels = this.node('Road badge labels');
    this.g = this.node('Interface panels').addComponent(Graphics);
    this.baseLabels = this.node('Interface labels');
    this.modal = this.node('Modal shade and cards').addComponent(Graphics);
    this.modalLabels = this.node('Modal labels');
    this.toastInk = this.node('Brief notices').addComponent(Graphics);
    this.toastLabels = this.node('Notice labels');
    this.surface = this.g;
    this.textParent = this.baseLabels;
    this.resize();
  }
  private node(name: string, parent = this.root) {
    const n = new Node(name);
    parent.addChild(n);
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
    let label = this.labels.get(id);
    if (!label) {
      label = this.node(id, this.textParent).addComponent(Label);
      label.fontFamily = 'Microsoft YaHei, sans-serif';
      label.horizontalAlign = Label.HorizontalAlign.CENTER;
      label.verticalAlign = Label.VerticalAlign.CENTER;
      label.overflow = Label.Overflow.CLAMP;
      this.labels.set(id, label);
    }
    if (label.node.parent !== this.textParent) label.node.setParent(this.textParent);
    label.node.active = true;
    label.node.setPosition(x - this.w / 2, this.h / 2 - y);
    label.node.getComponent(UITransform)!.setContentSize(width, height);
    label.fontSize = size;
    label.lineHeight = size * 1.35;
    label.color = col(hex);
    label.string = text;
    return label;
  }
  private button(
    id: string,
    label: string,
    x: number,
    y: number,
    w: number,
    h = 44,
    primary = false,
    disabled = false,
    interactive = true,
  ) {
    if (interactive) this.buttons.push({ id, label, x, y, w, h, disabled });
    const down = interactive && this.pressed === id,
      radius = Math.min(17, h / 2);
    this.rect(this.surface, x, y + 2, w, h, '#203a3b24', radius);
    this.rect(
      this.surface,
      x,
      y + (down ? 1 : 0),
      w,
      h,
      disabled ? '#e0dfd2' : primary ? C.gold : C.cream,
      radius,
    );
    const t = this.text(
      `button:${id}`,
      label,
      x + w / 2,
      y + h / 2,
      h >= 52 ? 20 : 15,
      w - 8,
      h,
      disabled ? '#90958b' : C.ink,
    );
    t.isBold = primary;
  }
  private circle(g: Graphics, x: number, y: number, r: number, fill: string) {
    g.fillColor = col(fill);
    g.circle(x - this.w / 2, this.h / 2 - y, r);
    g.fill();
  }
  private pauseMark(x: number, y: number) {
    for (const dx of [-5, 5]) this.rect(this.g, x + dx - 2, y - 8, 4, 16, C.ink, 1);
  }
  private topBar(s: Simulation, v: ViewState, interactive: boolean) {
    const x = this.safe.left + 8,
      y = this.safe.top + 8,
      right = this.w - this.safe.right - 8,
      pauseX = right - 44,
      speedX = pauseX - 52,
      progressX = x + 80,
      progressW = Math.min(148, speedX - 8 - progressX);
    this.rect(this.g, x, y, 74, 44, '#123e47e8', 20);
    this.text('level', `第 ${s.config.id} 关`, x + 37, y + 22, 15, 70, 40, C.cream);
    this.rect(this.g, progressX, y, progressW, 44, '#123e47e8', 20);
    this.circle(this.g, progressX + 16, y + 15, 4, C.cream);
    this.rect(this.g, progressX + 10, y + 21, 12, 10, C.cream, 4);
    this.button('speed-menu', `${v.gate.speed}×`, speedX, y, 44, 44, false, false, interactive);
    this.button('pause', '', pauseX, y, 44, 44, false, false, interactive);
    this.pauseMark(pauseX + 22, y + 22);
    if (interactive && v.speedExpanded) {
      // Four real 44px targets, anchored to the toggle; Game handles outside taps.
      const menuY = y + 50;
      this.rect(this.g, speedX - 4, menuY - 4, 52, 200, '#103e48e8', 16);
      for (const [i, speed] of SPEEDS.entries()) {
        const yy = menuY + i * 48,
          locked = !v.gate.unlocked.has(speed);
        this.button(`speed:${speed}`, `${speed}×`, speedX, yy, 44, 44, v.gate.speed === speed);
        if (locked) {
          this.rect(this.g, speedX + 25, yy + 29, 17, 12, C.teal, 4);
          this.text(`ad-badge:${speed}`, '广告', speedX + 33.5, yy + 35, 8, 17, 12, C.cream);
        }
      }
    }
  }
  private card(height: number) {
    const w = Math.min(320, this.w - this.safe.left - this.safe.right - 32),
      h = Math.min(height, this.h - this.safe.top - this.safe.bottom - 24),
      x = this.safe.left + (this.w - this.safe.left - this.safe.right - w) / 2,
      y = this.safe.top + (this.h - this.safe.top - this.safe.bottom - h) / 2;
    this.surface = this.modal;
    this.textParent = this.modalLabels;
    this.rect(this.modal, 0, 0, this.w, this.h, '#0b353b8c', 0);
    this.rect(this.modal, x, y + 3, w, h, '#102e3526', 23);
    this.rect(this.modal, x, y, w, h, C.cream, 23);
    return { x: x + 16, y, w: w - 32, h, cx: x + w / 2 };
  }
  hit(x: number, y: number) {
    return this.buttons.find(
      (b) => !b.disabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h,
    );
  }
  render(s: Simulation, v: ViewState, world: StationWorld) {
    const availableW = this.w - this.safe.left - this.safe.right,
      width = Math.min(480, availableW - 32),
      left = this.safe.left + (availableW - width) / 2,
      cx = this.safe.left + availableW / 2,
      top = this.safe.top + 8,
      bottom = this.h - this.safe.bottom - 12,
      short = this.h - this.safe.top - this.safe.bottom < 480,
      roadVisible = ['home', 'playing', 'pause'].includes(v.page);
    const key = [
      v.page,
      this.pressed,
      v.invitedLevel,
      v.chapter,
      v.practice,
      v.developer,
      v.gate.speed,
      v.speedExpanded,
      Array.from(v.gate.unlocked).join(),
      v.progress.sound,
      v.progress.stars.join(),
      s.config.id,
      s.target,
      v.resultStars,
      v.toast,
      v.page === 'result' ? Math.round(v.elapsed) : 0,
      this.w,
      this.h,
    ].join(':');
    if (key !== this.signature) {
      this.signature = key;
      this.g.clear();
      this.modal.clear();
      this.buttons = [];
      for (const label of this.labels.values()) label.node.active = false;
      this.surface = this.g;
      this.textParent = this.baseLabels;
      this.backdrop.node.active = v.page === 'levels';
      if (this.backdrop.node.active) {
        const frame = this.art.get('levels');
        if (frame) {
          this.backdrop.spriteFrame = frame;
          const scale = Math.max(
            this.w / frame.originalSize.width,
            this.h / frame.originalSize.height,
          );
          this.backdrop.node
            .getComponent(UITransform)!
            .setContentSize(frame.originalSize.width * scale, frame.originalSize.height * scale);
        }
      }
      if (v.page === 'home') {
        const landscape = this.w > this.h;
        const title = this.text(
          'home-title',
          '归途站',
          cx,
          top + (landscape ? 17 : 34),
          landscape ? 28 : 48,
          width,
          landscape ? 38 : 64,
          C.ink,
        );
        title.isBold = true;
        const outline = title.getComponent(LabelOutline) ?? title.node.addComponent(LabelOutline);
        outline.color = col(C.cream);
        outline.width = 2;
        this.text(
          'home-hint',
          '看箭头 · 点动车 · 接大家回家',
          cx,
          top + (landscape ? 43 : 86),
          landscape ? 12 : 15,
          width,
          landscape ? 20 : 28,
          C.ink,
        );
        if (v.developer && !landscape)
          this.text('dev', '开发试玩 · 任意选关', cx, top + 115, 12, width, 22, C.teal);
        this.button(
          'continue',
          v.invitedLevel
            ? `接受邀请 · 第 ${v.invitedLevel} 关`
            : `开始接班  ›  第 ${continueIndex(v.progress) + 1} 关`,
          left,
          bottom - 112,
          width,
          56,
          true,
        );
        this.button('levels', '选择关卡', left, bottom - 44, (width - 12) / 2, 44);
        this.button('settings', '设置', left + (width + 12) / 2, bottom - 44, (width - 12) / 2, 44);
      } else if (v.page === 'levels') {
        this.rect(this.g, left - 6, top - 2, width + 12, short ? 52 : 74, '#fff4dfe6', 20);
        this.text('levels-title', '选择关卡', cx, top + 24, 30, width, 44).isBold = true;
        if (!short)
          this.text(
            'levels-count',
            v.developer
              ? '开发试玩 · 100 关自由选择'
              : `已完成 ${v.progress.stars.filter((n) => n > 0).length} / 100 关`,
            cx,
            top + 56,
            13,
            width,
            26,
            C.dim,
          );
        const tabsY = top + (short ? 58 : 82),
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
          this.text('chapter-name', `第 ${v.chapter + 1} 章`, cx, tabsY + 22, 18, width - 120, 44);
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
        } else {
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
        }
        const mapTop = tabsY + (short ? 52 : 104),
          mapBottom = bottom - 56,
          rows = this.h < 740 ? 2 : 5,
          cols = this.h < 740 ? 5 : 2,
          stepY = (mapBottom - mapTop) / rows,
          stepX = width / cols;
        const point = (n: number) => {
          const row = Math.floor(n / cols),
            column = row % 2 === 0 ? n % cols : cols - 1 - (n % cols);
          return { x: left + stepX * (column + 0.5), y: mapTop + stepY * (row + 0.5) };
        };
        if (rows === 5) {
          this.g.strokeColor = col('#497e78');
          this.g.lineWidth = 4;
          for (let i = 0; i < 9; i++) {
            const a = point(i),
              b = point(i + 1),
              horizontal = a.y === b.y,
              d = Math.sign(b.x - a.x);
            this.g.moveTo(
              a.x + (horizontal ? d * 29 : 0) - this.w / 2,
              this.h / 2 - a.y - (horizontal ? 0 : 43),
            );
            this.g.lineTo(
              b.x - (horizontal ? d * 29 : 0) - this.w / 2,
              this.h / 2 - b.y + (horizontal ? 0 : 25),
            );
            this.g.stroke();
          }
        }
        for (let i = 0; i < 10; i++) {
          const index = v.chapter * 10 + i,
            level = LEVELS[index]!,
            p = point(i),
            enabled = v.developer || unlocked(v.progress, index),
            stars = v.progress.stars[index]!;
          this.button(
            `level:${index}`,
            String(level.id),
            p.x - 24,
            p.y - 22,
            48,
            44,
            enabled,
            !enabled,
          );
          if (stepY >= 70)
            this.text(
              `level-name:${i}`,
              stars ? '★'.repeat(stars) : enabled ? '出发' : '未解锁',
              p.x,
              p.y + 32,
              12,
              stepX - 8,
              24,
              stars ? '#c28917' : C.dim,
            );
        }
        this.button('home', '返回首页', left, bottom - 44, width, 44);
      } else if (v.page === 'playing' || v.page === 'pause') {
        this.topBar(s, v, v.page === 'playing');
        if (v.page === 'pause') {
          const c = this.card(300),
            half = (c.w - 12) / 2;
          this.text('panel-title', '已暂停', c.cx, c.y + 37, 30, c.w, 44).isBold = true;
          this.text('panel-copy', '准备好再出发', c.cx, c.y + 75, 15, c.w, 24, C.dim);
          this.button('resume', '继续游戏  ›', c.x, c.y + 99, c.w, 52, true);
          this.button('retry', '重新开始', c.x, c.y + 163, half, 44);
          this.button('home', '回首页', c.x + half + 12, c.y + 163, half, 44);
          this.button('sound', `音效 ${v.progress.sound ? '开' : '关'}`, c.x, c.y + 219, half, 44);
          this.button('help', '玩法帮助', c.x + half + 12, c.y + 219, half, 44);
        }
      } else if (v.page === 'settings') {
        const c = this.card(244),
          half = (c.w - 12) / 2;
        this.text('panel-title', '调度员设置', c.cx, c.y + 38, 27, c.w, 44).isBold = true;
        this.text('panel-copy', '轻松接班，好好回家', c.cx, c.y + 75, 14, c.w, 24, C.dim);
        this.button('home', '返回首页', c.x, c.y + 102, c.w, 52, true);
        this.button(
          'sound',
          `音效 ${v.progress.sound ? '开启' : '关闭'}`,
          c.x,
          c.y + 168,
          half,
          44,
        );
        this.button('help', '玩法帮助', c.x + half + 12, c.y + 168, half, 44);
      } else if (v.page === 'help') {
        const c = this.card(332),
          backY = c.y + c.h - 64,
          copyTop = c.y + 68,
          copyHeight = backY - copyTop - 14;
        this.text('help-title', '一起，好好回家', c.cx, c.y + 35, 26, c.w, 44).isBold = true;
        this.text(
          'help-copy',
          '看箭头，点击前方畅通的出租车。\n点击时绑定旅客，多车同时接客。\n接完旅客，让所有车辆离站。\n\n1×免费。2×、3×、5×各看一次\n激励视频，解锁当前局对应倍速。',
          c.cx,
          copyTop + copyHeight / 2,
          c.h < 310 ? 14 : 15,
          c.w,
          copyHeight,
          C.ink,
        );
        this.button('back', '明白了', c.x, backY, c.w, 48, true);
      } else if (v.page === 'result') {
        const c = this.card(348),
          half = (c.w - 12) / 2,
          last = c.y + c.h - 60,
          next = last - 64,
          share = next - 54,
          compact = c.h < 330;
        this.text(
          'result-title',
          '这一程，有你真好',
          c.cx,
          c.y + (compact ? 27 : 32),
          compact ? 23 : 25,
          c.w,
          compact ? 34 : 42,
        ).isBold = true;
        this.text(
          'result-stars',
          '★'.repeat(v.resultStars) + '☆'.repeat(3 - v.resultStars),
          c.cx,
          c.y + (compact ? 65 : 76),
          compact ? 28 : 34,
          c.w,
          compact ? 40 : 48,
          '#d49c21',
        );
        this.text(
          'result-stats',
          compact
            ? `${v.practice ? '试玩 · ' : ''}已接 ${s.target} 人 · ${Math.round(v.elapsed)} 秒`
            : `已接 ${s.target} 位旅客 · ${Math.round(v.elapsed)} 秒\n${v.practice ? '试玩不改变正常进度' : '所有车辆平安离站'}`,
          c.cx,
          c.y + (compact ? 99 : 121),
          compact ? 12 : 14,
          c.w,
          compact ? 20 : 44,
          C.dim,
        );
        if (sys.isBrowser) this.button('share', '邀请好友接同一班', c.x, share, c.w, 44);
        this.button(
          !v.practice && s.config.id < LEVELS.length ? 'next' : 'levels',
          !v.practice && s.config.id < LEVELS.length ? '下一关  ›' : '返回关卡',
          c.x,
          next,
          c.w,
          52,
          true,
        );
        this.button('retry', '再接一班', c.x, last, half, 44);
        this.button('home', '回首页', c.x + half + 12, last, half, 44);
      } else if (v.page === 'ad') {
        const c = this.card(260);
        this.text('ad-title', '准备加速', c.cx, c.y + 39, 28, c.w, 44).isBold = true;
        this.text(
          'ad-copy',
          '完整观看激励视频\n解锁所选倍速，仅本局有效\n取消或未完成不会获得奖励',
          c.cx,
          c.y + 122,
          15,
          c.w,
          94,
          C.dim,
        );
        this.button('cancel-ad', '取消并返回游戏', c.x, c.y + c.h - 64, c.w, 48);
      }
    }
    this.surface = this.g;
    this.textParent = this.baseLabels;
    if (v.page === 'playing' || v.page === 'pause') {
      const x = this.safe.left + 88,
        right = this.w - this.safe.right - 8 - 104,
        w = Math.min(148, right - x);
      this.text(
        'delivered',
        `${s.delivered.size}/${s.target}人`,
        x + (w + 24) / 2,
        top + 22,
        15,
        w - 30,
        40,
        C.cream,
      );
    }
    this.marks.clear();
    this.marks.strokeColor = col(C.cream);
    this.marks.lineWidth = 2;
    this.marks.lineCap = Graphics.LineCap.ROUND;
    this.marks.lineJoin = Graphics.LineJoin.ROUND;
    for (const [id, label] of this.labels)
      if (id.startsWith('capacity:')) label.node.active = false;
    this.textParent = this.roadLabels;
    if (roadVisible) {
      for (const vehicle of s.vehicles) {
        if (vehicle.state !== 'holding') continue;
        const p = world.arrow(vehicle),
          r = 10;
        if (!world.inViewport(p)) continue;
        if (v.page === 'home') {
          const pulse = 0.5 + 0.5 * Math.sin(v.demoTime * 3 + vehicle.sequence * 0.7);
          this.circle(this.marks, p.x, p.y, 12 + pulse * 2, '#fff3bf80');
        }
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
        this.circle(this.marks, p.x, p.y, r, C.cream);
        this.circle(this.marks, p.x, p.y, r - 1.5, C.ink);
        const dx = Math.cos(p.angle),
          dy = Math.sin(p.angle),
          perp = { x: -dy, y: dx };
        // Open arrowhead and a narrow shaft stay distinct inside the small badge.
        for (const path of [
          [
            [-5, 0],
            [5, 0],
          ],
          [
            [0, -4],
            [5, 0],
            [0, 4],
          ],
        ]) {
          path.forEach(([x, y], i) => {
            const xx = p.x + dx * x! + perp.x * y! - this.w / 2,
              yy = this.h / 2 - (p.y + dy * x! + perp.y * y!);
            if (i === 0) this.marks.moveTo(xx, yy);
            else this.marks.lineTo(xx, yy);
          });
        }
        this.marks.stroke();
      }
    }
    this.toastInk.clear();
    if (v.page === 'playing' && world.maxScroll > 0) {
      this.textParent = this.toastLabels;
      this.rect(this.toastInk, cx - 62, bottom - 22, 124, 22, '#123e47d9', 11);
      this.text('scroll-hint', '↕ 上下拖动车场', cx, bottom - 11, 11, 120, 22, C.cream);
    } else {
      const hint = this.labels.get('scroll-hint');
      if (hint) hint.node.active = false;
    }
    this.textParent = this.toastLabels;
    if (v.toast) {
      const toastW = Math.min(300, availableW - 32),
        letters = Array.from(v.toast),
        message = letters.length > 25 ? letters.slice(0, 24).join('') + '…' : v.toast;
      let toastY = bottom - 40,
        toastH = 34;
      const cardHeights: Partial<Record<Page, number>> = {
        pause: 300,
        settings: 244,
        help: 332,
        result: 348,
        ad: 260,
      };
      const preferredHeight = cardHeights[v.page];
      if (preferredHeight) {
        const height = Math.min(preferredHeight, this.h - this.safe.top - this.safe.bottom - 24),
          cardY = this.safe.top + (this.h - this.safe.top - this.safe.bottom - height) / 2;
        if (cardY - top >= 42) toastY = cardY - 42;
        else {
          // On short screens, use an existing explanatory row instead of covering
          // the title or a touch target. The toast key restores it when the notice ends.
          const slotId =
            v.page === 'pause' || v.page === 'settings'
              ? 'panel-copy'
              : `${v.page === 'result' ? 'result-stats' : v.page + '-copy'}`;
          const slot = this.labels.get(slotId);
          if (slot) {
            toastH = Math.min(30, slot.node.getComponent(UITransform)!.height);
            toastY = this.h / 2 - slot.node.position.y - toastH / 2;
            slot.node.active = false;
          } else toastY = top;
        }
      }
      this.rect(this.toastInk, cx - toastW / 2, toastY, toastW, toastH, '#123e47e8', 12);
      this.text(
        'toast',
        message,
        cx,
        toastY + toastH / 2,
        toastH < 28 ? 11 : 13,
        toastW - 18,
        toastH,
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
