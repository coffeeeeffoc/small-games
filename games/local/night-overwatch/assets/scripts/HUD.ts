import {
  Camera,
  Canvas,
  EditBox,
  Graphics,
  Label,
  Layers,
  Mask,
  Node,
  Rect,
  ResolutionPolicy,
  Sprite,
  SpriteFrame,
  Texture2D,
  Tween,
  UIOpacity,
  UITransform,
  isValid,
  resources,
  sys,
  tween,
  view,
} from 'cc';
import { BattleReportView } from './BattleReportView';
import { BattleStatusView } from './BattleStatusView';
import { CombatControlsView } from './CombatControlsView';
import { type TimeComparison } from './core/BattleRecords';
import { MAP, type BattlefieldId, type Language, type Point } from './core/Data';
import { type MissionLight } from './core/MissionCatalog';
import { newMissionProgress, type MissionProgress } from './core/MissionProgress';
import { type RewardKind, type SupplyReward } from './core/Rewards';
import { safeArea, watchSafeArea, type CapsuleRect } from './core/SafeArea';
import type { Simulation } from './core/Simulation';
import { type TrainingRecord } from './core/TrainingRecords';
import { type EffectsFrame } from './Effects';
import { HomeView } from './HomeView';
import { HudDrawing } from './HudDrawing';
import { dialog, dialogButton, type DialogOptions } from './Dialog';
import { C, col } from './HudTheme';
import { MissionPanelView } from './MissionPanelView';
import { type Online } from './Online';
import { OnlineLobbyView } from './OnlineLobbyView';
import { ProgressionArt } from './ProgressionArt';
import { ProgressionView } from './ProgressionView';
import type { Quartermaster } from './Quartermaster';
import { SettingsGuideView } from './SettingsGuideView';
import { SocialView } from './SocialView';
import { SupportPanelView } from './SupportPanelView';
import type { World } from './World';
import { WorldOverlayView } from './WorldOverlayView';

type ControlPosition = { x: number; y: number };
export type ButtonRect = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: Label;
  detail?: Label;
  visual?: { x: number; y: number; w: number; h: number; radius?: number; cut?: number };
  disabled?: boolean;
  clip?: { x: number; y: number; w: number; h: number };
};
// 保留控制器使用的状态与入口；具体页面、战斗标记和绘图由各视图负责。
export class HUD {
  private readonly controlsView = new CombatControlsView(this);
  private readonly drawing = new HudDrawing(this);
  private readonly homeView = new HomeView(
    this,
    () => this.titleArtwork,
    () => this.missionArtwork,
  );
  private readonly worldView = new WorldOverlayView(this);
  private readonly battleView = new BattleStatusView(
    this,
    () => this.controlsView.layoutCombatControls(),
    () => this.controlsView.controlTop,
  );
  private readonly supportView = new SupportPanelView(this);
  private readonly reportView = new BattleReportView(this);
  private readonly missionView = new MissionPanelView(this);
  private readonly onlineView = new OnlineLobbyView(this, () => this.missionArtwork);
  private readonly settingsView = new SettingsGuideView(this);
  private readonly socialView = new SocialView(this);
  updatesOpen=false;
  majorUpdate=false;
  listAreas: Array<{
    key: string;
    x: number;
    y: number;
    w: number;
    h: number;
    max: number;
    axis: 'x' | 'y';
    scrollbar?: { x: number; y: number; w: number; h: number; thumbX: number; thumbWidth: number };
  }> = [];
  listScroll: Record<string, number> = {};
  missionFocus: number | undefined;
  safeRevision = 0;

