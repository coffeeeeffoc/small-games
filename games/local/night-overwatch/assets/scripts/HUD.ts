import {
  Camera,
  Canvas,
  Color,
  Graphics,
  Label,
  Layers,
  Mask,
  Node,
  UITransform,
  view,
  ResolutionPolicy,
  sys,
} from 'cc';
import { ACTIONS, actionLabel, bindingLabel, TUTORIAL, tutorialText } from './core/Actions';
import { drawEffects, type EffectsFrame } from './Effects';
import {
  WEAPONS,
  MAP,
  FLIGHT,
  terrainHeight,
  ROUTE,
  HOLD_POINTS,
  FRIENDLY_POSTS,
  routePoint,
  PROTECTED,
  text,
  type Language,
  type Point,
} from './core/Data';
import type { Simulation } from './core/Simulation';
import type { World } from './World';
import { MISSIONS, TRAINING } from './core/MissionCatalog';
import { mapRoute, routeLength, type BattlefieldId } from './core/Data';
import { trainingNextGoal, type TrainingRecord } from './core/TrainingRecords';

const C = {
  ink: '#101e24f5',
  line: '#3b535a',
  white: '#eef3ea',
  dim: '#a2b5b5',
  mint: '#91e6cb',
  amber: '#f2bc77',
  red: '#ff525b',
};
const col = (hex: string) => new Color().fromHEX(hex);
const flightActions = ['rotateLeft', 'rotateRight', 'orbitLeft', 'orbitRight', 'altitudeUp', 'altitudeDown', 'radiusIn', 'radiusOut'];
const panelActions = [...flightActions, 'sensor', 'locate', 'zoomOut', 'zoomIn', 'mission'];
export type ButtonRect = { id: string; x: number; y: number; w: number; h: number; label: Label };
export class HUD {
  root: Node;
  camera: Camera;
  g: Graphics;
  marks: Graphics;
  globalControls: Node;
  globalGraphics: Graphics;
  w = 960;
  h = 540;
  lang: Language = 'zh';
  touch = sys.isMobile || (sys.isBrowser && window.matchMedia('(pointer: coarse)').matches);
  // UI coordinates from real mouse input; the controller clears this on leave/touch/blur.
  mousePointer?: { x: number; y: number };
  effects: EffectsFrame = { impacts: [], projectiles: [] };
  buttons: ButtonRect[] = [];
  labels = new Map<string, Label>();
  modal?: Node;
  modalKey = '';
  helpGroup: 'basic' | 'advanced' | 'rules' = 'basic';
  helpTouch = false;
  scroll = 0;
  scrollMax = 0;
  scrollNode?: Node;
  scrollArea = { x: 0, y: 0, w: 0, h: 0 };
  tutorial = true;
  muted = false;
  reducedEffects = false;
  fullscreen = false;
  toolsOpen = false;
  toast = '';
  toastUntil = 0;
  trainingBest?: TrainingRecord;
  unitLabels = new Map<number, Label>();
  lastHelpLine = '';
  safe = { left: 0, right: 0, top: 0, bottom: 0 };
  get compact() {
    return this.h < 500;
  }
  get footer() {
    return this.mouseDesktop ? 60 : this.compact ? 74 : 90;
  }
  get desktop() {
    return !this.compact && this.w - this.safe.left - this.safe.right >= 900;
  }
  get mouseDesktop() {
    return this.desktop && !this.touch;
  }
  get panelLayout() {
    const available = this.w - this.safe.left - this.safe.right - 24;
    const short = this.h - this.safe.top - this.safe.bottom < 340;
    const columns = short ? 8 : 4;
    const w = Math.min(available, short ? 720 : 388);
    const h = Math.ceil((this.desktop ? panelActions.length - flightActions.length : panelActions.length) / columns) * 48 + 4;
    return { x: 12 + this.safe.left + (this.desktop ? 148 : 0), y: Math.min(112 + this.safe.top, this.h - this.footer - this.safe.bottom - h - 6), w, h, columns };
  }
  get minimapLayout() {
    const w = this.compact ? 112 : 156;
    return { x: this.w - 12 - this.safe.right - w, y: this.safe.top + 64, w, h: this.compact ? 84 : 108 };
  }
  minimapPoint(x: number, y: number): Point | undefined {
    if (this.modal || this.toolsOpen || ![x, y].every(Number.isFinite)) return;
    const map = this.minimapLayout, left = map.x + 8, top = map.y + 25,
      width = map.w - 16, height = map.h - 33;
    if (x < left || x > left + width || y < top || y > top + height) return;
    return { x: (x - left) / width * MAP.halfWidth * 2 - MAP.halfWidth,
      z: (y - top) / height * MAP.halfDepth * 2 - MAP.halfDepth };
  }
  constructor(parent: Node) {
    this.root = new Node('OverwatchHUD');
    parent.addChild(this.root);
    this.root.layer = Layers.Enum.UI_2D;
    this.root.addComponent(UITransform);
    const canvas = this.root.addComponent(Canvas),
      cn = new Node('UICamera');
    parent.addChild(cn);
    this.camera = cn.addComponent(Camera);
    this.camera.projection = Camera.ProjectionType.ORTHO;
    this.camera.near = 0.1;
    this.camera.far = 2000;
    this.camera.priority = 10;
    this.camera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
    this.camera.visibility = Layers.Enum.UI_2D;
    canvas.cameraComponent = this.camera;
    this.g = this.node('Backdrop', this.root).addComponent(Graphics);
    this.marks = this.node('Telemetry', this.root).addComponent(Graphics);
    this.globalControls = this.node('GlobalControls', this.root);
    this.globalGraphics = this.globalControls.addComponent(Graphics);
    this.resize();
  }
  t(zh: string, en: string) {
    return this.lang === 'zh' ? zh : en;
  }
  node(name: string, parent: Node) {
    const n = new Node(name);
    n.layer = Layers.Enum.UI_2D;
    parent.addChild(n);
    n.addComponent(UITransform);
    return n;
  }
  resize() {
    this.mousePointer = undefined;
    const size = view.getFrameSize();
    this.w = size.width;
    this.h = size.height;
    view.setDesignResolutionSize(this.w, this.h, ResolutionPolicy.EXACT_FIT);
    const rect = sys.getSafeAreaRect();
    this.safe = {
      left: Math.max(0, rect.x),
      right: Math.max(0, this.w - rect.x - rect.width),
      bottom: Math.max(0, rect.y),
      top: Math.max(0, this.h - rect.y - rect.height),
    };
    this.root.getComponent(UITransform)!.setContentSize(this.w, this.h);
    this.root.setPosition(this.w / 2, this.h / 2, 0);
    this.camera.node.setPosition(this.w / 2, this.h / 2, 1000);
    this.camera.orthoHeight = this.h / 2;
    for (const b of this.buttons) b.label.node.destroy();
    this.buttons = [];
    for (const l of Array.from(this.labels.values())) l.node.destroy();
    this.labels.clear();
    for (const l of Array.from(this.unitLabels.values())) l.node.destroy();
    this.unitLabels.clear();
    this.modal?.destroy();
    this.modal = undefined;
    this.modalKey = '';
    this.buildControls();
  }
  label(
    parent: Node,
    str: string,
    x: number,
    y: number,
    size: number,
    width: number,
    height: number,
    hex = C.white,
  ) {
    const n = this.node(str.slice(0, 20), parent);
    n.setPosition(x - this.w / 2, this.h / 2 - y);
    n.getComponent(UITransform)!.setContentSize(width, height);
    const l = n.addComponent(Label);
    l.string = str;
    l.fontFamily = 'Microsoft YaHei';
    l.fontSize = size;
    l.lineHeight = size * 1.45;
    l.color = col(hex);
    l.overflow = Label.Overflow.CLAMP;
    l.horizontalAlign = Label.HorizontalAlign.CENTER;
    l.verticalAlign = Label.VerticalAlign.CENTER;
    return l;
  }
  button(id: string, str: string, x: number, y: number, w: number, h = 44, parent = this.root) {
    const l = this.label(parent, str, x + w / 2, y + h / 2, this.compact ? 13 : 14, w - 8, h - 2);
    this.buttons.push({ id, x, y, w, h, label: l });
    return l;
  }
  live(id: string, x: number, y: number, size: number, w: number, h: number, hex = C.white) {
    const l = this.label(this.root, '', x, y, size, w, h, hex);
    this.labels.set(id, l);
    return l;
  }
  set(id: string, str: string) {
    const l = this.labels.get(id);
    if (l && l.string !== str) l.string = str;
  }
  buildControls() {
    const w = this.w, h = this.h, left = 12 + this.safe.left,
      right = w - 12 - this.safe.right, top = this.safe.top;
    const statsX = left + (this.desktop ? 183 : 80);
    this.live('title', left + 49, top + 24, 18, 98, 34, C.mint).isBold = true;
    this.live('health', statsX, top + 18, 13, 160, 25);
    this.live('progress', statsX, top + 40, 11, 160, 20, C.dim);
    const small = this.mouseDesktop;
    this.live('status', right - (small ? 214 : 260), top + 26, 11, 60, 40, C.dim);
    this.button('settings', this.t('设置', 'SETTINGS'), right - (small ? 124 : 162), top + (small ? 12 : 6), small ? 54 : 68, small ? 32 : 44, this.globalControls).fontSize = small ? 11 : 12;
    this.button('fullscreen', this.t('全屏', 'FULL SCREEN'), right - (small ? 64 : 88), top + (small ? 12 : 6), small ? 64 : 88, small ? 32 : 44, this.globalControls).fontSize = small ? 11 : 12;
    const pause = this.button('pause', this.t('暂停', 'PAUSE'), right - (small ? 184 : 224), top + (small ? 12 : 6), small ? 54 : 56, small ? 32 : 44);
    pause.fontSize = 12;
    pause.lineHeight = 16;
    if (!small) {
      pause.node.setPosition(right - 196 - w / 2, h / 2 - top - 39);
      pause.node.getComponent(UITransform)!.setContentSize(48, 18);
    }
    const telemetryLeft = statsX + 84, telemetryWidth = Math.max(0, right - (small ? 250 : 296) - telemetryLeft);
    this.live('telemetry', telemetryLeft + telemetryWidth / 2, top + 28, this.desktop ? 14 : 11, telemetryWidth, 48, C.dim);
    this.live('globalToast', w / 2, h - this.safe.bottom - 24, 12, w - this.safe.left - this.safe.right - 32, 36, C.amber).node.parent = this.globalControls;
    const by = h - this.footer - this.safe.bottom;
    const cardW = small ? 104 : this.compact ? 78 : this.desktop ? 160 : 112;
    const fireW = this.compact ? 110 : 160;
    const cardsLeft = this.desktop ? right - (this.touch ? fireW + 18 : -6) - 3 * (cardW + 6) : left;
    for (let i = 0; i < 3; i++) {
      const label = this.button('weapon' + i, '', cardsLeft + i * (cardW + 6), by + (small ? 8 : 10), cardW, small ? 44 : this.footer - 20);
      if (small) { label.fontSize = 12; label.lineHeight = 17; }
    }
    this.button('fire', '', right - fireW, by + 8, fireW, this.footer - 16);
    const stateX = this.desktop ? cardsLeft - 144 : left + 3 * (cardW + 6) + 8;
    const stateW = this.desktop ? 132 : right - fireW - stateX - 12;
    this.live('weaponState', stateX + stateW / 2, by + this.footer / 2, small ? 12 : this.compact ? 12 : 14, Math.max(60, stateW), this.footer - 14, C.dim);
    this.live('notice', w / 2, this.compact ? by - 17 : top + 80, this.compact ? 12 : 15, this.compact ? w - 40 : Math.min(w - 260, 560), this.compact ? 28 : 36, C.amber);
    this.live('friendWarning', w / 2, this.compact ? by - 17 : top + 116, this.compact ? 13 : 16, this.compact ? w - 40 : Math.min(w - 260, 560), 28, C.red).isBold = true;
    this.live('tutorial', w / 2, by - 17, this.compact ? 11 : 13, w - 40, 28, C.mint);
    this.live('target', w / 2, by - 45, 12, 156, 24, C.amber);
    this.live('flight', w / 2, h / 2, 12, 130, 24, C.white);
    this.live('hold', left + (this.desktop ? 208 : 172), top + 121, 11, 140, 22, C.dim);
    this.button('flightControls', this.t('飞行 ▾', 'FLIGHT ▾'), left, top + 64, this.desktop ? 128 : 96);
    this.button('convoy', '', left + (this.desktop ? 144 : 102), top + 64, this.desktop ? 128 : 140, 44);
    const panel = this.panelLayout, toolWidth = (panel.w - 8 - (panel.columns - 1) * 4) / panel.columns;
    for (const [i, id] of panelActions.entries()) {
      const fixed = this.desktop && flightActions.includes(id);
      const index = this.desktop ? i - flightActions.length : i;
      const label = this.button(id,
        id === 'zoomIn' ? this.t('放大 +', 'ZOOM +') : id === 'zoomOut' ? this.t('缩小 −', 'ZOOM −') : actionLabel(id, this.lang, true),
        fixed ? left + (i === 2 || i === 3 ? 0 : (i % 2) * 62) : panel.x + 4 + (index % panel.columns) * (toolWidth + 4),
        fixed ? top + [366, 366, 116, 162, 230, 230, 298, 298][i] : panel.y + 4 + Math.floor(index / panel.columns) * 48,
        fixed ? i === 2 || i === 3 ? 128 : 44 : toolWidth, 44);
      if (fixed) {
        label.string = [ '←', '→', this.t('逆时针', 'CCW'), this.t('顺时针', 'CW'), '+', '−', '−', '+' ][i];
        label.fontSize = i === 2 || i === 3 ? 12 : 22;
        if (i === 2 || i === 3) {
          label.node.setPosition(left + 85 - w / 2, h / 2 - top - (i === 2 ? 138 : 184));
          label.node.getComponent(UITransform)!.setContentSize(84, 42);
        }
      }
    }
    const map = this.minimapLayout;
    this.live('mapLegend', map.x + map.w / 2, map.y + 11, 10, map.w - 4, 20, C.dim);
    const nextCell = this.desktop ? panelActions.length - flightActions.length : panelActions.length;
    const metricsColumn = nextCell % panel.columns;
    const metricsWidth = (panel.columns - metricsColumn - (panel.columns === 8 ? 1 : 0)) * (toolWidth + 4) - 4;
    this.live('orbit', panel.x + 4 + metricsColumn * (toolWidth + 4) + metricsWidth / 2,
      panel.y + 26 + Math.floor(nextCell / panel.columns) * 48, 11, metricsWidth - 8, 44, C.dim);
    if (this.desktop) {
      this.live('flightAltitude', left + 64, top + 216, 11, 128, 20, C.dim);
      this.live('flightRadius', left + 64, top + 284, 11, 128, 20, C.dim);
      this.live('flightView', left + 64, top + 352, 11, 128, 20, C.dim).string = this.t('查看方位', 'VIEW BEARING');
      this.live('orbitIconLeft', left + 21, top + 138, 24, 38, 42, C.mint).string = '↶';
      this.live('orbitIconRight', left + 21, top + 184, 24, 38, 42, C.mint).string = '↷';
    }
  }
  rect(g: Graphics, x: number, y: number, w: number, h: number, fill: string, stroke?: string, radius = 0) {
    if (w <= 0 || h <= 0) return;
    const path = () => radius > 0
      ? g.roundRect(x - this.w / 2, this.h / 2 - y - h, w, h, Math.min(radius, w / 2, h / 2))
      : g.rect(x - this.w / 2, this.h / 2 - y - h, w, h);
    g.fillColor = col(fill);
    path();
    g.fill();
    if (stroke) {
      g.lineWidth = 1;
      g.strokeColor = col(stroke);
      path();
      g.stroke();
    }
  }
  isGlobalAction(id: string) {
    return id === 'settings' || id === 'fullscreen';
  }
  hit(x: number, y: number) {
    return [...this.buttons]
      .reverse()
      .find(
        (b) =>
          x >= b.x &&
          x <= b.x + b.w &&
          y >= b.y &&
          y <= b.y + b.h &&
          b.label.node.activeInHierarchy &&
          (!this.modal || b.label.node.parent === this.modal || this.isGlobalAction(b.id)),
      );
  }
  blocksBattlefield(x: number, y: number) {
    const panel = this.panelLayout, map = this.minimapLayout;
    return !!this.hit(x, y) || y < 58 + this.safe.top ||
      (!this.desktop && y > this.h - this.footer - this.safe.bottom) ||
      (this.desktop && x < 152 + this.safe.left && y >= 110 + this.safe.top && y <= 414 + this.safe.top) ||
      (this.toolsOpen && x >= panel.x && x <= panel.x + panel.w && y >= panel.y && y <= panel.y + panel.h) ||
      (!this.toolsOpen && x >= map.x && x <= map.x + map.w && y >= map.y && y <= map.y + map.h);
  }
  scrollBy(amount: number) {
    this.scroll = Math.max(0, Math.min(this.scrollMax, this.scroll + amount));
    if (this.scrollNode) this.scrollNode.setPosition(0, this.scroll, 0);
  }
  routeGraphic(g: Graphics, x: number, y: number, w: number, h: number, progress = 0, map: BattlefieldId = 'valley') {
    const ROUTE = mapRoute(map), length = routeLength(map), HOLD_POINTS = [length * .28, length * .64];
    const point = (p: Point) => ({
      x: x + ((p.x + 100) / 210) * w - this.w / 2,
      y: this.h / 2 - y - ((p.z + 42) / 82) * h,
    });
    g.lineWidth = 3;
    g.strokeColor = col(C.line);
    ROUTE.forEach((p, i) => {
      const q = point(p);
      if (i) g.lineTo(q.x, q.y);
      else g.moveTo(q.x, q.y);
    });
    g.stroke();
    for (const [i, p] of [
      ROUTE[0],
      routePoint(HOLD_POINTS[0], map),
      routePoint(HOLD_POINTS[1], map),
      ROUTE[ROUTE.length - 1],
    ].entries()) {
      const q = point(p);
      g.fillColor = col(i === 3 ? C.mint : C.dim);
      g.circle(q.x, q.y, i === 3 ? 5 : 3);
      g.fill();
    }
    const q = point(routePoint(progress, map));
    g.strokeColor = col(C.mint);
    g.lineWidth = 2;
    g.rect(q.x - 6, q.y - 6, 12, 12);
    g.stroke();
  }
  renderHome(n: Node, g: Graphics, s: Simulation) {
    const w = this.w, h = this.h, short = h < 500;
    // The same live world sits behind this full-screen home and the mission.
    this.rect(g, 0, 0, w, h, '#07121cb8');
    const left = this.safe.left + (short ? 22 : 56), titleWidth = w * .38;
    this.label(n, 'NIGHT OVERWATCH', left + titleWidth / 2, short ? 87 : h * .29, short ? 12 : 16, titleWidth, 26, C.amber);
    this.label(n, this.t('夜航守望', 'OVERWATCH'), left + titleWidth / 2, short ? 125 : h * .39,
      short ? 32 : 52, titleWidth, short ? 52 : 80, C.white).isBold = true;
    this.label(n, this.t('长夜之上，一路守望', 'WATCH OVER THE WAY HOME'), left + titleWidth / 2,
      short ? 168 : h * .48, short ? 12 : 17, titleWidth, 36, C.mint);
    this.label(n, this.t('选择航区，开始你的下一次值勤。', 'Choose your next operation.'), left + titleWidth / 2,
      short ? 208 : h * .57, short ? 11 : 14, titleWidth, 40, C.dim);
    const x = w * .48, rw = w - x - this.safe.right - (short ? 20 : 52), top = this.safe.top + (short ? 60 : Math.max(95, h * .15));
    const row = short ? 44 : 72, gap = short ? 3 : 10;
    if (!short) this.label(n, this.t('任务中心  /  2 个航区', 'OPERATIONS  /  2 BATTLEFIELDS'), x + rw / 2, top - 17, 12, rw, 24, C.dim);
    for (const [i, mission] of [...MISSIONS, TRAINING].entries()) {
      const y = top + i * (row + gap), selected = mission.id === s.mission.id;
      const id = mission.id === TRAINING.id ? 'training' : 'mission:' + mission.id;
      this.rect(g, x, y, rw, row, selected ? '#233d46ef' : '#101e29dc', selected ? C.mint : '#67828d55', 4);
      if (selected) this.rect(g, x, y + 5, 3, row - 10, C.mint);
      const tag = mission.mode === 'training' ? this.t('练习', 'RANGE')
        : mission.map === 'valley' ? this.t('河谷', 'VALLEY') : this.t('高地', 'HIGHLAND');
      const label = this.button(id, `${selected ? '▸' : '  '} ${text(mission.name, this.lang)}  ·  ${tag}`, x, y, rw, row, n);
      label.fontSize = short ? 12 : 18;
      label.color = col(selected ? C.white : C.dim);
    }
    const startY = top + 4 * (row + gap) + (short ? 2 : 22);
    const start = this.button('start', this.t('开始任务  →', 'START MISSION  →'), x, startY, rw, 44, n);
    this.rect(g, x, startY, rw, 44, C.mint, undefined, 4);
    start.color = col('#10252a'); start.isBold = true;
    if (!short) {
      this.label(n, text(s.mission.description, this.lang), x + rw / 2, startY + 72, 13, rw, 42, C.dim);
      this.label(n, this.t('鼠标瞄准 · 左键开火 · 1 / 2 / 3 切换火炮', 'Mouse aim · Left click fire · 1 / 2 / 3 weapons'),
        w / 2, h - this.safe.bottom - 28, 12, w - 48, 28, C.dim);
    }
  }
  renderModal(key: string, s: Simulation) {
    if (key === this.modalKey) return;
    this.buttons = this.buttons.filter((b) => {
      if (b.label.node.parent !== this.root && !this.isGlobalAction(b.id)) {
        b.label.node.destroy();
        return false;
      }
      return true;
    });
    this.modal?.destroy();
    this.modal = undefined;
    this.scrollNode = undefined;
    this.scroll = 0;
    this.scrollMax = 0;
    this.modalKey = key;
    if (!key) return;
    this.toolsOpen = false;
    const n = this.node('Panel', this.root);
    this.modal = n;
    const g = n.addComponent(Graphics);
    if (key === 'home') { this.renderHome(n, g, s); return; }
    const paused = key === 'pause', settings = key === 'settings';
    const allies = s.units.filter((u) => u.friendly).length;
    const training = s.mission.mode === 'training';
    this.rect(g, 0, 0, this.w, this.h, paused ? '#05090c9c' : '#061116d9');
    const pw = Math.min(paused || settings ? 480 : 880, this.w - this.safe.left - this.safe.right - 32),
      ph = Math.min(paused || settings ? 320 : 540, this.h - this.safe.top - this.safe.bottom - 72);
    const px = this.safe.left + (this.w - this.safe.left - this.safe.right - pw) / 2,
      py = this.safe.top + 58 + (this.h - this.safe.top - this.safe.bottom - 58 - ph) / 2;
    this.rect(g, px, py, pw, ph, paused ? '#11191fe8' : '#101e24fb', paused ? '#91e6cb88' : C.line, paused ? 10 : 0);
    if (!paused) this.rect(g, px, py, 4, ph, key === 'failure' ? C.red : C.mint);
    const small = this.compact || this.w < 600,
      low = ph < 280,
      help = key.startsWith('help');
    const heading =
      key === 'briefing'
        ? training ? this.t('60秒火控热身', '60s FIRE CONTROL') : this.t('夜航守望', 'NIGHT OVERWATCH')
        : key === 'success'
          ? training ? this.t('三靶清除，热身完成', 'THREE TARGETS CLEARED') : this.t('车队安全抵达', 'CONVOY EXTRACTED')
          : key === 'failure'
            ? training ? this.t('热身结束，再试一次', 'WARMUP ENDED · TRY AGAIN') : this.t('护送中断', 'ESCORT INTERRUPTED')
            : key === 'orientation'
              ? this.t('横屏，进入火控席', 'ROTATE TO LANDSCAPE')
              : help
                ? this.t('飞行值勤手册', 'FIELD GUIDE')
                : key === 'mission'
                  ? this.t('山谷公路撤离', 'VALLEY EVACUATION')
                  : settings ? this.t('设置', 'SETTINGS') : this.t('任务已暂停', 'MISSION PAUSED');
    const headingLabel = this.label(
      n,
      heading,
      px + pw / 2,
      py + (paused && !small ? 88 : small ? 29 : 48),
      paused && !small ? 26 : small ? 23 : 36,
      pw - (help ? 112 : 56),
      small ? 46 : 60,
      C.white,
    );
    headingLabel.isBold = true;
    if (paused) {
      const x = small ? px + 40 : px + pw / 2, y = py + (small ? 29 : 40), r = small ? 15 : 21,
        barH = small ? 16 : 20;
      g.fillColor = col('#91e6cb24');
      g.circle(x - this.w / 2, this.h / 2 - y, r);
      g.fill();
      g.strokeColor = col(C.mint);
      g.lineWidth = 3;
      g.circle(x - this.w / 2, this.h / 2 - y, r);
      g.stroke();
      this.rect(g, x - 7, y - barH / 2, 5, barH, C.mint);
      this.rect(g, x + 2, y - barH / 2, 5, barH, C.mint);
    }
    if (!['briefing', 'success', 'failure', 'orientation', 'pause'].includes(key))
      this.button('close', '×', px + pw - 56, py + 8, 44, 44, n);
    const bottom = py + ph - 58;
    if (help) {
      const tabs = [
        ['basic', this.t('基础', 'BASIC')],
        ['advanced', this.t('进阶', 'ADVANCED')],
        ['rules', this.t('规则', 'RULES')],
      ];
      tabs.forEach(([id, str], i) =>
        this.button(
          'tab:' + id,
          str,
          px + 16 + (i * (pw - 144)) / 3,
          py + 58,
          (pw - 160) / 3,
          44,
          n,
        ),
      );
      this.button(
        'input',
        this.helpTouch ? this.t('触控', 'TOUCH') : this.t('键鼠', 'KEYS'),
        px + pw - 110,
        py + 58,
        94,
        44,
        n,
      );
      const vh = ph - 174,
        vw = pw - 44,
        mask = this.node('HelpViewport', n);
      mask.setPosition(0, this.h / 2 - (py + 112 + vh / 2));
      mask.getComponent(UITransform)!.setContentSize(vw, vh);
      mask.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
      this.scrollArea = { x: px + 22, y: py + 112, w: vw, h: vh };
      const content = this.node('Instructions', mask);
      this.scrollNode = content;
      const rows = ACTIONS.filter(
          (a) =>
            a.group === this.helpGroup &&
            !(this.helpTouch && ['previous', 'next', 'focus'].includes(a.id)),
        ),
        rowH = this.compact && this.w >= 500 ? 56 : 90;
      this.scrollMax = Math.max(0, rows.length * rowH - vh);
      rows.forEach((a, i) => {
        const l = this.label(
          content,
          `${text(a.name, this.lang)}  ·  ${this.helpTouch ? text(a.touch, this.lang) : bindingLabel(a.id, this.lang)}\n${text(a.description, this.lang)}`,
          this.w / 2,
          0,
          rowH === 56 ? 12 : 14,
          vw - 16,
          rowH - 8,
        );
        l.node.setPosition(0, vh / 2 - i * rowH - rowH / 2);
        l.horizontalAlign = Label.HorizontalAlign.LEFT;
      });
      this.lastHelpLine = text(rows[rows.length - 1].description, this.lang);
      this.button(
        'tutorial',
        this.t('重玩教学', 'COACH'),
        px + 16,
        bottom,
        pw < 360 ? 90 : 108,
        44,
        n,
      );
      this.button(
        'language',
        this.lang === 'zh' ? 'EN' : '中文',
        px + (pw < 360 ? 114 : 132),
        bottom,
        pw < 360 ? 44 : 56,
        44,
        n,
      );
      this.label(
        n,
        pw >= 500 ? this.t('上下滑动查看', 'SCROLL FOR MORE') : '',
        px + pw / 2 + 18,
        bottom + 22,
        11,
        Math.max(72, pw - 408),
        30,
        C.dim,
      );
    } else if (settings) {
      const bw = (pw - 56) / 2, row = py + (small ? 64 : 96);
      this.button('sound', this.muted ? this.t('声音：关', 'SOUND OFF') : this.t('声音：开', 'SOUND ON'), px + 24, row, bw, 44, n);
      this.button('effects', this.reducedEffects ? this.t('效果：简', 'FX: LOW') : this.t('效果：全', 'FX: FULL'), px + 32 + bw, row, bw, 44, n);
      this.button('help', this.t('操作帮助', 'HELP'), px + 24, row + 52, bw, 44, n);
      this.button('language', this.lang === 'zh' ? 'EN' : '中文', px + 32 + bw, row + 52, bw, 44, n);
    } else if (key === 'briefing' || key === 'mission') {
      const split = !small,
        contentTop = py + (low ? 52 : small ? 65 : 118);
      if (split) {
        this.label(n, 'NIGHT 07  /  ' + text(s.mission.name, this.lang), px + pw / 2, py + 86, 12, pw - 48, 24, C.mint);
        if (training) {
          for (const [i, target] of [this.t('◇ 静止目标 → 爆破炮', '◇ STATIC → BURST'),
            this.t('◇ 巡逻目标 → 弹着提前量', '◇ ROVER → LEAD THE SHOT'),
            this.t('◇ 重甲目标 → 重型炮', '◇ ARMOR → HEAVY')].entries())
            this.label(n, target, px + pw * .72, contentTop + 52 + i * 56, 17, pw * .43, 44, C.amber);
        } else {
          this.routeGraphic(g, px + pw * 0.48, contentTop + 28, pw * 0.46, ph - 235, s.progress, s.mission.map);
          this.label(
          n,
          this.t('西岭 → 河谷桥 → 东岭营地', 'WEST RIDGE → RIVER → EXTRACTION'),
          px + pw * 0.71,
          py + ph - 104,
          13,
          pw * 0.5,
          32,
          C.dim,
        );
        }
      }
      const cx = split ? px + pw * 0.25 : px + pw / 2,
        cw = split ? pw * 0.42 : pw - 36;
      this.label(
        n,
        training ? this.t('60 秒内清除 3 种目标', 'CLEAR THREE TARGET TYPES IN 60s')
          : text(s.mission.name, this.lang) + ' · ' + this.t('护送清敌', 'ESCORT & CLEAR'),
        cx,
        contentTop + 14,
        small ? 16 : 21,
        cw,
        42,
        C.white,
      ).isBold = true;
      for (const [i, message] of [
        training ? this.t('练瞄准，友军仍不能误伤', 'Practice aiming; do not hit allies')
          : this.t(`□  保护救援车与 ${FRIENDLY_POSTS.length} 处分散据点`, `□  Protect rescue & all ${FRIENDLY_POSTS.length} outposts`),
        text(s.mission.description, this.lang),
      ].entries())
        this.label(
          n,
          message,
          cx,
          contentTop + (low ? 52 : small ? 61 : 90) + (i - 0.5) * 24,
          small ? 14 : 17,
          cw,
          30,
          i === 0 ? C.mint : C.amber,
        );
      this.label(
        n,
        this.touch
          ? this.t('左手拖动瞄准 · 右手按住开火', 'Drag to aim · Hold FIRE with other thumb')
          : this.t(
              '鼠标瞄准 · 按住左键开火 · 1 / 2 / 3 切枪',
              'Mouse aims · Hold left button · 1 / 2 / 3 weapons',
            ),
        cx,
        contentTop + (low ? 95 : small ? 116 : 159),
        small ? 12 : 14,
        cw,
        low ? 28 : 44,
        C.dim,
      );
      const primaryW = key === 'briefing' ? (pw - (training ? 56 : 64)) / (training ? 2 : 3) : Math.min(260, pw - 48);
      if (key === 'briefing') {
        this.button(training ? 'missionReturn' : 'missionNext', training ? this.t('返回护送', 'BACK TO ESCORT')
          : this.t('切换任务 ↻', 'CHANGE TASK ↻'), px + 24, bottom, primaryW, 44, n);
        if (!training) this.button('training', this.t('60秒热身', '60s WARMUP'), px + 32 + primaryW, bottom, primaryW, 44, n);
      }
      this.button(
        key === 'briefing' ? 'start' : 'resume',
        key === 'briefing'
          ? training ? this.t('开始60秒 →', 'START 60s →') : this.t('护送开跑 →', 'BEGIN ESCORT →')
          : this.t('返回任务', 'RESUME'),
        key === 'briefing' ? px + (training ? 32 + primaryW : 40 + 2 * primaryW) : px + pw / 2 - primaryW / 2,
        bottom,
        primaryW,
        44,
        n,
      );
    } else if (key === 'success' || key === 'failure') {
      const success = key === 'success';
      const lostOutpost = s.failedGroup !== undefined && s.failedGroup > 0;
      const mainThreat = Object.entries(s.damageByThreat).sort((a, b) => b[1] - a[1])[0];
      const threatAdvice =
        mainThreat &&
        {
          light: [
            `轻车造成 ${Math.round(mainThreat[1])} 伤害。下次用速射追踪，并瞄准前方。`,
            `Light patrol: ${Math.round(mainThreat[1])} damage. Track with Rapid; lead its movement.`,
          ],
          turret: [
            `炮台造成 ${Math.round(mainThreat[1])} 伤害。下次优先用爆破炮清除固定威胁。`,
            `Turrets: ${Math.round(mainThreat[1])} damage. Clear fixed threats with Burst first.`,
          ],
          heavy: [
            `重甲造成 ${Math.round(mainThreat[1])} 伤害。下次用重炮，预留弹着提前量。`,
            `Armor: ${Math.round(mainThreat[1])} damage. Use Heavy and allow for flight time.`,
          ],
        }[mainThreat[0]];
      this.label(
        n,
        success
          ? this.t(`${training ? '热身' : '护送'}评价  ${s.rating}`, `${training ? 'WARMUP' : 'ESCORT'} RATING  ${s.rating}`)
          : this.t(
              training ? s.failure === 'vehicle' ? '误伤友军，热身中断' : '60秒结束，还有目标' : s.failure === 'vehicle' ? lostOutpost ? `第 ${s.failedGroup} 据点全灭` : '救援车被毁' : '撤离窗口关闭',
              training ? s.failure === 'vehicle' ? 'FRIENDLY LOST · WARMUP STOPPED' : '60s ENDED · TARGETS REMAIN' : s.failure === 'vehicle' ? lostOutpost ? `OUTPOST ${s.failedGroup} LOST` : 'Rescue vehicle lost' : 'Evacuation window closed',
            ),
        px + pw / 2,
        py + (low ? 73 : small ? 75 : 120),
        small ? 24 : 44,
        pw - 40,
        low ? 36 : 60,
        success ? C.mint : C.red,
      ).isBold = true;
      const statY = py + (low ? 110 : small ? 123 : 212),
        statW = (pw - 48) / 3,
        cleared = s.kills + s.friendlyKills;
      for (const [i, [value, caption]] of [
        [training ? `${s.time.toFixed(1)}s` : `${allies - s.friendlyLosses} / ${allies}`, training
          ? this.trainingBest ? this.t(`用时 · 最佳${this.trainingBest.time.toFixed(1)}s`, `TIME · BEST ${this.trainingBest.time.toFixed(1)}s`)
            : this.t('热身用时', 'WARMUP TIME') : this.t('友军存活', 'ALLIES ALIVE')],
        [training ? `${s.hitShots} / ${s.fired}` : `${cleared} / ${cleared + s.threatsRemaining}`, training ? this.t('命中发 / 已发射', 'HIT SHOTS / FIRED') : this.t('清除威胁', 'THREATS')],
        [`${Math.round(s.friendlyDamage)}`, this.t('友方损伤', 'FRIENDLY DAMAGE')],
      ].entries()) {
        const x = px + 24 + statW * (i + 0.5);
        this.label(n, value, x, statY, small ? 21 : 32, statW - 8, low ? 36 : 44, C.white);
        this.label(n, caption, x, statY + 29, 12, statW - 8, 22, C.dim);
      }
      if (ph >= 310) this.label(n,
        training ? this.t(`清靶 ${s.kills} / 3${this.trainingBest ? ` · 零友伤最佳 ${this.trainingBest.time.toFixed(1)}s / ${this.trainingBest.fired}发` : ''}`,
          `CLEARED ${s.kills}/3${this.trainingBest ? ` · CLEAN BEST ${this.trainingBest.time.toFixed(1)}s / ${this.trainingBest.fired} shots` : ''}`)
          : this.t(`空中 ${s.kills} · 地面 ${s.friendlyKills}`, `AIR ${s.kills} · GROUND ${s.friendlyKills}`),
        px + pw / 2, statY + 51, 11, training ? pw - 48 : statW - 8, 20, C.dim);
      const advice = training ? text(trainingNextGoal(s), this.lang) : success
        ? s.rating === 'S'
          ? this.t(
              `${text(s.mission.name, this.lang)} · ${Math.floor(s.time)}s · ${s.fired} 发。再战，减少耗弹。`,
              `${text(s.mission.name, this.lang)} · ${Math.floor(s.time)}s · ${s.fired} rounds. Try fewer shots.`,
            )
          : this.t(
              '下次目标：保护救援车，零友伤、零友军损失，争取 S。',
              'Next: protect rescue, avoid friendly damage and losses to aim for S.',
            )
        : s.failure === 'timeout'
          ? this.t(
              s.threatsRemaining > 0 ? `仍有 ${s.threatsRemaining} 个威胁未清除。巡视小地图，保护各组友军并清除全部敌人。` : '待命期间倒计时继续。清路后尽快点击「车队继续」。',
              s.threatsRemaining > 0 ? `${s.threatsRemaining} threats remain. Scan the minimap, protect every group and clear all enemies.` : 'HOLD does not stop the clock. Clear the road and GO.',
            )
          : lostOutpost
            ? this.t(
                s.failureCause === 'friendly' ? `第 ${s.failedGroup} 据点因己方火力全灭。开火前检查友军与爆炸范围。` : `第 ${s.failedGroup} 据点遭敌袭全灭。每组友军至少保住一辆，救援车存活也不能遗漏据点。`,
                s.failureCause === 'friendly' ? `Friendly fire eliminated outpost ${s.failedGroup}. Check allies and blast radius before firing.` : `Enemy fire eliminated outpost ${s.failedGroup}. Keep a survivor in every group; rescue survival alone is not enough.`,
              )
            : s.failureCause === 'friendly'
            ? this.t(
                '致命伤来自己方火力。下次开炮前检查范围圈。',
                'Lost to friendly fire. Check the blast circle before shooting.',
              )
            : threatAdvice
              ? text(threatAdvice, this.lang)
              : this.t(
                  '敌袭摧毁救援车。清除沿线威胁，必要时让车队待命。',
                  'Lost to hostile fire. Clear nearby threats; HOLD if needed.',
                );
      this.label(
        n,
        advice,
        px + pw / 2,
        py + ph - (low ? 74 : small ? 86 : 126),
        small ? 13 : 16,
        pw - 42,
        low ? 24 : small ? 44 : 62,
        C.dim,
      );
      const resultW = (pw - (training ? 56 : 64)) / (training ? 2 : 3);
      this.button('home', this.t('返回首页', 'HOME'), px + 24, bottom, resultW, 44, n);
      if (!training) this.button('training', this.t('60秒热身', '60s WARMUP'), px + 32 + resultW, bottom, resultW, 44, n);
      this.button(
        'retry',
        training ? this.t('再练一轮 ↻', 'TRY AGAIN ↻') : this.t('再次出动 ↻', 'RETRY ↻'),
        px + (training ? 32 + resultW : 40 + 2 * resultW),
        bottom,
        resultW,
        44,
        n,
      );
    } else if (key === 'orientation') {
      this.label(n, '↻', px + pw / 2, py + ph * 0.32, 60, pw - 30, 90, C.mint);
      this.label(
        n,
        this.t(
          '双手操作，更容易看清前路。\n任务已暂停，横屏后继续。',
          'Two thumbs. A clear view of the road.\nMission paused until landscape.',
        ),
        px + pw / 2,
        py + ph * 0.53,
        15,
        pw - 30,
        110,
        C.white,
      );
    } else {
      const tight = ph < 310, summaryY = py + (tight ? 90 : 142);
      this.label(n, this.t(
        `护送并清除全部威胁 · 剩余 ${s.threatsRemaining}\n友军 ${allies - s.friendlyLosses}/${allies}  ·  撤离 ${Math.floor(s.ratio * 100)}%  ·  剩余 ${Math.ceil(s.remaining)}s`,
        `ESCORT & CLEAR ALL THREATS · ${s.threatsRemaining} LEFT\nALLIES ${allies - s.friendlyLosses}/${allies} · ROUTE ${Math.floor(s.ratio * 100)}% · ${Math.ceil(s.remaining)}s LEFT`,
      ), px + pw / 2, summaryY, tight ? 12 : 14, pw - 48, 48, C.dim);
      this.rect(g, px + 24, summaryY + 30, pw - 48, 1, '#91e6cb33');
      if (!tight) this.label(n,
        this.t('世界与倒计时已冻结 · 继续后重新按下开火', 'World and clock frozen · Press FIRE again on return'),
        px + pw / 2, py + 204, 11, pw - 48, 30, C.dim);
      this.button('resume', this.t('继续任务  →', 'RESUME MISSION  →'),
        px + 24, bottom, (pw - 56) / 2, 44, n);
      this.button('home', this.t('中断任务 · 返回首页', 'ABORT · HOME'), px + 32 + (pw - 56) / 2, bottom, (pw - 56) / 2, 44, n);
    }
    for (const b of this.buttons.filter((b) => b.label.node.parent === n)) {
      const primary = ['start', 'retry', 'resume'].includes(b.id);
      this.rect(g, b.x, b.y, b.w, b.h, primary ? C.mint : paused ? '#17232930' : '#1b3038', primary ? C.mint : paused ? undefined : C.line, paused ? 5 : 0);
      b.label.color = col(primary ? '#10252a' : C.white);
      b.label.isBold = primary;
      if (paused && primary) b.label.fontSize = this.compact ? 16 : 18;
    }
  }
  drawCabin(g: Graphics) {
    const w = this.w, h = this.h;
    const polygon = (points: number[][], fill: string) => {
      g.fillColor = col(fill);
      points.forEach(([x, y], i) => i ? g.lineTo(x - w / 2, h / 2 - y) : g.moveTo(x - w / 2, h / 2 - y));
      g.close(); g.fill();
    };
    // A gunner's observation window: frame and glass stay at the periphery of the targeting view.
    polygon([[0, 45], [18, 60], [18, h * .86], [w * .045, h], [0, h]], '#10191fee');
    polygon([[w, 45], [w - 14, 60], [w - 16, h * .88], [w * .965, h], [w, h]], '#121b23e8');
    polygon([[0, h - 15], [w * .2, h - 28], [w * .72, h - 14], [w, h - 8], [w, h], [0, h]], '#0a121bef');
    polygon([[w * .81, 58], [w * .84, 58], [w * .98, h * .67], [w * .975, h * .74]], '#b6d9ee0b');
    polygon([[w * .87, 58], [w * .874, 58], [w - 21, h * .43], [w - 23, h * .46]], '#d7eafa16');
    for (const side of [12, w - 10]) for (let y = 88; y < h * .7; y += 66) {
      g.fillColor = col('#77828b88'); g.circle(side - w / 2, h / 2 - y, 1.8); g.fill();
    }
  }
  update(s: Simulation, world: World) {
    this.effects = { impacts: [], projectiles: [] };
    const w = this.w, h = this.h, g = this.g, top = this.safe.top,
      left = 12 + this.safe.left, by = h - this.footer - this.safe.bottom;
    let key = s.phase === 'briefing' ? 'home' : s.phase === 'playing' ? '' : s.phase;
    if (s.pauses.has('help')) key = 'help:' + this.helpGroup + this.helpTouch + this.lang;
    else if (s.pauses.has('settings')) key = 'settings';
    else if (s.pauses.has('orientation')) key = 'orientation';
    else if (s.pauses.has('mission')) key = 'mission';
    else if (s.paused && s.phase !== 'briefing') key = 'pause';
    this.renderModal(key, s);
    g.clear();
    this.marks.clear();
    this.globalGraphics.clear();
    this.globalControls.setSiblingIndex(this.root.children.length - 1);
    for (const l of this.labels.values()) l.node.active = !key;
    for (const l of this.unitLabels.values()) l.node.active = false;
    for (const b of this.buttons) {
      if (b.label.node.parent === this.root)
        b.label.node.active = !key && (b.id !== 'fire' || this.touch) && (!panelActions.includes(b.id) || this.toolsOpen || this.desktop && flightActions.includes(b.id));
      if (b.id === 'fullscreen') {
        b.label.string = this.fullscreen ? this.t('退出全屏', 'EXIT FULL') : this.t('全屏', 'FULL SCREEN');
      }
      if (this.isGlobalAction(b.id)) {
        b.label.node.active = true;
        this.rect(this.globalGraphics, b.x, b.y, b.w, b.h, '#0c171df5', b.id === 'settings' && s.pauses.has('settings') ? C.mint : '#91e6cb88', 5);
      }
    }
    const toast = this.labels.get('globalToast')!;
    toast.node.active = !!key && !!this.toast && Date.now() < this.toastUntil;
    toast.string = this.toast;
    if (toast.node.active) this.rect(this.globalGraphics, this.safe.left + 16, h - this.safe.bottom - 42,
      w - this.safe.left - this.safe.right - 32, 36, C.ink);
    if (key) {
      if (s.phase === 'playing') this.effects = drawEffects(this.marks, s, world, this.w, this.h, this.reducedEffects);
      return;
    }
    this.drawCabin(g);
    this.labels.get('title')!.node.active = this.desktop;
    this.labels.get('mapLegend')!.node.active = !this.toolsOpen;
    this.labels.get('orbit')!.node.active = this.toolsOpen;
    this.labels.get('telemetry')!.node.active = this.labels.get('telemetry')!.node.getComponent(UITransform)!.contentSize.width >= 100;
    this.rect(g, 0, 0, w, 58 + top, '#0c171dbb');
    if (!this.desktop) this.rect(g, 0, by, w, this.footer + this.safe.bottom, '#0c171ddd');
    this.rect(g, left, 56 + top, (w - 24 - this.safe.left - this.safe.right) * s.ratio, 1, '#91e6cb88');
    if (this.desktop) {
      this.rect(g, 0, top + 110, 152 + this.safe.left, 304, '#0c171d88');
      for (const y of [110, 206, 274, 342, 414])
        this.rect(g, left, top + y, 128, 1, '#91e6cb44');
    }
    const gun = s.guns[s.selected], weapon = WEAPONS[s.selected], reason = s.reason(),
      danger = s.friendlyRisk || s.time - s.friendHitAt < 2;
    const plane = s.aircraft;
    const metres = (value: number) => Math.round(value * FLIGHT.metersPerUnit);
    const range = Math.hypot(plane.x - s.aim.x, plane.z - s.aim.z, plane.y - s.height(s.aim.x, s.aim.z));
    const flightTime = s.flightTime(), flightText = Number.isFinite(flightTime) ? flightTime.toFixed(1) + 's' : '—';
    this.set('title', this.t('夜航守望', 'OVERWATCH'));
    const allies = s.units.filter((u) => u.friendly).length;
    this.set('health', this.t(`□ 友军 ${allies - s.friendlyLosses} / ${allies}`, `□ ALLIES ${allies - s.friendlyLosses} / ${allies}`));
    this.labels.get('health')!.color = col(s.rescue.hp / s.rescue.maxHp < 0.3 ? C.red : C.mint);
    this.set('progress', s.mission.mode === 'training'
      ? this.t(`热身清靶 ${s.kills} / 3 · 友伤 ${Math.round(s.friendlyDamage)}`, `WARMUP ${s.kills}/3 · FRIENDLY ${Math.round(s.friendlyDamage)}`)
      : this.t(`撤离 ${Math.floor(s.ratio * 100)}% · 威胁 ${s.threatsRemaining}`, `ROUTE ${Math.floor(s.ratio * 100)}% · THREATS ${s.threatsRemaining}`));
    const clock = Math.ceil(s.remaining);
    this.set('status', `${world.thermal ? 'IR' : 'NIGHT'}\n${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, '0')}`);
    this.set('telemetry', this.desktop
      ? this.t(`高度 ${metres(plane.altitude)}m   │   斜距 ${metres(range)}m   │   弹着 ${flightText}`, `ALT ${metres(plane.altitude)}m  │  SLANT ${metres(range)}m  │  IMPACT ${flightText}`)
      : this.t(`斜距 ${metres(range)}m\n高度 ${metres(plane.altitude)}m`, `SLANT ${metres(range)}m\nALT ${metres(plane.altitude)}m`));
    const radiusKm = (plane.radius * FLIGHT.metersPerUnit / 1000).toFixed(1);
    this.set('orbit', `${Math.round(FLIGHT.speed * FLIGHT.metersPerUnit * 3.6)} km/h\n${this.t('半径', 'RADIUS')} ${radiusKm} km`);
    this.set('flightAltitude', this.t(`高度 ${metres(plane.altitude)}m`, `ALT ${metres(plane.altitude)}m`));
    this.set('flightRadius', this.t(`轨道 ${radiusKm} km`, `ORBIT ${radiusKm} km`));
    this.set('hold', s.convoy === 'holdRequested' ? this.t('前往下一待命点', 'TO NEXT HOLD POINT') : s.convoy === 'holding' ? this.t('待命中 · 时间继续', 'HOLDING · CLOCK RUNS') : '');
    this.set('weaponState', this.t(
      `${this.mouseDesktop ? '' : flightText + ' 弹着\n'}${gun.overheated ? '过热 · 冷却至40' : gun.cooldown > 0 && s.selected > 0 ? '装填 ' + gun.cooldown.toFixed(1) + 's' : '热量 ' + Math.round(gun.heat) + '%'}`,
      `${this.mouseDesktop ? '' : flightText + ' IMPACT\n'}${gun.overheated ? 'OVERHEATED' : gun.cooldown > 0 && s.selected > 0 ? 'RELOAD ' + gun.cooldown.toFixed(1) + 's' : 'HEAT ' + Math.round(gun.heat) + '%'}`));
    const reasons: Record<string, string[]> = {
      protected: ['保护区 · 禁止开火', 'PROTECTED · FIRE BLOCKED'],
      overheated: ['武器过热 · 等待降温或切枪', 'OVERHEATED · COOL OR SWITCH'],
      empty: ['弹药耗尽 · 切换武器', 'EMPTY · SWITCH WEAPON'],
      outside: ['准星超出任务区域', 'OUTSIDE MISSION AREA'],
    };
    let notice = reasons[reason] ? text(reasons[reason], this.lang)
      : s.rescue.hp / s.rescue.maxHp < 0.3 ? this.t('救援车危急 · 清除附近威胁', 'RESCUE CRITICAL · CLEAR THREATS')
      : s.time - s.waveAt < 4 ? text(s.mission.events[s.lastWave]?.direction || ['', ''], this.lang)
      : s.convoy === 'holding' ? this.t('清路后，点击「车队继续」', 'CLEAR THE ROAD, THEN GO')
      : s.warning === 'armor' ? this.t('重甲抗速射 · 切换重炮', 'ARMOR · SWITCH TO HEAVY')
      : s.warning === 'lead' ? this.t('预留弹着提前量', 'LEAD THE TARGET') : '';
    if (Date.now() < this.toastUntil) notice = this.toast;
    this.set('notice', notice);
    this.set('friendWarning', danger ? s.time - s.friendHitAt < 2
      ? this.t('！正在误伤友方 · 停止射击', '! FRIENDLY HIT · CEASE FIRE')
      : this.t('！范围内有友方 · 当心误伤', '! FRIENDLY IN BLAST RADIUS') : '');
    const step = TUTORIAL.find((e) => !s.completed.has(e));
    this.set('tutorial', s.mission.mode === 'training'
      ? this.t('60秒清3靶 · 静止用爆破 · 巡逻留提前量 · 重甲用重炮', 'CLEAR THREE IN 60s · BURST STATIC · LEAD ROVER · HEAVY ARMOR')
      : this.tutorial && step
      ? `${TUTORIAL.indexOf(step) + 1}/${TUTORIAL.length}  ${tutorialText(step, this.lang, this.touch)}`
      : this.mouseDesktop ? '' : this.t('护送并清除全部威胁 · □ 友军 / ◇ 敌军 · 小地图北向固定', 'ESCORT & CLEAR ALL THREATS · □ FRIEND / ◇ FOE · MAP NORTH UP'));
    if (this.compact) {
      const messages = ['friendWarning', 'notice', 'tutorial'];
      const active = messages.find((id) => this.labels.get(id)!.string);
      for (const id of messages) this.labels.get(id)!.node.active = id === active;
    }
    const panel = this.panelLayout;
    if (this.toolsOpen) {
      this.rect(g, panel.x, panel.y, panel.w, panel.h, C.ink, '#91e6cb55');
      for (const id of ['notice', 'friendWarning', 'hold', 'target', 'flight', 'tutorial'])
        this.labels.get(id)!.node.active = false;
    }
    for (const id of ['notice', 'friendWarning', 'tutorial']) {
      const label = this.labels.get(id)!;
      if (!label.node.active || !label.string) continue;
      const size = label.node.getComponent(UITransform)!.contentSize, p = label.node.position;
      this.rect(g, p.x + w / 2 - size.width / 2, h / 2 - p.y - size.height / 2, size.width, size.height, id === 'friendWarning' ? '#381c26dd' : '#0c171da0');
    }
    const toggle = this.buttons.find((b) => b.id === 'flightControls')!;
    const inlineToggle = this.toolsOpen && panel.columns === 8;
    toggle.w = inlineToggle ? (panel.w - 36) / 8 : this.desktop ? 128 : 96;
    toggle.x = inlineToggle ? panel.x + 4 + 7 * (toggle.w + 4) : left;
    toggle.y = inlineToggle ? panel.y + 52 : top + 64;
    toggle.label.node.setPosition(toggle.x + toggle.w / 2 - w / 2, h / 2 - toggle.y - 22);
    toggle.label.node.getComponent(UITransform)!.setContentSize(toggle.w - 8, 42);
    toggle.label.string = this.toolsOpen ? this.t('收起 ▴', 'CLOSE ▴')
      : this.desktop ? this.t('飞行控制 ▾', 'FLIGHT ▾') : this.t('飞行 ▾', 'FLIGHT ▾');
    this.buttons.find((b) => b.id === 'convoy')!.label.node.active = s.mission.mode !== 'training' && !(this.toolsOpen && !this.desktop && panel.y < top + 110);
    for (const b of this.buttons.filter((b) => b.label.node.parent === this.root && b.label.node.active)) {
      const selected = b.id === 'weapon' + s.selected || b.id === (plane.direction < 0 ? 'orbitLeft' : 'orbitRight');
      if (b.id.startsWith('weapon')) {
        const i = Number(b.id.slice(-1)), a = s.guns[i];
        b.label.string = `${this.touch ? '' : i + 1 + ' '}${text(WEAPONS[i].name, this.lang)}\n${this.t(['轻车', '炮台', '重甲'][i], ['LIGHT', 'TURRET', 'ARMOR'][i])} · ${a.ammo === Infinity ? '∞' : a.ammo}`;
      }
      if (b.id === 'convoy') b.label.string = (this.touch ? '' : 'T · ') + (s.convoy === 'moving' ? this.t('车队等待', 'HOLD CONVOY') : s.convoy === 'holdRequested' ? this.t('取消等待', 'CANCEL HOLD') : this.t('车队继续 →', 'CONVOY GO →'));
      if (b.id === 'fire') b.label.string = actionLabel('fire', this.lang, this.touch, weapon.automatic) + '\n' +
        (reason === 'protected' ? this.t('禁止开火', 'BLOCKED') : reason === 'overheated' ? this.t('过热', 'OVERHEATED') : reason === 'empty' ? this.t('无弹药', 'EMPTY')
        : weapon.automatic ? this.t('松开即停', 'RELEASE TO STOP') : this.t('每次一发', 'ONE SHOT / PRESS'));
      if (b.id === 'sensor') b.label.string = world.thermal ? this.t('热成像 → 日光', 'THERMAL → DAY') : this.t('日光 → 热成像', 'DAY → THERMAL');
      if (b.id === 'sound') b.label.string = this.muted ? this.t('声音：关', 'SOUND OFF') : this.t('声音：开', 'SOUND ON');
      const fire = b.id === 'fire', flight = this.desktop && flightActions.includes(b.id);
      if (flight) {
        const orbit = b.id === 'orbitLeft' || b.id === 'orbitRight';
        const x = b.x + (orbit ? 21 : b.w / 2) - w / 2, y = h / 2 - b.y - b.h / 2;
        g.fillColor = col(selected ? '#3b706455' : '#0c171d55');
        g.circle(x, y, 18); g.fill();
        g.strokeColor = col(selected ? C.mint : '#91e6cb88');
        g.lineWidth = 1;
        g.circle(x, y, 18); g.stroke();
      } else this.rect(g, b.x, b.y, b.w, b.h, fire ? danger ? '#482832' : C.mint : selected ? '#29463ee0' : '#0c171daa', fire && danger ? C.red : selected || fire ? C.mint : '#91e6cb55', 5);
      b.label.color = col(fire && !danger ? '#10252a' : selected ? C.mint : C.white);
      b.label.isBold = selected || fire;
      if (b.id === 'pause' && !this.mouseDesktop) {
        this.rect(g, b.x + b.w / 2 - 6, b.y + 6, 4, 14, C.white);
        this.rect(g, b.x + b.w / 2 + 2, b.y + 6, 4, 14, C.white);
      }
      if (b.id.startsWith('weapon')) {
        const a = s.guns[Number(b.id.slice(-1))];
        this.rect(g, b.x + 5, b.y + b.h - 5, (b.w - 10) * a.heat / 100, 2, a.overheated ? C.red : C.amber);
      }
    }
    if (!this.toolsOpen) {
      this.drawWorld(s, world);
      this.drawMinimap(s);
    }
  }
  drawMinimap(s: Simulation) {
    const g = this.marks, map = this.minimapLayout;
    this.rect(g, map.x, map.y, map.w, map.h, '#0c171de8', '#91e6cb55');
    this.set('mapLegend', this.t(`北 ↑ · 威胁 ${s.threatsRemaining}`, `N ↑ · THREATS ${s.threatsRemaining}`));
    const point = (p: Point) => ({
      x: map.x + 8 + (p.x + MAP.halfWidth) / (2 * MAP.halfWidth) * (map.w - 16) - this.w / 2,
      y: this.h / 2 - map.y - 25 - (p.z + MAP.halfDepth) / (2 * MAP.halfDepth) * (map.h - 33),
    });
    g.strokeColor = col(C.line);
    g.lineWidth = 1;
    mapRoute(s.mission.map).forEach((p, i) => {
      const q = point(p);
      if (i) g.lineTo(q.x, q.y);
      else g.moveTo(q.x, q.y);
    });
    g.stroke();
    for (const u of s.units) {
      if (u.hp <= 0) continue;
      const q = point(u);
      g.strokeColor = col(u.friendly ? C.mint : C.amber);
      g.fillColor = col(u.friendly ? C.mint : C.amber);
      if (u.friendly) {
        g.rect(q.x - 3, q.y - 3, 6, 6);
        g.stroke();
      } else {
        g.moveTo(q.x, q.y + 2.5);
        g.lineTo(q.x + 2.5, q.y);
        g.lineTo(q.x, q.y - 2.5);
        g.lineTo(q.x - 2.5, q.y);
        g.close();
        g.fill();
      }
    }
    const aim = point(s.aim);
    if (Math.abs(s.aim.x) <= MAP.halfWidth && Math.abs(s.aim.z) <= MAP.halfDepth) {
      g.strokeColor = col(C.white);
      g.circle(aim.x, aim.y, 4);
      g.stroke();
    }
  }
  drawWorld(s: Simulation, world: World) {
    const g = this.marks;
    this.effects = drawEffects(g, s, world, this.w, this.h, this.reducedEffects);
    const project = (p: Point, y = 0) => {
      const q = world.project(p, y);
      return {
        x: q.x / view.getScaleX() - this.w / 2,
        y: q.y / view.getScaleY() - this.h / 2,
        visible: [q.x, q.y, q.z].every(Number.isFinite) && q.z >= 0 && q.z <= 1,
      };
    };
    const onScreen = (p: ReturnType<typeof project>, pad = 0) => p.visible &&
      Math.abs(p.x) <= this.w / 2 - pad && Math.abs(p.y) <= this.h / 2 - pad;
    const groundRing = (p: Point, radius: number) => {
      const points = Array.from({ length: 24 }, (_, i) => project({
        x: p.x + Math.cos(i * Math.PI / 12) * radius,
        z: p.z + Math.sin(i * Math.PI / 12) * radius,
      }));
      if (!points.every((p) => onScreen(p, -64))) return;
      points.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
      g.close();
      g.stroke();
    };
    for (const [id, l] of Array.from(this.unitLabels.entries()))
      if (!s.units.some((u) => u.id === id)) {
        l.node.destroy();
        this.unitLabels.delete(id);
      }
    for (const p of PROTECTED) {
      g.strokeColor = col('#729e9180');
      g.lineWidth = 1;
      groundRing(p, p.radius);
    }
    for (const d of s.holdPoints) {
      const q = project(s.routePoint(d));
      if (!onScreen(q, 6)) continue;
      g.strokeColor = col(C.amber);
      g.lineWidth = 1;
      g.circle(q.x, q.y, 6);
      g.stroke();
    }
    const placed: { x: number; y: number }[] = [],
      bottom = -this.h / 2 + this.footer + this.safe.bottom + 44,
      top = this.h / 2 - 64 - this.safe.top;
    const banners = ['notice', 'friendWarning', 'tutorial', 'hold']
      .map((id) => this.labels.get(id)!)
      .filter((l) => l.node.active && l.string);
    const overBanner = (x: number, y: number, halfWidth: number) =>
      banners.some((l) => {
        const p = l.node.position,
          size = l.node.getComponent(UITransform)!.contentSize;
        return (
          Math.abs(x - p.x) < size.width / 2 + halfWidth && Math.abs(y - p.y) < size.height / 2 + 12
        );
      });
    const aim = project(s.aim);
    const focus = this.touch
      ? onScreen(aim) ? { x: aim.x + this.w / 2, y: this.h / 2 - aim.y } : undefined
      : this.mousePointer;
    const pointer = focus && !this.blocksBattlefield(focus.x, focus.y) ? focus : undefined;
    const contacts: { unit: Simulation['units'][number]; point: ReturnType<typeof project> }[] = [];
    let hovered: (typeof contacts)[number] | undefined, hoverDistance = Infinity;
    for (const u of s.units) {
      if (u.hp <= 0) continue;
      const q = project(u, 0.8);
      // Behind-camera projections mirror direction; those contacts remain on the north-up minimap.
      if (!q.visible) continue;
      // The minimap covers off-screen contacts without crowding the battlefield edges.
      if (q.x < -this.w / 2 + 16 + this.safe.left || q.x > this.w / 2 - 16 - this.safe.right || q.y > top || q.y < bottom - 30) continue;
      if (this.blocksBattlefield(q.x + this.w / 2, this.h / 2 - q.y)) continue;
      const contact = { unit: u, point: q };
      contacts.push(contact);
      if (!pointer) continue;
      // Keep the forgiving body-to-marker hover region even when distant markers shrink.
      const body = project(u);
      const dx = body.visible ? body.x - q.x : 0, dy = body.visible ? body.y - q.y : 0;
      const px = pointer.x - this.w / 2 - q.x, py = this.h / 2 - pointer.y - q.y;
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
      const distance = Math.hypot(px - t * dx, py - t * dy);
      if (distance <= (u.kind === 'heavy' ? 15 : 12) && distance < hoverDistance) {
        hovered = contact;
        hoverDistance = distance;
      }
    }
    const unitLabel = (id: number, width: number, height: number) => {
      let l = this.unitLabels.get(id);
      if (!l) {
        l = this.label(this.root, '', 0, 0, 12, width, height);
        l.node.setSiblingIndex(this.root.children.length - 2);
        this.unitLabels.set(id, l);
      }
      l.node.getComponent(UITransform)!.setContentSize(width, height);
      l.fontSize = this.compact ? 12 : 13;
      l.lineHeight = 18;
      l.isBold = true;
      return l;
    };
    const groups = new Map<number, typeof contacts>();
    for (const contact of contacts) {
      const u = contact.unit;
      if (!u.friendly || u.group === undefined) continue;
      const group = groups.get(u.group) || [];
      group.push(contact);
      groups.set(u.group, group);
    }
    const counts = new Map<number, number>(), hidden = new Set<number>();
    for (const [id, members] of groups) {
      if (members.length < 2 || hovered?.unit.friendly && hovered.unit.group === id) continue;
      // ponytail: pairwise checks suit the current three-unit groups; use spatial bins for large formations.
      if (!members.every((a) => members.every((b) => Math.hypot(a.point.x - b.point.x, a.point.y - b.point.y) < 12))) continue;
      const q = members[0].point;
      if (q.x + 36 > this.w / 2 - this.safe.right || overBanner(q.x + 22, q.y, 14) ||
        Math.hypot(Math.max(0, Math.abs(q.x + 22 - aim.x) - 14), Math.max(0, Math.abs(q.y - aim.y) - 9)) < 40 ||
        [8, 36].some((dx) => this.blocksBattlefield(q.x + dx + this.w / 2, this.h / 2 - q.y))) continue;
      counts.set(members[0].unit.id, members.length);
      for (const member of members.slice(1)) hidden.add(member.unit.id);
    }
    const ordered = hovered ? [...contacts.filter((c) => c !== hovered), hovered] : contacts;
    for (const contact of ordered) {
      const { unit: u, point: q } = contact;
      if (hidden.has(u.id)) continue;
      const r = contact === hovered ? 9 : u.kind === 'heavy' ? 7 : 5;
      // Dark outline keeps team colors and shapes legible against bright thermal contacts.
      for (const outline of [true, false]) {
        g.lineWidth = outline ? contact === hovered ? 4 : 3 : 2;
        g.strokeColor = col(outline ? '#061116' : u.friendly ? C.mint : C.amber);
        if (u.friendly) g.rect(q.x - r, q.y - r, r * 2, r * 2);
        else {
          g.moveTo(q.x, q.y + r);
          g.lineTo(q.x + r, q.y);
          g.lineTo(q.x, q.y - r);
          g.lineTo(q.x - r, q.y);
          g.close();
        }
        g.stroke();
      }
      const count = counts.get(u.id);
      if (count) {
        const l = unitLabel(u.id, 28, 18);
        l.string = `×${count}`;
        l.color = col(C.mint);
        l.node.setPosition(q.x + 22, q.y);
        l.node.active = true;
        placed.push({ x: q.x + 22, y: q.y });
        this.rect(g, q.x + this.w / 2 + 8, this.h / 2 - q.y - 9, 28, 18, '#0c191fe8');
      }
    }
    if (hovered) {
      const { unit: u, point: q } = hovered;
      const width = this.compact ? 120 : 176, half = width / 2;
      const l = unitLabel(u.id, width, 24);
      l.color = col(u.friendly ? C.mint : C.amber);
      l.string = u.friendly
        ? u.kind === 'escort' ? this.t('护卫', 'ESCORT') : this.t('救援车', 'RESCUE')
        : this.t(
            u.kind === 'heavy' ? '重甲' : u.kind === 'turret' ? '炮台' : '轻车',
            u.kind.toUpperCase(),
          );
      if (u.hp < u.maxHp) l.string += u.hp <= u.maxHp * 0.3
        ? this.t(' · 重创', ' · CRITICAL') : this.t(' · 受损', ' · DAMAGED');
      const tag = [[0, 56], [0, -56], [half + 44, 0], [-half - 44, 0]]
        .map(([dx, dy]) => ({ x: q.x + dx, y: q.y + dy })).find((p) =>
        p.y <= top - 12 && p.y >= bottom &&
        p.x >= -this.w / 2 + this.safe.left + half && p.x <= this.w / 2 - this.safe.right - half &&
        Math.hypot(Math.max(0, Math.abs(p.x - aim.x) - half), Math.max(0, Math.abs(p.y - aim.y) - 12)) >= 40 &&
        !overBanner(p.x, p.y, half) &&
        [-half, 0, half].every((dx) => [-12, 12].every((dy) =>
          !this.blocksBattlefield(p.x + dx + this.w / 2, this.h / 2 - p.y + dy))));
      l.node.active = !!tag;
      if (tag) {
        l.node.setPosition(tag.x, tag.y);
        placed.push(tag);
        this.rect(g, tag.x + this.w / 2 - half, this.h / 2 - tag.y - 12, width, 24, '#0c191fe8');
      }
    }
    const q = project(s.aim);
    if (!onScreen(q, 18)) {
      this.labels.get('target')!.node.active = false;
      this.labels.get('flight')!.node.active = false;
      return;
    }
    g.strokeColor = col(s.reason() === 'protected' || s.friendlyRisk ? C.red : C.mint);
    g.lineWidth = 1.5;
    groundRing(s.aim, WEAPONS[s.selected].radius);
    for (const outline of [true, false]) {
      g.strokeColor = col(outline ? '#061116' : s.reason() === 'protected' || s.friendlyRisk ? C.red : C.white);
      g.lineWidth = outline ? 6 : 3;
      for (const sign of [-1, 1]) {
        g.moveTo(q.x + sign * 11, q.y);
        g.lineTo(q.x + sign * 32, q.y);
        g.moveTo(q.x, q.y + sign * 11);
        g.lineTo(q.x, q.y + sign * 32);
      }
      g.stroke();
      g.circle(q.x, q.y, 3);
      g.stroke();
    }
    const target = s.aimedUnit;
    const recentImpacts = [...s.events]
      .reverse()
      .filter((e) => e.type === 'impact' && s.time - e.time < 1.1);
    // A following round landing on a wreck must not erase the destruction confirmation.
    const impact =
      recentImpacts.find((e) => e.outcome === 'friendly') ||
      recentImpacts.find((e) => e.outcome === 'destroyed') ||
      recentImpacts[0];
    const outcome = impact?.outcome;
    const feedback =
      outcome === 'destroyed'
        ? this.t('◆ 威胁已清除', '◆ THREAT ELIMINATED')
        : outcome === 'friendly'
          ? this.t('！误伤友军', '! FRIENDLY HIT')
          : outcome === 'armor'
            ? this.t('装甲低伤 · 换重炮', 'ARMOR · USE HEAVY')
            : outcome === 'hit'
              ? this.t('命中目标', 'TARGET HIT')
              : outcome === 'miss'
                ? this.t('未命中', 'MISS')
                : '';
    this.set(
      'target',
      target?.friendly ? this.t('友方目标 · 请勿射击', 'FRIENDLY · DO NOT FIRE') : feedback,
    );
    this.labels.get('target')!.color = col(
      outcome === 'friendly' || target?.friendly ? C.red : outcome === 'miss' ? C.dim : C.amber,
    );
    // Both transient labels use the same avoidance rule; never clamp text onto the reticle.
    const placeFeedback = (label: Label, p: Point) => {
      const cursor = project(s.aim);
      for (const [dx, dy] of [
        [100, 0],
        [-100, 0],
        [0, -48],
        [0, 48],
        [100, -44],
        [-100, 44],
      ]) {
        const x = p.x + dx,
          y = p.z + dy;
        if (x < -this.w / 2 + 84 || x > this.w / 2 - 84 || y < bottom + 12 || y > top - 24)
          continue;
        if (Math.abs(x - cursor.x) < 100 && Math.abs(y - cursor.y) < 34) continue;
        if (overBanner(x, y, 78)) continue;
        if (placed.some((q) => Math.abs(x - q.x) < 122 && Math.abs(y - q.y) < 26)) continue;
        if (
          s.units.some((u) => {
            const q = project(u, 0.8);
            return u.hp > 0 && q.visible && Math.abs(x - q.x) < 96 && Math.abs(y - q.y) < 30;
          })
        )
          continue;
        if (this.blocksBattlefield(x + this.w / 2, this.h / 2 - y)) continue;
        label.node.setPosition(x, y);
        placed.push({ x, y });
        return true;
      }
      return false;
    };
    if (impact || target?.friendly) {
      const p = project(target?.friendly ? s.aim : impact!);
      const label = this.labels.get('target')!;
      label.node.active = onScreen(p) && placeFeedback(label, { x: p.x, z: p.y });
    }
    if (impact && outcome !== 'miss' && s.time - impact.time < 0.22) {
      const p = project(impact);
      if (!onScreen(p, 12)) return;
      g.strokeColor = col(outcome === 'friendly' ? C.red : C.white);
      g.lineWidth = 2;
      for (const x of [-1, 1])
        for (const y of [-1, 1]) {
          g.moveTo(p.x + x * 5, p.y + y * 5);
          g.lineTo(p.x + x * 10, p.y + y * 10);
        }
      g.stroke();
    }
    const next = s.selected > 0 ? s.shots.find((a) => a.weapon > 0) : undefined,
      flight = this.labels.get('flight')!;
    flight.string = next
      ? this.t(
          `弹着 ${(next.due - s.time).toFixed(1)}s`,
          `IMPACT ${(next.due - s.time).toFixed(1)}s`,
        )
      : '';
    if (next) {
      const p = project(next);
      flight.node.active = onScreen(p) && placeFeedback(flight, { x: p.x, z: p.y });
    }
  }
}
