import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { RaceManager } from '../assets/scripts/RaceManager.ts';

// Real panel handlers/geometry with a small engine substitute; Creator rendering is checked separately.
class SceneNode {
  static EventType = { TOUCH_START: 'start', TOUCH_MOVE: 'move', TOUCH_END: 'end', TOUCH_CANCEL: 'cancel' };
  active = true; layer = 0; children: SceneNode[] = []; parent?: SceneNode;
  position = { x: 0, y: 0, z: 0 }; scale = { x: 1, y: 1 }; components = new Map(); handlers = new Map();
  name = '';
  constructor(name = '') { this.name = name; }
  addChild(child: SceneNode) { child.parent = this; this.children.push(child); }
  addComponent(type: any) { const component = new type(); component.node = this; this.components.set(type, component); return component; }
  getComponent(type: any) { return this.components.get(type); }
  getChildByName(name: string) { return this.children.find(child => child.name === name); }
  setPosition(x: number, y: number, z = 0) { this.position = { x, y, z }; }
  setScale(x: number, y: number) { this.scale = { x, y }; }
  on(event: string, handler: Function) { this.handlers.set(event, handler); }
  emit(event: string, argument: unknown) { this.handlers.get(event)?.(argument); }
  removeFromParent() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = undefined; }
  destroy() { this.active = false; this.removeFromParent(); }
}
class Transform {
  node!: SceneNode; contentSize = { width: 0, height: 0 };
  setContentSize(width: number, height: number) { this.contentSize = { width, height }; }
  hitTest(point: { x: number; y: number }) {
    let x = 0, y = 0;
    for (let node: SceneNode | undefined = this.node; node; node = node.parent) { x += node.position.x; y += node.position.y; }
    return Math.abs(point.x - x) <= this.contentSize.width / 2 && Math.abs(point.y - y) <= this.contentSize.height / 2;
  }
}
class Graphics { operations: { op: string; args: number[] }[] = []; clear() { this.operations = []; } }
for (const op of ['rect', 'roundRect', 'circle', 'moveTo', 'lineTo', 'close', 'stroke', 'fill'])
  Graphics.prototype[op] = function (...args: number[]) { this.operations.push({ op, args }); };
class Color { fromHEX() { return this; } }
const cc = { Node: SceneNode, UITransform: Transform, Graphics, Color, EventTouch: class {}, BlockInputEvents: class {},
  Camera: class { static ProjectionType = { ORTHO: 0 }; static ClearFlag = { DEPTH_ONLY: 0 }; }, Canvas: class {},
  ResolutionPolicy: { SHOW_ALL: 0 }, sys: { isBrowser: true, isMobile: false }, view: { setDesignResolutionSize() {} },
  Label: class { static HorizontalAlign = { CENTER: 0 }; static VerticalAlign = { CENTER: 0 }; static Overflow = { SHRINK: 1 }; },
  Layers: { Enum: { UI_2D: 1 } } };
const items = [
  { id: 'classic-kart', category: 'vehicle', assetId: 'classic-kart', name: '经典卡丁', price: 0, description: '初始赛车' },
  { id: 'formula', category: 'vehicle', assetId: 'formula', name: '方程式', price: 500, description: '轻盈赛车' },
  { id: 'ribbon', category: 'decoration', assetId: 'ribbon', name: '彩带', price: 100, description: '迎风飘扬' },
  { id: 'cloud', category: 'pet', assetId: 'cloud', name: '云朵', price: 100, description: '飞行跟随' },
  { id: 'rookie', category: 'driver', assetId: 'rookie', name: '新秀', price: 0, description: '初始车手' },
];
const milestones = Array.from({ length: 4 }, (_, i) => ({ id: `race-${i}`, name: `完赛目标 ${i + 1}`,
  description: '积累完赛场次', target: i + 1, stat: 'races', coins: 100, xp: 20 }));
