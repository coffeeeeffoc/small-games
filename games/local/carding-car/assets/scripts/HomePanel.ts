import { BlockInputEvents, Color, EventTouch, Graphics, Label, Layers, Node, UITransform } from 'cc';
import { Career, milestones, shopItems } from './Career';
import { defaultSelection, drivers, vehicles, type Selection } from './Selection';
import { themes } from './ThemeCatalog';
import { routes } from './RouteCatalog';
import { menuLayout, sceneryArea, centeredArea } from './MenuLayout';

type Page = 'home' | 'setup' | 'career' | 'shop';
type Category = 'vehicle' | 'decoration' | 'pet' | 'driver' | 'parts';
export type PreviewSelection = Partial<Selection> & { decoration?: string; pet?: string };
type PanelState = { selection: Selection; mode: string; loading: boolean; loadError?: string; error: string; botCount: number; sameBots: boolean };
type Callbacks = {
  choose(field: keyof Selection, delta: number): void;
  mode(): void;
  prepare(): void;
  preview(selection: PreviewSelection): void;
  equip(): void;
  bots(count: number, same: boolean): void;
  settings(): void;
  challenge(stat: 'races' | 'wins' | 'routes'): void;
};
const color = (hex: string) => new Color().fromHEX(hex);
const categoryNames: Record<Category, string> = { vehicle: '赛车', decoration: '装饰', pet: '宠物', driver: '车手服', parts: '零部件' };
const partNames = { engine: '引擎', grip: '轮胎抓地', nitro: '氮气系统' } as const;
const ink = '#704d35';

/** A Cocos-only menu over the live scene: opening a page never loads a catalog. */
export class HomePanel {
  root: Node;
  page: Page = 'home';
  advanced = false;
  private content: Node;
  private category: Category = 'vehicle';
  private itemIndex = 0;
  private milestonePage = 0;
  private notice = '';
  private inputEnabled = true;
  private showingEquipped = false;
  private signature = '';
  private buttons: { label: string; x: number; y: number; width: number; height: number; enabled: boolean }[] = [];
  private state: PanelState = { selection: { ...defaultSelection }, mode: 'standard', loading: true, error: '', botCount: 3, sameBots: false };
  private time = 0;
  private motion: { node: Node; x: number; y: number; kind: 'pulse' | 'float'; phase: number }[] = [];
  private pressed = new Set<Node>();