  nativeCapsule = false;
  capsuleRect?: CapsuleRect;
  topRight(y: number, height: number, padding = 12) {
    const right = this.w - this.safe.right - padding;
    const capsule = this.capsuleRect;
    return capsule && y < capsule.bottom + 4 && y + height > capsule.top - 4
      ? Math.min(right, capsule.left - 8)
      : right;
  }
  private semanticKey = '';
  listAt(x: number, y: number) {
    return [...this.listAreas]
      .reverse()
      .find((area) => {
        if (this.conversationModal && area.key !== 'direct') return false;
        const region = area.scrollbar && y >= area.scrollbar.y ? area.scrollbar : area;
        return x >= region.x && x <= region.x + region.w && y >= region.y && y <= region.y + region.h;
      });
  }
  moveList(key: string, amount: number) {
    const area = this.listAreas.find((area) => area.key === key);
    if (!area) return;
    const scrollOffsets = key.startsWith('qm:') ? this.quartermaster!.scrolls : this.listScroll;
    scrollOffsets[key] = Math.max(0, Math.min(area.max, (scrollOffsets[key] || 0) + amount));
    if (key !== 'direct') this.modalKey = 'rebuild';
  }
  seekList(key: string, thumbLeft: number) {
    const area = this.listAreas.find((area) => area.key === key);
    const bar = area?.scrollbar;
    if (!area || !bar) return;
    const fraction = Math.max(0, Math.min(1, (thumbLeft - bar.x) / (bar.w - bar.thumbWidth)));
    const offset = (key.startsWith('qm:') ? this.quartermaster!.scrolls : this.listScroll)[key] || 0;
    if (fraction * area.max !== offset) this.moveList(key, fraction * area.max - offset);
  }
  listViewport(
    parent: Node,
    key: string,
    area: { x: number; y: number; w: number; h: number },
    total: number,
    axis: 'x' | 'y' = 'y',
  ) {
    const maxOffset = Math.max(0, total - (axis === 'x' ? area.w : area.h));
    const scrollOffsets = key.startsWith('qm:') ? this.quartermaster!.scrolls : this.listScroll;
    const offset = (scrollOffsets[key] = Math.max(0, Math.min(maxOffset, scrollOffsets[key] || 0)));
    let scrollbar: HUD['listAreas'][number]['scrollbar'];
    if (maxOffset && axis === 'x') {
      const x = area.x + 16, w = area.w - 32;
      const h = Math.min(44, Math.max(24, area.h - 100));
      const thumbWidth = Math.min(44, w / 2);
      scrollbar = { x, y: area.y + area.h - h, w, h, thumbX: x + (w - thumbWidth) * offset / maxOffset, thumbWidth };
      area = { ...area, h: area.h - h };
    }
    this.listAreas.push({ ...area, key, max: maxOffset, axis, scrollbar });
    const viewport = this.node('Scroll:' + key, parent);
    const centerX = area.x + area.w / 2 - this.w / 2;
    const centerY = this.h / 2 - area.y - area.h / 2;
    viewport.setPosition(centerX, centerY);
    viewport.getComponent(UITransform)!.setContentSize(area.w, area.h);
    viewport.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    // 抵消裁剪节点的位移，让列表内容与按钮热区继续使用同一套屏幕坐标。
    const contentNode = this.node('ScrollContent', viewport);
    contentNode.setPosition(-centerX, -centerY);
    const surfaces = this.node('Surfaces', contentNode);
    const graphics = this.node('Ink', contentNode).addComponent(Graphics);
    const firstButtonIndex = this.buttons.length;
    return {
      n: contentNode,
      surfaces,
      g: graphics,
      offset,
      height: area.h,
      finish: () => {
        // 只给本次列表新增的按钮加裁剪范围，避免滚出视口后仍能点击。
        for (const button of this.buttons.slice(firstButtonIndex)) button.clip = area;
        if (scrollbar) {
          const ink = this.node('ScrollIndicator', parent).addComponent(Graphics);
          const { x, y, w, h, thumbX, thumbWidth } = scrollbar;
          const center = y + h / 2;
          this.plate(ink, x, center - 3, w, 6, '#101f2c', '#385468', 2);
          this.plate(ink, thumbX, center - 7, thumbWidth, 14, C.amber, '#ffe6ae', 3);
          for (const dx of [-5, 0, 5])
            this.rect(ink, thumbX + thumbWidth / 2 + dx - 1, center - 3, 2, 6, C.action);
          if (offset > 1)
            this.label(parent, '‹', area.x + 5, area.y + area.h / 2, 25, 14, 32, C.white);
          if (offset < maxOffset - 1)
            this.label(parent, '›', area.x + area.w - 5, area.y + area.h / 2, 25, 14, 32, C.white);
        }
        if (maxOffset && axis === 'y') {
          const ink = this.node('ScrollIndicator', parent).addComponent(Graphics);
          const x = area.x + area.w - 5;
          const trackLength = Math.max(4, area.h - 32);
          const thumbLength = Math.max(20, (trackLength * area.h) / total);
          this.rect(ink, x, area.y + 16, 3, trackLength, '#253e50');
          this.rect(
            ink,
            x - 1,
            area.y + 16 + ((trackLength - thumbLength) * offset) / maxOffset,
            5,
            thumbLength,
            C.amber,
          );
          const arrow = (y: number, down: boolean) => {
            ink.strokeColor = col(C.white);
            ink.lineWidth = 2;
            const arrowX = x - this.w / 2;
            const arrowY = this.h / 2 - y;
            const direction = down ? -1 : 1;
            ink.moveTo(arrowX - 4, arrowY - direction * 2);
            ink.lineTo(arrowX, arrowY + direction * 2);
            ink.lineTo(arrowX + 4, arrowY - direction * 2);
            ink.stroke();
          };
          if (offset > 1) arrow(area.y + 6, false);
          if (offset < maxOffset - 1) arrow(area.y + area.h - 7, true);
        }
      },
    };
  }
  quartermaster?: Quartermaster;
  progressionArt: ProgressionArt;

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
  pressedPoint?: { x: number; y: number };
  pressedButton = '';
  private uiFrames = new Map<string, SpriteFrame>();
  private artworkRetries = new Map<string, () => void>();
  private surfaces?: Node;
  retryArtwork() {
    this.progressionArt.retry();
    for (const [name, retry] of Array.from(this.artworkRetries)) {
      this.artworkRetries.delete(name);
      retry();
    }
    this.modalKey = 'rebuild';
  }
  get interfaceArtworkReady() {
    return this.quartermaster
      ? this.progressionArt.homeReady
      : this.uiFrames.size === 3 &&
          !!this.titleArtwork &&
          this.missionArtwork.length === 3 &&
          this.dayArtwork.length === 3;
  }
  effects: EffectsFrame = { impacts: [], projectiles: [] };
  buttons: ButtonRect[] = [];
  labels = new Map<string, Label>();
  modal?: Node;
  modalKey = '';
  private onlineRevision = -1;
  private modalFamily = '';
  private coveredModal?: Node;
  private compactModal = false;
  private conversationModal?: Node;
  private conversationPage?: Node;
  private conversationInputs: EditBox[] = [];
  get activeModal() { return this.conversationModal || this.modal; }
  screenControl = false;
  screenActive = false;
  missionsOpen = false;
  storageError = '';
  online?: Online;
  reportOpen = false;
  equipmentOpen = false;
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
  voicePrompts = true;
  autoPriority = true;
  reducedEffects = false;
  toolsOpen = false;
  zoomOpen = false;
  controlsOpen = false;
  layoutEditing = false;
  fireScale = 1;
  controlScale = 1;

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
  controlPositions: Record<string, ControlPosition> = {};
  controlBounds(id: string) {
    return this.controlsView.controlBounds(id);
  }