const sourceURL = new URL('../assets/scripts/HomePanel.ts', import.meta.url);
const hudURL = new URL('../assets/scripts/HUD.ts', import.meta.url);
(globalThis as any).__kartHomeCC = cc;
(globalThis as any).__kartHomeCatalog = { shopItems: items, milestones };
const hooks = registerHooks({
  resolve(id, context, next) {
    if (context.parentURL === sourceURL.href || context.parentURL === hudURL.href) {
      if (id === 'cc') return { url: 'kart-home:cc', shortCircuit: true };
      if (id === './Career') return { url: 'kart-home:career', shortCircuit: true };
      if (id.startsWith('./') && !id.endsWith('.ts')) return next(new URL(id + '.ts', sourceURL).href, context);
    }
    return next(id, context);
  },
  load(url, context, next) {
    if (url === 'kart-home:cc') return { format: 'module', shortCircuit: true,
      source: `export const { ${Object.keys(cc).join(',')} } = globalThis.__kartHomeCC;` };
    if (url === 'kart-home:career') return { format: 'module', shortCircuit: true,
      source: 'export const {shopItems,milestones} = globalThis.__kartHomeCatalog; export class Career {}' };
    const result = next(url, context);
    if (url === sourceURL.href) return { ...result, format: 'module', source: stripTypeScriptTypes(result.source!.toString(), { mode: 'transform' }) };
    return result;
  },
});
let HomePanel: any, HUD: any;
try { ({ HomePanel } = await import(sourceURL.href)); ({ HUD } = await import(hudURL.href)); }
finally { hooks.deregister(); delete (globalThis as any).__kartHomeCC; delete (globalThis as any).__kartHomeCatalog; }

function setup() {
  const parent = new SceneNode('HUD'); parent.setPosition(480, 270);
  const profile = { xp: 40, coins: 700, races: 1, wins: 0, podiums: 1, owned: ['classic-kart', 'rookie'],
    equipped: { vehicle: 'classic-kart', driver: 'rookie', decoration: '', pet: '' },
    upgrades: { engine: 0, grip: 0, nitro: 0 }, routes: ['seaside'], claimed: [] as string[] };
  const career = { profile, level: 1, levelProgress: { current: 40, needed: 100 },
    milestoneProgress: () => profile.races, upgradeCost: () => 100,
    buy(id: string) { const item = items.find(item => item.id === id)!; if (profile.coins < item.price) return false;
      profile.coins -= item.price; profile.owned.push(id); return true; },
    equip(id: string) { const item = items.find(item => item.id === id)!; profile.equipped[item.category] = item.assetId; return true; },
    upgrade(part: string) { profile.coins -= 100; profile.upgrades[part]++; return true; },
    claim(id: string) { profile.claimed.push(id); return true; } };
  const calls = { prepare: 0, restore: 0, settings: 0, previews: [] as unknown[], choices: [] as unknown[] };
  let state = { selection: { theme: 'seaside', route: 'seaside', vehicle: 'classic-kart', driver: 'rookie' },
    mode: 'standard', loading: false, error: '', botCount: 3, sameBots: false };
  const panel = new HomePanel(parent, career, {
    choose: (field: string, delta: number) => calls.choices.push([field, delta]), mode() {},
    prepare: () => { calls.prepare++; }, preview: (selection: unknown) => calls.previews.push(selection),
    equip: () => { calls.restore++; }, bots: (count: number, same: boolean) => { state = { ...state, botCount: count, sameBots: same }; panel.update(state); },
    settings: () => { calls.settings++; panel.root.active = false; },
  });
  panel.update(state);
  const event = (x: number, y: number) => ({ propagationStopped: false, getID: () => 1,
    getUILocation: () => ({ x: (480 + x) * 2, y: (270 + y) * 2 }),
    getLocation: () => ({ x: 480 + x, y: 270 + y }) });
  const button = (label: string, y?: number) => {
    const node = panel.root.getChildByName('HomeContent').children.find((node: SceneNode) => node.name === label && (y === undefined || node.position.y === y));
    assert.ok(node, `missing button: ${label}`); return node;
  };
  const tap = (label: string, y?: number) => { const node = button(label, y), e = event(node.position.x, node.position.y);
    node.emit('start', e); node.emit('end', e); assert.equal(e.propagationStopped, true); };
  return { panel, profile, calls, state, button, event, tap };
}

