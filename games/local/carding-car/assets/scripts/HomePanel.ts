import { BlockInputEvents, Color, EventTouch, Graphics, Label, Layers, Node, UITransform } from 'cc';
import { Career, milestones, shopItems } from './Career';
import { defaultSelection, drivers, vehicles, type Selection } from './Selection';
import { themes } from './ThemeCatalog';
import { routes } from './RouteCatalog';

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
      this.root.on(event, (e: EventTouch) => { e.propagationStopped = true; });
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
  dispose() { this.root.destroy(); }
  snapshot() {
    return { visible: this.root.active, page: this.page, advanced: this.advanced, category: this.category,
      selectedItem: this.items()[this.itemIndex]?.id, notice: this.state.error || this.notice,
      selection: { ...this.state.selection }, buttons: this.buttons.map(button => ({ ...button, designX: button.x + 480, designY: 270 - button.y })),
      preview: this.page === 'home' ? { x: -80, y: -15, width: 300, height: 230 }
        : this.page === 'setup' ? { x: 230, y: 2.5, width: 380, height: 225 }
        : { x: 216, y: 17, width: 444, height: 250 },
      sceneryPreview: this.page === 'setup' ? { x: -230, y: 24, width: 396, height: 208 } : undefined };
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
  private box(x: number, y: number, width: number, height: number, hex = '#fff5e5f2', parent = this.content) {
    const g = this.graphics(parent);
    g.fillColor = color(hex);
    g.roundRect(x - width / 2, y - height / 2, width, height, 14);
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
    g.strokeColor = color(hex); g.lineWidth = 6;
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
      { x: 52, y: 142, width: 396, height: 208 }, { x: 520, y: 155, width: 380, height: 225 },
    ] : this.page === 'shop' && this.category !== 'parts' ? [{ x: 474, y: 128, width: 444, height: 250 }] : [];
    const xs = Array.from(new Set([0, 960, ...holes.flatMap(hole => [hole.x, hole.x + hole.width])])).sort((a, b) => a - b);
    const ys = Array.from(new Set([0, 540, ...holes.flatMap(hole => [hole.y, hole.y + hole.height])])).sort((a, b) => a - b);
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
    label.color = color(hex); label.isBold = true;
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
    transform.setContentSize(width, height);
    const g = this.graphics(node, 'ButtonShape');
    g.fillColor = color(accent ? '#c56e24' : '#b59c7a');
    g.roundRect(-width / 2, -height / 2 - 4, width, height, Math.min(22, height / 2)); g.fill();
    g.fillColor = color(enabled ? accent ? '#ffb632' : '#fff5e5' : '#e4d6c4');
    g.roundRect(-width / 2, -height / 2, width, height, Math.min(22, height / 2)); g.fill();
    g.strokeColor = color('#fffef5'); g.lineWidth = 3;
    g.roundRect(-width / 2 + 2, -height / 2 + 2, width - 4, height - 4, Math.min(20, height / 2)); g.stroke();
    if (display === '‹' || display === '›') this.arrow(node, display === '‹' ? -1 : 1);
    else if (display) this.label(display, 0, 0, width - 12, height - 4, accent ? 23 : 20, enabled ? ink : '#a4917c', node);
    this.buttons.push({ label: text, x, y, width, height, enabled });
    let press: { id: number | null; x: number; y: number } | undefined;
    const reset = () => { press = undefined; this.pressed.delete(node); node.setScale(1, 1, 1); };
    node.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
      e.propagationStopped = true;
      if (!enabled || press) return;
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
      const activate = press?.id === e.getID() && transform.hitTest(e.getLocation()) && enabled;
      reset();
      if (activate) { action(); this.signature = ''; if (this.root.active) this.render(); }
    });
    return node;
  }
  private render() {
    const signature = JSON.stringify([this.page, this.advanced, this.category, this.itemIndex, this.milestonePage, this.notice, this.state, this.career.profile]);
    if (signature === this.signature) return;
    this.signature = signature;
    for (const child of [...this.content.children]) { child.removeFromParent(); child.destroy(); }
    this.buttons = [];
    this.motion = []; this.pressed.clear();
    this.backdrop();
    if (this.page !== 'home') {
      const back = this.button('主页', -410, 224, 64, () => this.show('home'), true, 52, false, '');
      this.arrow(back, -1);
      this.label(this.page === 'setup' ? '出发！' : this.page === 'career' ? '生涯' : '车库', -300, 224, 140, 52, 34);
    }
    this.box(206, 224, 90, 36, '#387dabee');
    this.label(`Lv.${this.career.level}`, 206, 224, 80, 32, 21, '#ffffff');
    this.box(319, 224, 130, 38, '#387dabee');
    const coins = this.graphics(this.content, 'Coins');
    coins.fillColor = color('#ffd660'); coins.circle(274, 224, 15); coins.fill();
    coins.strokeColor = color('#d38c21'); coins.lineWidth = 2; coins.circle(274, 224, 11); coins.stroke();
    this.star(coins, 274, 224, 7, '#fff4b9');
    this.label(String(this.career.profile.coins), 333, 224, 91, 34, 22, '#ffffff');
    const settings = this.button('设置', 424, 224, 48, () => this.callbacks.settings(), true, 48, false, '');
    this.icon('settings', settings, 0, 0);
    if (this.page === 'home') this.home();
    else if (this.page === 'setup') this.setup();
    else if (this.page === 'career') this.careerPage();
    else this.shop();
    const notice = this.state.error || this.notice || (this.state.loading ? '装配中…' : '');
    if (notice) {
      this.box(0, -249, 896, 28, '#fff5e5f2');
      this.label(notice, 0, -249, 876, 28, 14, this.state.error ? '#ae4436' : ink);
    }
  }
  private previewCaption(text: string, top = 176) {
    // Keep the scene's centre unobscured; KartGame renders the selected 3D assets here.
    this.box(211, top, 448, 34);
    this.label(text, 211, top, 428, 32, 16);
    this.box(211, -113, 448, 30);
    this.label(this.state.loading ? '装配中…' : '试试看', 211, -113, 430, 28, 14);
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
    const frame = this.graphics(this.content, 'ThemePostcard');
    frame.strokeColor = color('#fffef5'); frame.lineWidth = 14;
    frame.roundRect(-434, -87, 408, 224, 8); frame.stroke();
    frame.strokeColor = color('#dec5a1'); frame.lineWidth = 2;
    frame.roundRect(-442, -95, 424, 240, 10); frame.stroke();
    const stamp = this.graphics(this.content, 'Postmark');
    stamp.strokeColor = color('#a98b64'); stamp.lineWidth = 2;
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i <= 8; i++) {
        const x = -53 + i * 5, y = -68 - row * 6 + Math.sin(i * 0.85) * 3;
        if (!i) stamp.moveTo(x, y); else stamp.lineTo(x, y);
      }
      stamp.stroke();
    }
    this.label('赛车', 230, 136, 210, 26, 16, '#98765c');
    for (const [i, field] of (['theme', 'route', 'vehicle', 'driver'] as const).entries()) {
      const choices = field === 'theme' ? themes.map(t => [t.id, t.name]) : field === 'route' ? routes.map(r => [r.id, r.name]) : field === 'vehicle' ? vehicles : drivers;
      const index = Math.max(0, choices.findIndex(choice => choice[0] === this.state.selection[field]));
      const geometry = [
        { x: -230, y: 158, left: -410, right: -50, width: 274 },
        { x: -230, y: -115, left: -410, right: -50, width: 274 },
        { x: 230, y: 15, left: 50, right: 412, width: 246 },
        { x: 235, y: -135, left: 100, right: 372, width: 204 },
      ][i];
      const { x, y, left, right, width } = geometry;
      const item = shopItems.find(item => item.category === field && item.assetId === this.state.selection[field]);
      const previous = this.button('‹', left, y, 48, () => this.callbacks.choose(field, -1), true, 48, false, '');
      this.arrow(previous, -1);
      const nameY = field === 'vehicle' ? -101 : y;
      if (field === 'vehicle') this.box(x, nameY, 224, 32);
      this.label(choices[index][1], x, nameY, width, 38, field === 'theme' ? 25 : 20);
      const next = this.button('›', right, y, 48, () => this.callbacks.choose(field, 1), true, 48, false, '');
      this.arrow(next, 1);
      if (item && !this.owned(item.id)) this.label(`${item.price} 金币解锁`, x, nameY - 24, width, 22, 13, '#ac652e');
    }
    const enter = this.button(this.state.loadError ? '重新加载' : this.state.loading ? '装配中…' : '进入赛道  →', 280, -193, 300,
      () => this.callbacks.prepare(), !this.state.loading, 64, false,
      this.state.loadError ? '重试' : this.state.loading ? '装配中' : '进入赛道');
    const enterShape = enter.getChildByName('ButtonShape')!.getComponent(Graphics)!;
    enterShape.fillColor = color(this.state.loading ? '#bfd6ce' : '#46decb');
    enterShape.roundRect(-147, -29, 294, 58, 22); enterShape.fill();
    this.arrow(enter, 1, 119, 0, '#197770');
    const mode = this.button(this.state.mode === 'sprint' ? '一圈冲刺  ‹ 切换 ›' : '三圈竞速  ‹ 切换 ›', -280, -184, 220,
      () => this.callbacks.mode(), true, 50, false, '');
    const selectedMode = this.graphics(mode, 'SelectedMode');
    selectedMode.fillColor = color('#ffb632');
    selectedMode.roundRect(this.state.mode === 'sprint' ? 2 : -106, -21, 104, 42, 19); selectedMode.fill();
    this.flag(selectedMode, -93, 7, 15);
    selectedMode.fillColor = color('#886247');
    selectedMode.moveTo(33, 13); selectedMode.lineTo(22, -2); selectedMode.lineTo(31, -2);
    selectedMode.lineTo(27, -13); selectedMode.lineTo(41, 4); selectedMode.lineTo(32, 4); selectedMode.close(); selectedMode.fill();
    this.label('三圈', -40, 0, 70, 40, 18, ink, mode);
    this.label('冲刺', 75, 0, 62, 40, 18, ink, mode);
    this.button(`${this.advanced ? '收起' : '展开'}高级选项`, -75, -185, 90, () => { this.advanced = !this.advanced; }, true, 50, false,
      this.advanced ? '收起' : '更多');
    if (this.advanced) {
      this.box(-230, 24, 416, 226, '#fff3ddfa');
      this.label('小伙伴', -230, 105, 320, 36, 27);
      this.button(`${this.state.sameBots ? '☑' : '□'} 机器人同款赛车 / 车手`, -230, 52, 320,
        () => this.callbacks.bots(this.state.botCount, !this.state.sameBots), true, 48, false,
        this.state.sameBots ? '跟我同款  ›' : '随机外观  ›');
      this.label('机器人', -316, -12, 120, 30, 18);
      this.button('−', -256, -12, 48, () => this.callbacks.bots(Math.max(0, this.state.botCount - 1), this.state.sameBots), this.state.botCount > 0, 48);
      this.label(String(this.state.botCount), -186, -12, 44, 44, 25);
      this.button('+', -116, -12, 48, () => this.callbacks.bots(Math.min(7, this.state.botCount + 1), this.state.sameBots), this.state.botCount < 7, 48);
    }
  }
  private careerPage() {
    this.box(0, -17, 896, 430);
    const p = this.career.profile;
    this.label(`完赛 ${p.races}   ·   冠军 ${p.wins}   ·   领奖台 ${p.podiums}   ·   路线 ${p.routes.length}/${routes.length}`, 0, 168, 850, 36, 21, '#438e81');
    const progress = this.career.levelProgress;
    this.label(`Lv.${this.career.level}   成长 ${progress.current}/${progress.needed}   ·   完成目标后触按领取奖励`, 0, 133, 850, 28, 16, '#94765b');
    const pages = Math.max(1, Math.ceil(milestones.length / 3));
    this.milestonePage = Math.min(this.milestonePage, pages - 1);
    for (const [i, milestone] of milestones.slice(this.milestonePage * 3, this.milestonePage * 3 + 3).entries()) {
      const y = 83 - i * 80;
      this.box(0, y, 846, 70, '#fffdf3');
      const progress = Math.min(milestone.target, this.career.milestoneProgress(milestone.id));
      const claimed = p.claimed.includes(milestone.id);
      this.label(`${milestone.name}   ${progress}/${milestone.target}`, -212, y + 16, 382, 28, 20);
      this.label(milestone.description, -212, y - 17, 382, 30, 15, '#94765b');
      this.label(`+${milestone.coins} 金币\n+${milestone.xp} 成长`, 75, y, 170, 58, 17, '#b87727');
      this.button(claimed ? '已领取' : progress >= milestone.target ? '领取奖励' : '继续挑战', 291, y, 202, () => {
        this.notice = this.career.claim(milestone.id) ? '里程碑奖励已入账！' : '尚未达成，完成比赛继续积累';
      }, !claimed && progress >= milestone.target, 50, !claimed && progress >= milestone.target);
    }
    this.button('‹ 上一页', -283, -185, 220, () => { this.milestonePage--; }, this.milestonePage > 0);
    this.label(`${this.milestonePage + 1} / ${pages}`, 0, -185, 150, 42, 20);
    this.button('下一页 ›', 283, -185, 220, () => { this.milestonePage++; }, this.milestonePage + 1 < pages);
  }
  private shop() {
    for (const [i, category] of (['vehicle', 'decoration', 'pet', 'driver', 'parts'] as const).entries())
      this.button(categoryNames[category], -352 + i * 176, 146, 156, () => {
        this.callbacks.equip(); this.category = category; this.itemIndex = 0; this.notice = '';
      }, true, 48, category === this.category);
    if (this.category === 'parts') {
      this.box(0, -54, 896, 348);
      for (const [i, part] of (['engine', 'grip', 'nitro'] as const).entries()) {
        const y = 58 - i * 83, cost = this.career.upgradeCost(part);
        const maxed = !Number.isFinite(cost) || cost <= 0;
        this.box(0, y, 846, 72, '#fffdf3');
        this.label(`${partNames[part]}   Lv.${this.career.profile.upgrades[part]}`, -247, y + 15, 320, 28, 22);
        this.label(part === 'engine' ? '提升加速与极速' : part === 'grip' ? '提升弯道抓地与转向' : '缩短氮气冷却，提升冲刺', -247, y - 18, 320, 28, 15, '#94765b');
        this.label(maxed ? '已达上限' : `${cost} 金币`, 59, y, 174, 44, 20, '#b87727');
        this.button(maxed ? '已满级' : '升级', 291, y, 202, () => {
          this.notice = this.career.upgrade(part) ? `${partNames[part]}升级成功` : '金币不足，完赛可赢取奖金';
          this.callbacks.equip();
        }, !maxed && this.career.profile.coins >= cost, 50, true);
      }
      this.label('零部件升级用于单人生涯比赛', 0, -195, 820, 36, 17, '#94765b');
      return;
    }
    const items = this.items();
    this.itemIndex = Math.min(this.itemIndex, Math.max(0, items.length - 1));
    const item = items[this.itemIndex];
    this.box(-240, -44, 416, 368);
    if (!item) { this.label('暂无商品', -240, 0, 350); return; }
    this.label(item.name, -240, 73, 376, 52, 28);
    this.label(item.description, -240, 11, 360, 74, 19, '#94765b');
    const owned = this.owned(item.id);
    const equipped = this.career.profile.equipped[this.category] === item.id || this.career.profile.equipped[this.category] === item.assetId;
    this.label(owned ? equipped ? '正在装备' : '已拥有' : `${item.price} 金币`, -240, -49, 360, 40, 22, '#b87727');
    this.button('‹', -402, -115, 56, () => this.selectItem(-1));
    this.label(`${this.itemIndex + 1} / ${items.length}`, -240, -115, 240, 44, 20);
    this.button('›', -78, -115, 56, () => this.selectItem(1));
    this.button(owned ? equipped ? '已装备' : '装备' : `购买 · ${item.price} 金币`, -240, -196, 380, () => {
      if (!owned && !this.career.buy(item.id)) { this.notice = '金币不足，完赛可赢取奖金'; return; }
      this.notice = this.career.equip(item.id) ? `${item.name}已装备` : '装备未完成，请重试';
      this.callbacks.equip();
    }, !equipped && (owned || this.career.profile.coins >= item.price), 52, true);
    this.previewCaption(`${item.name} · 候选外观`, 89);
    this.button('试穿 / 预览', 211, -161, 420, () => {
      // Optional cosmetic fields travel through the same callback, without changing ownership.
      const preview = { [item.category]: item.assetId };
      this.callbacks.preview(preview);
      this.notice = `正在预览${item.name}，购买后才能永久装备`;
    }, !this.state.loading, 48);
    this.label(`当前装备：${this.equipmentName(this.category)}`, 211, -208, 432, 34, 16, '#94765b');
  }
  private selectItem(delta: number) {
    const items = this.items();
    if (!items.length) return;
    this.itemIndex = (this.itemIndex + delta + items.length) % items.length;
    this.notice = '';
    const preview = { [items[this.itemIndex].category]: items[this.itemIndex].assetId };
    this.callbacks.preview(preview);
  }
}