  placeControl(id: string, position?: ControlPosition) {
    return this.controlsView.placeControl(id, position);
  }
  controlAt(x: number, y: number) {
    return this.controlsView.controlAt(x, y);
  }

  get compact() {
    return this.h < 500;
  }
  get footer() {
    return 60;
  }
  get desktop() {
    return !this.compact && this.w - this.safe.left - this.safe.right >= 900;
  }
  get mouseDesktop() {
    return this.desktop && !this.touch;
  }
  get editing() {
    return this.activeModal?.getComponentsInChildren(EditBox).some((field) => field.isFocused()) ?? false;
  }
  get pageEditing() {
    return this.modal?.getComponentsInChildren(EditBox).some(field => field.enabled && field.isFocused()) ?? false;
  }
  get minimapLayout() {
    const width = this.compact ? 112 : 156;
    return {
      x: this.w - 12 - this.safe.right - width,
      y: this.safe.top + 64,
      w: width,
      h: this.compact ? 84 : 108,
    };
  }
  minimapPoint(x: number, y: number): Point | undefined {
    if (this.activeModal || ![x, y].every(Number.isFinite)) return;
    const map = this.minimapLayout;
    const left = map.x + 8;
    const top = map.y + 25;
    const width = map.w - 16;
    const height = map.h - 33;
    if (x < left || x > left + width || y < top || y > top + height) return;
    return {
      x: ((x - left) / width) * MAP.halfWidth * 2 - MAP.halfWidth,
      z: ((y - top) / height) * MAP.halfDepth * 2 - MAP.halfDepth,
    };
  }
  constructor(parent: Node) {
    this.root = new Node('OverwatchHUD');
    parent.addChild(this.root);
    this.root.layer = Layers.Enum.UI_2D;
    this.progressionArt = new ProgressionArt(this);
    const stopWatchingSafeArea = watchSafeArea(() => this.safeRevision++);
    this.root.once(Node.EventType.NODE_DESTROYED, stopWatchingSafeArea);
    this.root.once(Node.EventType.NODE_DESTROYED, () => this.progressionArt.destroy());
    this.root.once(Node.EventType.NODE_DESTROYED, () => {
      for (const frame of this.artworkFrames) frame.destroy();
    });
    this.root.addComponent(UITransform);
    const canvas = this.root.addComponent(Canvas);
    const cameraNode = new Node('UICamera');
    parent.addChild(cameraNode);
    this.camera = cameraNode.addComponent(Camera);
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
    // These are original unlettered illustrations and a separate transparent wordmark.
    // All mission data, interaction and status text remain live Cocos UI.
    for (const asset of ['title-metal', 'mission-atlas', 'mission-day-atlas']) {
      const load = () =>
        resources.load('ui/' + asset + '/texture', Texture2D, (error, texture) => {
          if (!isValid(this.root)) return;
          if (error) {
            this.artworkRetries.set(asset, load);
            if (!this.pageEditing) this.modalKey = 'rebuild';
            return;
          }
          const count = asset === 'title-metal' ? 1 : 3;
          for (let index = 0; index < count; index++) {
            const frame = new SpriteFrame();
            frame.texture = texture;
            if (count === 3)
              frame.rect = new Rect(
                (index * texture.width) / 3,
                0,
                texture.width / 3,
                texture.height,
              );
            this.artworkFrames.push(frame);
            if (asset === 'mission-day-atlas') this.dayArtwork.push(frame);
            else if (count === 3) this.missionArtwork.push(frame);
            else this.titleArtwork = frame;
          }
          if (!this.pageEditing) this.modalKey = 'rebuild';
        });
      load();
    }
    for (const name of ['panel', 'button', 'insignia']) {
      const load = () =>
        resources.load(`ui/${name}/texture`, Texture2D, (error, texture) => {
          if (!isValid(this.root)) return;
          if (error) {
            this.artworkRetries.set(name, load);
            if (!this.pageEditing) this.modalKey = 'rebuild';
            return;
          }
          const frame = new SpriteFrame();
          frame.texture = texture;
          if (name !== 'insignia') {
            const edge = Math.round(Math.min(texture.width, texture.height) * 0.065);
            frame.insetLeft = frame.insetRight = frame.insetTop = frame.insetBottom = edge;
          }
          this.uiFrames.set(name, frame);
          this.artworkFrames.push(frame);
          if (!this.pageEditing) this.modalKey = 'rebuild';
        });
      load();
    }
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
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    parent.addChild(node);
    node.addComponent(UITransform);
    return node;
  }
  resize() {
    this.mousePointer = undefined;
    this.pressedButton = '';
    const size = view.getFrameSize();
    this.w = size.width;
    this.h = size.height;
    view.setDesignResolutionSize(this.w, this.h, ResolutionPolicy.EXACT_FIT);
    const rect = sys.getSafeAreaRect(false);
    const merged = safeArea(this.w, this.h, {
      left: Math.max(0, rect.x),
      right: Math.max(0, this.w - rect.x - rect.width),
      bottom: Math.max(0, rect.y),
      top: Math.max(0, this.h - rect.y - rect.height),
    });
    this.nativeCapsule = merged.capsule;
    this.capsuleRect = merged.capsuleRect;
    this.safe = { left: merged.left, right: merged.right, top: merged.top, bottom: merged.bottom };
    this.root.getComponent(UITransform)!.setContentSize(this.w, this.h);
    this.root.setPosition(this.w / 2, this.h / 2, 0);
    this.camera.node.setPosition(this.w / 2, this.h / 2, 1000);
    this.camera.orthoHeight = this.h / 2;
    for (const button of this.buttons) button.label.node.destroy();
    this.buttons = [];
    for (const label of Array.from(this.labels.values())) label.node.destroy();
    this.labels.clear();
    for (const label of Array.from(this.unitLabels.values())) label.node.destroy();
    this.unitLabels.clear();
    this.modal?.destroy();
    this.conversationModal?.destroy();
    this.conversationModal = this.conversationPage = undefined;
    this.conversationInputs = [];
    this.coveredModal?.destroy();
    this.coveredModal = undefined;
    this.compactModal = false;
    this.modal = undefined;
    this.modalKey = '';
    this.buildControls();
  }
  label(
    parent: Node,
    caption: string,
    x: number,
    y: number,
    size: number,
    width: number,
    height: number,
    hex = C.white,
  ) {
    const labelNode = this.node(caption.slice(0, 20), parent);
    labelNode.setPosition(x - this.w / 2, this.h / 2 - y);
    labelNode.getComponent(UITransform)!.setContentSize(width, height);
    const label = labelNode.addComponent(Label);
    label.string = caption;
    label.fontFamily = 'Microsoft YaHei';
    label.fontSize = size;
    label.lineHeight = size * 1.45;
    label.color = col(hex);
    label.overflow = Label.Overflow.CLAMP;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    return label;
  }
  button(
    id: string,
    caption: string,
    x: number,
    y: number,
    width: number,
    height = 44,
    parent = this.root,
  ) {
    const label = this.label(
      parent,
      caption,
      x + width / 2,
      y + height / 2,
      this.compact ? 13 : 14,
      width - 8,
      height - 2,
    );
    this.buttons.push({
      id,
      x,
      y,
      w: width,
      h: height,
      label: label,
      visual: { x: x + 2, y: y + 2, w: width - 4, h: height - 4 },
    });
    return label;
  }
  artwork(name: string, x: number, y: number, width: number, height: number, tone?: string) {
    const frame = this.uiFrames.get(name);
    if (!frame || !this.surfaces) return false;
    let parent = this.surfaces;
    if (name === 'button') {
      const crop = this.node('ButtonSilhouette', parent);
      crop.setPosition(x + width / 2 - this.w / 2, this.h / 2 - y - height / 2);
      crop.getComponent(UITransform)!.setContentSize(width, height);
      const mask = crop.addComponent(Mask);
      mask.type = Mask.Type.GRAPHICS_STENCIL;
      const silhouette =
        (mask.subComp as Graphics) || crop.getComponent(Graphics) || crop.addComponent(Graphics);
      const cut = Math.min(8, height * 0.18);
      const left = -width / 2;
      const right = width / 2;
      const top = height / 2;
      const bottom = -height / 2;
      silhouette.clear();
      silhouette.fillColor = col('#ffffff');
      silhouette.moveTo(left + cut, top);
      silhouette.lineTo(right - cut, top);
      silhouette.lineTo(right, top - cut);
      silhouette.lineTo(right, bottom + cut);
      silhouette.lineTo(right - cut, bottom);
      silhouette.lineTo(left + cut, bottom);
      silhouette.lineTo(left, bottom + cut);
      silhouette.lineTo(left, top - cut);
      silhouette.close();
      silhouette.fill();
      parent = crop;
    }
    const spriteNode = this.node('Skin:' + name, parent);
    const sprite = spriteNode.addComponent(Sprite);
    const scale = name === 'button' ? 0.18 : name === 'panel' ? 0.2 : 1;
    spriteNode.setPosition(
      name === 'button' ? 0 : x + width / 2 - this.w / 2,
      name === 'button' ? 0 : this.h / 2 - y - height / 2,
    );
    spriteNode.setScale(scale, scale, 1);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.type = name === 'insignia' ? Sprite.Type.SIMPLE : Sprite.Type.SLICED;
    sprite.spriteFrame = frame;
    spriteNode.getComponent(UITransform)!.setContentSize(width / scale, height / scale);
    sprite.color = col(tone || (name === 'panel' ? '#b6c6d4' : '#ffffff'));
    return true;
  }
  controlIcon(graphics: Graphics, kind: string, x: number, y: number, size = 18, color = C.dim) {
    return this.drawing.controlIcon(graphics, kind, x, y, size, color);
  }
  styleButton(
    graphics: Graphics,
    button: ButtonRect,
    kind: 'primary' | 'secondary' | 'quiet' | 'ghost' = 'secondary',
    icon = '',
  ) {
    return this.drawing.styleButton(graphics, button, kind, icon);
  }
  menuButton(
    parentNode: Node,
    graphics: Graphics,
    id: string,
    caption: string,
    x: number,
    y: number,
    width: number,
    kind: 'primary' | 'secondary' | 'quiet' | 'ghost' = 'secondary',
    icon = '',
    height = 44,
    disabled = false,
  ) {
    return this.drawing.menuButton(
      parentNode,
      graphics,
      id,
      caption,
      x,
      y,
      width,
      kind,
      icon,
      height,
      disabled,
    );
  }
  buttonFeedback() {
    const pointer = this.pressedButton ? this.pressedPoint || this.mousePointer : this.mousePointer;
    const pointed = pointer && this.hit(pointer.x, pointer.y);
    const button = this.pressedButton
      ? pointed?.id === this.pressedButton
        ? pointed
        : this.buttons.find((button) => button.id === this.pressedButton && button.label.node.activeInHierarchy)
      : pointed;
    if (
      !button ||
      button.id === 'qm:wheelTap' ||
      button.id === 'qm:wheelNudge' ||
      button.disabled ||
      !button.label.node.activeInHierarchy ||
      (this.activeModal && !this.inModal(button.label.node) && !(this.isGlobalAction(button.id) && !this.conversationModal))
    )
      return;
    if (button.id === 'fire') {
      const graphics = this.globalGraphics;
      graphics.fillColor = col(this.pressedButton ? '#e5d5b433' : '#e0efff14');
      graphics.strokeColor = col(this.pressedButton ? C.amber : '#bdcfd6aa');
      graphics.lineWidth = 3;
      graphics.circle(
        button.x + button.w / 2 - this.w / 2,
        this.h / 2 - button.y - button.h / 2,
        button.visual ? Math.min(button.visual.w, button.visual.h) / 2 : Math.min(button.w, button.h) / 2 - 5,
      );
      graphics.fill();
      graphics.stroke();
      return;
    }
    const visualBounds = button.visual || {
      x: button.x + 3,
      y: button.y + 4,
      w: button.w - 6,
      h: button.h - 8,
    };
    const { x, y, w, h, cut, radius } = visualBounds;
    const clip = button.clip;
    if (clip && (x < clip.x || y < clip.y || x + w > clip.x + clip.w || y + h > clip.y + clip.h)) return;
    const fill = this.pressedButton ? '#e5d5b433' : '#e0efff14';
    const stroke = this.pressedButton ? C.amber : '#bdcfd6aa';
    if (cut) {
      const ink = this.globalGraphics;
      const path = () => this.drawing.chamferPath(ink, x, y, w, h, cut);
      ink.fillColor = col(fill);
      path();
      ink.fill();
      ink.strokeColor = col(stroke);
      ink.lineWidth = 1;
      path();
      ink.stroke();
      return;
    }
    this.rect(
      this.globalGraphics,
      x, y, w, h, fill, stroke, radius ?? 3,
    );
  }
  live(
    id: string,
    x: number,
    y: number,
    size: number,
    width: number,
    height: number,
    hex = C.white,
  ) {
    const label = this.label(this.root, '', x, y, size, width, height, hex);
    this.labels.set(id, label);
    return label;
  }
  set(id: string, caption: string) {
    const label = this.labels.get(id);
    if (label && label.string !== caption) label.string = caption;
  }
  buildControls() {
    return this.controlsView.buildControls();
  }
  rect(
    graphics: Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    stroke?: string,
    radius = 0,
  ) {
    return this.drawing.rect(graphics, x, y, width, height, fill, stroke, radius);
  }
  image(
    parent: Node,
    name: string,
    frame: SpriteFrame | undefined,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    return this.drawing.image(parent, name, frame, x, y, width, height);
  }
  // A separate overlay after a Sprite preserves the border/text layer ordering.
  coverImage(
    parent: Node,
    name: string,
    frame: SpriteFrame,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    return this.drawing.coverImage(parent, name, frame, x, y, width, height);
  }
  artOverlay(parent: Node, name: string) {
    return this.drawing.artOverlay(parent, name);
  }
  mix(a: string, b: string, t: number) {
    return this.drawing.mix(a, b, t);
  }
  gradient(
    graphics: Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    top: string,
    bottom: string,
    cut = 0,
    steps = 12,
  ) {
    return this.drawing.gradient(graphics, x, y, width, height, top, bottom, cut, steps);
  }
  plate(
    graphics: Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    stroke = C.line,
    cut = 7,
  ) {
    return this.drawing.plate(graphics, x, y, width, height, fill, stroke, cut);
  }
  inset(graphics: Graphics, x: number, y: number, width: number, height: number, accent = C.line) {
    return this.drawing.inset(graphics, x, y, width, height, accent);
  }
  emblem(graphics: Graphics, x: number, y: number, radius: number, color = C.amber) {
    return this.drawing.emblem(graphics, x, y, radius, color);
  }
  icon(graphics: Graphics, kind: string, x: number, y: number, size = 16, color = C.mint) {
    return this.drawing.icon(graphics, kind, x, y, size, color);
  }
  isGlobalAction(id: string) {
    return id === 'online:version' && this.modalFamily === 'home' || id === 'settings' || id === 'screen'||['social:reply','social:inbox','social:dismiss','social:updates'].includes(id);
  }
  corners(graphics: Graphics, x: number, y: number, width: number, height: number, tone: string, arm = 14) {
    return this.drawing.corners(graphics, x, y, width, height, tone, arm);
  }
  inModal(node: Node, modal = this.activeModal) {
    for (let current: Node | null = node; current; current = current.parent)
      if (current === modal) return true;
    return false;
  }
  hit(x: number, y: number, includeDisabled = false) {
    const buttons = [...this.buttons].reverse();
    const hit = [
      ...buttons.filter((button) => this.isGlobalAction(button.id)),
      ...buttons.filter((button) => !this.isGlobalAction(button.id)),
    ].find(
      (button) =>
        (includeDisabled || !button.disabled) &&
        (!button.clip ||
          (x >= button.clip.x &&
            x <= button.clip.x + button.clip.w &&
            y >= button.clip.y &&
            y <= button.clip.y + button.clip.h)) &&
        x >= button.x &&
        x <= button.x + button.w &&
        y >= button.y &&
        y <= button.y + button.h &&
        button.label.node.activeInHierarchy &&
        (!this.activeModal || this.inModal(button.label.node) || this.isGlobalAction(button.id) && !this.conversationModal),
    );
    if (hit?.id === 'qm:wheelTap' && Math.hypot(x - hit.x - hit.w / 2, y - hit.y - hit.h / 2) > hit.w * .43)
      return { ...hit, id: 'qm:wheelNudge' };
    return hit;
  }
  blocksBattlefield(x: number, y: number, ignorePriority = false) {
    const map = this.minimapLayout;
    const control = this.buttons.some(
      (button) =>
        !(ignorePriority && button.id === 'priority') &&
        button.label.node.activeInHierarchy &&
        (!this.activeModal || this.inModal(button.label.node) || this.isGlobalAction(button.id) && !this.conversationModal) &&
        x >= button.x &&
        x <= button.x + button.w &&
        y >= button.y &&
        y <= button.y + button.h,
    );
    return (
      control ||
      y < 46 + this.safe.top ||
      (x >= map.x && x <= map.x + map.w && y >= map.y && y <= map.y + map.h)
    );
  }
  scrollBy(amount: number) {
    this.scroll = Math.max(0, Math.min(this.scrollMax, this.scroll + amount));
    if (this.scrollNode) this.scrollNode.setPosition(0, this.scroll, 0);
  }
  routeGraphic(
    graphics: Graphics,
    x: number,
    y: number,
    previewWidth: number,
    height: number,
    progress = 0,
    map: BattlefieldId = 'valley',
    light: MissionLight = 'day',
    enemies: readonly Point[] = [],
  ) {
    return this.worldView.routeGraphic(
      graphics,
      x,
      y,
      previewWidth,
      height,
      progress,
      map,
      light,
      enemies,
    );
  }
  supplyIcon(graphics: Graphics, kind: string, x: number, y: number) {
    return this.drawing.supplyIcon(graphics, kind, x, y);
  }
  renderHome(parentNode: Node, graphics: Graphics, simulation: Simulation) {
    return this.homeView.renderHome(parentNode, graphics, simulation);
  }
  panelFrame(
    graphics: Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    accent = C.mint,
    dim = '#050f1d55',
    header = true,
  ) {
    return this.drawing.panelFrame(graphics, x, y, width, height, accent, dim, header);
  }
  dialog(n: Node, g: Graphics, options: DialogOptions) {
    return dialog(this, n, g, options);
  }
  dialogButton(n: Node, g: Graphics, id: string, caption: string, x: number, y: number,
    w: number, kind: 'primary' | 'secondary' | 'quiet' | 'ghost' = 'secondary', icon = '', height = 44, disabled = false) {
    return dialogButton(this, n, g, id, caption, x, y, w, kind, icon, height, disabled);
  }
  renderModal(key: string, simulation: Simulation, world: World) {
    this.renderPage(key, simulation, world);
    const open = this.online?.socialOpen && !this.online.peerChoice && !this.online.friendRemoval && !this.updatesOpen && !this.storageError;
    if (!open) {
      if (this.conversationModal) {
        this.buttons = this.buttons.filter(b => !this.inModal(b.label.node, this.conversationModal));
        this.conversationModal.destroy();
        this.conversationModal = undefined;
        this.listAreas = this.listAreas.filter(a => a.key !== 'direct');
        if (this.conversationPage === this.modal)
          for (const field of this.conversationInputs) if (isValid(field)) field.enabled = true;
      }
      this.conversationPage = undefined;
      this.conversationInputs = [];
      return;
    }
    if (this.conversationPage !== this.modal) {
      this.conversationPage = this.modal;
      this.conversationInputs = this.modal?.getComponentsInChildren(EditBox).filter(field => field.enabled) || [];
      for (const field of this.conversationInputs) field.enabled = false;
    }
    const initial = !this.conversationModal;
    this.conversationModal ??= this.node('Conversation', this.root);
    this.socialView.render(this.conversationModal, initial);
  }
  private renderPage(key: string, simulation: Simulation, world: World) {
    // A resized home dropdown still needs its toolbar underneath at the new size.
    if (/^online:(players|friends):/.test(key) && this.quartermaster && !this.quartermaster.page &&
      simulation.phase === 'briefing' && !this.missionsOpen && !this.modal && !this.coveredModal)
      this.renderPage('home', simulation, world);
    if (!key.startsWith('peerOffline:')) {
      if(this.online?.friendRemoval)key='friendRemove';
      else if(this.updatesOpen)key='updates';
    }
    const family = key.startsWith('online:')
      ? key.split(':').slice(0, 2).join(':')
      : key.split(':')[0];
    if (
      (family === 'online:menu' || family === 'online:chat') &&
      this.modalFamily === family &&
      this.modal &&
      this.onlineView.refreshLobby(this.modal, key !== this.modalKey)
    ) {
      this.modalKey = key;
      return;
    }
    // 同一面板内输入时保留节点，避免异步刷新打断输入框焦点。
    if (family === this.modalFamily && this.pageEditing) return;
    if (
      simulation.phase !== 'playing' &&
      this.online &&
      this.onlineRevision !== this.online.revision
    ) {
      this.onlineRevision = this.online.revision;
      this.modalKey = '';
    }
    if (key === this.modalKey) return;
    this.buttons = this.buttons.filter((button) => {
      if (this.conversationModal && this.inModal(button.label.node, this.conversationModal)) return true;
      if (button.label.node.parent !== this.root && !this.isGlobalAction(button.id)) {
        return false;
      }
      return true;
    });
    const quartermaster = this.quartermaster;
    const semantic = [
      ['settings', 'help', 'supply', 'advert'].includes(family) ? key : family,
      this.lang,
      family === 'online:ranking'
        ? [this.online?.board, this.online?.level, this.online?.rankingVersion].join(':')
        : '',
      family === 'online:create' ? this.online?.privateRoom : '',
      key.startsWith('progression:') ? quartermaster?.page : '',
      quartermaster?.section,
      quartermaster?.term,
      quartermaster?.mode,
      quartermaster?.selectedSkill,
      quartermaster?.detail,
      quartermaster?.info,
      !!quartermaster?.confirmation,
      quartermaster?.leaveTo !== undefined,
      quartermaster?.gift
        ? quartermaster.gift.started
          ? 'opening'
          : quartermaster.gift.opened
            ? 'rewards'
            : 'received'
        : '',
    ].join('|');
    // 轮询数据变化只刷新内容；真正切换页面或页签时才播放淡入淡出。
    const animate = !this.reducedEffects && semantic !== this.semanticKey;
    this.semanticKey = semantic;
    this.listAreas = this.listAreas.filter(a => this.conversationModal && a.key === 'direct');
    const compact = ['peerOffline', 'friendRemove', 'settings', 'pause', 'online:players', 'online:friends', 'online:profile', 'online:create', 'online:join'].includes(family);
    let previous = this.modal;
    if (compact && !this.compactModal && previous) {
      this.coveredModal?.destroy();
      this.coveredModal = previous;
      for (const field of previous.getComponentsInChildren(EditBox)) field.enabled = false;
      previous = undefined;
    } else if (!compact) {
      this.coveredModal?.destroy();
      this.coveredModal = undefined;
    }
    this.compactModal = compact;
    if (previous) {
      // 淡出节点尚未销毁时先停用输入，避免旧面板继续接收文本。
      for (const field of previous.getComponentsInChildren(EditBox)) field.enabled = false;
      const opacity = previous.getComponent(UIOpacity);
      if (animate && opacity) {
        Tween.stopAllByTarget(opacity);
        tween(opacity)
          .to(0.12, { opacity: 0 })
          .call(() => {
            if (isValid(previous)) previous.destroy();
          })
          .start();
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
    const parentNode = this.node('Panel', this.root);
    this.modal = parentNode;
    const opacity = parentNode.addComponent(UIOpacity);
    if (animate) {
      opacity.opacity = 0;
      tween(opacity).to(0.16, { opacity: 255 }, { easing: 'quadOut' }).start();
    }
    this.node('Backdrop', parentNode).addComponent(Graphics);
    this.surfaces = this.node('Surfaces', parentNode);
    const graphics = this.node('Ink', parentNode).addComponent(Graphics);
    if (family === 'peerOffline') { this.supportView.renderPeerOffline(parentNode, graphics); return; }
    if(family==='friendRemove'){this.socialView.renderRemoval(parentNode,graphics);return;}
    if(key==='updates'){this.settingsView.renderUpdates(parentNode,graphics);return;}
    if (key.startsWith('storageError:')) {
      this.supportView.renderStorageError(parentNode, graphics, simulation, key);
      return;
    }
    if (
      this.quartermaster &&
      (key === 'home' ||
        key.startsWith('progression:') ||
        key === 'success' ||
        key === 'failure' ||
        key === 'duelResult')
    ) {
      new ProgressionView(
        this,
        this.quartermaster,
        this.progressionArt,
        parentNode,
        graphics,
        this.surfaces,
      ).render(simulation, ['success', 'failure', 'duelResult'].includes(key));
      return;
    }
    if (this.quartermaster && (key === 'missions' || key.startsWith('online:'))) {
      const missions = key === 'missions';
      const required = key.startsWith('online:menu')
        ? ['skins', 'night-ui-serif', '03-mode-selection']
        : [];
      if (
        new ProgressionView(
          this,
          this.quartermaster,
          this.progressionArt,
          parentNode,
          graphics,
          this.surfaces,
        ).loading(
          required,
          missions ? 'homeMenu' : 'online:back',
          missions && (this.missionArtwork.length !== 3 || this.dayArtwork.length !== 3),
          missions &&
            ['mission-atlas', 'mission-day-atlas'].some((name) => this.artworkRetries.has(name)),
        )
      )
        return;
    }
    if (key === 'entering') {
      this.supportView.renderEntering(parentNode, graphics, simulation, key);
      return;
    }
    if (key.startsWith('online:') || key === 'duelResult') {
      this.onlineView.renderOnline(parentNode, graphics, simulation, key === 'duelResult');
      return;
    }
    if (key === 'home' || key === 'missions') {
      this.renderHome(parentNode, graphics, simulation);
      return;
    }
    if (key.startsWith('report:')) {
      this.reportView.render(parentNode, graphics, simulation);
      return;
    }
    if (key.startsWith('help')) {
      this.settingsView.renderGuide(parentNode, graphics);
      return;
    }
    if (key.startsWith('countdown:')) {
      this.supportView.renderCountdown(parentNode, graphics, simulation, key);
      return;
    }
    if (key.startsWith('supply:')) {
      this.supportView.renderSupply(parentNode, graphics, simulation, key);
      return;
    }
    if (key === 'exit') {
      this.supportView.renderExit(parentNode, graphics, simulation, key);
      return;
    }
    if (key === 'pause' || key.startsWith('settings')) {
      this.settingsView.renderSettings(parentNode, graphics, simulation, world, key);
      return;
    }
    if (key.startsWith('advert:')) {
      this.supportView.renderAdvert(parentNode, graphics, simulation, key);
      return;
    }
    this.missionView.render(parentNode, graphics, simulation, key);
  }
  supplyLabel(simulation: Simulation) {
    return this.pendingSupply
      ? this.t('战斗补给 · 待领取', 'SUPPLY · CLAIM')
      : simulation.buff
        ? this.t('战斗补给\n增益生效中', 'COMBAT SUPPLY\nBUFF ACTIVE')
        : this.t('战斗补给', 'COMBAT SUPPLY');
  }
  update(simulation: Simulation, world: World) {
    this.battleView.update(simulation, world);
    this.socialView.updateBanner();
    this.conversationModal?.setSiblingIndex(this.root.children.length - 1);
  }

  drawMinimap(simulation: Simulation) {
    return this.worldView.drawMinimap(simulation);
  }
  drawWorld(simulation: Simulation, world: World) {
    return this.worldView.drawWorld(simulation, world);
  }
}