test('home/setup touches are independent of driving input, cancel safely, and only prepare explicitly', () => {
  const { panel, calls, button, event, tap } = setup();
  const start = button('选择比赛  →'), e = event(start.position.x, start.position.y);
  panel.tick(0.1);
  assert.notEqual(start.scale.x, 1, 'primary action breathes without rebuilding the panel');
  start.emit('start', e); start.emit('cancel', e); start.emit('end', e);
  assert.equal(panel.page, 'home', 'cancel must not navigate');
  assert.deepEqual(start.scale, { x: 1, y: 1 }, 'cancel restores the whole button including its text and icon');
  start.emit('start', e); panel.tick(0.1);
  assert.deepEqual(start.scale, { x: 0.94, y: 0.94 }, 'ambient animation cannot override a held button');
  start.emit('move', event(start.position.x + 40, start.position.y)); start.emit('end', e);
  assert.equal(panel.page, 'home', 'dragging away must not navigate');
  assert.deepEqual(start.scale, { x: 1, y: 1 });
  tap('选择比赛  →');
  tap('›', 158); tap('‹', -115);
  assert.deepEqual(calls.choices, [['theme', 1], ['route', -1]]);
  assert.equal(calls.prepare, 0);
  tap('展开高级选项');
  assert.equal(panel.snapshot().advanced, true);
  for (let i = 0; i < 4; i++) tap('+');
  assert.equal(panel.snapshot().buttons.find(button => button.label === '+').enabled, false);
  tap('+');
  for (let i = 0; i < 7; i++) tap('−');
  assert.equal(panel.snapshot().buttons.find(button => button.label === '−').enabled, false);
  tap('进入赛道  →'); assert.equal(calls.prepare, 1, 'prepare remains separate from countdown/start');
  tap('设置'); assert.equal(calls.settings, 1);
  assert.equal(panel.snapshot().visible, false);
  panel.root.active = true;
  assert.equal(panel.page, 'setup'); assert.equal(panel.advanced, true, 'settings preserves the configuration page');
});

test('home is a sparse plaza while setup keeps both native scene windows uncovered', () => {
  const { panel, state, button, tap } = setup();
  const content = panel.root.getChildByName('HomeContent');
  const labels = (node: SceneNode): string[] => [node.getComponent(cc.Label)?.string || '', ...node.children.flatMap(labels)].filter(Boolean);
  assert.equal(content.getChildByName('CreamBackdrop'), undefined, 'plaza and live kart fill the home scene');
  assert.equal(content.getChildByName('ThemePostcard'), undefined);
  assert.deepEqual(panel.snapshot().preview, { x: -80, y: -15, width: 300, height: 230 });
  assert.deepEqual(panel.snapshot().buttons.map(button => button.label), ['设置', '选择比赛  →', '生涯 / 领奖', '商店 / 升级']);
  assert.ok(labels(content).includes('开赛'));
  assert.ok(!labels(content).some(text => /已完赛|当前装备|成长|金币|下一站/.test(text)), 'details live on the career page');
  assert.deepEqual(button('选择比赛  →').position, { x: 280, y: -160, z: 0 });
  assert.deepEqual(button('生涯 / 领奖').position, { x: -390, y: -180, z: 0 });
  const start = button('选择比赛  →'); panel.update(state);
  assert.equal(button('选择比赛  →'), start, 'unchanged state keeps native UI nodes and motion intact');
  tap('选择比赛  →');
  assert.ok(content.getChildByName('ThemePostcard'));
  assert.ok(labels(content).includes('出发！'));
  assert.ok(!labels(content).includes('开赛'));
  assert.deepEqual(panel.snapshot().preview, { x: 230, y: 2.5, width: 380, height: 225 });
  assert.deepEqual(panel.snapshot().sceneryPreview, { x: -230, y: 24, width: 396, height: 208 });
  assert.deepEqual(panel.snapshot().buttons.filter(button => button.label === '›').map(button => [button.designX, button.designY]),
    [[430, 112], [430, 385], [892, 255], [852, 405]], 'theme/map/car/driver keep semantic arrow order');
  const holes = [{ x: 52, y: 142, width: 396, height: 208 }, { x: 520, y: 155, width: 380, height: 225 }];
  const backdrop = content.getChildByName('CreamBackdrop').getComponent(Graphics);
  const rectangles = backdrop.operations.filter(operation => operation.op === 'rect');
  assert.ok(rectangles.length > 0);
  for (const { args: [x, y, width, height] } of rectangles) {
    const left = x + 480, top = 270 - y - height;
    assert.ok(!holes.some(hole => left < hole.x + hole.width && left + width > hole.x && top < hole.y + hole.height && top + height > hole.y),
      'cream paint must never cover either live preview');
  }
  panel.show('shop');
  assert.deepEqual(panel.snapshot().preview, { x: 216, y: 17, width: 444, height: 250 });
});

