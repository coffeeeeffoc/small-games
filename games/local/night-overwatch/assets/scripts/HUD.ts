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
  Rect,
  resources,
  isValid,
  EditBox,
  UIOpacity,
  tween,
  Tween,
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
  ink: '#081725f5',
  line: '#456780',
  white: '#e5edf3',
  dim: '#9bb4c8',
  mint: '#82c9ed',
  amber: '#e5b65c',
  action: '#ffe3a4',
  red: '#ff525b',
};
const col = (hex: string) => new Color().fromHEX(hex);
export type ButtonRect = { id: string; x: number; y: number; w: number; h: number; label: Label; visual?: { x: number; y: number; w: number; h: number }; disabled?: boolean };
export class HUD {
  root: Node;
  camera: Camera;
  g: Graphics;
  marks: Graphics;
  globalControls: Node;
  globalGraphics: Graphics;
  homeBackground: Node;
  homeArtwork: Sprite;
  private titleArtwork?: SpriteFrame;
  private missionArtwork: SpriteFrame[] = [];
  private dayArtwork: SpriteFrame[] = [];
  private artworkFrames: SpriteFrame[] = [];
  w = 960;
  h = 540;
  lang: Language = 'zh';
  radioText = '';
  touch = sys.isMobile || (sys.isBrowser && window.matchMedia('(pointer: coarse)').matches);
  // UI coordinates from real mouse input; the controller clears this on leave/touch/blur.
  mousePointer?: { x: number; y: number };
  pressedButton = '';
  private uiFrames = new Map<string, SpriteFrame>();
  private surfaces?: Node;
  get interfaceArtworkReady() { return this.uiFrames.size === 3 && !!this.titleArtwork && this.missionArtwork.length === 3 && this.dayArtwork.length === 3; }
  effects: EffectsFrame = { impacts: [], projectiles: [] };
  buttons: ButtonRect[] = [];
  labels = new Map<string, Label>();
  modal?: Node;
  modalKey = '';
  private onlineRevision = -1;
  private modalFamily = '';
  screenControl = false;
  screenActive = false;
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
  get editing() {
    return this.modal?.getComponentsInChildren(EditBox).some(field => field.isFocused()) ?? false;
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
    this.root.once(Node.EventType.NODE_DESTROYED, () => { for (const frame of this.artworkFrames) frame.destroy(); });
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
        this.homeArtwork.spriteFrame = frame; this.artworkFrames.push(frame);
      }
    });
    // These are original unlettered illustrations and a separate transparent wordmark.
    // All mission data, interaction and status text remain live Cocos UI.
    for (const asset of ['title-metal', 'mission-atlas', 'mission-day-atlas']) resources.load('ui/' + asset + '/texture', Texture2D, (error, texture) => {
      if (error || !isValid(this.root)) return;
      const count = asset === 'title-metal' ? 1 : 3;
      for (let index = 0; index < count; index++) {
        const frame = new SpriteFrame(); frame.texture = texture;
        if (count === 3) frame.rect = new Rect(index * texture.width / 3, 0, texture.width / 3, texture.height);
        this.artworkFrames.push(frame);
        if (asset === 'mission-day-atlas') this.dayArtwork.push(frame);
        else if (count === 3) this.missionArtwork.push(frame); else this.titleArtwork = frame;
      }
      if (!this.editing) this.modalKey = 'rebuild';
    });
    for (const name of ['panel', 'button', 'insignia']) resources.load(`ui/${name}/texture`, Texture2D, (error, texture) => {
      if (error || !isValid(this.root)) return;
      const frame = new SpriteFrame(); frame.texture = texture;
      if (name !== 'insignia') {
        const edge = Math.round(Math.min(texture.width, texture.height) * .065);
        frame.insetLeft = frame.insetRight = frame.insetTop = frame.insetBottom = edge;
      }
      this.uiFrames.set(name, frame); this.artworkFrames.push(frame); if (!this.editing) this.modalKey = 'rebuild';
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
    this.pressedButton = '';
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
    this.buttons.push({ id, x, y, w, h, label: l, visual: { x: x + 2, y: y + 2, w: w - 4, h: h - 4 } });
    return l;
  }
  artwork(name: string, x: number, y: number, w: number, h: number, tone?: string) {
    const frame = this.uiFrames.get(name);
    if (!frame || !this.surfaces) return false;
    let parent = this.surfaces;
    if (name === 'button') {
      const crop = this.node('ButtonSilhouette', parent);
      crop.setPosition(x + w / 2 - this.w / 2, this.h / 2 - y - h / 2);
      crop.getComponent(UITransform)!.setContentSize(w, h);
      const mask = crop.addComponent(Mask); mask.type = Mask.Type.GRAPHICS_STENCIL;
      const silhouette = mask.subComp as Graphics || crop.getComponent(Graphics) || crop.addComponent(Graphics);
      const cut = Math.min(8, h * .18), l = -w / 2, r = w / 2, t = h / 2, b = -h / 2;
      silhouette.clear(); silhouette.fillColor = col('#ffffff');
      silhouette.moveTo(l + cut, t); silhouette.lineTo(r - cut, t); silhouette.lineTo(r, t - cut);
      silhouette.lineTo(r, b + cut); silhouette.lineTo(r - cut, b); silhouette.lineTo(l + cut, b);
      silhouette.lineTo(l, b + cut); silhouette.lineTo(l, t - cut); silhouette.close(); silhouette.fill();
      parent = crop;
    }
    const n = this.node('Skin:' + name, parent), sprite = n.addComponent(Sprite);
    const scale = name === 'button' ? .18 : name === 'panel' ? .2 : 1;
    n.setPosition(name === 'button' ? 0 : x + w / 2 - this.w / 2, name === 'button' ? 0 : this.h / 2 - y - h / 2);
    n.setScale(scale, scale, 1);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.type = name === 'insignia' ? Sprite.Type.SIMPLE : Sprite.Type.SLICED;
    sprite.spriteFrame = frame;
    n.getComponent(UITransform)!.setContentSize(w / scale, h / scale);
    sprite.color = col(tone || (name === 'panel' ? '#b6c6d4' : '#ffffff'));
    return true;
  }
  controlIcon(g: Graphics, kind: string, x: number, y: number, size = 18, color = C.dim) {
    const cx = x - this.w / 2, cy = this.h / 2 - y, k = size / 20;
    const line = (points: number[][], close = false) => {
      points.forEach(([xx, yy], i) => i ? g.lineTo(cx + xx * k, cy - yy * k) : g.moveTo(cx + xx * k, cy - yy * k));
      if (close) g.close(); g.stroke();
    };
    g.strokeColor = col(color); g.lineWidth = 1.5;
    if (kind === 'close') { line([[-5,-5],[5,5]]); line([[5,-5],[-5,5]]); }
    else if (kind === 'back' || kind === 'next') line(kind === 'back' ? [[3,-6],[-3,0],[3,6]] : [[-3,-6],[3,0],[-3,6]]);
    else if (kind === 'plus') { line([[-7,0],[7,0]]); line([[0,-7],[0,7]]); }
    else if (kind === 'time' || kind === 'history') { g.circle(cx,cy,8*k); g.stroke(); line([[0,-5],[0,0],[4,2]]); if(kind === 'time') line([[-3,-11],[3,-11]]); }
    else if (kind === 'star') { const points = Array.from({length:10},(_,i)=>{const a=-Math.PI/2+i*Math.PI/5,r=i%2?4:9;return [Math.cos(a)*r,Math.sin(a)*r];}); line(points,true); }
    else if (kind === 'guide') { line([[0,7],[0,-7],[-8,-9],[-8,5],[0,7],[8,5],[8,-9],[0,-7]]); }
    else if (kind === 'profile') { g.circle(cx,cy+4*k,4*k); g.stroke(); line([[-8,8],[-7,3],[-3,0],[3,0],[7,3],[8,8]]); }
    else if (kind === 'ranking') { line([[-7,8],[-7,0],[-3,0],[-3,8]]); line([[-2,8],[-2,-7],[2,-7],[2,8]]); line([[3,8],[3,-3],[7,-3],[7,8]]); }
    else if (kind === 'mission') line([[-9,-6],[-3,-9],[3,-6],[9,-9],[9,6],[3,9],[-3,6],[-9,9],[-9,-6],[-3,-9],[-3,6],[3,9],[3,-6]]);
    else if (kind === 'lobby') { line([[-7,8],[6,-8],[8,-3],[3,-2]]); line([[7,8],[-6,-8],[-8,-3],[-3,-2]]); }
    else if (kind === 'sound' || kind === 'muted') { line([[-8,-3],[-4,-3],[1,-7],[1,7],[-4,3],[-8,3]],true); if(kind==='sound')line([[5,-5],[8,0],[5,5]]);else{line([[4,-4],[10,4]]);line([[10,-4],[4,4]]);} }
    else if (kind === 'language') { g.circle(cx,cy,8*k); g.stroke(); line([[-8,0],[8,0]]); line([[0,-8],[-3,-3],[-3,3],[0,8],[3,3],[3,-3],[0,-8]]); }
    else if (kind === 'effects') { line([[-9,-7],[9,-7],[9,5],[-9,5]],true); line([[0,5],[0,9],[-5,9],[5,9]]); }
    else if (kind === 'refresh') { line([[-7,1],[-7,-4],[-3,-7],[3,-7],[7,-3],[7,0]]); line([[3,-2],[7,0],[9,-4]]); line([[7,3],[4,7],[-3,7],[-7,4]]); }
    else if (kind === 'join') { line([[-2,-8],[8,-8],[8,8],[-2,8]]); line([[-9,0],[3,0],[-1,-4]]); line([[3,0],[-1,4]]); }
    else if (kind === 'bot') { line([[-8,-5],[8,-5],[8,7],[-8,7]],true); line([[0,-5],[0,-9]]); g.circle(cx-3*k,cy,1.5*k); g.circle(cx+3*k,cy,1.5*k); g.stroke(); }
    else if (kind === 'match') { line([[-8,-5],[-4,-5],[5,5],[9,5],[6,2]]); line([[-8,5],[-4,5],[5,-5],[9,-5],[6,-8]]); }
  }
  styleButton(g: Graphics, b: ButtonRect, kind: 'primary' | 'secondary' | 'quiet' = 'secondary', icon = '') {
    const v = b.visual = { x: b.x + 2, y: b.y + 4, w: b.w - 4, h: b.h - 8 };
    if (kind === 'primary') {
      if (!this.artwork('button',v.x,v.y,v.w,v.h,b.disabled?'#75808c99':undefined)) this.rect(g,v.x,v.y,v.w,v.h,b.disabled?'#242d35':'#4a3d24',C.amber,3);
    } else if (kind === 'secondary') this.rect(g,v.x,v.y,v.w,v.h,b.disabled?'#14233188':'#263e50ed',b.disabled?'#72899655':'#8ba9ba',3);
    b.label.color = col(b.disabled ? '#72818a' : kind === 'primary' ? '#fff0d0' : C.white);
    b.label.isBold = kind === 'primary';
    if (icon) {
      this.controlIcon(g,icon,b.x + (b.w <= 54 ? b.w/2 : 20),b.y+b.h/2,18,b.disabled?'#72818a':kind==='primary'?C.action:C.dim);
      if (b.w > 54) {
        b.label.node.setPosition(b.x+32+(b.w-38)/2-this.w/2,this.h/2-b.y-b.h/2);
        b.label.node.getComponent(UITransform)!.setContentSize(b.w-40,b.h-4);
      }
    }
  }
  menuButton(n: Node, g: Graphics, id: string, caption: string, x: number, y: number, w: number,
    kind: 'primary' | 'secondary' | 'quiet' = 'secondary', icon = '', h = 44, disabled = false) {
    const label = this.button(id,caption,x,y,w,h,n);
    this.buttons[this.buttons.length-1].disabled = disabled;
    this.styleButton(g,this.buttons[this.buttons.length-1],kind,icon); return label;
  }
  buttonFeedback() {
    const b = this.pressedButton ? this.buttons.find(b => b.id === this.pressedButton)
      : this.mousePointer ? this.hit(this.mousePointer.x,this.mousePointer.y) : undefined;
    if (!b || b.disabled || !b.label.node.activeInHierarchy || (this.modal && b.label.node.parent !== this.modal && !this.isGlobalAction(b.id))) return;
    const v = b.visual || { x:b.x+3,y:b.y+4,w:b.w-6,h:b.h-8 };
    this.rect(this.globalGraphics,v.x,v.y,v.w,v.h,this.pressedButton?'#e5d5b433':'#e0efff14',this.pressedButton?C.amber:'#bdcfd6aa',3);
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
    const small = this.mouseDesktop, settingsX = right - 44 - (this.touch ? 88 : 0) - (this.screenControl ? 52 : 0);
    this.live('status', settingsX - 40, top + 26, 11, 70, 40, C.white);
    this.button('settings', '', settingsX, top + 6, 44, 44, this.globalControls);
    if (this.screenControl) this.button('screen', '', settingsX + 52, top + 6, 44, 44, this.globalControls);
    this.live('connectionNotice', left + 150, top + 68, 12, Math.min(300, right - left - 140), 28, C.red).node.parent = this.globalControls;
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
    this.button('battleReport', this.t('战况', 'REPORT'), map.x + map.w - 88, map.y + map.h + 6, 88, 44).fontSize = 12;
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
  image(parent: Node, name: string, frame: SpriteFrame | undefined, x: number, y: number, w: number, h: number) {
    if (!frame || w <= 0 || h <= 0) return;
    const node = this.node(name, parent), sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.spriteFrame = frame;
    node.getComponent(UITransform)!.setContentSize(w, h);
    node.setPosition(x + w / 2 - this.w / 2, this.h / 2 - y - h / 2);
    return sprite;
  }
  // A separate overlay after a Sprite preserves the border/text layer ordering.
  coverImage(parent: Node, name: string, frame: SpriteFrame, x: number, y: number, w: number, h: number) {
    const crop = this.node(name, parent);
    crop.setPosition(x + w / 2 - this.w / 2, this.h / 2 - y - h / 2);
    crop.getComponent(UITransform)!.setContentSize(w, h);
    crop.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    const picture = this.node(name + '-Art', crop), sprite = picture.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.spriteFrame = frame;
    const size = Math.max(w, h); picture.getComponent(UITransform)!.setContentSize(size, size);
    return crop;
  }
  artOverlay(parent: Node, name: string) { return this.node(name, parent).addComponent(Graphics); }
  mix(a: string, b: string, t: number) {
    const channels = (value: string) => [1, 3, 5, 7].map((offset) => parseInt(value.slice(offset, offset + 2) || 'ff', 16));
    return '#' + channels(a).map((value, index) => Math.round(value + (channels(b)[index] - value) * t).toString(16).padStart(2, '0')).join('');
  }
  gradient(g: Graphics, x: number, y: number, w: number, h: number, top: string, bottom: string, cut = 0, steps = 12) {
    for (let i = 0; i < steps; i++) {
      const ya = h * i / steps, yb = h * (i + 1) / steps;
      const inset = (v: number) => Math.max(0, cut - v, cut - (h - v));
      g.fillColor = col(this.mix(top, bottom, (i + .5) / steps));
      g.moveTo(x + inset(ya) - this.w / 2, this.h / 2 - y - ya);
      g.lineTo(x + w - inset(ya) - this.w / 2, this.h / 2 - y - ya);
      g.lineTo(x + w - inset(yb) - this.w / 2, this.h / 2 - y - yb);
      g.lineTo(x + inset(yb) - this.w / 2, this.h / 2 - y - yb); g.close(); g.fill();
    }
  }
  plate(g: Graphics, x: number, y: number, w: number, h: number, fill: string, stroke = C.line, cut = 7) {
    if (w <= 0 || h <= 0) return;
    const gold = fill === C.amber, active = fill === C.mint || stroke === C.mint, emphasis = gold || fill === C.mint;
    if (emphasis) stroke = gold ? C.amber : C.mint;
    cut = Math.min(cut, w / 5, h / 4);
    const path = (inset = 0, dy = 0) => {
      const l = x - this.w / 2 + inset, r = x + w - this.w / 2 - inset,
        t = this.h / 2 - y - inset + dy, b = this.h / 2 - y - h + inset + dy, c = Math.max(2, cut - inset);
      g.moveTo(l + c, t); g.lineTo(r - c, t); g.lineTo(r, t - c); g.lineTo(r, b + c);
      g.lineTo(r - c, b); g.lineTo(l + c, b); g.lineTo(l, b + c); g.lineTo(l, t - c); g.close();
    };
    const skinned = gold && g.node.parent === this.modal && this.artwork('button', x + 2, y + 2, w - 4, h - 4);
    if (!skinned) { g.fillColor = col('#01070cb0'); path(0, -3); g.fill(); }
    if (!skinned) this.gradient(g, x, y, w, h, gold ? '#b88c3cf2' : fill === '#382730' ? '#492c37' : active ? '#244b65ed' : '#20384aed', gold ? '#443018fa' : fill === '#382730' ? '#21111d' : '#07121ff2', cut, h > 90 ? 16 : 8);
    if (gold) {
      g.lineWidth = 5; g.strokeColor = col('#f3c36624'); path(); g.stroke();
      g.lineWidth = 3; g.strokeColor = col('#ffe2a04d'); path(); g.stroke();
    }
    g.lineWidth = gold ? 1.5 : 1; g.strokeColor = col(stroke); path(); g.stroke();
    g.strokeColor = col(gold ? '#ffe8ada0' : '#a5cbe229'); path(2); g.stroke();
    this.rect(g, x + cut + 3, y + 3, w - cut * 2 - 6, 1, gold ? '#ffe2a0a0' : '#d3e9f34d');
    this.rect(g, x + cut + 3, y + h - 3, w - cut * 2 - 6, 1, '#010812a0');
    if (gold) {
      for (const side of [-1, 1]) {
        const cx = x + (side < 0 ? 9 : w - 9) - this.w / 2, cy = this.h / 2 - y - h / 2;
        g.strokeColor = col('#efd39388'); g.lineWidth = 1;
        g.moveTo(cx - side * 2, cy + 3); g.lineTo(cx, cy); g.lineTo(cx - side * 2, cy - 3); g.stroke();
      }
    }
  }
  inset(g: Graphics, x: number, y: number, w: number, h: number, accent = C.line) {
    this.gradient(g, x, y, w, h, '#030c17f2', '#1a3041ed', 3, 12);
    g.strokeColor = col('#02070de6'); g.lineWidth = 2; g.rect(x - this.w / 2, this.h / 2 - y - h, w, h); g.stroke();
    g.strokeColor = col(accent); g.lineWidth = 1; g.rect(x + 2 - this.w / 2, this.h / 2 - y - h + 2, w - 4, h - 4); g.stroke();
    this.rect(g, x + 7, y + h - 1, w - 14, 1, '#aec8d047');
    this.rect(g, x + 8, y + 6, 18, 2, accent);
  }
  emblem(g: Graphics, x: number, y: number, radius: number, color = C.amber) {
    const cx = x - this.w / 2, cy = this.h / 2 - y;
    g.strokeColor = col(color); g.lineWidth = 1.5;
    g.circle(cx, cy, radius * .8); g.stroke();
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      g.fillColor = col(this.mix(color, '#142231', .15 + i * .16));
      g.moveTo(cx + side * radius * .7, cy + radius * .15 - i * 5);
      g.lineTo(cx + side * (radius * 1.6 - i * 5), cy + radius * .15 - i * 5);
      g.lineTo(cx + side * (radius * 1.4 - i * 5), cy - radius * .02 - i * 5);
      g.lineTo(cx + side * radius * .65, cy - radius * .02 - i * 5); g.close(); g.fill();
    }
    g.fillColor = col(color);
    for (let i = 0; i < 8; i++) {
      const angle = Math.PI / 2 + i * Math.PI / 4, r = i % 2 ? radius * .25 : radius;
      const px = cx + Math.cos(angle) * r, py = cy + Math.sin(angle) * r;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.close(); g.fill();
    g.fillColor = col('#fff1ca'); g.moveTo(cx, cy + radius); g.lineTo(cx, cy); g.lineTo(cx - radius * .25, cy + radius * .25); g.close(); g.fill();
  }
  icon(g: Graphics, kind: string, x: number, y: number, size = 16, color = C.mint) {
    const cx = x - this.w / 2, cy = this.h / 2 - y, r = size / 2;
    g.strokeColor = col(color); g.fillColor = col(color); g.lineWidth = 1.8;
    if (kind === 'mountain') {
      g.moveTo(cx - r, cy - r * .65); g.lineTo(cx - r * .1, cy + r); g.lineTo(cx + r * .35, cy + r * .1); g.lineTo(cx + r * .7, cy + r * .65); g.lineTo(cx + r * 1.3, cy - r * .65); g.close(); g.fill();
    } else if (kind === 'ranking') {
      for (const [i, h] of [r, r * 1.7, r * 1.3].entries()) { g.rect(cx - r + i * r * .7, cy - r, r * .45, h); g.fill(); }
    } else if (kind === 'book') {
      for (const side of [-1, 1]) {
        g.moveTo(cx + side * 1.5, cy - r * .8); g.lineTo(cx + side * r, cy - r * .5);
        g.lineTo(cx + side * r, cy + r); g.lineTo(cx + side * 1.5, cy + r * .7); g.close(); g.fill();
        g.strokeColor = col('#173147'); g.lineWidth = 1;
        for (const row of [0, .4]) { g.moveTo(cx + side * 3, cy + r * row); g.lineTo(cx + side * (r - 2), cy + r * (row + .15)); g.stroke(); }
      }
    } else if (kind === 'battle') {
      for (const side of [-1, 1]) {
        g.moveTo(cx - side * r * .5, cy - r * .7); g.lineTo(cx + side * r * .8, cy + r * .65);
        g.lineTo(cx + side * r, cy + r); g.lineTo(cx + side * r * .6, cy + r * .8);
        g.lineTo(cx - side * r * .7, cy - r * .5); g.close(); g.fill();
        g.lineWidth = 2.6; g.strokeColor = col(color);
        g.moveTo(cx - side * r * .9, cy - r * .25); g.lineTo(cx - side * r * .25, cy - r * .9);
        g.moveTo(cx - side * r * .6, cy - r * .6); g.lineTo(cx - side * r, cy - r); g.stroke();
      }
    } else if (kind === 'clock') {
      g.circle(cx, cy, r); g.stroke(); g.moveTo(cx, cy + r * .65); g.lineTo(cx, cy); g.lineTo(cx + r * .45, cy - r * .2); g.stroke();
    } else {
      g.circle(cx, cy, r); g.stroke(); g.moveTo(cx - r * 1.35, cy); g.lineTo(cx + r * 1.35, cy); g.moveTo(cx, cy - r * 1.35); g.lineTo(cx, cy + r * 1.35); g.stroke();
    }
  }
  isGlobalAction(id: string) {
    return id === 'settings' || id === 'screen';
  }
  hit(x: number, y: number) {
    return [...this.buttons]
      .reverse()
      .find(
        (b) =>
          !b.disabled &&
          x >= b.x &&
          x <= b.x + b.w &&
          y >= b.y &&
          y <= b.y + b.h &&
          b.label.node.activeInHierarchy &&
          (!this.modal || b.label.node.parent === this.modal || this.isGlobalAction(b.id)),
      );
  }
  blocksBattlefield(x: number, y: number, ignorePriority = false) {
    const map = this.minimapLayout, hit = this.hit(x, y);
    return !!hit && !(ignorePriority && hit.id === 'priority') || y < 58 + this.safe.top ||
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
      const q = point(p); g.fillColor = col('#1c2a2e'); g.circle(q.x, q.y, 5); g.fill();
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
    this.rect(this.modal?.getChildByName('Backdrop')?.getComponent(Graphics) || g, 0, 0, this.w, this.h, '#07121c28');
    if (!this.missionsOpen) {
      const compact = h < 420, wide = right - left >= 680,
        menuY = h - this.safe.bottom - (wide ? 76 : 114),
        titleW = Math.min(wide ? 500 : 390, (right - left) * .62),
        titleH = titleW / 3,
        titleY = Math.min(this.safe.top + (compact ? 70 : 112), menuY - titleH - 46);
      // The title is an authored transparent metal wordmark, not a font approximation.
      if (this.titleArtwork && this.lang === 'zh') this.image(n, 'MetalWordmark', this.titleArtwork, left - 8, titleY, titleW, titleH);
      else {
        const title = this.label(n, this.t('夜航守望', 'OVERWATCH'), left + titleW / 2, titleY + titleH / 2, compact ? 42 : 62, titleW, Math.min(titleH - 20, 76), C.white);
        title.horizontalAlign = Label.HorizontalAlign.LEFT; title.isBold = true;
      }
      const strap = this.label(n, 'N I G H T   O V E R W A T C H', left + titleW / 2, titleY + titleH + 2, compact ? 10 : 12, titleW, 24, C.action);
      strap.horizontalAlign = Label.HorizontalAlign.LEFT;
      const subtitle = this.label(n, this.t('长夜之上，守住归途。', 'ABOVE THE NIGHT. BRING THEM HOME.'), left + titleW / 2, titleY + titleH + 28, 12, titleW, 24, '#b8cbd8');
      subtitle.horizontalAlign = Label.HorizontalAlign.LEFT;
      const menuW = wide ? (right - left - 36) / 4 : Math.min(248, (right - left - 12) / 2);
      const entries = [
        ['missions', this.t('单人模式', 'SINGLE PLAYER'), 'mountain'],
        ['online:menu', this.t('对战大厅', 'BATTLE LOBBY'), 'battle'],
        ['online:ranking', this.t('排行榜', 'LEADERBOARDS'), 'ranking'],
        ['help', this.t('飞行手册', 'FIELD GUIDE'), 'book'],
      ];
      for (const [i, [id, caption, symbol]] of entries.entries()) {
        const x = left + (wide ? i : i % 2) * (menuW + 12), y = menuY + (wide ? 0 : Math.floor(i / 2) * 54), primary = i === 0;
        this.plate(g, x, y, menuW, 48, primary ? C.amber : '#111d21dc', primary ? C.amber : '#8ba9ba', 5);
        if (!primary) {
          this.rect(g, x + 6, y + 5, menuW - 12, 38, '#59778b33');
          this.rect(g, x + 6, y + 12, 2, 24, C.mint);
        }
        this.icon(g, symbol, x + 23, y + 24, 18, primary ? C.action : C.mint);
        const button = this.button(id, caption + '  ›', x, y, menuW, 48, n);
        button.node.setPosition(x + menuW / 2 + 11 - w / 2, h / 2 - y - 24);
        button.node.getComponent(UITransform)!.setContentSize(menuW - 42, 44);
        this.buttons[this.buttons.length - 1].visual = { x: x + 2, y: y + 2, w: menuW - 4, h: 44 };
        button.fontSize = menuW < 170 ? 13 : 15; button.color = col(primary ? C.action : C.white); button.isBold = true;
      }
      if (this.online) {
        const settingsLeft = this.buttons.find(button => button.id === 'settings')!.x;
        const profileW = Math.min(264, settingsLeft - left - 118);
        this.plate(g, left, this.safe.top + 8, profileW, 44, '#111d21ed', C.line, 6);
        this.button('online:profile', playerLabel(this.online.identity) + '  ✎', left, this.safe.top + 8,
          profileW, 44, n).fontSize = 12;
        this.plate(g, left + profileW + 10, this.safe.top + 8, 92, 44, '#111d21ed', C.line, 6);
        this.button('online:history', this.t('对战记录', 'RECORDS'), left + profileW + 10, this.safe.top + 8, 92, 44, n).fontSize = 11;
      }
      return;
    }
    this.rect(this.modal?.getChildByName('Backdrop')?.getComponent(Graphics) || g, 0, 0, this.w, this.h, '#071a2d55');
    this.label(n, this.t('任务地图', 'MISSION MAP'), left + 78, this.safe.top + 80, 22, 156, 42).isBold = true;
    const page = Math.max(0, Math.min(Math.ceil(MISSIONS.length / 3) - 1, this.missionPage));
    const pagerWidth = this.compact ? 88 : 100, pagerY = this.safe.top + 58;
    const nextX = right - pagerWidth, previousX = nextX - pagerWidth - 100;
    for (const [id, x, active, caption] of [
      ['missionsPrevious', previousX, page > 0, this.t('上一页', 'PREV')],
      ['missionsNext', nextX, page < Math.ceil(MISSIONS.length / 3) - 1, this.t('下一页', 'NEXT')],
    ] as const) {
      this.menuButton(n,g,id,caption,x,pagerY,pagerWidth,'secondary',id==='missionsPrevious'?'back':'next',44,!active).fontSize=12;
    }
    this.label(n, `${page * 3 + 1}–${Math.min(MISSIONS.length, page * 3 + 3)} / ${MISSIONS.length}`,
      previousX + pagerWidth + 50, pagerY + 22, 12, 100, 32, C.dim);
    const top = this.safe.top + 110, bottom = h - this.safe.bottom - 58;
    const gap = 10, cw = (right - left - gap * 2) / 3;
    const ch = Math.min(300, Math.max(112, cw * .7), bottom - top - 8);
    const y = top + Math.max(0, bottom - top - 8 - ch) * .35;
    for (const [i, mission] of MISSIONS.slice(page * 3, page * 3 + 3).entries()) {
      const x = left + i * (cw + gap), selected = mission.id === s.mission.id, number = page * 3 + i + 1;
      const unlocked = this.developer || missionUnlocked(this.missionProgress, mission.id), smallCard = ch < 180;
      this.plate(g, x, y, cw, ch, '#101e2c', selected ? C.mint : C.line, 3);
      const artTop = y + 4, artH = ch - 8;
      const artIndex = mission.light === 'night' ? 2 : mission.map === 'highland' || mission.light === 'dusk' ? 1 : 0;
      const artwork = mission.light === 'day' ? this.dayArtwork[number <= 3 ? number - 1 : mission.map === 'highland' ? 1 : number % 3 === 0 ? 2 : 0] : this.missionArtwork[artIndex];
      if (artwork) this.coverImage(n, 'MissionIllustration-' + mission.id, artwork, x + 4, artTop, cw - 8, artH);
      else this.routeGraphic(g, x + 4, artTop, cw - 8, artH, 0, mission.map, mission.light, mission.events);
      const overlay = this.artOverlay(n, 'MissionSurface-' + mission.id);
      this.gradient(overlay, x + 4, artTop, cw - 8, Math.min(40, artH), '#04131bca', '#04131b00');
      this.gradient(overlay, x + 4, artTop + artH * .25, cw - 8, artH * .75, '#04131b00', '#04131bf2', 0, 24);
      this.gradient(overlay, x + 4, y + ch - (smallCard ? 66 : 90), cw - 8, smallCard ? 62 : 86, '#07131f00', '#07131fc9', 0, 18);
      if (selected) {
        overlay.strokeColor = col('#6ad4ff55'); overlay.lineWidth = 5;
        overlay.rect(x - w / 2 + 2, h / 2 - y - ch + 2, cw - 4, ch - 4); overlay.stroke();
      }
      overlay.strokeColor = col(selected ? '#b9edff' : '#58788d'); overlay.lineWidth = selected ? 2 : 1;
      overlay.rect(x - w / 2 + 2, h / 2 - y - ch + 2, cw - 4, ch - 4); overlay.stroke();
      this.rect(overlay, x + 14, y + ch - 3, cw - 28, 2, selected ? C.mint : '#45678055');
      if (selected) {
        const bx = x + cw - 16 - w / 2, by = h / 2 - y - 17;
        overlay.fillColor = col(C.mint); overlay.circle(bx, by, 8); overlay.fill();
        overlay.strokeColor = col('#092032'); overlay.lineWidth = 2;
        overlay.moveTo(bx - 4, by); overlay.lineTo(bx - 1, by - 3); overlay.lineTo(bx + 4, by + 3); overlay.stroke();
      }
      this.label(n, String(number).padStart(3, '0'), x + 29, y + 18, 15, 42, 25, C.action).isBold = true;
      this.label(n, selected ? this.t('当前', 'SELECTED') : unlocked ? light(number) : this.t('锁定', 'LOCKED'), x + cw - (selected ? 62 : 48), y + 18, 10, selected ? 66 : 80, 22, selected ? C.mint : C.white);
      const label = this.button('mission:' + mission.id, text(mission.name, this.lang), x, y, cw, ch, n);
      this.buttons[this.buttons.length - 1].disabled = !unlocked;
      label.node.setPosition(x + cw / 2 - w / 2, h / 2 - y - ch + (smallCard ? 48 : 61));
      label.node.getComponent(UITransform)!.setContentSize(cw - 20, smallCard ? 24 : 26);
      label.fontSize = cw < 180 ? 12 : smallCard ? 15 : 19; label.color = col(unlocked ? C.white : C.dim); label.isBold = true;
      const tier = number <= 3 ? this.t('入门', 'INTRO') : number <= 60 ? this.t('进阶', 'ADVANCED') : this.t('挑战', 'EXPERT');
      this.label(n, `${light(number)} · ${tier} · ` + this.t(`敌方 ${mission.events.length}`, `${mission.events.length} HOSTILES`),
        x + cw / 2, y + ch - (smallCard ? 27 : 36), cw < 180 ? 9 : 11, cw - 16, smallCard ? 16 : 20, '#bdd0dd');
      const status = this.missionProgress.cleared.includes(mission.id) ? this.t('已完成', 'CLEARED')
        : unlocked ? this.developer ? this.t('试玩 · 不计进度', 'PRACTICE') : this.t('可出动', 'AVAILABLE')
          : this.t('完成上一关解锁', 'COMPLETE PREVIOUS');
      this.label(n, status, x + cw / 2, y + ch - (smallCard ? 10 : 15), smallCard ? 9 : 11, cw - 12, smallCard ? 16 : 19, unlocked ? C.mint : C.dim);
    }
    const bw = (right - left - 24) / 3;
    for (const [i, id] of ['homeMenu', 'training', 'start'].entries()) {
      const x = left + i * (bw + 12), primary = id === 'start', selected = id === 'training' && s.mission.mode === 'training';
      this.plate(g, x, bottom, bw, 44, primary ? C.amber : '#1c2a2e', selected ? C.mint : C.line, 3);
      const label = this.button(id, [this.t('返回', 'BACK'), this.t('火控热身', 'FIRE CONTROL'), s.mission.mode === 'training'
        ? this.t('开始热身 →', 'START WARMUP →') : this.t(`出发 ${String(number).padStart(3, '0')} →`, `DEPLOY ${String(number).padStart(3, '0')} →`)][i], x, bottom, bw, 44, n);
      this.buttons[this.buttons.length - 1].disabled = primary && s.mission.mode !== 'training' && !this.developer && !missionUnlocked(this.missionProgress, s.mission.id);
      label.color = col(primary ? C.action : selected ? C.mint : C.white); label.isBold = primary;
    }
  }
  panelFrame(g: Graphics, x: number, y: number, w: number, h: number, accent = C.mint, dim = '#050f1d55', header = true) {
    const backdrop = this.modal?.getChildByName('Backdrop')?.getComponent(Graphics) || g;
    this.rect(backdrop, 0, 0, this.w, this.h, dim);
    const skinned = this.artwork('panel', x, y, w, h);
    // Separate load-bearing frame, recessed display and machined corner hardware.
    if (!skinned) this.plate(g, x - 4, y + 3, w + 8, h + 2, '#162838', '#020b12', 18);
    if (!skinned) this.gradient(g, x, y, w, h, '#35454b', '#101a21', 15, 22);
    this.gradient(g, x + 5, y + 5, w - 10, h - 10, skinned ? '#17282f33' : '#17282f', skinned ? '#070f1644' : '#070f16', 11, 22);
    if (header) this.gradient(g, x + 9, y + 9, w - 18, 36, '#55656725', '#17282f00', 7, 10);
    if (header) this.rect(g, x + 14, y + 47, w - 28, 1, '#b7b09488');
    this.rect(g, x + 14, y + h - 66, w - 28, 1, '#45677c66');
    // Quiet instrument grid and a wing planform live behind the readable controls.
    for (let xx = x + 22; xx < x + w - 20; xx += 24) this.rect(g, xx, y + 51, 1, Math.max(0, h - 120), '#a3c6df07');
    for (let yy = y + 58; yy < y + h - 68; yy += 24) this.rect(g, x + 18, yy, w - 36, 1, '#a3c6df07');
    const cx = x + w / 2 - this.w / 2, cy = this.h / 2 - y - h * .54;
    g.strokeColor = col('#8eafc414'); g.lineWidth = 1;
    g.moveTo(cx, cy + h * .21); g.lineTo(cx + 8, cy + 5); g.lineTo(cx + w * .30, cy - h * .06);
    g.lineTo(cx + w * .30, cy - h * .10); g.lineTo(cx + 7, cy - 12); g.lineTo(cx + 5, cy - h * .20);
    g.lineTo(cx + w * .09, cy - h * .24); g.lineTo(cx - w * .09, cy - h * .24); g.lineTo(cx - 5, cy - h * .20);
    g.lineTo(cx - 7, cy - 12); g.lineTo(cx - w * .30, cy - h * .10); g.lineTo(cx - w * .30, cy - h * .06); g.lineTo(cx - 8, cy + 5); g.close(); g.stroke();
    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      const xx = side < 0 ? x + 4 : x + w - 35, yy = end < 0 ? y + 4 : y + h - 24;
      this.gradient(g, xx, yy, 31, 20, skinned ? '#4b5a6070' : '#4b5a60', skinned ? '#1b2c3444' : '#1b2c34', 5, 6);
      this.rect(g, xx + 5, yy + 3, 21, 1, '#c5d5d363');
      g.fillColor = col('#07131b'); g.circle(xx + 8 - this.w / 2, this.h / 2 - yy - 10, 2.5); g.fill();
      g.strokeColor = col('#d8ba6c80'); g.lineWidth = 1; g.circle(xx + 8 - this.w / 2, this.h / 2 - yy - 10, 2.5); g.stroke();
    }
    this.rect(g, x + 45, y + 3, w - 90, 1, '#e4d19995');
    if (header) this.rect(g, x + w / 2 - 30, y + 47, 60, 2, accent);
    this.rect(g, x + 44, y + h - 5, w - 88, 1, '#c6ac7080');
  }
  renderSettings(n: Node, g: Graphics, s: Simulation, world: World, key: string) {
    const flight = this.toolsOpen, zoom = this.zoomOpen, playing = s.phase === 'playing';
    const short = this.h - this.safe.top - this.safe.bottom < 360;
    const pw = Math.min(flight || zoom ? Math.max(344, Math.min(420, this.w * .5)) : 640,
      this.w - this.safe.left - this.safe.right - 32);
    const ph = Math.min(zoom ? this.rewardsAvailable && nextZoomLimit(this.zoomLimit) ? 248 : 222 : short ? 260 : flight ? 304 : 360, this.h - this.safe.top - this.safe.bottom - 32);
    const px = this.safe.left + (this.w - this.safe.left - this.safe.right - pw) / 2,
      py = this.safe.top + (this.h - this.safe.top - this.safe.bottom - ph) / 2;
    this.panelFrame(g, px, py, pw, ph, C.mint, flight || zoom ? '#050f1d18' : '#050f1d45');
    const title = flight ? this.t('飞行 / 视野', 'FLIGHT / VIEW') : zoom ? this.t('画面 / 倍率', 'DISPLAY / ZOOM')
      : this.t(playing ? '战斗设置' : '设置', playing ? 'BATTLE SETTINGS' : 'SETTINGS');
    const heading = this.label(n, title, px + 16 + (pw - 112) / 2, py + 20, 19, pw - 112, 30);
    heading.horizontalAlign = Label.HorizontalAlign.LEFT; heading.isBold = true;
    const control = (id: string, caption: string, x: number, y: number, w: number, active = false, disabled = false) => {
      const label = this.menuButton(n,g,id,caption,x,y,w,'secondary','',44,disabled);
      if(active)this.rect(g,x+12,y+39,w-24,2,C.mint);
      label.fontSize = w < 100 ? 11 : 13; label.lineHeight = 17;
      label.color = col(disabled ? C.dim : active ? C.mint : C.white); label.isBold = active;
      return label;
    };
    if (flight) control('locate', this.t('定位', 'LOCATE'), px + pw - 80, py - 5, 64);
    else this.label(n, s.duelMode ? this.t('对战继续', 'BATTLE LIVE') : this.t('已暂停', 'PAUSED'), px + pw - 48, py + 20, 10, 64, 24, C.mint);
    if ((flight || zoom) && px - this.safe.left > 160) {
      const x = this.safe.left + 16, w = Math.min(190, px - x - 16);
      this.plate(g, x, py, w, 28, '#111d21dc', undefined, 6);
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
        ] : [['online:profile', this.t('玩家昵称', 'PLAYER NAME')], ['effects', this.reducedEffects ? this.t('特效 · 精简', 'FX · REDUCED') : this.t('特效 · 完整', 'FX · FULL')]]),
      ].filter(([id]) => !(s.duelMode && ['convoy', 'mission', 'supply'].includes(id)) && !(id === 'convoy' && s.mission.mode === 'training') && !(id === 'supply' && !this.rewardsAvailable && !this.pendingSupply));
      const cols = short ? 3 : 2, cw = (inner - (cols - 1) * 16) / cols;
      items.forEach(([id, caption], i) => {
        const bx=x+i%cols*(cw+16),by=top+(playing?step:0)+Math.floor(i/cols)*step;
        const glyph = ({sound:this.muted?'muted':'sound',language:'language',help:'guide','online:profile':'profile',effects:'effects',mission:'mission',convoy:'next',supply:'plus'} as Record<string,string>)[id];
        const label=this.menuButton(n,g,id,caption,bx,by,cw,'quiet',glyph);
        label.fontSize=cw<160?11:13; label.horizontalAlign=Label.HorizontalAlign.LEFT;
        this.rect(g,bx+8,by+43,cw-16,1,'#8ba0ab28');
        if(id==='sound'&&cw>220){
          this.rect(g,bx+cw-54,by+14,38,18,this.muted?'#283b45':'#927744',this.muted?C.line:C.amber,9);
          g.fillColor=col(this.muted?C.dim:C.action);g.circle(bx+cw-(this.muted?44:26)-this.w/2,this.h/2-by-23,6);g.fill();
        } else if(cw>220)this.controlIcon(g,'next',bx+cw-22,by+22,16);
        if(id==='supply'&&s.buff){this.buttons[this.buttons.length-1].disabled=true;label.color=col(C.dim);}
      });
    }
    const by = py + ph - 52, bw = (pw - 40) / 2;
    if (!short) this.rect(g, px + 16, by - 7, pw - 32, 1, '#4c605e77');
    if (playing) this.menuButton(n,g,flight||zoom?'close':'home',flight||zoom?this.t('返回设置','BACK'):this.t('返回基地','BASE'),px+16,by,bw,'quiet','back');
    const width=Math.min(playing?bw:160,200),bx=px+pw-16-width;
    const primary = playing && (flight || zoom || key === 'pause') ? 'resume' : 'close';
    const label = this.menuButton(n,g,primary,playing?this.t('继续战斗','RESUME BATTLE'):this.t('返回','BACK'),bx,by,width,playing?'primary':'secondary',playing?'next':'back');
    label.color = col(C.action); label.isBold = true;
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
      this.plate(g, x, tabY, tabW, 44, active ? '#29423c' : '#1c2a2e', undefined, 6);
      const label = this.button('tab:' + id, caption, x, tabY, tabW, 44, n);
      label.color = col(active ? C.mint : C.dim); label.isBold = active;
      if (active) this.rect(g, x + 12, tabY + 41, tabW - 24, 2, C.mint);
    }
    this.plate(g, px + pw - 94, tabY, 78, 44, '#1c2a2e', C.line, 6);
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
      this.plate(g, x, bottom, width, 44, primary ? C.amber : '#1c2a2e', primary ? undefined : C.line, 6);
      const label = this.button(id, caption, x, bottom, width, 44, n);
      label.color = col(primary ? C.action : C.white); label.isBold = primary;
    }
    if (pw >= 420) this.label(n, this.t('上下滑动查看更多', 'SCROLL FOR MORE'), px + 176 + (pw - 300) / 2, bottom + 22, 10, pw - 308, 26, C.dim);
  }
  inputField(n: Node, g: Graphics, key: 'draftName' | 'draftCode' | 'draftPassword', caption: string, x: number, y: number, width: number) {
    this.label(n, caption, x + 46, y + 22, 12, 92, 40, C.dim);
    this.inset(g, x + 102, y, width - 102, 44);
    const field = this.node(key, n);
    // Configure before preload creates the native input and default labels.
    field.active = false;
    field.setPosition(x + 102 + (width - 102) / 2 - this.w / 2, this.h / 2 - y - 22);
    field.getComponent(UITransform)!.setContentSize(width - 122, 44);
    const edit = field.addComponent(EditBox);
    edit.textLabel = this.label(field, '', this.w / 2, this.h / 2, 14, width - 122, 42);
    edit.placeholder = key === 'draftCode' ? this.t('6位房间号', 'ROOM NUMBER') : key === 'draftPassword' ? this.t('公开房无需密码', 'OPTIONAL FOR PUBLIC ROOM') : '';
    edit.placeholderLabel = this.label(field, edit.placeholder, this.w / 2, this.h / 2, 12, width - 122, 42, C.dim);
    edit.inputMode = EditBox.InputMode.SINGLE_LINE;
    for (const label of [edit.textLabel, edit.placeholderLabel]) {
      label.node.getComponent(UITransform)!.setAnchorPoint(0, 1);
      label.horizontalAlign = Label.HorizontalAlign.LEFT;
      // Label setters use the initial multiline mode; restore single-line alignment.
      label.verticalAlign = Label.VerticalAlign.CENTER;
    }
    edit.maxLength = key === 'draftName' ? 16 : key === 'draftCode' ? 12 : 64;
    edit.inputFlag = key === 'draftPassword' ? EditBox.InputFlag.PASSWORD : EditBox.InputFlag.DEFAULT;
    edit.string = this.online![key];
    field.on(EditBox.EventType.TEXT_CHANGED, () => { this.online![key] = edit.string; });
    field.active = true;
  }
  renderOnline(n: Node, g: Graphics, s: Simulation, result: boolean) {
    const online = this.online!;
    const pw = Math.min(result ? 560 : 760, this.w - this.safe.left - this.safe.right - 32),
      ph = Math.min(result ? 360 : 440, this.h - this.safe.top - this.safe.bottom - 28), px = (this.w - pw) / 2, py = (this.h - ph) / 2;
    this.panelFrame(g,px,py,pw,ph,result?C.amber:C.mint,result?'#050f1d66':'#050f1d55',!result&&!(online.panel==='ranking'&&ph<280));
    const label = (str: string, y: number, size = 14, color = C.white) => this.label(n, str, px + pw / 2, py + y, size, pw - 40, 26, color);
    const button = (id: string, caption: string, x: number, y: number, width: number, primary = false, quiet = false, glyph = '', disabled = false) => {
      disabled ||= online.busy&&['saveName','createConfirm','joinConfirm','match','friend','ready'].includes(id);
      const selected=primary&&(id==='public'||id==='private'||id.startsWith('board:'));
      const text=this.menuButton(n,g,'online:'+id,caption,px+x,py+y,width,primary&&!selected?'primary':quiet?'quiet':'secondary',glyph,44,disabled);
      if(selected){text.color=col(C.mint);text.isBold=true;this.rect(g,px+x+12,py+y+39,width-24,2,C.mint);}
      text.fontSize=pw<600?11:13;
      return this.buttons[this.buttons.length-1];
    };
    const bottom = ph - 54, half = (pw - 44) / 2,
      count = online.panel === 'menu' ? Math.max(1,Math.min(4,Math.floor((bottom-141)/52)))
        : online.panel === 'ranking' ? Math.max(1,Math.min(3,Math.floor((bottom-210)/27)+1)) : ph < 340 ? 2 : 3;
    online.pageSize = count;
    if (online.panel === 'ranking') online.rankPage = Math.min(online.rankPage, Math.max(0, Math.ceil((online.ranking?.top.length || 0) / count) - 1));
    if (online.panel === 'menu') online.roomPage = Math.min(online.roomPage, Math.max(0, Math.ceil(online.rooms.length / count) - 1));
    if (online.panel === 'history') online.historyPage = Math.min(online.historyPage, Math.max(0, Math.ceil((online.history?.matches.length || 0) / count) - 1));
    const titles = { menu: ['对战大厅', 'BATTLE LOBBY'], ranking: ['排行榜', 'LEADERBOARDS'], room: ['作战准备室', 'READY ROOM'],
      profile: ['玩家昵称', 'PLAYER NAME'], create: ['创建房间', 'CREATE ROOM'], join: ['加入房间', 'JOIN ROOM'], history: ['对战记录', 'BATTLE RECORDS'], '': ['', ''] };
    if(!result){
      const heading=this.label(n,text(titles[online.panel],this.lang),px+54+(pw-130)/2,py+26,21,pw-130,32);
      heading.horizontalAlign=Label.HorizontalAlign.LEFT;heading.isBold=true;
      this.controlIcon(g,online.panel==='menu'?'lobby':online.panel==='ranking'?'ranking':online.panel==='history'?'history':'profile',px+31,py+25,22,C.amber);
    }
    if (online.panel !== 'ranking') button('dismiss','',pw-58,4,44,false,true,'close');
    if (result) {
      const short=ph<320,cramped=ph<280,mid=Math.min(short?165:205,bottom-66);
      const ownSeat = online.spectator ? -1 : online.room?.you ?? 0;
      const outcome = (seat: number) => online.room?.players[seat]?.settlement?.outcome
        || (seat === ownSeat ? online.room?.settlement?.outcome : undefined)
        || (online.view?.winner === null ? 'draw' : online.view?.winner === seat ? 'win' : online.view?.winner !== undefined ? 'loss' : '');
      const outcomeText = (value: string) => value === 'win' ? this.t('胜利','WIN') : value === 'loss' ? this.t('失败','LOSS') : value === 'draw' ? this.t('平局','DRAW') : this.t('结算中','PENDING');
      const outcomeColor = (value: string) => value === 'win' ? '#75db9e' : value === 'loss' ? C.red : C.amber;
      const ownOutcome = outcome(ownSeat);
      if(!cramped)this.artwork('insignia',px+pw/2-(short?50:65),py+12,short?100:130,short?37:48);
      label(online.spectator ? this.t('观战结束','MATCH ENDED') : this.t('战斗','BATTLE ') + outcomeText(ownOutcome),cramped?44:short?70:88,short?28:34,online.spectator?C.amber:outcomeColor(ownOutcome)).isBold=true;
      for (let seat = 0; seat < 2; seat++) {
        const player = online.room?.players[seat] || (seat === 0 ? online.identity : online.opponent), result = outcome(seat);
        label((seat === 0 ? this.t('A方','SIDE A') : this.t('B方','SIDE B')) + (seat === ownSeat ? this.t(' · 你',' · YOU') : '')
          + ' · ' + playerLabel(player) + ' · ' + outcomeText(result), (cramped?70:short?99:120)+seat*(cramped?22:23),11,outcomeColor(result));
      }
      const settlement = online.room?.settlement;
      const cw=(pw-56)/2;
      for (let i = 0; i < 2; i++) this.inset(g, px + 20 + i * (pw / 2 - 10), py + mid - 28, pw / 2 - 30, 86, i ? '#ac8e4d99' : '#5b859d99');
      for (let i = 0; i < 2; i++) {
        const cx=px+28+cw*(i+.5);
        this.controlIcon(g,i?'star':'time',cx-cw*.32,py+mid+8,26,i?C.amber:C.dim);
        this.label(n,i?this.t('本局积分','POINTS EARNED'):this.t('作战用时','OPERATION TIME'),cx+14,py+mid-14,11,cw-40,22,C.dim);
        this.label(n,i?settlement?'+'+settlement.points:'—':formatTime(s.time*1000),cx+14,py+mid+13,
          short?24:30,cw-40,40,i?C.action:C.white).isBold=true;
        if (i) this.label(n, settlement?.totalPoints !== undefined ? this.t('总积分 ', 'TOTAL ') + settlement.totalPoints : online.spectator ? this.t('观战不计分', 'SPECTATING · NO POINTS')
          : online.room ? this.t('积分暂不可用', 'POINTS UNAVAILABLE') : this.t('本地练习', 'LOCAL PRACTICE'),cx+14,py+mid+43,11,cw-20,22,C.dim);
      }
      this.rect(g,px+32,py+bottom-7,pw-64,1,'#8ba0ab44');
      const bw=Math.min(210,pw-64);
      button('backLobby',this.t('返回大厅','BACK TO LOBBY'),(pw-bw)/2,bottom,bw,true,false,'back');return;
    }
    if (['profile', 'create', 'join'].includes(online.panel)) {
      if (online.panel === 'profile') {
        this.inputField(n, g, 'draftName', this.t('玩家昵称', 'PLAYER NAME'), px + 18, py + 83, pw - 36);
        label(this.t('2–16个字符，昵称会显示在房间和战绩中', '2–16 CHARACTERS · SHOWN IN ROOMS AND RECORDS'), 151, 11, C.dim);
      } else if (online.panel === 'create') {
        button('public', this.t('公开房间', 'PUBLIC'), 18, 65, half, !online.privateRoom);
        button('private', this.t('好友私密房', 'PRIVATE'), 26 + half, 65, half, online.privateRoom);
        if (online.privateRoom) this.inputField(n, g, 'draftPassword', this.t('房间密码', 'PASSWORD'), px + 18, py + 127, pw - 36);
        else label(this.t('房间将显示在大厅，其他玩家可加入', 'OTHER PILOTS CAN FIND AND JOIN THIS ROOM'), 151, 13, C.dim);
      } else {
        this.inputField(n, g, 'draftCode', this.t('房间号', 'ROOM'), px + 18, py + 73, pw - 36);
        this.inputField(n, g, 'draftPassword', this.t('房间密码', 'PASSWORD'), px + 18, py + 129, pw - 36);
      }
      label(online.message || (online.busy ? this.t('正在处理…', 'PLEASE WAIT…') : online.panel === 'create' && online.privateRoom ? this.t('设置4–64位密码，分享时另行告知好友', 'SET A 4–64 CHARACTER PASSWORD') : ''), bottom - 24, 11, C.amber);
      button('back', this.t('返回', 'BACK'), 18, bottom,100,false,true,'back');
      button(online.panel === 'profile' ? 'saveName' : online.panel === 'create' ? 'createConfirm' : 'joinConfirm',
        online.busy ? this.t('请稍候', 'PLEASE WAIT') : this.t('确定', 'CONFIRM'),pw-198,bottom,180,online.panel !== 'profile'); return;
    }
    if (online.panel === 'ranking') {
      const tabW = (pw - 60) / 4, compact = ph < 280;
      for (const [i, [id, name]] of [['clears', this.t('通关榜', 'CLEARS')], ['level', this.t('关卡榜', 'LEVEL')], ['points', this.t('积分榜', 'POINTS')], ['win-rate', this.t('胜率榜', 'WIN RATE')]].entries())
        button('board:' + id, name, 18 + i * (tabW + 8), compact ? 42 : 61, tabW, online.board === id);
      const mission = MISSIONS[online.level], level = online.board === 'level';
      if (level) { button('previous', this.t('上一关','PREV'), 18, compact ? 86 : 108, 94,false,false,'back',online.level===0); button('next', this.t('下一关','NEXT'), pw - 112, compact ? 86 : 108, 94,false,false,'next',online.level===MISSIONS.length-1); }
      const descriptions = { clears: ['最高通关', 'HIGHEST LEVEL CLEARED'], level: [this.t('第 ','LEVEL ') + String(online.level + 1) + this.t('关 · ',' · ') + text(mission.name, this.lang), this.t('第 ','LEVEL ') + String(online.level + 1) + ' · ' + text(mission.name, this.lang)], points: ['累计积分', 'TOTAL POINTS'], 'win-rate': ['真人对战胜率', 'HUMAN MATCH WIN RATE'] };
      const description=label(text(descriptions[online.board], this.lang), compact ? 108 : 127, 11, C.dim);
      if(level)description.node.getComponent(UITransform)!.setContentSize(pw-244,26);
      const value = (row: NonNullable<Online['ranking']>['top'][number]) => level ? formatTime(row.secondary) : online.board === 'win-rate'
        ? Math.round((row.games ? (row.wins || 0) / row.games : row.score) * 1000) / 10 + '%' : online.board === 'clears' ? this.t('第','') + row.score + this.t('关','') : row.score + this.t('分','');
      const metric = (row: NonNullable<Online['ranking']>['top'][number]) => (level ? this.t('最快 ','BEST ') : online.board==='clears' ? this.t('最高通关 ','LEVEL ') : online.board==='points' ? this.t('积分 ','POINTS ') : this.t('胜率 ','WIN RATE ')) + value(row);
      const rows = online.ranking?.top.slice(online.rankPage * count, (online.rankPage + 1) * count) || [];
      rows.forEach((row, i) => {
        const own = playerId(row) === playerId(online.identity), y = (compact ? 143 : 160) + i * 27;
        if (own) this.plate(g, px + 18, py + y - 12, pw - 36, 26, '#29423c', C.mint, 4);
        const nameW=pw-260, maxName=Math.max(2,Math.floor((nameW-95)/12)), name=Array.from(row.nickname||row.name||'飞行员');
        const caption=playerLabel({...row,nickname:name.length>maxName?name.slice(0,maxName).join('')+'…':name.join('')});
        for (const [captionText,x,width] of [[this.t('第','RANK ')+row.rank+this.t('名',''),18,64],[caption,90,nameW],[metric(row),pw-160,142]] as const) {
          this.label(n,captionText,px+x+width/2,py+y,12,width,26,own?C.mint:C.white).horizontalAlign=Label.HorizontalAlign.LEFT;
        }
      });
      if (!rows.length) label(online.message || (online.ranking ? this.t('暂无成绩，等你创造纪录', 'SET THE FIRST RECORD') : this.t('正在读取…', 'LOADING…')), compact ? 143 : 174, 12, C.dim);
      const me = online.ranking?.me;
      label(me ? this.t('我的排名 第','MY RANK ') + me.rank + this.t('名 · ',' · ') + metric(me) : this.t('你 · 尚无上榜成绩', 'YOU · NOT YET RANKED'), bottom - 24, 11, C.mint);
      button('back',this.t('返回','BACK'),18,bottom,90,false,true,'back');
      button('refresh',this.t('刷新','REFRESH'),114,bottom,94,false,true,'refresh');
      button('pagePrev','',pw-150,bottom,44,false,false,'back',online.rankPage===0);
      button('pageNext','',pw-62,bottom,44,false,false,'next',!online.ranking||online.ranking.top.length<=(online.rankPage+1)*count);
      this.label(n,String(online.rankPage+1),px+pw-84,py+bottom+22,12,40,24,C.dim);
      return;
    }
    if (online.panel === 'history') {
      const summary = online.history?.summary;
      label(summary ? this.t('真人对战 ', 'MATCHES ') + summary.games + this.t(' · 胜 ', ' · W ') + summary.wins + this.t('  负 ', '  L ') + summary.losses
        + this.t('  平 ', '  D ') + summary.draws + ' · ' + Math.round(summary.winRate * 1000) / 10 + '%'
        : this.t('仅记录开局双方都是真人的对局', 'HUMAN MATCHES ONLY'), 63, 12, C.mint);
      const rows = online.history?.matches.slice(online.historyPage * count, (online.historyPage + 1) * count) || [];
      rows.forEach((match, i) => {
        const y = 86 + i * 58, outcome = match.outcome === 'win' ? this.t('胜利', 'WIN') : match.outcome === 'loss' ? this.t('失败', 'LOSS') : this.t('平局', 'DRAW');
        this.plate(g, px + 18, py + y, pw - 36, 52, '#1c2a2e', C.line, 5);
        this.label(n, outcome + ' · ' + (match.opponent.nickname || match.opponent.name || '飞行员') + '  +' + match.points,
          px + pw / 2, py + y + 15, 13, pw - 60, 26, match.outcome === 'win' ? '#75db9e' : match.outcome === 'loss' ? C.red : C.amber);
        const date = new Date(match.finishedAt).toLocaleString(this.lang === 'zh' ? 'zh-CN' : 'en-GB', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        this.label(n, date + ' · ' + formatTime(match.durationMs) + (match.reason === 'disconnect' ? this.t(' · 掉线结算', ' · DISCONNECT') : match.reason === 'abandoned' ? this.t(' · 双方离开', ' · ABANDONED') : ''),
          px + pw / 2, py + y + 36, 10, pw - 60, 22, C.dim);
      });
      if (!rows.length) label(online.message || (online.busy ? this.t('正在读取…', 'LOADING…') : this.t('暂无真人对战记录', 'NO HUMAN MATCHES YET')), 144, 13, C.dim);
      button('menu',this.t('大厅','LOBBY'),18,bottom,90,false,true,'back');
      button('history',this.t('刷新','REFRESH'),114,bottom,94,false,true,'refresh');
      button('historyPrev','',pw-150,bottom,44,false,false,'back',online.historyPage===0);
      button('historyNext','',pw-62,bottom,44,false,false,'next',!online.history||(online.history.matches.length<=(online.historyPage+1)*count&&!online.history.nextCursor));
      this.label(n,String(online.historyPage+1),px+pw-84,py+bottom+22,12,40,24,C.dim);
      return;
    }
    if (online.panel === 'menu') {
      const waiting = online.rooms.filter(room => room.status === 'waiting').length;
      label(online.message || this.t('等待中 ', 'WAITING ') + waiting + this.t(' · 对战中 ', ' · PLAYING ') + (online.rooms.length - waiting), 61, 12, C.amber);
      const rows = online.rooms.slice(online.roomPage * count, (online.roomPage + 1) * count);
      rows.forEach((room, i) => {
        const y=81+i*52;
        this.rect(g,px+20,py+y,pw-40,48,'#1a2d3944');
        if (this.missionArtwork[0]) this.coverImage(n, 'RoomTerrain-' + room.code, this.missionArtwork[0], px + 24, py + y + 5, 38, 38);
        else this.controlIcon(g,room.canJoin?'lobby':'mission',px+43,py+y+23,22,room.canJoin?C.amber:C.mint);
        const names=room.players.map(player=>player.nickname||player.name||'飞行员').join(' / '),textW=pw-176;
        const name=this.label(n,names,px+70+textW/2,py+y+14,13,textW,24,C.white);name.horizontalAlign=Label.HorizontalAlign.LEFT;
        const detail=this.label(n,'#'+room.code+'  ·  '+room.playerCount+'/2  ·  '+(room.status === 'waiting' ? room.canJoin ? this.t('等待加入','WAITING') : this.t('等待开战','READY ROOM') : this.t('对战中','IN BATTLE')),px+70+textW/2,py+y+35,10,textW,20,C.dim);detail.horizontalAlign=Label.HorizontalAlign.LEFT;
        button((room.canJoin?'joinCode:':'watchCode:')+room.code,room.canJoin?this.t('加入','JOIN'):this.t('观战','WATCH'),pw-102,y+2,82);
      });
      if(!rows.length){const yy=ph<280?78:ph<340?108:144;if(ph>=280)this.controlIcon(g,'lobby',px+pw/2,py+yy,34,C.line);label(this.t('空域待命，等你出发','THE SKIES ARE QUIET'),yy+32,16,C.white);if(ph>=340)label(this.t('创建房间邀请好友，或先进行人机练习','CREATE A ROOM FOR FRIENDS OR PRACTICE WITH A BOT'),yy+58,11,C.dim);}
      const cw = (pw - 60) / 4;
      for (const [i,[id,name]] of [['friend',this.t('创建房间','CREATE')],['join',this.t('加入房间','JOIN ROOM')],['match',this.t('随机匹配','RANDOM')],['bot',this.t('人机对战','BOT')]].entries())button(id,name,18+i*(cw+8),bottom-52,cw,i===0,i>1,pw>=660?['plus','join','match','bot'][i]:'');
      this.rect(g,px+20,py+bottom-4,pw-40,1,'#8ba0ab33');
      button('back',this.t('返回','BACK'),18,bottom,82,false,true,'back');
      button('history',this.t('对战记录','RECORDS'),106,bottom,108,false,true,'history');
      button(online.resumeCode?'resumeRoom':'roomsRefresh',online.resumeCode?this.t('重连','REJOIN'):pw<500?'':this.t('刷新','REFRESH'),224,bottom,Math.min(online.resumeCode?110:80,pw-382),false,true,online.resumeCode?'':'refresh');
      button('roomPrev','',pw-150,bottom,44,false,false,'back',online.roomPage===0);
      button('roomNext','',pw-62,bottom,44,false,false,'next',online.rooms.length<=(online.roomPage+1)*count);
      this.label(n,`${online.roomPage+1}/${Math.max(1,Math.ceil(online.rooms.length/count))}`,px+pw-84,py+bottom+22,11,44,24,C.dim);
      return;
    }
    const room = online.room;
    label(room ? this.t('房间号 ', 'ROOM ') + room.code + (room.visibility === 'private' ? this.t(' · 私密', ' · PRIVATE') : '') : online.busy ? this.t('正在连接…', 'CONNECTING…') : '', 78, 20, C.amber);
    for (let i = 0; i < 2; i++) {
      const player = room?.players[i], own = player && playerId(player) === playerId(online.identity), y = 117 + i * 34;
      if (own) this.plate(g, px + 18, py + y - 14, pw - 36, 30, '#29423c', C.mint, 5);
      label(player ? playerLabel(player) + (own ? this.t(' · 你', ' · YOU') : '') + ' · ' + (player.ready ? this.t('已准备', 'READY') : this.t('未准备', 'NOT READY'))
        : this.t('等待另一位飞行员', 'WAITING FOR ANOTHER PILOT'), y, 13, own ? C.mint : C.white);
    }
    label(online.message || this.t('把房间号告诉好友，双方准备后开始', 'TELL YOUR FRIEND THE ROOM NUMBER · BOTH READY TO START'), bottom - 25, 11, C.dim);
    const cw = Math.min(180,(pw - 52) / 3);
    button('backLobby', this.t('离开房间', 'LEAVE'), 18, bottom, cw,false,false,'back');
    if (room?.status === 'waiting' && !online.spectator) {
      button('share', this.t('分享链接', 'SHARE'), 26 + cw, bottom, cw);
      button('ready', room.players[room.you]?.ready ? this.t('取消准备', 'CANCEL READY') : this.t('准备', 'READY UP'), pw-18-cw, bottom, cw);
    }
  }
  renderModal(key: string, s: Simulation, world: World) {
    const family = key.startsWith('online:') ? key.split(':').slice(0, 2).join(':') : key.split(':')[0];
    if (family === this.modalFamily && this.editing) return;
    if (s.phase !== 'playing' && this.online && this.onlineRevision !== this.online.revision) {
      this.onlineRevision = this.online.revision; this.modalKey = '';
    }
    if (key === this.modalKey) return;
    this.buttons = this.buttons.filter((b) => {
      if (b.label.node.parent !== this.root && !this.isGlobalAction(b.id)) {
        return false;
      }
      return true;
    });
    const animate = !this.reducedEffects && family !== this.modalFamily;
    const previous = this.modal;
    if (previous) {
      for (const field of previous.getComponentsInChildren(EditBox)) field.enabled = false;
      const opacity = previous.getComponent(UIOpacity);
      if (animate && opacity) {
        Tween.stopAllByTarget(opacity);
        tween(opacity).to(.12, { opacity: 0 }).call(() => { if (isValid(previous)) previous.destroy(); }).start();
      } else previous.destroy();
    }
    this.pressedButton = '';
    this.modalFamily = family;
    this.modal = undefined;
    this.surfaces = undefined;
    this.scrollNode = undefined;
    this.scroll = 0;
    this.scrollMax = 0;
    this.modalKey = key;
    if (!key) return;
    const n = this.node('Panel', this.root);
    this.modal = n;
    const opacity = n.addComponent(UIOpacity);
    if (animate) { opacity.opacity = 0; tween(opacity).to(.2, { opacity: 255 }, { easing: 'quadOut' }).start(); }
    this.node('Backdrop', n).addComponent(Graphics);
    this.surfaces = this.node('Surfaces', n);
    const g = this.node('Ink', n).addComponent(Graphics);
    if (key === 'entering') {
      const pw = Math.min(480, this.w - 48), px = (this.w - pw) / 2, py = this.h / 2 - 75;
      this.panelFrame(g, px, py, pw, 150, C.amber, '#050f1d38');
      this.label(n, this.t('正在进入战区', 'ENTERING THE BATTLEFIELD'), this.w / 2, py + 54, 25, pw - 30, 46, C.amber).isBold = true;
      this.label(n, this.t('火控系统就绪 · 祝行动顺利', 'FIRE CONTROL READY · GOOD HUNTING'), this.w / 2, py + 105, 13, pw - 30, 32, C.mint);
      return;
    }
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
      this.rect(this.modal?.getChildByName('Backdrop')?.getComponent(Graphics) || g, 0, 0, this.w, this.h, '#05090c55');
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
        this.plate(g, x, cy, cw, ch, active ? '#393528' : '#1c2a2e', active ? C.amber : C.line, 3);
        if (icons) this.supplyIcon(g, id, x + cw / 2, cy + 22);
        const label = this.button('reward:' + id, (active ? '✓ ' : '') + title, x, cy, cw, ch, n);
        label.node.setPosition(x + cw / 2 - this.w / 2, this.h / 2 - cy - (icons ? 50 : 15));
        label.node.getComponent(UITransform)!.setContentSize(cw - 8, 22);
        label.fontSize = pw < 600 ? 12 : 15; label.color = col(active ? C.amber : C.white); label.isBold = true;
        this.label(n, detail, x + cw / 2, cy + (icons ? 84 : 43), icons ? 14 : 11, cw - 10, icons ? 42 : 32, C.white);
        if (icons) this.label(n, active ? this.t('已选择', 'SELECTED') : this.t('点击选择', 'TAP TO SELECT'),
          x + cw / 2, cy + ch - 15, 11, cw - 12, 20, active ? C.amber : C.dim);
      }
      this.label(n, this.supplyMessage || this.t(`已选：${selected[1]} · 启用后立即返回战斗`, `${selected[1]} · RESUME IMMEDIATELY`),
        px + pw / 2, py + ph - 66, 11, pw - 32, 18, this.supplyMessage ? C.red : C.dim);
      const bw = (pw - 40) * .42, y = py + ph - 52;
      this.plate(g, px + 16, y, bw, 44, '#1c2a2e', C.line, 3);
      const skip = this.button('supplyLater', choice ? this.t('留到下次，继续战斗', 'SAVE FOR LATER · RESUME') : this.t('不使用，继续战斗', 'SKIP · RESUME BATTLE'), px + 16, y, bw, 44, n);
      skip.fontSize = pw < 600 ? 11 : 13;
      const bx = px + 24 + bw, ww = pw - 40 - bw;
      this.plate(g, bx, y, ww, 44, s.buff ? '#1c2a2e' : C.amber, s.buff ? C.line : undefined, 3);
      const watch = this.button('supplyWatch', s.buff ? this.t('支援生效中', 'SUPPORT ACTIVE')
        : choice ? this.t('启用并返回战斗', 'ACTIVATE & RESUME') : this.t('看广告并启用', 'WATCH AD & ACTIVATE'), bx, y, ww, 44, n);
      watch.fontSize = pw < 600 ? 13 : 16;
      watch.color = col(s.buff ? C.dim : C.action); watch.isBold = !s.buff;
      return;
    }
    if (key === 'exit') {
      const pw = Math.min(440, this.w - this.safe.left - this.safe.right - 32), ph = 178;
      const px = this.safe.left + (this.w - this.safe.left - this.safe.right - pw) / 2;
      const py = this.safe.top + 58 + (this.h - this.safe.top - this.safe.bottom - 58 - ph) / 2;
      this.panelFrame(g, px, py, pw, ph, C.red);
      this.label(n, this.t('返回基地？', 'RETURN TO BASE?'), px + pw / 2, py + 30, 22, pw - 32, 34).isBold = true;
      this.label(n, s.duelMode ? this.t('离开后30秒内可重回，超时将按失败结算。', 'REJOIN WITHIN 30 SECONDS OR THE MATCH COUNTS AS A LOSS.')
        : this.t('将会中断本次游戏并退出。', 'This will end the current battle and exit.'), px + pw / 2, py + 76, 14, pw - 32, 40, C.dim);
      const bw = (pw - 40) / 2;
      for (const [i, id] of ['exitCancel', 'exitConfirm'].entries()) {
        const x = px + 16 + i * (bw + 8), y = py + ph - 56;
        this.plate(g, x, y, bw, 44, i ? '#382730' : C.amber, i ? '#8f4853' : undefined, 6);
        this.button(id, i ? this.t('确认退出', 'CONFIRM EXIT') : this.t('继续战斗', 'CONTINUE'), x, y, bw, 44, n).color = col(i ? '#ff9b9f' : C.action);
      }
      return;
    }
    if (key === 'pause' || key.startsWith('settings')) { this.renderSettings(n, g, s, world, key); return; }
    if (key.startsWith('advert:')) {
      const pw = Math.min(420, this.w - this.safe.left - this.safe.right - 32);
      const ph = Math.min(244, this.h - this.safe.top - this.safe.bottom - 74);
      const px = this.safe.left + (this.w - this.safe.left - this.safe.right - pw) / 2;
      const py = this.safe.top + 58 + (this.h - this.safe.top - this.safe.bottom - 58 - ph) / 2;
      this.rect(this.modal?.getChildByName('Backdrop')?.getComponent(Graphics) || g, 0, 0, this.w, this.h, '#05090cb8');
      this.plate(g, px, py, pw, ph, C.ink, C.mint, 10);
      this.label(n, this.advert?.mock ? this.t('模拟广告', 'SIMULATED AD') : this.t('广告加载中', 'LOADING AD'),
        px + pw / 2, py + 34, 24, pw - 32, 42, C.white).isBold = true;
      this.label(n, this.advert?.kind === 'supply' ? this.t('完整观看后启用所选支援，并返回战斗', 'COMPLETE TO ACTIVATE SUPPORT AND RESUME')
        : this.t(`完成后解锁 ${nextZoomLimit(this.zoomLimit)}× 放大上限`, `COMPLETE TO UNLOCK ${nextZoomLimit(this.zoomLimit)}× ZOOM`),
        px + pw / 2, py + 80, 14, pw - 32, 36, C.mint);
      if (this.advert?.mock) {
        const bw = (pw - 56) / 2, y = py + ph - 76;
        const b = this.button('adClose', this.t('完成模拟广告', 'COMPLETE MOCK AD'), px + 24, y, bw, 44, n);
        this.plate(g, px + 24, y, bw, 44, C.mint, undefined, 5);
        b.color = col(C.action); b.isBold = true;
        this.plate(g, px + 32 + bw, y, bw, 44, '#1b3038', C.line, 5);
        this.button('adCancel', this.t('取消 · 返回选择', 'CANCEL · GO BACK'), px + 32 + bw, y, bw, 44, n);
      } else this.button('adCancel', this.t('取消领取', 'CANCEL'), px + 24, py + ph - 76, pw - 48, 44, n);
      this.label(n, this.advert?.mock ? this.t('本次为网页模拟 · 无需等待', 'WEB SIMULATION · NO WAIT') : this.t('完成广告后领取奖励', 'COMPLETE THE AD TO CLAIM'),
        px + pw / 2, py + ph - 17, 11, pw - 32, 22, C.dim);
      return;
    }
    const allies = s.units.filter((u) => u.friendly).length;
    const training = s.mission.mode === 'training';
    this.rect(this.modal?.getChildByName('Backdrop')?.getComponent(Graphics) || g, 0, 0, this.w, this.h, '#06111655');
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
        ? training ? this.t('火控热身', 'FIRE CONTROL') : this.t('夜航守望', 'NIGHT OVERWATCH')
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
    if (result) this.button('resultClose', '×', px + pw - 52, py + 4, 44, 44, n);
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
        if (!training) this.button('training', this.t('火控热身', 'FIRE CONTROL'), px + 32 + primaryW, bottom, primaryW, 44, n);
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
      this.emblem(g, px + 66, py + (low ? 73 : 78), low ? 15 : 19, success ? C.amber : '#c99580');
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
              training ? '热身中断，请整备后再战' : s.failure === 'vehicle' ? lostOutpost ? `第 ${s.failedGroup} 据点全灭` : '救援车被毁' : '行动结束',
              training ? 'WARMUP ENDED · REGROUP' : s.failure === 'vehicle' ? lostOutpost ? `OUTPOST ${s.failedGroup} LOST` : 'Rescue vehicle lost' : 'Operation ended',
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
        this.inset(g, x - statW / 2 + 4, statY - 20, statW - 8, low ? 63 : 68, i === 0 ? '#a98c4a80' : '#49657b99');
        if (statW >= 170) this.icon(g, i === 0 ? 'clock' : i === 1 ? 'target' : 'battle', x - statW / 2 + 24, statY + 1, 17, i === 0 ? C.amber : C.mint);
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
          ? this.t('下一任务 →', 'NEXT OPERATION →') : this.t('火控热身', 'FIRE CONTROL'),
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
      this.plate(g, b.x, b.y, b.w, b.h, primary ? C.amber : '#1c2a2e', primary ? C.amber : C.line, 3);
      b.label.color = col(b.id === 'supply' && s.buff && !this.pendingSupply ? C.dim : primary ? C.action : C.white);
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
      left = 12 + this.safe.left, right = w - this.safe.right - 12, by = h - this.footer - this.safe.bottom;
    this.homeBackground.active = s.phase === 'briefing';
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
    else if (this.online?.entering) key = 'entering';
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
      if (this.online?.spectator && (b.id === 'fire' || b.id.startsWith('weapon') || b.id === 'homing')) { b.label.node.active = false; continue; }
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
        b.label.node.active = !key || key === 'home';
        if (!b.label.node.active) continue;
        const gx = b.x + b.w / 2 - w / 2, gy = h / 2 - b.y - b.h / 2, gear = this.globalGraphics;
        gear.strokeColor = col(!key && !world.thermal && s.mission.light === 'day' ? '#123844' : C.white); gear.lineWidth = 2;
        if (b.id === 'screen') {
          for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
            const r = this.screenActive ? 5 : 12, direction = this.screenActive ? 1 : -1;
            gear.moveTo(gx + dx * (r + direction * 7), gy + dy * r);
            gear.lineTo(gx + dx * r, gy + dy * r);
            gear.lineTo(gx + dx * r, gy + dy * (r + direction * 7));
          }
          gear.stroke(); continue;
        }
        for (let i = 0; i < 32; i++) {
          const angle = (i + .5) * Math.PI / 16, radius = i % 4 === 1 || i % 4 === 2 ? 14 : 10.5;
          const x = gx + Math.cos(angle) * radius, y = gy + Math.sin(angle) * radius;
          if (i) gear.lineTo(x, y); else gear.moveTo(x, y);
        }
        gear.close(); gear.fillColor = gear.strokeColor; gear.fill();
        gear.fillColor = col(!key && !world.thermal && s.mission.light === 'day' ? '#b9d7dd' : '#122433');
        gear.circle(gx, gy, 5.5); gear.fill();
      }
    }
    this.buttonFeedback();
    const connection = this.labels.get('connectionNotice')!;
    connection.string = this.online?.connectionLost ? this.t('网络异常 · 正在重连', 'NETWORK LOST · RECONNECTING') : this.online?.offlineNotice || '';
    connection.node.active = s.duelMode && !!connection.string;
    if (connection.node.active) this.plate(this.globalGraphics, left, top + 54, Math.min(300, right - left - 140), 28, '#2f1118ee', C.red, 4);
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
      if (['playing', 'success', 'failure'].includes(s.phase)) this.effects = drawEffects(this.marks, s, world, this.w, this.h, this.reducedEffects);
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
    const clock = Math.floor(s.time);
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
      if (b.id === 'battleReport') {
        this.rect(g, b.x, b.y, b.w, b.h, '#101a1e88', '#9acbb966', 6);
        continue;
      }
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
      this.plate(g, b.x, b.y, b.w, b.h, fire ? danger ? '#482832' : C.mint : selected ? '#29463ee0' : '#101a1ee6', fire && danger ? C.red : selected || fire ? C.mint : '#708a8066', fire ? 12 : 7);
      b.label.color = col(fire && !danger ? C.action : selected ? C.mint : C.white);
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
      if (this.blocksBattlefield(q.x + this.w / 2, this.h / 2 - q.y, true)) continue;
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