  constructor(parent: Node, private career: Career, private callbacks: Callbacks) {
    this.root = new Node('HomePanel');
    this.root.layer = Layers.Enum.UI_2D;
    parent.addChild(this.root);
    this.root.addComponent(UITransform).setContentSize(960, 540);
    this.root.addComponent(BlockInputEvents);
    for (const event of [Node.EventType.TOUCH_START, Node.EventType.TOUCH_MOVE, Node.EventType.TOUCH_END, Node.EventType.TOUCH_CANCEL])
      this.root.on(event, (e: EventTouch) => { if (this.inputEnabled) e.propagationStopped = true; });
    this.content = new Node('HomeContent');
    this.content.layer = Layers.Enum.UI_2D;
    this.root.addChild(this.content);
    this.render();
  }
  update(state: PanelState) {
    this.state = { ...state, selection: { ...state.selection } };
    if (this.root.active) this.render();
  }
  tick(dt: number) {
    if (!this.root.active) return;
    this.time += Math.max(0, Math.min(dt, 0.1));
    for (const item of this.motion) {
      if (this.pressed.has(item.node)) continue;
      if (item.kind === 'pulse') {
        const scale = 1 + Math.sin(this.time * 2.8 + item.phase) * 0.018;
        item.node.setScale(scale, scale, 1);
      } else item.node.setPosition(item.x, item.y + Math.sin(this.time * 2 + item.phase) * 4);
    }
  }
  show(page: Page = 'home') {
    if (this.page === 'shop' && page !== 'shop') this.callbacks.equip();
    if (page === 'shop' && this.page !== 'shop') this.callbacks.equip();
    this.showingEquipped = false;
    this.page = page;
    if (page === 'shop' && this.category !== 'parts') {
      const equipped = this.career.profile.equipped[this.category];
      this.itemIndex = Math.max(0, this.items().findIndex(item => item.id === equipped || item.assetId === equipped));
    }
    this.notice = '';
    this.root.active = true;
    this.signature = '';
    this.render();
  }
  hide() {
    if (this.page === 'shop') this.callbacks.equip();
    this.root.active = false;
  }
  setInputEnabled(enabled: boolean) {
    this.inputEnabled = enabled;
    this.root.getComponent(BlockInputEvents)!.enabled = enabled;
    if (enabled) this.root.resumeSystemEvents(true);
    else this.root.pauseSystemEvents(true);
    for (const node of this.pressed) node.setScale(1, 1, 1);
    this.pressed.clear();
  }
  dispose() { this.root.destroy(); }
  snapshot() {
    return { visible: this.root.active, page: this.page, advanced: this.advanced, category: this.category, inputEnabled: this.inputEnabled,
      previewMode: this.showingEquipped ? 'equipped' : 'candidate',
      selectedItem: this.items()[this.itemIndex]?.id, notice: this.state.error || this.notice,
      selection: { ...this.state.selection }, buttons: this.buttons.map(button => ({ ...button, designX: button.x + 480, designY: 270 - button.y })),
      preview: this.page === 'home' ? { x: -80, y: -15, width: 300, height: 230 }
        : this.page === 'setup' ? centeredArea(menuLayout.garage)
        : centeredArea(menuLayout.shop),
      sceneryPreview: this.page === 'setup' ? centeredArea(sceneryArea(this.advanced)) : undefined };
  }
  private items() { return shopItems.filter(item => item.category === this.category); }
  private owned(id: string) { return this.career.profile.owned.includes(id); }
  private equipmentName(category: Exclude<Category, 'parts'>) {
    const id = this.career.profile.equipped[category];
    return shopItems.find(item => item.category === category && (item.id === id || item.assetId === id))?.name || '未装备';
  }
  private graphics(parent = this.content, name = 'Panel') {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    parent.addChild(node);
    node.addComponent(UITransform).setContentSize(960, 540);
    return node.addComponent(Graphics);
  }
  private box(x: number, y: number, width: number, height: number, hex = '#fffaf0', parent = this.content) {
    const g = this.graphics(parent);
    g.fillColor = color(hex);
    g.roundRect(x - width / 2, y - height / 2, width, height, 12);
    g.fill();
    return g;
  }
  private star(g: Graphics, x: number, y: number, radius: number, hex: string) {
    g.fillColor = color(hex);
    for (let i = 0; i < 10; i++) {
      const angle = Math.PI / 2 + i * Math.PI / 5, r = radius * (i % 2 ? 0.46 : 1);
      const px = x + Math.cos(angle) * r, py = y + Math.sin(angle) * r;
      if (!i) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.close(); g.fill();
  }
  private flag(g: Graphics, x: number, y: number, width: number) {
    g.strokeColor = color('#34475b'); g.lineWidth = 3;
    g.moveTo(x, y - 22); g.lineTo(x, y + 10); g.stroke();
    const square = width / 4;
    for (let row = 0; row < 3; row++) for (let column = 0; column < 4; column++) {
      g.fillColor = color((row + column) % 2 ? '#34475b' : '#fffdf3');
      g.rect(x + column * square, y - row * square, square, square); g.fill();
    }
  }
  private arrow(parent: Node, direction: number, x = 0, y = 0, hex = ink) {
    const g = this.graphics(parent, 'Arrow');
    g.strokeColor = color(hex); g.lineWidth = 3;
    g.moveTo(x - direction * 4, y + 9); g.lineTo(x + direction * 5, y); g.lineTo(x - direction * 4, y - 9); g.stroke();
  }
  private icon(kind: string, parent: Node, x: number, y: number) {
    const g = this.graphics(parent, `${kind}Icon`);
    if (kind === 'settings') {
      g.fillColor = color('#478ed1');
      for (let i = 0; i < 32; i++) {
        const angle = i * Math.PI / 16, radius = i % 4 < 2 ? 19 : 15;
        const px = x + Math.cos(angle) * radius, py = y + Math.sin(angle) * radius;
        if (!i) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.close(); g.fill();
      g.fillColor = color('#fffdf3'); g.circle(x, y, 8); g.fill();
      return;
    }
    g.fillColor = color('#8ad8ef'); g.circle(x, y, 29); g.fill();
    g.strokeColor = color('#ffffff'); g.lineWidth = 3; g.circle(x, y, 29); g.stroke();
    if (kind === 'career') {
      g.fillColor = color('#ff9b34'); g.circle(x, y + 2, 22); g.fill();
      g.fillColor = color('#fff4dc'); g.roundRect(x - 16, y - 15, 32, 26, 10); g.fill();
      g.fillColor = color('#704d35');
      for (const offset of [-6, 6]) { g.circle(x + offset, y - 1, 2.5); g.fill(); }
      g.fillColor = color('#ffb49b');
      for (const offset of [-11, 11]) { g.circle(x + offset, y - 8, 3); g.fill(); }
      g.fillColor = color('#ffffff'); g.roundRect(x - 3, y + 13, 6, 10, 2); g.fill();
    } else if (kind === 'shop') {
      g.fillColor = color('#4b99c3'); g.roundRect(x - 20, y - 20, 40, 36, 4); g.fill();
      g.fillColor = color('#ffda63'); g.roundRect(x - 11, y - 17, 12, 19, 2); g.fill(); g.roundRect(x + 5, y - 9, 9, 11, 2); g.fill();
      for (let i = 0; i < 5; i++) {
        g.fillColor = color(i % 2 ? '#fffdf3' : '#ff8b63');
        g.roundRect(x - 23 + i * 9, y + 7, 9, 15, 3); g.fill();
      }
    } else {
      for (const [offset, lift, hex] of [[-13, -2, '#ffb370'], [13, -2, '#9dcaf9'], [0, 9, '#fff3cf']] as const) {
        g.fillColor = color(hex); g.roundRect(x + offset - 9, y + lift - 17, 18, 20, 7); g.fill();
        g.circle(x + offset, y + lift + 1, 10); g.fill();
        g.fillColor = color('#704d35');
        for (const eye of [-3, 3]) { g.circle(x + offset + eye, y + lift + 2, 1.5); g.fill(); }
      }
    }
  }
  private backdrop() {
    if (this.page === 'home') return;
    const holes = this.page === 'setup' ? [
      sceneryArea(this.advanced), menuLayout.garage,
    ] : this.page === 'shop' && this.category !== 'parts' ? [menuLayout.shop] : [];
    const xs = Array.from(new Set([-960, 0, 960, 1920, ...holes.flatMap(hole => [hole.x, hole.x + hole.width])])).sort((a, b) => a - b);
    const ys = Array.from(new Set([-540, 0, 540, 1080, ...holes.flatMap(hole => [hole.y, hole.y + hole.height])])).sort((a, b) => a - b);
    const g = this.graphics(this.content, 'CreamBackdrop');
    g.fillColor = color('#f5e3c7');
    for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) {
      const x = (xs[i] + xs[i + 1]) / 2, y = (ys[j] + ys[j + 1]) / 2;
      if (holes.some(hole => x > hole.x && x < hole.x + hole.width && y > hole.y && y < hole.y + hole.height)) continue;
      g.rect(xs[i] - 480, 270 - ys[j + 1], xs[i + 1] - xs[i], ys[j + 1] - ys[j]); g.fill();
    }
  }
  private label(text: string, x: number, y: number, width: number, height = 36, size = 20, hex = ink, parent = this.content) {
    const node = new Node(text || 'Text');
    node.layer = Layers.Enum.UI_2D;
    parent.addChild(node);
    node.setPosition(x, y);
    node.addComponent(UITransform).setContentSize(width, height);
    const label = node.addComponent(Label);
    label.string = text; label.fontSize = size; label.lineHeight = size * 1.25;
    label.color = color(hex); label.isBold = size >= 17;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    return label;
  }
  private button(text: string, x: number, y: number, width: number, action: () => void, enabled = true, height = 52, accent = false, display = text) {
    const node = new Node(text);
    node.layer = Layers.Enum.UI_2D;
    this.content.addChild(node);
    node.setPosition(x, y);
    const transform = node.addComponent(UITransform);
    const touchWidth = Math.max(60, width), touchHeight = Math.max(60, height);
    transform.setContentSize(touchWidth, touchHeight);
    const faceHeight = height > 70 ? height : Math.min(44, height - 6);
    const g = this.graphics(node, 'ButtonShape');
    g.fillColor = color('#dac8ab');
    g.roundRect(-width / 2, -faceHeight / 2 - 2, width, faceHeight, 12); g.fill();
    g.fillColor = color(enabled ? accent ? '#47cabb' : '#fffaf0' : '#e8dfd0');
    g.roundRect(-width / 2, -faceHeight / 2, width, faceHeight, 12); g.fill();
    g.strokeColor = color(enabled ? accent ? '#34b4a8' : '#ddc8a8' : '#d9cfbf'); g.lineWidth = 1;
    g.roundRect(-width / 2, -faceHeight / 2, width, faceHeight, 12); g.stroke();
    if (display === '‹' || display === '›') this.arrow(node, display === '‹' ? -1 : 1);
    else if (display) this.label(display, 0, 0, width - 16, faceHeight, 17, enabled ? ink : '#9c907e', node);
    this.buttons.push({ label: text, x, y, width: touchWidth, height: touchHeight, enabled });
    let press: { id: number | null; x: number; y: number } | undefined;
    const reset = () => { press = undefined; this.pressed.delete(node); node.setScale(1, 1, 1); };
    node.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
      e.propagationStopped = true;
      if (!enabled || !this.inputEnabled || press) return;
      const p = e.getUILocation();
      press = { id: e.getID(), x: p.x, y: p.y };
      this.pressed.add(node); node.setScale(0.94, 0.94, 1);
    });
    node.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
      e.propagationStopped = true;
      if (press?.id !== e.getID()) return;
      const p = e.getUILocation();
      if (Math.hypot(p.x - press.x, p.y - press.y) > 18) reset();
    });
    node.on(Node.EventType.TOUCH_CANCEL, (e: EventTouch) => { e.propagationStopped = true; reset(); });
    node.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      const activate = this.pressed.has(node) && press?.id === e.getID() && transform.hitTest(e.getLocation()) && enabled && this.inputEnabled;
      reset();
      if (activate) { action(); this.signature = ''; if (this.root.active) this.render(); }
    });
    return node;
  }
  private render() {
    const signature = JSON.stringify([this.page, this.advanced, this.category, this.itemIndex, this.milestonePage, this.showingEquipped, this.notice, this.state, this.career.profile]);
    if (signature === this.signature) return;
    this.signature = signature;
    for (const child of [...this.content.children]) { child.removeFromParent(); child.destroy(); }
    this.buttons = [];
    this.motion = []; this.pressed.clear();
    this.backdrop();
    if (this.page !== 'home') {
      const back = this.button('主页', -410, 224, 52, () => this.show('home'), true, 48, false, '');
      this.arrow(back, -1);
      this.label(this.page === 'setup' ? '出发！' : this.page === 'career' ? '生涯' : '商店', -312, 224, 140, 44, 26);
    }
    this.box(220, 224, 72, 32, '#fffaf0');
    this.label(`Lv.${this.career.level}`, 220, 224, 66, 32, 16, ink);
    this.box(324, 224, 120, 32, '#fffaf0');
    const coins = this.graphics(this.content, 'Coins');
    coins.fillColor = color('#ffd660'); coins.circle(280, 224, 11); coins.fill();
    coins.strokeColor = color('#d38c21'); coins.lineWidth = 2; coins.circle(280, 224, 8); coins.stroke();
    this.star(coins, 280, 224, 5, '#fff4b9');
    this.label(String(this.career.profile.coins), 331, 224, 88, 32, 17, ink);
    const settings = this.button('设置', 424, 224, 48, () => this.callbacks.settings(), true, 48, false, '');
    this.icon('settings', settings, 0, 0);
    if (this.page === 'home') this.home();
    else if (this.page === 'setup') this.setup();
    else if (this.page === 'career') this.careerPage();
    else this.shop();
    const notice = this.state.error || this.notice || (this.state.loading ? '装配中…' : '');
    if (notice) {
      this.box(0, -253, 896, 22, '#fffaf0');
      this.label(notice, 0, -253, 876, 22, 12, this.state.error ? '#ae4436' : ink);
    }
    if (!this.inputEnabled) this.root.pauseSystemEvents(true);
  }
  private home() {
    const logo = this.graphics(this.content, 'PlayfulLogo');
    logo.fillColor = color('#203e56'); logo.roundRect(-453, 129, 285, 100, 36); logo.fill();
    logo.strokeColor = color('#ffffff'); logo.lineWidth = 7; logo.roundRect(-453, 129, 285, 100, 36); logo.stroke();
    for (const [i, letter] of ['咔', '叮', '唓'].entries()) {
      const x = -399 + i * 79, y = 178 + (i === 1 ? 7 : 0);
      this.label(letter, x + 3, y - 5, 95, 96, 70, '#153e55');
      this.label(letter, x, y, 95, 96, 70, ['#ff913b', '#ffd84d', '#55c8f3'][i]);
    }
    this.flag(logo, -193, 225, 27);
    this.star(logo, -321, 224, 13, '#fff2ac');
    const go = this.button('选择比赛  →', 280, -160, 300, () => this.show('setup'), true, 100, true, '');
    this.label('开赛', 0, 2, 172, 76, 49, '#ffffff', go);
    this.arrow(go, 1, 117, 0, '#fff6c9');
    const goArt = this.graphics(go, 'GoFlags');
    this.flag(goArt, -131, 25, 27);
    this.motion.push({ node: go, x: 280, y: -160, kind: 'pulse', phase: 0 });
    for (const [text, short, x, icon, action] of [
      ['生涯 / 领奖', '生涯', -390, 'career', () => this.show('career')],
      ['商店 / 升级', '商店', -275, 'shop', () => this.show('shop')],
    ] as const) {
      const button = this.button(text, x, -180, 100, action, true, 94, false, '');
      this.icon(icon, button, 0, 20);
      this.label(short, 0, -35, 90, 28, 21, '#236384', button);
    }
    // The actual room button belongs to KartGame and overlays this reserved shortcut.
    this.box(-160, -180, 100, 94);
    this.icon('friends', this.content, -160, -160);
    const sparkle = this.graphics(this.content, 'GoSparkle');
    sparkle.node.setPosition(446, -213);
    this.star(sparkle, 0, 0, 15, '#ffe36b');
    this.motion.push({ node: sparkle.node, x: 446, y: -213, kind: 'float', phase: 1.4 });
    const p = this.career.profile;
    if (milestones.some(m => !p.claimed.includes(m.id) && this.career.milestoneProgress(m.id) >= m.target)) {
      const badge = this.graphics(this.content, 'ClaimBadge');
      badge.fillColor = color('#ff704a'); badge.circle(-351, -145, 10); badge.fill();
      this.star(badge, -351, -145, 5, '#fff6d0');
    }
  }
  private setup() {
    const track = sceneryArea(this.advanced), photo = centeredArea(track);
    const frame = this.graphics(this.content, 'ThemePostcard');
    frame.strokeColor = color('#fffaf0'); frame.lineWidth = 6;
    frame.roundRect(photo.x - photo.width / 2 - 2, photo.y - photo.height / 2 - 2, photo.width + 4, photo.height + 4, 5); frame.stroke();
    const selector = (field: keyof Selection, x: number, y: number, left: number, right: number, nameY = y) => {
      const choices = field === 'theme' ? themes.map(t => [t.id, t.name]) : field === 'route' ? routes.map(r => [r.id, r.name]) : field === 'vehicle' ? vehicles : drivers;
      const index = Math.max(0, choices.findIndex(choice => choice[0] === this.state.selection[field]));
      const item = shopItems.find(item => item.category === field && item.assetId === this.state.selection[field]);
      const locked = !!item && !this.owned(item.id);
      this.button(`上一${field === 'theme' ? '主题' : field === 'route' ? '路线' : field === 'vehicle' ? '赛车' : '车手'}`, left, y, 48,
        () => this.callbacks.choose(field, -1), true, 48, false, '‹');
      this.button(`下一${field === 'theme' ? '主题' : field === 'route' ? '路线' : field === 'vehicle' ? '赛车' : '车手'}`, right, y, 48,
        () => this.callbacks.choose(field, 1), true, 48, false, '›');
      this.label(choices[index][1], x, nameY, 272, 28, field === 'theme' ? 22 : 18, locked ? '#9b8066' : ink);
      if (item) this.label(locked ? `未解锁 · ${item.price} 金币` : field === 'vehicle' ? '赛车 · 已拥有' : '车手 · 已拥有',
        x, nameY - 23, 264, 20, 13, locked ? '#b07634' : '#98856c');
      return locked ? item : undefined;
    };
    selector('theme', -232, 162, -410, -54);
    selector('route', -232, this.advanced ? 5 : -101, -410, -54);
    const vehicleLock = selector('vehicle', 234, 42, 62, 410, -81);
    const driverLock = selector('driver', 234, -143, 62, 410, -139);
    if (vehicleLock || driverLock) {
      this.box(234, 123, 202, 28, '#fff3d9ed');
      this.label('未解锁 · 仅供预览', 234, 123, 194, 28, 13, '#a16e32');
    }
    const locked = vehicleLock || driverLock;
    const retry = !!this.state.loadError;
    this.button(retry ? '重新加载' : this.state.loading ? '装配中…' : locked ? '请先解锁' : '进入赛道  →', locked ? 311 : 234, -211, locked ? 246 : 404,
      () => this.callbacks.prepare(), !this.state.loading && (retry || !locked), 54, !locked,
      retry ? '重新加载' : this.state.loading ? '装配中…' : locked ? '请先解锁' : '进入赛道  →');
    if (locked) this.button('去解锁', 108, -211, 136, () => this.openItem(locked.id), true, 54, true);
    const mode = this.button(this.state.mode === 'sprint' ? '一圈冲刺  ‹ 切换 ›' : '三圈竞速  ‹ 切换 ›', -306, -211, 238,
      () => this.callbacks.mode(), true, 48, false, '');
    const selected = this.graphics(mode, 'SelectedMode');
    selected.fillColor = color('#ffe1a1');
    selected.roundRect(this.state.mode === 'sprint' ? 2 : -115, -18, 113, 36, 10); selected.fill();
    this.label('三圈竞速', -58, 0, 112, 34, 16, ink, mode);
    this.label('一圈冲刺', 58, 0, 112, 34, 16, ink, mode);
    this.button(`${this.advanced ? '收起' : '展开'}高级选项`, -88, -211, 106, () => { this.advanced = !this.advanced; }, true, 48, false,
      this.advanced ? '收起  ∧' : '小伙伴  +');
    if (this.advanced) {
      this.box(-232, -96, 408, 132);
      this.label('对手', -380, -63, 66, 28, 16);
      this.button('−', -299, -63, 48, () => this.callbacks.bots(Math.max(0, this.state.botCount - 1), this.state.sameBots), this.state.botCount > 0, 44);
      this.label(this.state.botCount ? `${this.state.botCount} 位` : '单人', -228, -63, 70, 30, 17);
      this.button('+', -157, -63, 48, () => this.callbacks.bots(Math.min(7, this.state.botCount + 1), this.state.sameBots), this.state.botCount < 7, 44);
      this.label('外观', -380, -125, 66, 28, 16);
      this.button('切换小伙伴外观', -214, -125, 256, () => this.callbacks.bots(this.state.botCount, !this.state.sameBots), this.state.botCount > 0, 44, false,
        this.state.sameBots ? '跟我同款  ⇄' : '随机搭配  ⇄');
    } else this.label(this.state.botCount ? `${this.state.botCount} 位小伙伴 · ${this.state.sameBots ? '跟我同款' : '随机搭配'}` : '单人练习', -232, -155, 350, 24, 14, '#998269');
  }
  private openItem(id: string) {
    const item = shopItems.find(entry => entry.id === id);
    if (!item) return;
    this.show('shop');
    this.category = item.category;
    this.itemIndex = this.items().findIndex(entry => entry.id === id);
    this.showingEquipped = false;
    this.callbacks.preview({ [item.category]: item.assetId });
    this.signature = '';
    this.render();
  }
  private careerPage() {
    const p = this.career.profile;
    const level = this.career.levelProgress;
    const ready = milestones.filter(m => !p.claimed.includes(m.id) && this.career.milestoneProgress(m.id) >= m.target);
    const priority = (m: typeof milestones[number]) => p.claimed.includes(m.id) ? 2
      : this.career.milestoneProgress(m.id) >= m.target ? 0 : 1;
    const ordered = [...milestones].sort((a, b) => priority(a) - priority(b));
    const pages = Math.max(1, Math.ceil(ordered.length / 3));
    this.milestonePage = Math.max(0, Math.min(this.milestonePage, pages - 1));
    const leftText = (text: string, x: number, y: number, width: number, size = 16, hex = ink) => {
      const label = this.label(text, x + width / 2, y, width, size + 10, size, hex);
      label.horizontalAlign = Label.HorizontalAlign.LEFT;
      return label;
    };
    const meter = (x: number, y: number, width: number, ratio: number, hex = '#4eb9aa') => {
      const g = this.graphics(this.content, 'CareerProgress');
      g.fillColor = color('#e8ddc8'); g.roundRect(x, y - 3, width, 6, 3); g.fill();
      const filled = width * Math.max(0, Math.min(1, ratio));
      if (filled > 0) {
        g.fillColor = color(hex); g.roundRect(x, y - 3, filled, 6, Math.min(3, filled / 2)); g.fill();
      }
    };

    // A compact driver's passport keeps lifetime progress beside the next goals.
    this.box(-322, -10, 244, 406, '#fff9ec');
    const passport = this.graphics(this.content, 'CareerPassport');
    passport.strokeColor = color('#e5d4b9'); passport.lineWidth = 1;
    passport.roundRect(-438, -207, 232, 394, 11); passport.stroke();
    this.star(passport, -410, 160, 8, '#e7b248');
    this.label('车手护照', -313, 160, 172, 30, 20);
    this.box(-322, 111, 98, 44, '#ffe7a7');
    this.label(`Lv.${this.career.level}`, -322, 111, 90, 38, 25);
    this.label(`成长 ${level.current} / ${level.needed}`, -322, 72, 210, 23, 13, '#90735c');
    meter(-418, 50, 192, level.current / Math.max(1, level.needed));
    passport.strokeColor = color('#eee1ca');
    passport.moveTo(-418, 25); passport.lineTo(-226, 25); passport.stroke();
    for (const [i, stat] of [
      ['完赛', String(p.races)], ['冠军', String(p.wins)],
      ['领奖台', String(p.podiums)], ['路线', `${p.routes.length}/${routes.length}`],
    ].entries()) {
      const x = -382 + (i % 2) * 120, y = -4 - Math.floor(i / 2) * 77;
      this.label(stat[1], x, y, 104, 30, 23, '#427f73');
      this.label(stat[0], x, y - 27, 104, 24, 14, '#90735c');
    }
    passport.moveTo(-418, -141); passport.lineTo(-226, -141); passport.stroke();
    this.label(`已领取 ${p.claimed.length} / ${milestones.length} 个目标`, -322, -169, 212, 26, 14, '#90735c');

    leftText('成长目标', -174, 168, 150, 20);
    this.label(`${ready.length} 项可领取`, 242, 160, 148, 26, 13, ready.length ? '#378879' : '#90735c');
    this.button('一键领取', 386, 160, 124, () => {
      const coins = this.career.profile.coins, xp = this.career.profile.xp;
      this.notice = this.career.claimAll()
        ? `已领取 · +${this.career.profile.coins - coins} 金币 · +${this.career.profile.xp - xp} 成长`
        : this.career.saveError || '暂时没有可领取的奖励';
    }, ready.length > 0, 48, ready.length > 0);
    for (const [i, milestone] of ordered.slice(this.milestonePage * 3, this.milestonePage * 3 + 3).entries()) {
      const y = 89 - i * 104;
      const progress = Math.min(milestone.target, this.career.milestoneProgress(milestone.id));
      const claimed = p.claimed.includes(milestone.id), complete = progress >= milestone.target;
      this.box(137, y, 622, 94, claimed ? '#f7eedf' : complete ? '#eff8eb' : '#fffaf0');
      leftText(milestone.name, -152, y + 24, 304, 17, claimed ? '#90735c' : ink);
      leftText(milestone.description, -152, y, 324, 13, '#90735c');
      meter(-152, y - 27, 232, progress / Math.max(1, milestone.target), claimed ? '#b7b29b' : '#4eb9aa');
      this.label(`${progress}/${milestone.target}`, 130, y - 27, 84, 20, 13, '#90735c');
      this.label(`+${milestone.coins} 金币\n+${milestone.xp} 成长`, 241, y, 114, 48, 14, claimed ? '#a08c72' : '#aa742a');
      const action = claimed ? '已领取' : complete ? '领取奖励' : '去挑战';
      this.button(`${action} · ${milestone.name}`, 371, y, 126, () => {
        if (!complete) { this.callbacks.challenge(milestone.stat); return; }
        this.notice = this.career.claim(milestone.id)
          ? `已领取 · +${milestone.coins} 金币 · +${milestone.xp} 成长`
          : this.career.saveError || '奖励暂未领取，请重试';
      }, !claimed, 48, !claimed && complete, action);
    }
    this.button('‹ 上一页', -114, -198, 120, () => { this.milestonePage--; }, this.milestonePage > 0, 48);
    this.label(`${this.milestonePage + 1} / ${pages}`, 137, -198, 100, 32, 15, '#90735c');
    this.button('下一页 ›', 388, -198, 120, () => { this.milestonePage++; }, this.milestonePage + 1 < pages, 48);
  }

  private shop() {
    for (const [i, category] of (['vehicle', 'decoration', 'pet', 'driver', 'parts'] as const).entries())
      this.button(categoryNames[category], -352 + i * 176, 162, 156, () => {
        this.callbacks.equip(); this.category = category; this.notice = ''; this.showingEquipped = false;
        const equipped = category === 'parts' ? '' : this.career.profile.equipped[category];
        this.itemIndex = Math.max(0, this.items().findIndex(item => item.assetId === equipped));
        const item = this.items()[this.itemIndex];
        if (item) this.callbacks.preview({ [item.category]: item.assetId });
      }, true, 44, category === this.category);
    if (this.category === 'parts') {
      for (const [i, part] of (['engine', 'grip', 'nitro'] as const).entries()) {
        const x = -296 + i * 296, cost = this.career.upgradeCost(part), level = this.career.profile.upgrades[part];
        const maxed = !Number.isFinite(cost) || cost <= 0, affordable = this.career.profile.coins >= cost;
        this.box(x, -51, 276, 338);
        this.label(partNames[part], x, 79, 244, 34, 22);
        this.label(`Lv.${level} / 5`, x, 31, 236, 30, 18, '#468e80');
        const progress = this.graphics();
        for (let n = 0; n < 5; n++) {
          progress.fillColor = color(n < level ? '#4bbcac' : '#e6dccb');
          progress.roundRect(x - 106 + n * 44, -4, 36, 7, 3); progress.fill();
        }
        this.label(part === 'engine' ? '提升加速与极速' : part === 'grip' ? '提升弯道抓地与转向' : '缩短冷却，提升冲刺', x, -43, 244, 48, 15, '#94765b');
        this.label(maxed ? '已达上限' : `${cost} 金币`, x, -96, 236, 30, 19, '#b87727');
        if (!maxed && !affordable) this.label(`还差 ${cost - this.career.profile.coins} 金币`, x, -126, 236, 24, 13, '#94765b');
        this.button(maxed ? '已满级' : `升级${partNames[part]}`, x, -175, 236, () => {
          this.notice = this.career.upgrade(part) ? `${partNames[part]}升级成功` : this.career.saveError || '金币不足';
          this.callbacks.equip();
        }, !maxed && affordable, 50, true, maxed ? '已满级' : '升级');
      }
      this.label('升级在单人比赛中生效 · 好友赛保持统一性能', 0, -233, 850, 20, 13, '#94765b');
      return;
    }
    const items = this.items();
    this.itemIndex = Math.min(this.itemIndex, Math.max(0, items.length - 1));
    const item = items[this.itemIndex];
    this.box(-240, -56, 416, 344);
    if (!item) { this.label('暂无商品', -240, 0, 350); return; }
    const owned = this.owned(item.id), equipped = this.career.profile.equipped[this.category] === item.assetId;
    this.label(item.name, -240, 74, 366, 38, 25);
    this.label(item.description, -240, 25, 342, 50, 16, '#94765b');
    this.label(owned ? equipped ? '已装备' : '已拥有 · 可装备' : `${item.price} 金币`, -240, -34, 340, 32, 20, '#b87727');
    this.button('上一个商品', -397, -94, 48, () => this.selectItem(-1), true, 44, false, '‹');
    this.label(`${this.itemIndex + 1} / ${items.length}`, -240, -94, 200, 30, 15, '#94765b');
    this.button('下一个商品', -83, -94, 48, () => this.selectItem(1), true, 44, false, '›');
    const canBuy = this.career.profile.coins >= item.price;
    if (!owned && !canBuy) this.label(`还差 ${item.price - this.career.profile.coins} 金币 · 完赛可获得`, -240, -137, 370, 24, 13, '#94765b');
    this.button(owned ? equipped ? '已装备' : '装备' : `购买 · ${item.price} 金币`, -240, -182, 368, () => {
      if (!owned) {
        this.notice = this.career.buy(item.id) ? `已拥有${item.name} · 点击装备后用于比赛` : this.career.saveError || '金币不足，完赛可赢取奖金';
        return;
      }
      if (this.career.equip(item.id)) { this.notice = `${item.name}已装备`; this.callbacks.equip(); this.showingEquipped = false; }
      else this.notice = this.career.saveError || '装备未完成，请重试';
    }, !equipped && (owned || canBuy), 52, true);
    this.box(367, 108, 110, 28, '#fffaf0ee');
    this.label(this.state.loading ? '装配中…' : this.showingEquipped || equipped ? '当前装备' : '商品预览', 367, 108, 104, 28, 13, '#48887c');
    this.label(this.showingEquipped ? this.equipmentName(this.category) : item.name, 214, -119, 408, 32, 18);
    this.label(`当前装备：${this.equipmentName(this.category)}`, 214, -209, 420, 26, 14, '#94765b');
    this.button(this.showingEquipped ? '查看此商品' : '查看已装备', 214, -164, 214, () => {
      this.showingEquipped = !this.showingEquipped;
      if (this.showingEquipped) this.callbacks.equip();
      else this.callbacks.preview({ [item.category]: item.assetId });
    }, !this.state.loading && !equipped, 44);
  }
  private selectItem(delta: number) {
    const items = this.items();
    if (!items.length) return;
    this.itemIndex = (this.itemIndex + delta + items.length) % items.length;
    this.notice = ''; this.showingEquipped = false;
    const preview = { [items[this.itemIndex].category]: items[this.itemIndex].assetId };
    this.callbacks.preview(preview);
  }
}