test('shop candidate preview never buys implicitly, and leaving restores actual equipment', () => {
  const { panel, calls, profile, tap } = setup();
  panel.show('shop'); tap('›', -115);
  assert.deepEqual(calls.previews, [{ vehicle: 'formula' }]);
  assert.deepEqual(profile.owned, ['classic-kart', 'rookie']);
  assert.equal(profile.coins, 700);
  tap('购买 · 500 金币');
  assert.equal(profile.coins, 200); assert.equal(profile.equipped.vehicle, 'formula');
  tap('宠物'); tap('试穿 / 预览');
  assert.deepEqual(calls.previews.at(-1), { pet: 'cloud' });
  const restores = calls.restore;
  tap('主页'); assert.equal(calls.restore, restores + 1);
  panel.show('shop'); panel.hide(); assert.equal(calls.restore, restores + 2);
});

test('all pages keep touch targets inside the 960x540 rotated-phone render and report load errors', () => {
  const { panel, state, tap, calls } = setup();
  for (const page of ['home', 'setup', 'career', 'shop']) {
    panel.show(page);
    if (page === 'setup') tap('展开高级选项');
    for (const button of panel.snapshot().buttons) {
      assert.ok(button.designX - button.width / 2 >= 16 && button.designX + button.width / 2 <= 944, button.label);
      assert.ok(button.designY - button.height / 2 >= 16 && button.designY + button.height / 2 <= 524, button.label);
      assert.ok(button.width >= 48 && button.height >= 44, button.label);
    }
  }
  panel.update({ ...state, error: '所选赛车未拥有，请先购买' });
  assert.match(panel.snapshot().notice, /未拥有/);
  panel.show('setup');
  panel.update({ ...state, loading: true });
  tap('装配中…');
  assert.equal(calls.prepare, 0);
  panel.update({ ...state, loadError: 'network unavailable', error: 'network unavailable' });
  assert.equal(panel.snapshot().buttons.find(button => button.label === '重新加载').enabled, true);
  tap('重新加载');
  assert.equal(calls.prepare, 1);
  panel.dispose(); assert.equal(panel.root.active, false);
});

test('staged HUD hides old selectors, waits for start and exposes home plus the finish reward', () => {
  const hud = new HUD(new SceneNode()), race = new RaceManager({}, 12, 8);
  const idle = { steer: 0, throttle: 0, brake: false, drift: false };
  hud.staged = true; hud.update(race, idle, false);
  assert.equal(race.phase, 'ready'); assert.equal(hud.picker.active, false);
  assert.equal(hud.title.node.active, false); assert.equal(hud.racingHUD.active, false);
  assert.equal(hud.button.string, '开始比赛');
  assert.deepEqual(hud.button.node.position, { x: -282, y: -163, z: 0 });
  assert.equal(hud.garageLabel.string, '返回主页');
  const home = new SceneNode('HomePanel'); hud.root.addChild(home); hud.update(race, idle, false);
  assert.equal(hud.panel.active, false, 'home consumes the ready menu');
  home.active = false; race.phase = 'racing'; hud.update(race, idle, false);
  assert.equal(hud.panel.active, false);
  race.phase = 'finished'; race.drivers[0].progress.finishedAt = 30;
  hud.rewardText = '+120 金币 · +70 成长'; hud.update(race, idle, false);
  assert.match(hud.footer.string, /120 金币.*70 成长/);
  assert.equal(hud.standings.lineHeight, 16, 'eight-driver results fit the standings area');
});
