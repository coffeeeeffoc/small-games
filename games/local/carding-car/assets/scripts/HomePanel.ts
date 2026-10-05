import { BlockInputEvents, Color, EventTouch, Graphics, Label, Layers, Node, UITransform } from 'cc';
import { Career, milestones, shopItems } from './Career';
import { defaultSelection, drivers, vehicles, type Selection } from './Selection';
import { themes } from './ThemeCatalog';
import { routes } from './RouteCatalog';
import { createTrack } from './TrackGenerator';

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
  private mappedRoute = '';
  private track = createTrack();

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
      preview: { x: 216, y: 20, width: 444, height: 240 } };
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
  private box(x: number, y: number, width: number, height: number, hex = '#163b55ef', parent = this.content) {
    const g = this.graphics(parent);
    g.fillColor = color(hex);
    g.roundRect(x - width / 2, y - height / 2, width, height, 14);
    g.fill();
    return g;
  }
  private label(text: string, x: number, y: number, width: number, height = 36, size = 20, hex = '#fff6dc', parent = this.content) {
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
  private button(text: string, x: number, y: number, width: number, action: () => void, enabled = true, height = 52, accent = false) {
    const node = new Node(text);
    node.layer = Layers.Enum.UI_2D;
    this.content.addChild(node);
    node.setPosition(x, y);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);
    const g = this.box(0, 0, width, height, enabled ? accent ? '#ffd15a' : '#295870' : '#344b5d', node);
    this.label(text, 0, 0, width - 12, height - 4, 20, enabled ? accent ? '#173b53' : '#fff6dc' : '#a9cdd0', node);
    this.buttons.push({ label: text, x, y, width, height, enabled });
    let press: { id: number | null; x: number; y: number } | undefined;
    const reset = () => { press = undefined; g.node.setScale(1, 1, 1); };
    node.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
      e.propagationStopped = true;
      if (!enabled || press) return;
      const p = e.getUILocation();
      press = { id: e.getID(), x: p.x, y: p.y };
      g.node.setScale(0.96, 0.96, 1);
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
      const p = e.getUILocation();
      const activate = press?.id === e.getID() && transform.hitTest(e.getLocation()) && enabled;
      reset();
      if (activate) { action(); this.signature = ''; if (this.root.active) this.render(); }
    });
  }
  private render() {
    const signature = JSON.stringify([this.page, this.advanced, this.category, this.itemIndex, this.milestonePage, this.notice, this.state, this.career.profile]);
    if (signature === this.signature) return;
    this.signature = signature;
    for (const child of [...this.content.children]) { child.removeFromParent(); child.destroy(); }
    this.buttons = [];
    this.box(0, 224, 920, 60);
    const titles = { home: '咔叮唓 · 赛车生涯', setup: '出发前 · 比赛配置', career: '生涯 · 每一圈都算数', shop: '车库商店' };
    if (this.page !== 'home') this.button('主页', -392, 224, 108, () => this.show('home'), true, 48);
    this.label(titles[this.page], this.page === 'home' ? -234 : -170, 224, this.page === 'home' ? 370 : 344, 46, 26);
    this.label(`Lv.${this.career.level}   成长 ${this.career.profile.xp}   金币 ${this.career.profile.coins}`, 196, 224, 360, 42, 18, '#ffd15a');
    this.button('设置', 424, 224, 48, () => this.callbacks.settings(), true, 48);
    if (this.page === 'home') this.home();
    else if (this.page === 'setup') this.setup();
    else if (this.page === 'career') this.careerPage();
    else this.shop();
    const notice = this.state.error || this.notice || (this.state.loading ? '正在装配所选赛车与场景…' : '');
    if (notice) {
      this.box(0, -249, 896, 28, '#163b55fa');
      this.label(notice, 0, -249, 876, 28, 14, this.state.error ? '#ffb1a3' : '#ffd15a');
    }
  }
  private previewCaption(text: string, top = 176) {
    // Keep the scene's centre unobscured; KartGame renders the selected 3D assets here.
    this.box(211, top, 448, 34, '#173c55c8');
    this.label(text, 211, top, 428, 32, 16, '#fff6dc');
    this.box(211, -113, 448, 30, '#173c55c8');
    this.label(this.state.loading ? '装配中…' : '实景预览 · 触按选项查看', 211, -113, 430, 28, 14, '#d1e9e4');
  }
  private home() {
    const p = this.career.profile;
    const progress = this.career.levelProgress;
    this.box(-240, -16, 416, 430);
    this.label('每次完赛，积累成长与奖金', -240, 168, 386, 36, 23);
    const g = this.graphics(this.content, 'LevelProgress');
    g.fillColor = color('#295870'); g.roundRect(-424, 131, 368, 8, 4); g.fill();
    const ratio = Math.min(1, Math.max(0, progress.current / Math.max(1, progress.needed)));
    if (ratio > 0) { g.fillColor = color('#69dfc0'); g.roundRect(-424, 131, 368 * ratio, 8, 4); g.fill(); }
    this.label(`Lv.${this.career.level}   ${progress.current} / ${progress.needed} 成长`, -240, 115, 376, 24, 15, '#a9cdd0');
    this.label(`已完赛 ${p.races} 场   冠军 ${p.wins} 次\n领奖台 ${p.podiums} 次   探索路线 ${p.routes.length} 条`, -240, 73, 378, 56, 19, '#69dfc0');
    this.label(`当前装备\n${this.equipmentName('vehicle')} · ${this.equipmentName('driver')}\n${this.equipmentName('decoration')} · ${this.equipmentName('pet')}`, -240, -7, 378, 84, 18);
    this.label(`引擎 Lv.${p.upgrades.engine} · 抓地 Lv.${p.upgrades.grip} · 氮气 Lv.${p.upgrades.nitro}`, -240, -71, 380, 28, 16, '#a9cdd0');
    const next = milestones.find(milestone => !p.claimed.includes(milestone.id));
    this.label(next ? `下一站：${next.name}\n${next.description}` : '生涯里程碑已全部达成，继续刷新圈速！', -240, -119, 370, 56, 17, '#ffd15a');
    this.button('选择比赛  →', -240, -193, 380, () => this.show('setup'), true, 56, true);
    this.previewCaption('你的赛车 · 出发随时可选');
    this.button('生涯 / 领奖', 95, -184, 200, () => this.show('career'));
    this.button('商店 / 升级', 327, -184, 200, () => this.show('shop'));
  }
  private setup() {
    this.box(-240, -16, 416, 430);
    const names = { theme: '主题', route: '地图', vehicle: '赛车', driver: '车手' };
    for (const [i, field] of (['theme', 'route', 'vehicle', 'driver'] as const).entries()) {
      const choices = field === 'theme' ? themes.map(t => [t.id, t.name]) : field === 'route' ? routes.map(r => [r.id, r.name]) : field === 'vehicle' ? vehicles : drivers;
      const index = Math.max(0, choices.findIndex(choice => choice[0] === this.state.selection[field]));
      const y = 136 - i * 76;
      const item = shopItems.find(item => item.category === field && item.assetId === this.state.selection[field]);
      const lock = item && !this.owned(item.id) ? ` · 未拥有 ${item.price} 金币` : '';
      this.label(`${names[field]}${lock}`, -240, y + 28, 374, 25, 14, lock ? '#ffd15a' : '#a9cdd0');
      this.button('‹', -402, y, 56, () => this.callbacks.choose(field, -1));
      this.label(choices[index][1], -240, y, 248, 48, 22);
      this.button('›', -78, y, 56, () => this.callbacks.choose(field, 1));
      this.label(`${choices[(index - 1 + choices.length) % choices.length][1]}    /    ${choices[(index + 1) % choices.length][1]}`, -240, y - 26, 270, 24, 13, '#a9cdd0');
    }
    this.button(this.state.loadError ? '重新加载' : this.state.loading ? '装配中…' : '进入赛道  →', -240, -198, 380, () => this.callbacks.prepare(), !this.state.loading, 52, true);
    this.previewCaption(`${themes.find(t => t.id === this.state.selection.theme)?.name} · ${routes.find(r => r.id === this.state.selection.route)?.name}`);
    this.routePreview();
    this.button(this.state.mode === 'sprint' ? '一圈冲刺  ‹ 切换 ›' : '三圈竞速  ‹ 切换 ›', 103, -69, 234, () => this.callbacks.mode(), true, 48);
    this.button(`${this.advanced ? '收起' : '展开'}高级选项`, 211, -155, 448, () => { this.advanced = !this.advanced; }, true, 44);
    if (this.advanced) {
      this.button(`${this.state.sameBots ? '☑' : '□'} 机器人同款赛车 / 车手`, 133, -208, 292,
        () => this.callbacks.bots(this.state.botCount, !this.state.sameBots), true, 48);
      this.button('−', 312, -208, 52, () => this.callbacks.bots(Math.max(0, this.state.botCount - 1), this.state.sameBots), this.state.botCount > 0, 48);
      this.label(String(this.state.botCount), 363, -208, 40, 44, 23);
      this.button('+', 414, -208, 52, () => this.callbacks.bots(Math.min(7, this.state.botCount + 1), this.state.sameBots), this.state.botCount < 7, 48);
    } else this.label(`机器人 ${this.state.botCount} 位 · ${this.state.sameBots ? '与玩家同款' : '外观随机'}`, 211, -208, 440, 42, 16, '#d1e9e4');
  }
  private routePreview() {
    const route = routes.find(route => route.id === this.state.selection.route);
    if (!route) return;
    if (this.mappedRoute !== route.id) { this.track = createTrack(route.track); this.mappedRoute = route.id; }
    this.box(344, -53, 168, 112, '#173c55d8');
    const { main, shortcut } = this.track;
    const xs = main.map(p => p.x), zs = main.map(p => p.z);
    const left = Math.min(...xs), right = Math.max(...xs), bottom = Math.min(...zs), top = Math.max(...zs);
    const scale = Math.min(138 / Math.max(1, right - left), 66 / Math.max(1, top - bottom));
    const g = this.graphics(this.content, 'RoutePreview');
    for (const [points, hex, width] of [[main, '#ffd15a', 3], [shortcut, '#69dfc0', 2]] as const) {
      if (points.length < 2) continue;
      g.strokeColor = color(hex); g.lineWidth = width;
      points.forEach((p, i) => {
        const x = 344 + (p.x - (left + right) / 2) * scale, y = -43 + (p.z - (bottom + top) / 2) * scale;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      });
      g.stroke();
    }
    this.label(`${Math.round(this.track.length)} m · 路宽 ${this.track.width} m`, 344, -94, 156, 24, 12, '#d1e9e4');
  }
  private careerPage() {
    this.box(0, -17, 896, 430);
    const p = this.career.profile;
    this.label(`完赛 ${p.races}   ·   冠军 ${p.wins}   ·   领奖台 ${p.podiums}   ·   路线 ${p.routes.length}/${routes.length}`, 0, 168, 850, 36, 21, '#69dfc0');
    const progress = this.career.levelProgress;
    this.label(`Lv.${this.career.level}   成长 ${progress.current}/${progress.needed}   ·   完成目标后触按领取奖励`, 0, 133, 850, 28, 16, '#a9cdd0');
    const pages = Math.max(1, Math.ceil(milestones.length / 3));
    this.milestonePage = Math.min(this.milestonePage, pages - 1);
    for (const [i, milestone] of milestones.slice(this.milestonePage * 3, this.milestonePage * 3 + 3).entries()) {
      const y = 83 - i * 80;
      this.box(0, y, 846, 70, '#295870');
      const progress = Math.min(milestone.target, this.career.milestoneProgress(milestone.id));
      const claimed = p.claimed.includes(milestone.id);
      this.label(`${milestone.name}   ${progress}/${milestone.target}`, -212, y + 16, 382, 28, 20);
      this.label(milestone.description, -212, y - 17, 382, 30, 15, '#d1e9e4');
      this.label(`+${milestone.coins} 金币\n+${milestone.xp} 成长`, 75, y, 170, 58, 17, '#ffd15a');
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
        this.box(0, y, 846, 72, '#295870');
        this.label(`${partNames[part]}   Lv.${this.career.profile.upgrades[part]}`, -247, y + 15, 320, 28, 22);
        this.label(part === 'engine' ? '提升加速与极速' : part === 'grip' ? '提升弯道抓地与转向' : '缩短氮气冷却，提升冲刺', -247, y - 18, 320, 28, 15, '#a9cdd0');
        this.label(maxed ? '已达上限' : `${cost} 金币`, 59, y, 174, 44, 20, '#ffd15a');
        this.button(maxed ? '已满级' : '升级', 291, y, 202, () => {
          this.notice = this.career.upgrade(part) ? `${partNames[part]}升级成功` : '金币不足，完赛可赢取奖金';
          this.callbacks.equip();
        }, !maxed && this.career.profile.coins >= cost, 50, true);
      }
      this.label('零部件升级用于单人生涯比赛', 0, -195, 820, 36, 17, '#a9cdd0');
      return;
    }
    const items = this.items();
    this.itemIndex = Math.min(this.itemIndex, Math.max(0, items.length - 1));
    const item = items[this.itemIndex];
    this.box(-240, -44, 416, 368);
    if (!item) { this.label('暂无商品', -240, 0, 350); return; }
    this.label(item.name, -240, 73, 376, 52, 28);
    this.label(item.description, -240, 11, 360, 74, 19, '#d1e9e4');
    const owned = this.owned(item.id);
    const equipped = this.career.profile.equipped[this.category] === item.id || this.career.profile.equipped[this.category] === item.assetId;
    this.label(owned ? equipped ? '正在装备' : '已拥有' : `${item.price} 金币`, -240, -49, 360, 40, 22, '#ffd15a');
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
    this.label(`当前装备：${this.equipmentName(this.category)}`, 211, -208, 432, 34, 16, '#d1e9e4');
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
