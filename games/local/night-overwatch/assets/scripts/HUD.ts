import { playerId, playerLabel, type Online } from './Online';
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
  Sprite,
  SpriteFrame,
  Texture2D,
  resources,
  isValid,
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
import { missionUnlocked, newMissionProgress, type MissionProgress } from './core/MissionProgress';
import { MISSIONS, TRAINING, type MissionLight } from './core/MissionCatalog';
import { mapRoute, routeLength, riverX, type BattlefieldId } from './core/Data';
import { trainingNextGoal, type TrainingRecord } from './core/TrainingRecords';
import { nextZoomLimit, type RewardKind, type SupplyReward } from './core/Rewards';
import { battleCounts, formatTime, type TimeComparison } from './core/BattleRecords';

const C = {
  ink: '#091b2df5',
  line: '#36566e',
  white: '#eef3ea',
  dim: '#a2b5b5',
  mint: '#5ed9f5',
  amber: '#ffbf55',
  red: '#ff525b',
};
const col = (hex: string) => new Color().fromHEX(hex);
export type ButtonRect = { id: string; x: number; y: number; w: number; h: number; label: Label };
export class HUD {
  root: Node;
  camera: Camera;
  g: Graphics;
  marks: Graphics;
  globalControls: Node;
  globalGraphics: Graphics;
  homeBackground: Node;
  homeArtwork: Sprite;
  w = 960;
  h = 540;
  lang: Language = 'zh';
  radioText = '';
  touch = sys.isMobile || (sys.isBrowser && window.matchMedia('(pointer: coarse)').matches);
  // UI coordinates from real mouse input; the controller clears this on leave/touch/blur.
  mousePointer?: { x: number; y: number };
  effects: EffectsFrame = { impacts: [], projectiles: [] };
  buttons: ButtonRect[] = [];
  labels = new Map<string, Label>();
  modal?: Node;
  modalKey = '';
  private onlineRevision = -1;
  missionsOpen = false;
  online?: Online;
  reportOpen = false;
  timeComparison?: TimeComparison;
  missionPage = 0;
  missionProgress: MissionProgress = newMissionProgress();
  developer = false;
  helpGroup: 'basic' | 'advanced' | 'rules' = 'basic';
  helpTouch = false;
  scroll = 0;
  scrollMax = 0;
  scrollNode?: Node;
  scrollArea = { x: 0, y: 0, w: 0, h: 0 };
  tutorial = true;
  muted = false;
  reducedEffects = false;
  toolsOpen = false;
  zoomOpen = false;
  zoomLimit = 10;
  rewardsAvailable = false;
  supplyOpen = false;
  exitConfirm = false;
  supplySelection: SupplyReward = 'tracking';
  supplyMessage = '';
  pendingSupply = false;
  advert?: { kind: RewardKind; mock: boolean };
  lockedTargets: { id: number; x: number; y: number }[] = [];
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
  get minimapLayout() {
    const w = this.compact ? 112 : 156;
    return { x: this.w - 12 - this.safe.right - w, y: this.safe.top + 64, w, h: this.compact ? 84 : 108 };
  }
  minimapPoint(x: number, y: number): Point | undefined {
    if (this.modal || ![x, y].every(Number.isFinite)) return;
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
    this.homeBackground = this.node('HomeCover', this.root);
    this.homeBackground.addComponent(Graphics);
    this.homeArtwork = this.node('HomeArtwork', this.homeBackground).addComponent(Sprite);
    this.homeArtwork.sizeMode = Sprite.SizeMode.CUSTOM;
    resources.load('ui/home/texture', Texture2D, (error, texture) => {
      if (!error && isValid(this.root)) {
        const frame = new SpriteFrame(); frame.texture = texture;
        this.homeArtwork.spriteFrame = frame;
      }
    });
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
    this.live('health', left + 80, top + 18, 13, 160, 25);
    this.live('progress', left + 80, top + 40, 11, 160, 20, C.dim);
    const small = this.mouseDesktop, settingsX = right - 44 - (this.touch ? 88 : 0);
    this.live('status', settingsX - 40, top + 26, 11, 70, 40, C.white);
    this.button('settings', '', settingsX, top + 6, 44, 44, this.globalControls);
    this.live('buff', (left + 164 + settingsX - 160) / 2, top + 26, 11,
      Math.max(40, settingsX - 160 - left - 164), 40, C.mint).node.parent = this.globalControls;
    const toastWidth = Math.min(420, settingsX - left - 12);
    this.live('globalToast', left + toastWidth / 2, top + 26, 12, toastWidth, 36, C.amber).node.parent = this.globalControls;
    const by = h - this.footer - this.safe.bottom;
    const cardW = small ? 76 : this.compact ? Math.min(68, (right - left - 118) / 5 - 8) : 90;
    const fireW = this.compact ? 64 : 76;
    const cardsLeft = this.desktop ? right - fireW - 18 - 5 * (cardW + 8) : left;
    for (let i = 0; i < WEAPONS.length; i++) {
      const label = this.button('weapon' + i, '', cardsLeft + i * (cardW + 8), by + (small ? 8 : 10), cardW, small ? 44 : this.footer - 20);
      if (small) { label.fontSize = 12; label.lineHeight = 17; }
    }
    this.button('homing', '', cardsLeft + 4 * (cardW + 8), by + (small ? 8 : 10), cardW, small ? 44 : this.footer - 20);
    this.button('battleReport', this.t('战况', 'REPORT'), settingsX - 148, top + 6, 56, 44);
    this.button('fire', '', right - fireW, h - this.safe.bottom - fireW - 10, fireW, fireW);
    const stateX = this.desktop ? cardsLeft - 144 : left + 5 * (cardW + 8) + 4;
    const stateW = this.desktop ? 132 : right - fireW - stateX - 12;
    this.live('weaponState', stateX + stateW / 2, by + this.footer / 2, small ? 12 : this.compact ? 12 : 14, Math.max(60, stateW), this.footer - 14, C.dim);
    this.live('notice', w / 2, by - 17, this.compact ? 12 : 15, this.compact ? w - 40 : Math.min(w - 260, 560), this.compact ? 28 : 36, C.amber);
    this.live('friendWarning', w / 2, by - 17, this.compact ? 13 : 16, this.compact ? w - 40 : Math.min(w - 260, 560), 28, C.red).isBold = true;
    this.live('tutorial', w / 2, by - 17, this.compact ? 11 : 13, w - 40, 28, C.mint);
    this.live('target', w / 2, by - 45, 12, 156, 24, C.amber);
    this.live('flight', w / 2, h / 2, 12, 130, 24, C.white);
    const priority = this.button('priority', '', 0, 0, 96, 68);
    priority.fontSize = 12;
    priority.color = col(C.red);
    priority.isBold = true;
    this.labels.set('priorityMarker', priority);
    const map = this.minimapLayout;
    this.live('mapLegend', map.x + map.w / 2, map.y + 11, 10, map.w - 4, 20, C.dim);
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
    return id === 'settings';
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
    const map = this.minimapLayout;
    return !!this.hit(x, y) || y < 58 + this.safe.top ||
      (!this.desktop && y > this.h - this.footer - this.safe.bottom) ||
      (x >= map.x && x <= map.x + map.w && y >= map.y && y <= map.y + map.h);
  }
  scrollBy(amount: number) {
    this.scroll = Math.max(0, Math.min(this.scrollMax, this.scroll + amount));
    if (this.scrollNode) this.scrollNode.setPosition(0, this.scroll, 0);
  }
  routeGraphic(g: Graphics, x: number, y: number, w: number, h: number, progress = 0, map: BattlefieldId = 'valley', light: MissionLight = 'day', enemies: readonly Point[] = []) {
    if (w <= 0 || h <= 0) return;
    const route = mapRoute(map), point = (p: Point) => ({
      x: x + (p.x / MAP.halfWidth + 1) * w / 2 - this.w / 2,
      y: this.h / 2 - y - (p.z / MAP.halfDepth + 1) * h / 2,
    });
    const colors = light === 'night' ? [[17, 39, 53], [70, 100, 117]]
      : light === 'dusk' ? [[67, 61, 48], [165, 125, 80]] : map === 'highland' ? [[78, 91, 70], [187, 181, 147]] : [[43, 76, 58], [156, 177, 117]];
    // Sample the same height field as the battlefield so ridges and roads stay in place.
    const cols = 32, rows = 20, dx = MAP.halfWidth * 2 / cols, dz = MAP.halfDepth * 2 / rows;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const wx = -MAP.halfWidth + i * dx, wz = -MAP.halfDepth + j * dz;
      const corners = [{ x: wx, z: wz }, { x: wx + dx, z: wz }, { x: wx + dx, z: wz + dz }, { x: wx, z: wz + dz }];
      for (const indices of [[0, 1, 2], [0, 2, 3]]) {
        const tri = indices.map(k => corners[k]), cx = tri.reduce((sum, p) => sum + p.x, 0) / 3, cz = tri.reduce((sum, p) => sum + p.z, 0) / 3;
        const elevation = terrainHeight(cx, cz, map);
        const shade = Math.max(0, Math.min(1, elevation / (map === 'highland' ? 22 : 10) * .75
          + (elevation - terrainHeight(cx - 4, cz - 4, map)) * .18 + .12));
        g.fillColor = col('#' + colors[0].map((v, k) => Math.round(v + (colors[1][k] - v) * shade).toString(16).padStart(2, '0')).join(''));
        tri.forEach((p, k) => { const q = point(p); if (k) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); });
        g.close(); g.fill();
      }
    }
    if (map === 'valley') {
      for (const [width, color] of [[Math.max(7, w * .032), light === 'night' ? '#254656' : '#7c9c87'], [Math.max(3, w * .017), light === 'night' ? '#396785' : '#4e9eac']] as const) {
        g.lineWidth = width; g.strokeColor = col(color);
        for (let j = 0; j <= 24; j++) {
          const z = -MAP.halfDepth + j / 24 * MAP.halfDepth * 2, q = point({ x: riverX(z), z });
          if (j) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y);
        }
        g.stroke();
      }
    }
    if (h >= 60) for (let j = 1; j < 7; j++) for (let i = 1; i < 11; i++) {
      const p = { x: (i / 11 * 2 - 1) * MAP.halfWidth + Math.sin(i * 7 + j) * 7, z: (j / 7 * 2 - 1) * MAP.halfDepth };
      if ((i + j * 3) % 4 === 0 || map === 'valley' && Math.abs(p.x - riverX(p.z)) < 10
        || route.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 12)) continue;
      const q = point(p), r = Math.max(2, Math.min(4, w / 90));
      g.fillColor = col(light === 'night' ? '#132d36' : light === 'dusk' ? '#474936' : '#254f3b');
      g.circle(q.x + 1, q.y - 1, r + 1); g.fill();
      g.fillColor = col(light === 'night' ? '#254351' : light === 'dusk' ? '#717148' : '#55794a');
      g.circle(q.x, q.y + 1, r); g.fill();
    }
    for (const [width, color] of [[6, '#17262b'], [3, '#c2b58c'], [1.5, C.amber]] as const) {
      g.lineWidth = width; g.strokeColor = col(color);
      route.forEach((p, i) => { const q = point(p); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); }); g.stroke();
    }
    for (const post of FRIENDLY_POSTS) {
      const q = point(post);
      for (let i = 0; i < 3; i++) {
        g.fillColor = col('#172c37'); g.rect(q.x - 7 + i * 5, q.y - 4, 5, 8); g.fill();
        g.fillColor = col(light === 'night' ? '#d0ad69' : '#adad91'); g.rect(q.x - 8 + i * 5, q.y - 2, 4, 6); g.fill();
      }
      g.strokeColor = col(C.mint); g.lineWidth = 1; g.rect(q.x - 10, q.y - 6, 19, 13); g.stroke();
    }
    for (const enemy of enemies) {
      const q = point(enemy), r = h < 70 ? 2.5 : 4;
      g.fillColor = col('#14242b'); g.strokeColor = col(C.red); g.lineWidth = 1.5;
      g.moveTo(q.x, q.y + r); g.lineTo(q.x + r, q.y); g.lineTo(q.x, q.y - r); g.lineTo(q.x - r, q.y); g.close(); g.fill(); g.stroke();
    }
    for (const p of [route[0], route.at(-1)!]) {
      const q = point(p); g.fillColor = col('#102b42'); g.circle(q.x, q.y, 5); g.fill();
      g.strokeColor = col(C.mint); g.lineWidth = 2; g.circle(q.x, q.y, 5); g.stroke();
    }
    const q = point(routePoint(progress, map));
    g.fillColor = col(C.amber); g.rect(q.x - 3, q.y - 2, 6, 4); g.fill();
  }
  supplyIcon(g: Graphics, kind: string, x: number, y: number) {
    x -= this.w / 2; y = this.h / 2 - y;
    g.strokeColor = col(kind === 'rate' ? C.amber : C.mint); g.lineWidth = 2;
    if (kind === 'tracking') {
      g.circle(x, y, 9); g.stroke();
      for (const sign of [-1, 1]) {
        g.moveTo(x + sign * 5, y); g.lineTo(x + sign * 14, y);
        g.moveTo(x, y + sign * 5); g.lineTo(x, y + sign * 14);
      }
    } else if (kind === 'ammo') {
      g.moveTo(x - 12, y - 7); g.lineTo(x + 13, y + 9); g.lineTo(x + 4, y - 5);
      g.lineTo(x - 10, y - 10); g.close();
      g.moveTo(x - 4, y - 4); g.lineTo(x - 10, y + 4);
    } else {
      for (const dy of [-5, 5]) {
        g.moveTo(x - 13, y + dy - 3); g.lineTo(x + 7, y + dy - 3);
        g.lineTo(x + 13, y + dy); g.lineTo(x + 7, y + dy + 3);
        g.lineTo(x - 13, y + dy + 3); g.close();
      }
    }
    g.stroke();
  }
  renderHome(n: Node, g: Graphics, s: Simulation) {
    const w = this.w, h = this.h, left = this.safe.left + 24, right = w - this.safe.right - 24;
    const light = (number: number) => ({ day: this.t('白天', 'DAY'), dusk: this.t('黄昏', 'DUSK'), night: this.t('夜间', 'NIGHT') })[MISSIONS[number - 1]?.light || 'day'];
    const number = Math.max(0, MISSIONS.findIndex(mission => mission.id === s.mission.id)) + 1;
    this.rect(g, 0, 0, w, h, '#07121c28');
    if (!this.missionsOpen) {
      const titleWidth = Math.min(520, right - left), compact = h < 420,
        menuY = h - this.safe.bottom - (compact ? 108 : 146),
        titleY = Math.min(this.safe.top + (h - this.safe.top - this.safe.bottom) * .38, menuY - 72),
        menuW = Math.min(248, (right - left - 12) / 2);
      const title = (str: string, yy: number, size: number, height: number, color: string) => {
        const label = this.label(n, str, left + titleWidth / 2, yy, size, titleWidth, height, color);
        label.horizontalAlign = Label.HorizontalAlign.LEFT; return label;
      };
      title('N I G H T   O V E R W A T C H', titleY - (compact ? 37 : 52), compact ? 10 : 13, 24, C.mint);
      title(this.t('夜航守望', 'OVERWATCH'), titleY + (compact ? 7 : 0), compact ? 44 : 64, compact ? 64 : 76, C.white).isBold = true;
      title(this.t('长夜之上，守住归途。', 'ABOVE THE NIGHT. BRING THEM HOME.'), titleY + 53, 12, 28, C.dim);
      this.rect(g, left, menuY, menuW, 48, C.amber, undefined, 7);
      const primary = this.button('missions', this.t('选择任务  →', 'SELECT MISSION  →'), left, menuY, menuW, 48, n);
      primary.color = col('#10252a'); primary.isBold = true;
      this.rect(g, left, menuY + 56, menuW, 44, '#091b2dbb', C.line, 7);
      this.button('help', this.t('飞行手册  ›', 'FIELD GUIDE  ›'), left, menuY + 56, menuW, 44, n);
      const x = left + menuW + 12;
      for (const [i, id] of ['online:menu', 'online:ranking'].entries()) {
        this.rect(g, x, menuY + i * 56, menuW, i ? 44 : 48, '#091b2ddd', C.mint, 7);
        this.button(id, i ? this.t('关卡排行榜  ›', 'LEADERBOARDS  ›') : this.t('双人对战  ›', 'VERSUS  ›'), x, menuY + i * 56, menuW, i ? 44 : 48, n);
      }
      if (this.online) this.label(n, playerLabel(this.online.identity) + this.t(' · 你', ' · YOU'), left + (2 * menuW + 12) / 2,
        menuY - 18, 11, 2 * menuW + 12, 26, C.mint);
      return;
    }
    this.rect(g, 0, 0, w, h, '#071a2d55');
    this.label(n, this.t('任务地图', 'MISSION MAP'), left + 78, this.safe.top + 80, 22, 156, 42).isBold = true;
    const page = Math.max(0, Math.min(Math.ceil(MISSIONS.length / 3) - 1, this.missionPage));
    const pagerWidth = this.compact ? 54 : 78, pagerY = this.safe.top + 58;
    const nextX = right - pagerWidth, previousX = nextX - pagerWidth - 100;
    for (const [id, x, active, caption] of [
      ['missionsPrevious', previousX, page > 0, this.t('上一页', 'PREV')],
      ['missionsNext', nextX, page < Math.ceil(MISSIONS.length / 3) - 1, this.t('下一页', 'NEXT')],
    ] as const) {
      this.rect(g, x, pagerY, pagerWidth, 44, '#102b42', active ? C.line : '#21374a', 3);
      const label = this.button(id, caption, x, pagerY, pagerWidth, 44, n);
      label.color = col(active ? C.white : C.dim); label.fontSize = 12;
    }
    this.label(n, `${page * 3 + 1}–${Math.min(MISSIONS.length, page * 3 + 3)} / ${MISSIONS.length}`,
      previousX + pagerWidth + 50, pagerY + 22, 12, 100, 32, C.dim);
    const y = this.safe.top + 110, bottom = h - this.safe.bottom - 58;
    const gap = 10, cw = (right - left - gap * 2) / 3, ch = Math.min(380, bottom - y - 8);
    for (const [i, mission] of MISSIONS.slice(page * 3, page * 3 + 3).entries()) {
      const x = left + i * (cw + gap), selected = mission.id === s.mission.id, number = page * 3 + i + 1;
      const unlocked = this.developer || missionUnlocked(this.missionProgress, mission.id), smallCard = ch < 180;
      this.rect(g, x, y, cw, ch, selected ? '#17364d' : '#0b2034', selected ? C.amber : C.line, 3);
      this.rect(g, x, y, 3, ch, selected ? C.amber : unlocked ? C.mint : C.line);
      this.label(n, String(number).padStart(3, '0'), x + 30, y + 14, 16, 44, 24, C.amber).isBold = true;
      if (!smallCard) this.label(n, selected ? this.t('当前', 'SELECTED') : unlocked ? '' : this.t('锁定', 'LOCKED'),
        x + cw - 46, y + 14, 10, 76, 22, selected ? C.amber : C.dim);
      const label = this.button('mission:' + mission.id, text(mission.name, this.lang), x, y, cw, ch, n);
      label.node.setPosition(x + cw / 2 + (smallCard ? 26 : 0) - w / 2, h / 2 - y - (smallCard ? 14 : 39));
      label.node.getComponent(UITransform)!.setContentSize(cw - (smallCard ? 60 : 16), 26);
      label.fontSize = smallCard ? 12 : cw < 180 ? 12 : 20; label.color = col(unlocked ? C.white : C.dim); label.isBold = true;
      const tier = number <= 3 ? this.t('入门', 'INTRO') : number <= 60 ? this.t('进阶', 'ADVANCED') : this.t('挑战', 'EXPERT');
      if (!smallCard) this.label(n, `${light(number)} · ${tier}`, x + cw / 2, y + 61, cw < 180 ? 11 : 12, cw - 16, 18, C.dim);
      this.routeGraphic(g, x + 8, y + (smallCard ? 32 : 76), cw - 16, ch - (smallCard ? 80 : 124), 0, mission.map, mission.light, mission.events);
      this.label(n, smallCard ? `${light(number)} · ${tier} · ` + this.t(`敌方 ${mission.events.length}`, `${mission.events.length} HOSTILES`)
        : this.t(`敌方 ${mission.events.length} · ${mission.map === 'valley' ? '山谷' : '高地'}`,
          `${mission.events.length} HOSTILES · ${mission.map === 'valley' ? 'VALLEY' : 'HIGHLAND'}`),
        x + cw / 2, y + ch - 37, smallCard ? 9 : cw < 180 ? 10 : 13, cw - 16, 22, smallCard ? C.white : C.red);
      const status = this.missionProgress.cleared.includes(mission.id) ? this.t('已完成', 'CLEARED')
        : unlocked ? this.developer ? this.t('试玩 · 不计进度', 'PRACTICE') : this.t('可出动', 'AVAILABLE')
          : this.t('完成上一关解锁', 'COMPLETE PREVIOUS');
      this.label(n, (smallCard ? selected ? this.t('当前 · ', 'SELECTED · ') : !unlocked ? this.t('锁定 · ', 'LOCKED · ') : '' : '') + status, x + cw / 2, y + ch - 14, smallCard ? 10 : 11, cw - 12, 22, unlocked ? C.mint : C.dim);
    }
    const bw = (right - left - 24) / 3;
    for (const [i, id] of ['homeMenu', 'training', 'start'].entries()) {
      const x = left + i * (bw + 12), primary = id === 'start', selected = id === 'training' && s.mission.mode === 'training';
      this.rect(g, x, bottom, bw, 44, primary ? C.amber : '#102b42', selected ? C.mint : C.line, 3);
      const label = this.button(id, [this.t('返回', 'BACK'), this.t('60秒热身', '60s WARMUP'), s.mission.mode === 'training'
        ? this.t('开始热身 →', 'START WARMUP →') : this.t(`出发 ${String(number).padStart(3, '0')} →`, `DEPLOY ${String(number).padStart(3, '0')} →`)][i], x, bottom, bw, 44, n);
      label.color = col(primary ? '#10252a' : selected ? C.mint : C.white); label.isBold = primary;
    }
  }
  panelFrame(g: Graphics, x: number, y: number, w: number, h: number, accent = C.mint, dim = '#050f1d55') {
    this.rect(g, 0, 0, this.w, this.h, dim);
    this.rect(g, x + 3, y + 5, w, h, '#020b1555', undefined, 12);
    this.rect(g, x, y, w, h, C.ink, C.line, 10);
    this.rect(g, x + 16, y + 39, w - 32, 1, '#36566e88');
    this.rect(g, x + 16, y + 39, 32, 2, accent);
  }
  renderSettings(n: Node, g: Graphics, s: Simulation, world: World, key: string) {
    const flight = this.toolsOpen, zoom = this.zoomOpen, playing = s.phase === 'playing';
    const short = this.h - this.safe.top - this.safe.bottom < 360;
    const pw = Math.min(flight || zoom ? Math.max(344, Math.min(420, this.w * .5)) : short ? 600 : 440,
      this.w - this.safe.left - this.safe.right - 32);
    const ph = Math.min(zoom ? this.rewardsAvailable && nextZoomLimit(this.zoomLimit) ? 248 : 222 : short ? 236 : 304, this.h - this.safe.top - this.safe.bottom - 60);
    const px = this.w - this.safe.right - 16 - pw,
      py = this.safe.top + 58 + (this.h - this.safe.top - this.safe.bottom - 58 - ph) / 2;
    this.panelFrame(g, px, py, pw, ph, C.mint, flight || zoom ? '#050f1d18' : '#050f1d45');
    const title = flight ? this.t('飞行 / 视野', 'FLIGHT / VIEW') : zoom ? this.t('画面 / 倍率', 'DISPLAY / ZOOM')
      : this.t(playing ? '战斗设置' : '设置', playing ? 'BATTLE SETTINGS' : 'SETTINGS');
    const heading = this.label(n, title, px + 16 + (pw - 112) / 2, py + 20, 19, pw - 112, 30);
    heading.horizontalAlign = Label.HorizontalAlign.LEFT; heading.isBold = true;
    const control = (id: string, caption: string, x: number, y: number, w: number, active = false, disabled = false) => {
      this.rect(g, x, y, w, 44, active ? '#164555' : '#10283b', active ? C.mint : '#29465a', 6);
      const label = this.button(id, caption, x, y, w, 44, n);
      label.fontSize = w < 100 ? 11 : 13; label.lineHeight = 17;
      label.color = col(disabled ? C.dim : active ? C.mint : C.white); label.isBold = active;
      return label;
    };
    if (flight) control('locate', this.t('定位', 'LOCATE'), px + pw - 80, py - 5, 64);
    else this.label(n, s.duelMode ? this.t('对战继续', 'BATTLE LIVE') : this.t('已暂停', 'PAUSED'), px + pw - 48, py + 20, 10, 64, 24, C.mint);
    if ((flight || zoom) && px - this.safe.left > 160) {
      const x = this.safe.left + 16, w = Math.min(190, px - x - 16);
      this.rect(g, x, py, w, 28, '#091b2dbb', undefined, 6);
      this.label(n, s.duelMode ? this.t('对战继续 · 操作已松开', 'BATTLE LIVE · FIRE RELEASED') : this.t('实时画面 · 战斗暂停', 'LIVE VIEW · BATTLE PAUSED'), x + w / 2, py + 14, 10, w - 8, 20, C.mint);
    }
    if (flight) {
      const a = s.aircraft, cell = (pw - 40) / 2, row = short ? 64 : 86, top = py + (short ? 44 : 54);
      const groups = [
        [this.t('飞行高度 / m', 'ALTITUDE / m'), 'altitudeDown', 'altitudeUp', String(Math.round(a.altitude * FLIGHT.metersPerUnit)), a.altitude <= FLIGHT.minAltitude, a.altitude >= FLIGHT.maxAltitude],
        [this.t('盘旋半径 / m', 'ORBIT RADIUS / m'), 'radiusIn', 'radiusOut', String(Math.round(a.radius * FLIGHT.metersPerUnit)), a.radius <= FLIGHT.minRadius, a.radius >= FLIGHT.maxRadius],
        [this.t('观察角度', 'VIEW ANGLE'), 'rotateLeft', 'rotateRight', `${Math.round(world.cameraSnapshot?.sensorRotation || 0)}°`, false, false],
      ] as const;
      groups.forEach(([caption, down, up, value, min, max], i) => {
        const x = px + 16 + i % 2 * (cell + 8), y = top + Math.floor(i / 2) * row;
        this.label(n, caption, x + cell / 2, y + 8, 10, cell, 16, C.dim);
        control(down, '−', x, y + 18, 44, false, min);
        control(up, '+', x + cell - 44, y + 18, 44, false, max);
        this.label(n, value, x + cell / 2, y + 40, 16, cell - 92, 30, C.white).isBold = true;
      });
      const x = px + 24 + cell, y = top + row, half = (cell - 6) / 2;
      this.label(n, this.t('盘旋方向', 'ORBIT DIRECTION'), x + cell / 2, y + 8, 10, cell, 16, C.dim);
      control('orbitLeft', this.t('逆时针', 'CCW'), x, y + 18, half, a.direction === -1);
      control('orbitRight', this.t('顺时针', 'CW'), x + half + 6, y + 18, half, a.direction === 1);
      if (!short) this.label(n, s.duelMode ? this.t('服务器持续计时，关闭菜单后继续操作', 'SERVER CLOCK CONTINUES WHILE IN MENU') : this.t('调整立即生效，战斗计时保持暂停', 'CHANGES APPLY NOW · BATTLE STAYS PAUSED'), px + pw / 2, py + ph - 73, 10, pw - 32, 20, C.mint);
    } else if (zoom) {
      const y = py + 44, step = short ? 46 : 48, inner = pw - 32, half = (inner - 8) / 2;
      control('lensOut', '−', px + 16, y, 44, false, world.zoom <= .65);
      control('lensIn', '+', px + pw - 60, y, 44, false, world.zoom >= this.zoomLimit);
      this.label(n, `${world.zoom.toFixed(1)}×`, px + pw / 2, y + 22, 26, inner - 104, 40, C.white).isBold = true;
      control('sensor', world.thermal ? this.t('成像 · 热像', 'SENSOR · THERMAL') : this.t('成像 · 光学', 'SENSOR · OPTICAL'), px + 16, y + step, half, world.thermal);
      control('effects', this.reducedEffects ? this.t('特效 · 精简', 'FX · REDUCED') : this.t('特效 · 完整', 'FX · FULL'), px + 24 + half, y + step, half, !this.reducedEffects);
      const limit = nextZoomLimit(this.zoomLimit);
      if (this.rewardsAvailable && limit) control('zoomUpgrade', s.buff ? this.t('支援生效中', 'SUPPORT ACTIVE') : this.pendingSupply ? this.t('请先领取补给', 'CLAIM SUPPLY FIRST')
        : this.t(`解锁 ${limit}× 上限 · 广告`, `UNLOCK ${limit}× · AD`), px + 16, y + step * 2, inner, false, !!s.buff || this.pendingSupply);
      else this.label(n, this.t(`已解锁上限 ${this.zoomLimit}×`, `ZOOM LIMIT ${this.zoomLimit}×`), px + pw / 2, y + 110, 11, inner, 20, C.dim);
    } else {
      const x = px + 16, inner = pw - 32, top = py + 44, step = short ? 46 : 48;
      if (playing) {
        const half = (inner - 8) / 2;
        control('flightControls', this.t('飞行 / 视野  ›', 'FLIGHT / VIEW  ›'), x, top, half, true);
        control('zoomControls', this.t('画面 / 倍率  ›', 'DISPLAY / ZOOM  ›'), x + half + 8, top, half, true);
      }
      const items = [
        ['sound', this.muted ? this.t('声音 关', 'SOUND OFF') : this.t('声音 开', 'SOUND ON')],
        ['language', this.lang === 'zh' ? '语言 · 中文' : 'LANGUAGE · EN'],
        ['help', this.t('飞行手册', 'FIELD GUIDE')],
        ...(playing ? [
          ['convoy', s.convoy === 'moving' ? this.t('车队等待', 'HOLD CONVOY') : s.convoy === 'holdRequested' ? this.t('取消等待', 'CANCEL HOLD') : this.t('车队继续', 'CONVOY GO')],
          ['mission', this.t('任务详情', 'MISSION BRIEF')],
          ['supply', this.supplyLabel(s)],
        ] : [['effects', this.reducedEffects ? this.t('特效 · 精简', 'FX · REDUCED') : this.t('特效 · 完整', 'FX · FULL')]]),
      ].filter(([id]) => !(s.duelMode && ['convoy', 'mission', 'supply'].includes(id)) && !(id === 'convoy' && s.mission.mode === 'training') && !(id === 'supply' && !this.rewardsAvailable && !this.pendingSupply));
      const cols = short ? 3 : 2, cw = (inner - (cols - 1) * 8) / cols;
      items.forEach(([id, caption], i) => {
        const bx = x + i % cols * (cw + 8), by = top + (playing ? step : 0) + Math.floor(i / cols) * step;
        const label = control(id, caption, bx, by, cw, false, id === 'supply' && !!s.buff);
        if (id === 'sound') {
          label.node.setPosition(bx + cw / 2 + 8 - this.w / 2, this.h / 2 - by - 22);
          label.node.getComponent(UITransform)!.setContentSize(cw - 28, 42);
          const sx = bx + 13 - this.w / 2, sy = this.h / 2 - by - 22;
          g.strokeColor = col(this.muted ? C.dim : C.mint); g.lineWidth = 1.5;
          g.moveTo(sx - 5, sy - 3); g.lineTo(sx - 2, sy - 3); g.lineTo(sx + 2, sy - 7);
          g.lineTo(sx + 2, sy + 7); g.lineTo(sx - 2, sy + 3); g.lineTo(sx - 5, sy + 3); g.close(); g.stroke();
          g.moveTo(sx + 5, sy - 4); g.lineTo(sx + 9, sy + (this.muted ? 4 : 0));
          if (this.muted) { g.moveTo(sx + 5, sy + 4); g.lineTo(sx + 9, sy - 4); }
          else g.lineTo(sx + 5, sy + 4);
          g.stroke();
        }
      });
    }
    const by = py + ph - 52, bw = (pw - 40) / 2;
    if (!short) this.rect(g, px + 16, by - 7, pw - 32, 1, '#36566e88');
    if (playing) control(flight || zoom ? 'close' : 'home', flight || zoom ? this.t('返回设置', 'BACK') : this.t('返回基地', 'BASE'), px + 16, by, bw);
    const bx = playing ? px + 24 + bw : px + 16, width = playing ? bw : pw - 32;
    this.rect(g, bx, by, width, 44, C.amber, undefined, 6);
    const primary = playing && (flight || zoom || key === 'pause') ? 'resume' : 'close';
    const label = this.button(primary, playing ? this.t('继续战斗', 'RESUME BATTLE') : this.t('返回', 'BACK'), bx, by, width, 44, n);
    label.color = col('#10252a'); label.isBold = true;
  }
  renderGuide(n: Node, g: Graphics) {
    const pw = Math.min(760, this.w - this.safe.left - this.safe.right - 32),
      ph = Math.min(450, this.h - this.safe.top - this.safe.bottom - 74),
      px = this.safe.left + (this.w - this.safe.left - this.safe.right - pw) / 2,
      py = this.safe.top + 58 + (this.h - this.safe.top - this.safe.bottom - 58 - ph) / 2;
    this.panelFrame(g, px, py, pw, ph);
    const title = this.label(n, this.t('飞行手册', 'FIELD GUIDE'), px + 100, py + 20, 20, 168, 30);
    title.horizontalAlign = Label.HorizontalAlign.LEFT; title.isBold = true;
    if (pw >= 420) this.label(n, 'NIGHT 07 / ' + this.t('操作指引', 'FLIGHT NOTES'), px + pw - 110, py + 20, 10, 188, 22, C.dim);
    const tabW = (pw - 122) / 3, tabY = py + 44;
    for (const [i, [id, caption]] of [[ 'basic', this.t('基础操作', 'BASICS') ], [ 'advanced', this.t('飞行视野', 'FLIGHT') ], [ 'rules', this.t('任务规则', 'MISSION') ]].entries()) {
      const x = px + 16 + i * (tabW + 4), active = this.helpGroup === id;
      this.rect(g, x, tabY, tabW, 44, active ? '#164555' : '#10283b', undefined, 6);
      const label = this.button('tab:' + id, caption, x, tabY, tabW, 44, n);
      label.color = col(active ? C.mint : C.dim); label.isBold = active;
      if (active) this.rect(g, x + 12, tabY + 41, tabW - 24, 2, C.mint);
    }
    this.rect(g, px + pw - 94, tabY, 78, 44, '#10283b', C.line, 6);
    this.button('input', this.helpTouch ? this.t('触控', 'TOUCH') : this.t('键鼠', 'KEYS'), px + pw - 94, tabY, 78, 44, n);
    const vh = ph - 154, vw = pw - 44, mask = this.node('HelpViewport', n);
    mask.setPosition(px + pw / 2 - this.w / 2, this.h / 2 - (py + 94 + vh / 2));
    mask.getComponent(UITransform)!.setContentSize(vw, vh);
    mask.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    this.scrollArea = { x: px + 22, y: py + 94, w: vw, h: vh };
    const content = this.node('Instructions', mask); this.scrollNode = content;
    const lines = content.addComponent(Graphics), rows = ACTIONS.filter(a => a.group === this.helpGroup &&
      !(this.helpTouch && ['previous', 'next', 'focus'].includes(a.id)));
    let offset = 0;
    rows.forEach((a, i) => {
      const description = text(a.description, this.lang), font = pw < 600 ? 12 : 14,
        width = vw - 46, units = [...description].reduce((sum, c) => sum + (c.charCodeAt(0) > 255 ? 1 : .6), 0),
        bodyH = Math.max(2, Math.ceil(units * font / width) + 1) * (font * 1.45), rowH = bodyH + 38;
      const entry = (str: string, x: number, yy: number, size: number, w: number, h: number, color: string) => {
        const label = this.label(content, str, this.w / 2, 0, size, w, h, color);
        label.node.setPosition(x, vh / 2 - offset - yy); label.horizontalAlign = Label.HorizontalAlign.LEFT; return label;
      };
      entry(String(i + 1).padStart(2, '0'), -vw / 2 + 16, 17, 10, 28, 22, C.mint);
      entry(text(a.name, this.lang), -vw / 2 + 42 + width * .22, 17, 14, width * .44, 26, C.white).isBold = true;
      const binding = entry(this.helpTouch ? text(a.touch, this.lang) : bindingLabel(a.id, this.lang),
        -vw / 2 + 42 + width * .73, 17, 10, width * .5, 26, C.mint);
      binding.horizontalAlign = Label.HorizontalAlign.RIGHT;
      entry(description, -vw / 2 + 42 + width / 2, 32 + bodyH / 2, font, width, bodyH, C.dim);
      lines.fillColor = col('#36566e66'); lines.rect(-vw / 2 + 42, vh / 2 - offset - rowH + 1, width, 1); lines.fill();
      offset += rowH;
    });
    this.scrollMax = Math.max(0, offset - vh);
    this.lastHelpLine = text(rows.at(-1)!.description, this.lang);
    const bottom = py + ph - 52;
    for (const [id, caption, x, width, primary] of [
      ['tutorial', this.t('重玩教学', 'COACH'), px + 16, pw < 400 ? 80 : 100, false],
      ['language', this.lang === 'zh' ? 'EN' : '中文', px + (pw < 400 ? 100 : 124), 44, false],
      ['close', this.t('返回', 'BACK'), px + pw - (pw < 400 ? 96 : 116), pw < 400 ? 80 : 100, true],
    ] as const) {
      this.rect(g, x, bottom, width, 44, primary ? C.amber : '#10283b', primary ? undefined : C.line, 6);
      const label = this.button(id, caption, x, bottom, width, 44, n);
      label.color = col(primary ? '#10252a' : C.white); label.isBold = primary;
    }
    if (pw >= 420) this.label(n, this.t('上下滑动查看更多', 'SCROLL FOR MORE'), px + 176 + (pw - 300) / 2, bottom + 22, 10, pw - 308, 26, C.dim);
  }
  renderOnline(n: Node, g: Graphics, s: Simulation, result: boolean) {
    const online = this.online!;
    const pw = Math.min(720, this.w - this.safe.left - this.safe.right - 32),
      ph = Math.min(380, this.h - this.safe.top - this.safe.bottom - 28), px = (this.w - pw) / 2, py = (this.h - ph) / 2;
    this.panelFrame(g, px, py, pw, ph);
    const label = (str: string, y: number, size = 14, color = C.white) => this.label(n, str, px + pw / 2, py + y, size, pw - 36, 28, color);
    const button = (id: string, caption: string, x: number, y: number, width: number, primary = false) => {
      this.rect(g, px + x, py + y, width, 44, primary ? C.amber : '#10283b', primary ? undefined : C.line, 6);
      const text = this.button('online:' + id, caption, px + x, py + y, width, 44, n);
      text.fontSize = pw < 600 ? 12 : 14; text.color = col(primary ? '#10252a' : C.white); text.isBold = primary;
    };
    const bottom = ph - 54, half = (pw - 44) / 2;
    label(result ? this.t(online.view?.winner === null ? '对战平局' : s.phase === 'success' ? '对战胜利' : '对战结束',
      online.view?.winner === null ? 'DRAW' : s.phase === 'success' ? 'VICTORY' : 'DEFEAT')
      : online.panel === 'ranking' ? this.t('关卡排行榜', 'LEVEL LEADERBOARD')
        : online.panel === 'room' ? this.t('作战准备室', 'READY ROOM') : this.t('双人对战', 'VERSUS'), 24, 21).isBold = true;
    label(playerLabel(online.identity) + this.t(' · 你', ' · YOU'), 51, 12, C.mint);
    if (result) {
      label(playerLabel(online.opponent) + (online.view?.bot ? this.t(' · 机器人', ' · BOT') : ''), 88, 15, C.amber);
      label(this.t(`本局用时 ${formatTime(s.time * 1000)}`, `TIME ${formatTime(s.time * 1000)}`), 126, 20);
      label(this.t(`我方存活 ${s.units.filter(u => u.friendly && u.hp > 0).length} / 8    敌方存活 ${s.units.filter(u => !u.friendly && u.hp > 0).length} / 8`,
        `ALLIES ${s.units.filter(u => u.friendly && u.hp > 0).length}/8    FOES ${s.units.filter(u => !u.friendly && u.hp > 0).length}/8`), 165);
      label(online.message || this.t(online.view?.winner === null ? '双方仍有单位存活，或同时全灭' : '消灭对方全部地面单位的一方获胜',
        online.view?.winner === null ? 'TIME LIMIT OR MUTUAL ELIMINATION' : 'ALL OPPOSING GROUND UNITS ELIMINATED'), bottom - 22, 12, C.dim);
      button('back', this.t('返回基地', 'BACK TO BASE'), 18, bottom, pw - 36, true);
      return;
    }
    if (online.panel === 'ranking') {
      const mission = MISSIONS[online.level];
      label(`${online.level + 1} / ${MISSIONS.length} · ${text(mission.name, this.lang)}`, 81, 13);
      button('previous', '‹', 18, 62, 44); button('next', '›', pw - 62, 62, 44);
      const rows = online.ranking?.top.slice(online.rankPage * 3, online.rankPage * 3 + 3) || [];
      rows.forEach((row, i) => {
        const own = playerId(row) === playerId(online.identity), y = 112 + i * 27;
        if (own) this.rect(g, px + 18, py + y - 12, pw - 36, 26, '#164555', C.mint, 4);
        label(`${row.rank}. ${playerLabel(row)}${own ? this.t(' · 你', ' · YOU') : ''}   ${formatTime(row.secondary)}`, y, 12, own ? C.mint : C.white);
      });
      if (!rows.length) label(online.message || (online.ranking ? this.t('本关暂无成绩，等你创造纪录', 'SET THE FIRST RECORD') : this.t('正在读取…', 'LOADING…')), 139, 12, C.dim);
      const me = online.ranking?.me;
      label(me ? this.t(`你的最佳 ${formatTime(me.secondary)} · 第 ${me.rank} 名`, `YOUR BEST ${formatTime(me.secondary)} · RANK ${me.rank}`)
        : this.t('你 · 尚无上榜成绩', 'YOU · NO RANKED TIME'), 192, 12, C.mint);
      label(this.t('按最短用时排列 · 无广告支援的成功护送', 'FASTEST FIRST · SUCCESSFUL ESCORTS WITHOUT AD SUPPORT'), bottom - 20, 10, C.dim);
      const cw = (pw - 60) / 4;
      for (const [i, [id, name]] of [['back', this.t('返回', 'BACK')], ['pagePrev', '‹'], ['pageNext', '›'], ['refresh', this.t('刷新', 'REFRESH')]].entries()) button(id, name, 18 + i * (cw + 8), bottom, cw);
      return;
    }
    if (online.panel === 'menu') {
      label(this.t('每方 4 轻车 · 2 炮台 · 2 重甲，随机地图', '4 LIGHT · 2 TURRETS · 2 ARMOR EACH · RANDOM MAP'), 90, 13, C.dim);
      button('friend', this.t('好友对战 · 创建房间', 'FRIEND ROOM'), 18, 116, half, true);
      button('match', this.t('匹配对战', 'MATCHMAKING'), 26 + half, 116, half);
      label(this.t('匹配等待 8 秒，无真人对手时由机器人接战', '8 SECOND QUEUE · BOT OPPONENT IF NO PLAYER JOINS'), 179, 12, C.dim);
      button('back', this.t('返回', 'BACK'), 18, bottom, half);
      button('bot', this.t('机器人练习', 'BOT PRACTICE'), 26 + half, bottom, half);
      return;
    }
    const room = online.room;
    label(online.busy ? this.t('正在连接…', 'CONNECTING…') : room ? (room.mode === 'match' ? this.t('正在匹配 · 最长等待 8 秒', 'MATCHING · UP TO 8 SECONDS') : this.t('房间 ', 'ROOM ') + room.code) : '', 84, 16, C.amber);
    for (let i = 0; i < 2; i++) {
      const player = room?.players[i], own = player && playerId(player) === playerId(online.identity), y = 119 + i * 34;
      if (own) this.rect(g, px + 18, py + y - 14, pw - 36, 30, '#164555', C.mint, 5);
      label(player ? `${playerLabel(player)}${own ? this.t(' · 你', ' · YOU') : ''} · ${player.ready ? this.t('已准备', 'READY') : this.t('未准备', 'NOT READY')}`
        : this.t('等待另一位飞行员', 'WAITING FOR ANOTHER PILOT'), y, 13, own ? C.mint : C.white);
    }
    label(online.message || this.t('分享链接邀请好友，双方准备后开始', 'SHARE THE LINK · BOTH PILOTS MUST BE READY'), bottom - 25, 11, C.dim);
    const cw = (pw - 52) / 3;
    button('back', this.t('离开', 'LEAVE'), 18, bottom, cw);
    if (room?.mode === 'friend' && room.status === 'waiting') {
      button('share', this.t('分享链接', 'SHARE LINK'), 26 + cw, bottom, cw);
      button('ready', room.players[room.you]?.ready ? this.t('已准备', 'READY') : this.t('准备', 'READY UP'), 34 + cw * 2, bottom, cw, true);
    }
  }
  renderModal(key: string, s: Simulation, world: World) {
    if (s.phase !== 'playing' && this.online && this.onlineRevision !== this.online.revision) {
      this.onlineRevision = this.online.revision; this.modalKey = '';
    }
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
    const n = this.node('Panel', this.root);
    this.modal = n;
    const g = n.addComponent(Graphics);
    if (key.startsWith('online:') || key === 'duelResult') { this.renderOnline(n, g, s, key === 'duelResult'); return; }
    if (key === 'home' || key === 'missions') { this.renderHome(n, g, s); return; }
    if (key.startsWith('report:')) {
      const pw = Math.min(640, this.w - this.safe.left - this.safe.right - 32), ph = Math.min(310, this.h - this.safe.top - this.safe.bottom - 24);
      const px = (this.w - pw) / 2, py = (this.h - ph) / 2;
      this.panelFrame(g, px, py, pw, ph);
      this.label(n, this.t('战况 · 敌方单位', 'BATTLE REPORT · HOSTILES'), px + pw / 2, py + 24, 20, pw - 32, 32, C.white).isBold = true;
      if (s.duelMode && this.online) this.label(n, playerLabel(this.online.opponent) + (this.online.view?.bot ? ' · BOT' : ''), px + pw / 2, py + 47, 11, pw - 36, 22, C.amber);
      const columns = [.17, .41, .57, .73, .9], headings = this.lang === 'zh' ? ['类型', '总数', '存活', '消灭', '未出场'] : ['TYPE', 'TOTAL', 'ALIVE', 'LOST', 'PENDING'];
      headings.forEach((heading, i) => this.label(n, heading, px + pw * columns[i], py + (s.duelMode ? 72 : 58), 12, pw * .18, 24, C.dim));
      const names = { light: ['轻车', 'LIGHT'], turret: ['炮台', 'TURRET'], heavy: ['重甲', 'ARMOR'], rescue: ['救援车', 'RESCUE'], escort: ['护卫', 'ESCORT'] };
      const rows = battleCounts(s, false, s.duelMode);
      rows.forEach((row, i) => {
        const y = py + (s.duelMode ? 100 : 87) + i * 25;
        [text(names[row.kind], this.lang), row.total, row.alive, row.destroyed, row.pending].forEach((value, column) =>
          this.label(n, String(value), px + pw * columns[column], y, 14, pw * .18, 26, column === 3 ? C.mint : C.white));
      });
      this.label(n, this.t('查看战况时战斗继续', 'BATTLE CONTINUES WHILE VIEWING'), px + pw / 2, py + ph - 68, 11, pw - 24, 20, C.amber);
      this.button('close', this.t('返回战斗', 'BACK TO BATTLE'), px + pw / 2 - 90, py + ph - 50, 180, 44, n);
      return;
    }
    if (key.startsWith('help')) { this.renderGuide(n, g); return; }
    if (key.startsWith('countdown:')) {
      const x = this.safe.left + (this.w - this.safe.left - this.safe.right) / 2,
        y = this.safe.top + (this.h - this.safe.top - this.safe.bottom) / 2,
        r = Math.min(88, (this.h - this.safe.top - this.safe.bottom - 100) / 2);
      this.rect(g, 0, 0, this.w, this.h, '#05090c55');
      g.strokeColor = col('#91e6cb66'); g.lineWidth = 2;
      g.circle(x - this.w / 2, this.h / 2 - y, r); g.stroke();
      this.label(n, key.slice(10), x, y - 14, 72, r * 2, 104, C.mint).isBold = true;
      this.label(n, this.t('准备继续', 'GET READY'), x, y + 45, 18, r * 2, 32, C.mint);
      return;
    }
    if (key.startsWith('supply:')) {
      const choice = this.pendingSupply,
        pw = Math.min(760, this.w - this.safe.left - this.safe.right - 32),
        ph = Math.min(320, this.h - this.safe.top - this.safe.bottom - 74),
        px = this.safe.left + (this.w - this.safe.left - this.safe.right - pw) / 2,
        py = this.safe.top + 58 + (this.h - this.safe.top - this.safe.bottom - 58 - ph) / 2;
      this.panelFrame(g, px, py, pw, ph, C.amber);
      const offers = [
        ['tracking', this.t('自动追踪', 'AUTO TRACKING'), this.t('普通炮弹自动追踪敌人\n持续 60 秒', 'Regular rounds track foes\n60 seconds')],
        ['ammo', this.t('追踪弹 +2', 'HOMING +2'), this.t('点选敌人，再按开火\n立即补充 2 发', 'Tap an enemy, then FIRE\nAdds 2 rounds')],
        ['rate', this.t('射速提升', 'FIRE RATE'), this.t('普通炮射速提升 30%\n持续 60 秒', 'Fire rate +30%\n60 seconds')],
        ['restock', this.t('弹药补给', 'RESTOCK'), this.t('榴弹 +60 · 重炮 +24\n燃烧弹 +6', 'HE +60 · HEAVY +24\nFIRE +6')],
      ];
      const selected = offers.find(([id]) => id === this.supplySelection)!;
      this.label(n, this.t('选择战斗支援', 'CHOOSE COMBAT SUPPORT'), px + pw / 2, py + 19, 20, pw - 32, 28, C.white).isBold = true;
      this.label(n, s.buff ? this.t('支援已生效，结束后可再次领取', 'SUPPORT ACTIVE · WAIT UNTIL IT ENDS')
        : choice ? this.t('支援已获得 · 选择后直接启用', 'SUPPORT EARNED · SELECT AND ACTIVATE')
        : this.t('可选支援 · 完整观看广告后生效', 'OPTIONAL · WATCH A FULL AD TO ACTIVATE'),
        px + pw / 2, py + 43, 11, pw - 32, 18, choice ? C.mint : C.dim);
      const cw = (pw - 56) / 4, cy = py + 58, ch = ph - 138, icons = ch >= 136;
      for (const [i, [id, title, detail]] of offers.entries()) {
        const x = px + 16 + i * (cw + 8), active = id === this.supplySelection;
        this.rect(g, x, cy, cw, ch, active ? '#333022' : '#102b42', active ? C.amber : C.line, 3);
        if (icons) this.supplyIcon(g, id, x + cw / 2, cy + 22);
        const label = this.button('reward:' + id, (active ? '✓ ' : '') + title, x, cy, cw, ch, n);
        label.node.setPosition(x + cw / 2 - this.w / 2, this.h / 2 - cy - (icons ? 50 : 15));
        label.node.getComponent(UITransform)!.setContentSize(cw - 8, 22);
        label.fontSize = pw < 600 ? 12 : 15; label.color = col(active ? C.amber : C.white); label.isBold = true;
        this.label(n, detail, x + cw / 2, cy + (icons ? 84 : 43), icons ? 14 : 11, cw - 10, icons ? 42 : 32, C.white);
        if (icons) this.label(n, active ? this.t('已选择', 'SELECTED') : this.t('点击选择', 'TAP TO SELECT'),
          x + cw / 2, cy + ch - 15, 11, cw - 12, 20, active ? C.amber : C.dim);
      }
      this.label(n, this.supplyMessage || this.t(`已选：${selected[1]} · 启用后3秒返回战斗`, `${selected[1]} · RESUME IN 3s`),
        px + pw / 2, py + ph - 66, 11, pw - 32, 18, this.supplyMessage ? C.red : C.dim);
      const bw = (pw - 40) * .42, y = py + ph - 52;
      this.rect(g, px + 16, y, bw, 44, '#102b42', C.line, 3);
      const skip = this.button('supplyLater', choice ? this.t('留到下次，继续战斗', 'SAVE FOR LATER · RESUME') : this.t('不使用，继续战斗', 'SKIP · RESUME BATTLE'), px + 16, y, bw, 44, n);
      skip.fontSize = pw < 600 ? 11 : 13;
      const bx = px + 24 + bw, ww = pw - 40 - bw;
      this.rect(g, bx, y, ww, 44, s.buff ? '#102b42' : C.amber, s.buff ? C.line : undefined, 3);
      const watch = this.button('supplyWatch', s.buff ? this.t('支援生效中', 'SUPPORT ACTIVE')
        : choice ? this.t('启用并返回战斗', 'ACTIVATE & RESUME') : this.t('看广告并启用', 'WATCH AD & ACTIVATE'), bx, y, ww, 44, n);
      watch.fontSize = pw < 600 ? 13 : 16;
      watch.color = col(s.buff ? C.dim : '#10252a'); watch.isBold = !s.buff;
      return;
    }
    if (key === 'exit') {
      const pw = Math.min(440, this.w - this.safe.left - this.safe.right - 32), ph = 178;
      const px = this.safe.left + (this.w - this.safe.left - this.safe.right - pw) / 2;
      const py = this.safe.top + 58 + (this.h - this.safe.top - this.safe.bottom - 58 - ph) / 2;
      this.panelFrame(g, px, py, pw, ph, C.red);
      this.label(n, this.t('返回基地？', 'RETURN TO BASE?'), px + pw / 2, py + 30, 22, pw - 32, 34).isBold = true;
      this.label(n, this.t('将会中断本次游戏并退出。', 'This will end the current battle and exit.'), px + pw / 2, py + 76, 14, pw - 32, 40, C.dim);
      const bw = (pw - 40) / 2;
      for (const [i, id] of ['exitCancel', 'exitConfirm'].entries()) {
        const x = px + 16 + i * (bw + 8), y = py + ph - 56;
        this.rect(g, x, y, bw, 44, i ? '#382730' : C.amber, i ? '#8f4853' : undefined, 6);
        this.button(id, i ? this.t('确认退出', 'CONFIRM EXIT') : this.t('继续战斗', 'CONTINUE'), x, y, bw, 44, n).color = col(i ? '#ff9b9f' : '#10252a');
      }
      return;
    }
    if (key === 'pause' || key.startsWith('settings')) { this.renderSettings(n, g, s, world, key); return; }
    if (key.startsWith('advert:')) {
      const pw = Math.min(420, this.w - this.safe.left - this.safe.right - 32);
      const ph = Math.min(244, this.h - this.safe.top - this.safe.bottom - 74);
      const px = this.safe.left + (this.w - this.safe.left - this.safe.right - pw) / 2;
      const py = this.safe.top + 58 + (this.h - this.safe.top - this.safe.bottom - 58 - ph) / 2;
      this.rect(g, 0, 0, this.w, this.h, '#05090cb8');
      this.rect(g, px, py, pw, ph, C.ink, C.mint, 10);
      this.label(n, this.advert?.mock ? this.t('模拟广告', 'SIMULATED AD') : this.t('广告加载中', 'LOADING AD'),
        px + pw / 2, py + 34, 24, pw - 32, 42, C.white).isBold = true;
      this.label(n, this.advert?.kind === 'supply' ? this.t('完整观看后启用所选支援，并返回战斗', 'COMPLETE TO ACTIVATE SUPPORT AND RESUME')
        : this.t(`完成后解锁 ${nextZoomLimit(this.zoomLimit)}× 放大上限`, `COMPLETE TO UNLOCK ${nextZoomLimit(this.zoomLimit)}× ZOOM`),
        px + pw / 2, py + 80, 14, pw - 32, 36, C.mint);
      if (this.advert?.mock) {
        const bw = (pw - 56) / 2, y = py + ph - 76;
        const b = this.button('adClose', this.t('完成模拟广告', 'COMPLETE MOCK AD'), px + 24, y, bw, 44, n);
        this.rect(g, px + 24, y, bw, 44, C.mint, undefined, 5);
        b.color = col('#10252a'); b.isBold = true;
        this.rect(g, px + 32 + bw, y, bw, 44, '#1b3038', C.line, 5);
        this.button('adCancel', this.t('取消 · 返回选择', 'CANCEL · GO BACK'), px + 32 + bw, y, bw, 44, n);
      } else this.button('adCancel', this.t('取消领取', 'CANCEL'), px + 24, py + ph - 76, pw - 48, 44, n);
      this.label(n, this.advert?.mock ? this.t('本次为网页模拟 · 无需等待', 'WEB SIMULATION · NO WAIT') : this.t('完成广告后领取奖励', 'COMPLETE THE AD TO CLAIM'),
        px + pw / 2, py + ph - 17, 11, pw - 32, 22, C.dim);
      return;
    }
    const allies = s.units.filter((u) => u.friendly).length;
    const training = s.mission.mode === 'training';
    this.rect(g, 0, 0, this.w, this.h, '#061116b8');
    const result = key === 'success' || key === 'failure';
    const pw = Math.min(result ? 720 : 880, this.w - this.safe.left - this.safe.right - 32),
      ph = Math.min(result ? 340 : 540, this.h - this.safe.top - this.safe.bottom - 72);
    const px = this.safe.left + (this.w - this.safe.left - this.safe.right - pw) / 2,
      py = this.safe.top + 58 + (this.h - this.safe.top - this.safe.bottom - 58 - ph) / 2;
    this.panelFrame(g, px, py, pw, ph, key === 'failure' ? C.red : C.mint, '#050f1d00');
    const small = result || this.compact || this.w < 600,
      low = ph < 280;
    const heading =
      key === 'briefing'
        ? training ? this.t('60秒火控热身', '60s FIRE CONTROL') : this.t('夜航守望', 'NIGHT OVERWATCH')
        : key === 'success'
          ? training ? this.t('三靶清除，热身完成', 'THREE TARGETS CLEARED') : this.t('车队安全抵达', 'CONVOY EXTRACTED')
          : key === 'failure'
            ? training ? this.t('热身结束，再试一次', 'WARMUP ENDED · TRY AGAIN') : this.t('护送中断', 'ESCORT INTERRUPTED')
            : key === 'orientation'
              ? this.t('横屏，进入火控席', 'ROTATE TO LANDSCAPE')
              : key === 'mission'
                  ? this.t('山谷公路撤离', 'VALLEY EVACUATION')
                  : this.t('暂停', 'PAUSED');
    const headingLabel = this.label(
      n,
      heading,
      px + pw / 2,
      py + (small ? 29 : 48),
      small ? 23 : 36,
      pw - 56,
      small ? 46 : 60,
      C.white,
    );
    headingLabel.isBold = true;
    const bottom = py + ph - 58;
    if (key === 'briefing' || key === 'mission') {
      const split = !small,
        contentTop = py + (low ? 52 : small ? 65 : 118);
      if (split) {
        this.label(n, 'NIGHT 07  /  ' + text(s.mission.name, this.lang), px + pw / 2, py + 86, 12, pw - 48, 24, C.mint);
        if (training) {
          for (const [i, target] of [this.t('◇ 静止目标 → 榴弹炮', '◇ STATIC → HE'),
            this.t('◇ 巡逻目标 → 弹着提前量', '◇ ROVER → LEAD THE SHOT'),
            this.t('◇ 重甲目标 → 重型榴弹炮', '◇ ARMOR → HEAVY')].entries())
            this.label(n, target, px + pw * .72, contentTop + 52 + i * 56, 17, pw * .43, 44, C.amber);
        } else {
          this.routeGraphic(g, px + pw * 0.48, contentTop + 28, pw * 0.46, ph - 235, s.progress, s.mission.map, s.mission.light, s.mission.events);
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
            `炮台造成 ${Math.round(mainThreat[1])} 伤害。下次优先用榴弹炮清除固定威胁。`,
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
      const rankState: Record<string, [string, string]> = { finished: ['已入榜', 'RANKED'], syncing: ['上传中', 'SYNCING'], recording: ['计时中', 'RECORDING'], practice: ['练习', 'PRACTICE'], 'update-required': ['需更新', 'UPDATE'] };
      const rank = rankState[this.online?.rankStatus || 'local'] || ['仅本地', 'LOCAL'];
      const statY = py + (low ? 110 : small ? 123 : 212),
        statW = (pw - 48) / 3,
        cleared = s.kills + s.friendlyKills;
      for (const [i, [value, caption]] of [
        [training ? `${s.time.toFixed(1)}s` : formatTime(Math.round((s.completionTime ?? s.time) * 1000)), training
          ? this.trainingBest ? this.t(`用时 · 最佳${this.trainingBest.time.toFixed(1)}s`, `TIME · BEST ${this.trainingBest.time.toFixed(1)}s`)
            : this.t('热身用时', 'WARMUP TIME') : this.t(`本次用时 · ${rank[0]}`, `TIME · ${rank[1]}`)],
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
      const comparison = !training && success ? this.timeComparison : undefined;
      const advice = comparison ? this.t(
        `${comparison.newRecord ? comparison.previousMs === undefined ? '首次完成 · 个人最佳' : '新纪录 · 个人最佳' : '个人最佳'} ${formatTime(comparison.bestMs)}${comparison.previousMs === undefined ? '' : ` · ${comparison.currentMs < comparison.previousMs ? '快' : comparison.currentMs > comparison.previousMs ? '慢' : '持平'}${comparison.currentMs === comparison.previousMs ? '' : ' ' + (Math.abs(comparison.currentMs - comparison.previousMs) / 1000).toFixed(2) + '秒'}`}`,
        `${comparison.newRecord ? 'NEW PERSONAL BEST' : 'PERSONAL BEST'} ${formatTime(comparison.bestMs)}${comparison.previousMs === undefined ? '' : ` · ${(comparison.currentMs - comparison.previousMs) / 1000}s VS PREVIOUS`}`)
        : training ? text(trainingNextGoal(s), this.lang) : success
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
      if (!training) this.button('retry', this.t('再次出动 ↻', 'RETRY ↻'), px + 32 + resultW, bottom, resultW, 44, n);
      this.button(
        training ? 'retry' : success && s.mission.id !== MISSIONS.at(-1)!.id ? 'missionNext' : 'training',
        training ? this.t('再练一轮 ↻', 'TRY AGAIN ↻') : success && s.mission.id !== MISSIONS.at(-1)!.id
          ? this.t('下一任务 →', 'NEXT OPERATION →') : this.t('60秒热身', '60s WARMUP'),
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
    }
    for (const b of this.buttons.filter((b) => b.label.node.parent === n)) {
      const primary = ['start', 'retry', 'resume'].includes(b.id);
      this.rect(g, b.x, b.y, b.w, b.h, primary ? C.amber : '#102b42', primary ? C.amber : C.line, 3);
      b.label.color = col(b.id === 'supply' && s.buff && !this.pendingSupply ? C.dim : primary ? '#10252a' : C.white);
      b.label.isBold = primary;
    }
  }
  supplyLabel(s: Simulation) {
    return this.pendingSupply ? this.t('战斗补给 · 待领取', 'SUPPLY · CLAIM')
      : s.buff ? this.t('战斗补给\n增益生效中', 'COMBAT SUPPLY\nBUFF ACTIVE')
      : this.t('战斗补给', 'COMBAT SUPPLY');
  }
  update(s: Simulation, world: World) {
    this.lockedTargets = [];
    this.effects = { impacts: [], projectiles: [] };
    const w = this.w, h = this.h, g = this.g, top = this.safe.top,
      left = 12 + this.safe.left, by = h - this.footer - this.safe.bottom;
    this.homeBackground.active = s.phase === 'briefing' && !this.missionsOpen;
    if (this.homeBackground.active) {
      const background = this.homeBackground.getComponent(Graphics)!;
      background.clear(); this.rect(background, 0, 0, w, h, '#071522');
      const frame = this.homeArtwork.spriteFrame;
      if (frame) {
        const size = frame.originalSize, scale = Math.max(w / size.width, h / size.height);
        this.homeArtwork.node.getComponent(UITransform)!.setContentSize(size.width * scale, size.height * scale);
      }
    }
    let key = s.phase === 'briefing' ? this.missionsOpen ? 'missions' : 'home' : s.phase === 'playing' ? '' : s.phase;
    if (this.online?.panel) key = `online:${this.online.panel}:${this.online.revision}:${this.lang}`;
    else if (s.duelMode && this.online?.view?.finished) key = 'duelResult';
    if (this.advert) key = `advert:${this.advert.kind}:${this.advert.mock}:${this.lang}`;
    else if (this.exitConfirm) key = 'exit';
    else if (s.pauses.has('help')) key = 'help:' + this.helpGroup + this.helpTouch + this.lang;
    else if (s.pauses.has('mission')) key = 'mission';
    else if (s.pauses.has('settings')) key = this.toolsOpen ? 'settings:flight' : this.zoomOpen ? 'settings:zoom' : 'settings';
    else if (s.pauses.has('orientation')) key = 'orientation';
    else if (this.supplyOpen) key = this.pendingSupply ? 'supply:choice' : 'supply:offer';
    else if (this.reportOpen && s.phase === 'playing') key = `report:${Math.floor(s.time * 2)}`;
    else if (s.resumeCountdown > 0) key = `countdown:${Math.ceil(s.resumeCountdown)}`;
    else if (s.paused && s.phase !== 'briefing') key = 'pause';
    this.renderModal(key, s, world);
    g.clear();
    this.marks.clear();
    this.globalGraphics.clear();
    this.globalControls.setSiblingIndex(this.root.children.length - 1);
    const tracking = s.buff?.kind === 'tracking' && s.buff.remaining > 0;
    for (const l of this.labels.values()) l.node.active = !key;
    for (const l of this.unitLabels.values()) l.node.active = false;
    for (const b of this.buttons) {
      if (s.duelMode && ['homing', 'convoy', 'supply', 'mission'].includes(b.id)) { b.label.node.active = false; continue; }
      if (b.id === 'homing' && !tracking && !s.homingAmmo && !this.rewardsAvailable && !this.pendingSupply) {
        b.label.node.active = false;
        continue;
      }
      if (['supply', 'homingReward', 'supplyWatch', 'zoomUpgrade'].includes(b.id) &&
          !this.rewardsAvailable && !(this.pendingSupply && ['supply', 'supplyWatch'].includes(b.id))) {
        b.label.node.active = false;
        continue;
      }
      if (b.label.node.parent === this.root)
        b.label.node.active = !key && b.id !== 'priority' && (b.id !== 'fire' || this.touch || s.homingSelected);
      if (this.isGlobalAction(b.id)) {
        b.label.node.active = !this.advert && !this.supplyOpen && !this.exitConfirm && !key.startsWith('countdown:');
        if (!b.label.node.active) continue;
        const gx = b.x + b.w / 2 - w / 2, gy = h / 2 - b.y - b.h / 2, gear = this.globalGraphics;
        gear.strokeColor = col(!key && !world.thermal && s.mission.light === 'day' ? '#123844' : C.white); gear.lineWidth = 2;
        gear.circle(gx, gy, 10); gear.stroke(); gear.circle(gx, gy, 4); gear.stroke();
        for (let i = 0; i < 8; i++) { const angle = i * Math.PI / 4;
          gear.moveTo(gx + Math.cos(angle) * 10, gy + Math.sin(angle) * 10);
          gear.lineTo(gx + Math.cos(angle) * 14, gy + Math.sin(angle) * 14); }
        gear.stroke();
      }
    }
    const toast = this.labels.get('globalToast')!;
    toast.node.active = ['missions', 'pause', 'settings', 'settings:zoom'].includes(key) && !!this.toast && Date.now() < this.toastUntil;
    toast.string = this.toast;
    if (toast.node.active) {
      const tw = toast.node.getComponent(UITransform)!.contentSize.width;
      this.rect(this.globalGraphics, toast.node.position.x + w / 2 - tw / 2, top + 8, tw, 36, C.ink);
    }
    const buff = this.labels.get('buff')!;
    buff.node.active = !key && s.phase === 'playing' && s.buff?.kind === 'rate';
    if (s.buff && buff.node.active) {
      const size = buff.node.getComponent(UITransform)!.contentSize, p = buff.node.position,
        name = s.buff.kind === 'tracking' ? this.t('追踪模式', 'TRACKING') : this.t('射速提升', 'RATE ×1.3'),
        remaining = Math.ceil(s.buff.remaining), tint = s.buff.remaining <= 5 ? C.amber : C.mint;
      buff.string = name + (size.width < 170 ? '\n' : ' · ') + this.t(`${remaining}秒`, `${remaining}s`);
      buff.color = col(tint);
    }
    if (key) {
      if (s.phase === 'playing') this.effects = drawEffects(this.marks, s, world, this.w, this.h, this.reducedEffects);
      return;
    }
    const gun = s.guns[s.selected], weapon = WEAPONS[s.selected], reason = s.reason(),
      danger = s.friendlyRisk || s.time - s.friendHitAt < 2;
    const plane = s.aircraft;
    const flightTime = s.flightTime(), flightText = Number.isFinite(flightTime) ? flightTime.toFixed(1) + 's' : '—';
    const allies = s.units.filter((u) => u.friendly).length;
    this.set('health', s.duelMode && this.online ? playerLabel(this.online.identity) + this.t(' · 你', ' · YOU') : this.t(`□ 友军 ${allies - s.friendlyLosses} / ${allies}`, `□ ALLIES ${allies - s.friendlyLosses} / ${allies}`));
    const bright = !world.thermal && s.mission.light === 'day';
    this.labels.get('health')!.color = col(!s.duelMode && s.rescue.hp / s.rescue.maxHp < 0.3 ? bright ? '#982536' : C.red : bright ? '#124652' : C.mint);
    this.labels.get('progress')!.color = col(bright ? '#243c42' : C.dim);
    this.labels.get('status')!.color = col(bright ? '#123844' : C.white);
    this.labels.get('health')!.fontSize = s.duelMode ? 10 : 13;
    this.set('progress', s.duelMode ? this.t(`我 ${allies - s.friendlyLosses}/8 · 敌 ${s.units.filter(u => !u.friendly && u.hp > 0).length} / 8 · 全灭获胜`, `FOES ${s.units.filter(u => !u.friendly && u.hp > 0).length}/8 · ELIMINATE ALL`) : s.mission.mode === 'training'
      ? this.t(`热身清靶 ${s.kills} / 3 · 友伤 ${Math.round(s.friendlyDamage)}`, `WARMUP ${s.kills}/3 · FRIENDLY ${Math.round(s.friendlyDamage)}`)
      : this.t(`撤离 ${Math.floor(s.ratio * 100)}% · 威胁 ${s.threatsRemaining}`, `ROUTE ${Math.floor(s.ratio * 100)}% · THREATS ${s.threatsRemaining}`));
    const clock = Math.ceil(s.duelMode ? this.online?.view?.remaining ?? 180 : s.remaining);
    this.set('status', `${world.thermal ? this.t('热像', 'IR') : this.t(s.mission.light === 'day' ? '白天' : s.mission.light === 'dusk' ? '黄昏' : '夜间', s.mission.light.toUpperCase())}\n${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, '0')}`);
    this.set('weaponState', this.t(
      `${this.mouseDesktop ? '' : flightText + ' 弹着\n'}${gun.overheated ? '过热 · 冷却至40' : gun.cooldown > 0 && s.selected > 0 ? '装填 ' + gun.cooldown.toFixed(1) + 's' : '热量 ' + Math.round(gun.heat) + '%'}`,
      `${this.mouseDesktop ? '' : flightText + ' IMPACT\n'}${gun.overheated ? 'OVERHEATED' : gun.cooldown > 0 && s.selected > 0 ? 'RELOAD ' + gun.cooldown.toFixed(1) + 's' : 'HEAT ' + Math.round(gun.heat) + '%'}`));
    if (s.homingSelected) this.set('weaponState', s.homingAmmo <= 0 ? this.t('点战斗补给', 'OPEN SUPPLY')
      : s.homingTarget ? this.t('已锁定', 'LOCKED') : this.t('点选敌人', 'TAP AN ENEMY'));
    const reasons: Record<string, string[]> = {
      extracting: [s.extractionRemaining ? `停止开火 · 快速撤离 ${Math.ceil(s.extractionRemaining)}秒` : s.shots.length ? '车队已抵达 · 正在确认炮弹落点' : '车队已抵达 · 等待电台播报结束', s.extractionRemaining ? `CEASE FIRE · EXTRACTING ${Math.ceil(s.extractionRemaining)}s` : s.shots.length ? 'CONVOY ARRIVED · RESOLVING SHOTS' : 'CONVOY ARRIVED · RADIO REPORT'],
      target: ['点选敌人，再按发射', 'TAP AN ENEMY, THEN LAUNCH'],
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
    if (s.duelMode) notice = this.online?.message || this.t('消灭对方全部地面单位 · 菜单不暂停对战', 'ELIMINATE ALL GROUND UNITS · MENUS DO NOT PAUSE');
    if (s.extractionRemaining === undefined && Date.now() < this.toastUntil) notice = this.toast;
    this.set('notice', notice || this.radioText);
    this.set('friendWarning', danger && s.extractionRemaining === undefined ? s.time - s.friendHitAt < 2
      ? this.t('！正在误伤友方 · 停止射击', '! FRIENDLY HIT · CEASE FIRE')
      : this.t('！范围内有友方 · 当心误伤', '! FRIENDLY IN BLAST RADIUS') : '');
    const step = TUTORIAL.find((e) => !s.completed.has(e));
    this.set('tutorial', s.duelMode || s.extractionRemaining !== undefined ? '' : s.mission.mode === 'training'
      ? this.t('清除 3 个目标', 'CLEAR 3 TARGETS')
      : this.tutorial && step && s.time < 12
      ? `${TUTORIAL.indexOf(step) + 1}/${TUTORIAL.length}  ${tutorialText(step, this.lang, this.touch)}`
      : '');
    {
      const messages = ['friendWarning', 'notice', 'tutorial'];
      const active = messages.find((id) => this.labels.get(id)!.string);
      for (const id of messages) this.labels.get(id)!.node.active = id === active;
    }
    for (const id of ['notice', 'friendWarning', 'tutorial']) {
      const label = this.labels.get(id)!;
      if (!label.node.active || !label.string) continue;
      label.node.getComponent(UITransform)!.setContentSize(Math.min(w - 40, Math.max(180, label.string.length * label.fontSize + 24)), 28);
      const size = label.node.getComponent(UITransform)!.contentSize, p = label.node.position;
      this.rect(g, p.x + w / 2 - size.width / 2, h / 2 - p.y - size.height / 2, size.width, size.height, id === 'friendWarning' ? '#381c26dd' : '#0c171da0');
    }
    for (const b of this.buttons.filter((b) => b.label.node.parent === this.root && b.label.node.active)) {
      if (b.id === 'priority') continue;
      if (b.id === 'homing') b.label.string = this.t('追踪', 'HOMING') + '\n' + (tracking
        ? this.t(`${Math.ceil(s.buff!.remaining)}秒`, `${Math.ceil(s.buff!.remaining)}s`) : s.homingAmmo || '+');
      const selected = (!s.homingSelected && b.id === 'weapon' + s.selected) || ((s.homingSelected || tracking) && b.id === 'homing') || b.id === (plane.direction < 0 ? 'orbitLeft' : 'orbitRight');
      if (b.id.startsWith('weapon')) {
        const i = Number(b.id.slice(-1)), a = s.guns[i];
        b.label.string = this.t(['速射', '榴弹', '重炮', '燃烧'][i], ['RAPID', 'HE', 'HEAVY', 'FIRE'][i]) + '\n' + (a.ammo === Infinity ? '∞' : a.ammo);
      }
      if (b.id === 'fire') b.label.string = reason === 'extracting' ? this.t('停火', 'CEASE FIRE') : s.homingSelected
        ? s.homingAmmo <= 0 ? this.t('无弹药', 'EMPTY') : s.homingTarget ? this.t('发射', 'LAUNCH') : this.t('待锁定', 'LOCK')
        : reason === 'protected' ? this.t('禁射', 'BLOCKED') : reason === 'overheated' ? this.t('冷却', 'COOL')
        : reason === 'empty' ? this.t('无弹药', 'EMPTY') : this.t('开火', 'FIRE');
      const fire = b.id === 'fire';
      this.rect(g, b.x, b.y, b.w, b.h, fire ? danger ? '#482832' : C.mint : selected ? '#29463ee0' : '#0c171daa', fire && danger ? C.red : selected || fire ? C.mint : '#91e6cb55', fire ? b.w / 2 : 12);
      b.label.color = col(fire && !danger ? '#10252a' : selected ? C.mint : C.white);
      if (b.id === 'homing' && tracking && s.buff!.remaining <= 5) b.label.color = col(C.amber);
      b.label.isBold = selected || fire;
      if ((b.id.startsWith('weapon') || b.id === 'homing') && b.w >= 64) {
        const x = b.x + 17 - w / 2, y = h / 2 - b.y - b.h / 2;
        g.strokeColor = col(selected ? C.mint : C.dim); g.lineWidth = 2;
        if (b.id === 'homing') {
          g.circle(x, y, 7); g.stroke();
          for (const sign of [-1, 1]) { g.moveTo(x + sign * 5, y); g.lineTo(x + sign * 11, y); g.moveTo(x, y + sign * 5); g.lineTo(x, y + sign * 11); } g.stroke();
        } else {
          const barrels = b.id === 'weapon0' ? 2 : 1;
          for (let i = 0; i < barrels; i++) { g.moveTo(x - 8, y - 7 + i * 5); g.lineTo(x + 8, y + 7 + i * 5); } g.stroke();
          g.moveTo(x - 7, y - 9); g.lineTo(x - 11, y - 2); g.lineTo(x - 5, y + 3); g.stroke();
        }
        b.label.node.setPosition(b.x + 30 + (b.w - 30) / 2 - w / 2, h / 2 - b.y - b.h / 2);
        b.label.node.getComponent(UITransform)!.setContentSize(b.w - 32, b.h - 4);
        b.label.fontSize = 12;
      }
      if (b.id.startsWith('weapon')) {
        const a = s.guns[Number(b.id.slice(-1))];
        this.rect(g, b.x + 5, b.y + b.h - 5, (b.w - 10) * a.heat / 100, 2, a.overheated ? C.red : C.amber);
      }
    }
    this.labels.get('priorityMarker')!.node.active = false;
    this.drawWorld(s, world);
    this.drawMinimap(s);
  }
  drawMinimap(s: Simulation) {
    const g = this.marks, map = this.minimapLayout, priorityId = s.priorityThreat?.unit.id;
    this.rect(g, map.x, map.y, map.w, map.h, '#0c171de8', '#91e6cb55');
    this.set('mapLegend', this.t('北 ↑', 'N ↑'));
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
      if (priorityId === u.id) { g.strokeColor = col(C.white); g.lineWidth = 2; g.circle(q.x, q.y, 6); g.stroke(); g.lineWidth = 1; }
      g.strokeColor = col(u.friendly ? C.mint : C.red);
      g.fillColor = col(u.friendly ? C.mint : C.red);
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
    const priorityLabel = this.labels.get('priorityMarker')!;
    priorityLabel.node.active = false;
    const threat = s.priorityThreat;
    if (threat) {
      const p = project(threat.unit, 1.5);
      if (p.visible) {
        let x = Math.max(-this.w / 2 + this.safe.left + 48, Math.min(this.w / 2 - this.safe.right - 48, p.x));
        const y = Math.max(-this.h / 2 + this.safe.bottom + this.footer + 52, Math.min(this.h / 2 - this.safe.top - 82, p.y));
        const map = this.minimapLayout;
        if (x + this.w / 2 + 48 > map.x && this.h / 2 - y - 24 < map.y + map.h) x = map.x - 56 - this.w / 2;
        const marker = this.buttons.find(b => b.id === 'priority')!;
        marker.x = x + this.w / 2 - 48; marker.y = this.h / 2 - y - 24;

        const clipped = x !== p.x || y !== p.y;
        g.strokeColor = col(C.red); g.lineWidth = 2;
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          g.moveTo(x + sx * 10, y + sy * 19); g.lineTo(x + sx * 19, y + sy * 19); g.lineTo(x + sx * 19, y + sy * 10);
        }
        g.stroke();
        if (clipped) { const angle = Math.atan2(p.y - y, p.x - x); g.moveTo(x, y); g.lineTo(x + Math.cos(angle) * 28, y + Math.sin(angle) * 28); g.stroke(); }
        priorityLabel.string = this.t(`优先 ${Math.ceil(threat.dueIn)}s${clipped ? ' ↗' : ''}`, `PRIORITY ${Math.ceil(threat.dueIn)}s${clipped ? ' ↗' : ''}`);
        priorityLabel.node.setPosition(x, y - 33);
        priorityLabel.node.getComponent(UITransform)!.setContentSize(96, 24);
        priorityLabel.node.active = true;
      }
    }
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
    for (const p of s.duelMode ? [] : PROTECTED) {
      g.strokeColor = col('#729e9180');
      g.lineWidth = 1;
      groundRing(p, p.radius);
    }
    for (const d of s.duelMode ? [] : s.holdPoints) {
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
    const banners = ['notice', 'friendWarning', 'tutorial']
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
        g.strokeColor = col(outline ? '#061116' : u.friendly ? C.mint : C.red);
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
    for (const id of new Set([...s.shots.filter(shot => shot.guidance).map(shot => shot.guidance!.target), ...(s.homingSelected && s.homingTarget ? [s.homingTarget.id] : [])])) {
      const unit = s.units.find(u => u.id === id && u.hp > 0);
      if (!unit) continue;
      const q = project(unit, .3);
      if (!onScreen(q, 24)) continue;
      const r = 18;
      for (const outline of [true, false]) {
        g.lineWidth = outline ? 6 : 3;
        g.strokeColor = col(outline ? '#061116' : C.amber);
        for (const x of [-1, 1]) for (const y of [-1, 1]) {
          g.moveTo(q.x + x * (r - 9), q.y + y * r);
          g.lineTo(q.x + x * r, q.y + y * r);
          g.lineTo(q.x + x * r, q.y + y * (r - 9));
        }
        g.stroke();
      }
      const l = unitLabel(unit.id, 110, 24);
      l.string = s.shots.some(shot => shot.guidance?.target === id)
        ? this.t('追踪中', 'TRACKING') : this.t('已锁定', 'LOCKED'); l.color = col(C.amber);
      l.node.setPosition(q.x, q.y + 36); l.node.active = true;
      this.lockedTargets.push({ id, x: q.x + this.w / 2, y: this.h / 2 - q.y });
    }
    if (hovered && !this.lockedTargets.some(lock => lock.id === hovered.unit.id)) {
      const { unit: u, point: q } = hovered;
      const width = this.compact ? 120 : 176, half = width / 2;
      const l = unitLabel(u.id, width, 24);
      l.color = col(u.friendly ? C.mint : C.red);
      l.string = u.friendly
        ? u.kind === 'escort' ? this.t('护卫', 'ESCORT') : this.t('救援车', 'RESCUE')
        : this.t(
            u.kind === 'heavy' ? '重甲' : u.kind === 'turret' ? '炮台' : '轻车',
            u.kind.toUpperCase(),
          );
      if (u.hp < u.maxHp) l.string += u.hp <= u.maxHp * 0.3
        ? this.t(' · 重创', ' · CRITICAL') : this.t(' · 受损', ' · DAMAGED');
      const tag = [[0, 56], [0, -56], [half + 44, 0], [-half - 44, 0], [half + 44, -24], [-half - 44, -24]]
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
      .filter((e) => e.type === 'impact' && (!s.duelMode || e.side === s.pilotSide) && s.time - e.time < 1.1);
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
