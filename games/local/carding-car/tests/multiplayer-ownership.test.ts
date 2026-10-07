import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { defaultSelection, drivers, vehicles, type Selection } from '../assets/scripts/Selection.ts';
import type { ClientMessage, RoomState } from '../assets/scripts/MultiplayerProtocol.ts';

// Run the actual room button handlers; only Creator's scene/label plumbing is replaced.
class SceneNode {
  static EventType = { TOUCH_END: 'end' };
  name = ''; active = true; layer = 0;
  parent?: SceneNode; children: SceneNode[] = [];
  position = { x: 0, y: 0, z: 0 };
  components = new Map<any, any>(); handlers = new Map<string, () => void>();
  constructor(name = '') { this.name = name; }
  addChild(node: SceneNode) { node.parent = this; this.children.push(node); }
  addComponent(type: any) { const value = new type(); value.node = this; this.components.set(type, value); return value; }
  getComponent(type: any) { return this.components.get(type); }
  setPosition(x: number, y: number, z = 0) { this.position = { x, y, z }; }
  setSiblingIndex(index: number) {
    if (!this.parent) return;
    const siblings = this.parent.children;
    siblings.splice(siblings.indexOf(this), 1); siblings.splice(index, 0, this);
  }
  on(event: string, handler: () => void) { this.handlers.set(event, handler); }
  emit(event: string) { this.handlers.get(event)?.(); }
}
class Transform {
  width = 0; height = 0;
  setContentSize(width: number, height: number) { this.width = width; this.height = height; }
  setAnchorPoint() {}
}
class Graphics { node!: SceneNode; clear() {} roundRect() {} fill() {} }
class Label { static VerticalAlign = { CENTER: 0 }; node!: SceneNode; string = ''; }
class EditBox { static InputMode = { SINGLE_LINE: 0 }; string = ''; }
const cc = { Node: SceneNode, UITransform: Transform, Graphics, Label, EditBox,
  BlockInputEvents: class {}, Layers: { Enum: { UI_2D: 1 } },
  sys: { isBrowser: false, localStorage: { getItem: () => null, setItem() {} } } };
const sourceURL = new URL('../assets/scripts/MultiplayerPanel.ts', import.meta.url);
(globalThis as any).__kartOwnershipCC = cc;
const hooks = registerHooks({
  resolve(id, context, next) {
    if (context.parentURL === sourceURL.href) {
      if (id === 'cc') return { url: 'kart-ownership:cc', shortCircuit: true };
      if (id === './HUD' || id === './MultiplayerClient') return { url: 'kart-ownership:' + id.slice(2), shortCircuit: true };
      if (id.startsWith('./') && !id.endsWith('.ts')) return next(new URL(id + '.ts', sourceURL).href, context);
    }
    return next(id, context);
  },
  load(url, context, next) {
    if (url === 'kart-ownership:cc') return { format: 'module', shortCircuit: true,
      source: `export const { ${Object.keys(cc).join(',')} } = globalThis.__kartOwnershipCC;` };
    if (url === 'kart-ownership:HUD' || url === 'kart-ownership:MultiplayerClient') return {
      format: 'module', shortCircuit: true, source: `export class ${url.slice('kart-ownership:'.length)} {}` };
    const result = next(url, context);
    if (url === sourceURL.href) return { ...result, format: 'module',
      source: stripTypeScriptTypes(result.source!.toString(), { mode: 'transform' }) };
    return result;
  },
});
let MultiplayerPanel: any;
try { ({ MultiplayerPanel } = await import(sourceURL.href)); }
finally { hooks.deregister(); delete (globalThis as any).__kartOwnershipCC; }

const lockedMessage = '房间赛车或车手未解锁，请房主换车或退出后解锁';
function setup(canUse?: (selection: Selection) => boolean, roomSelection: Partial<Selection> = {}) {
  const root = new SceneNode('HUD');
  const hud = { root,
    box(parent: SceneNode, x: number, y: number, width: number, height: number) {
      const node = new SceneNode('box'); parent.addChild(node); node.setPosition(x, y);
      node.addComponent(Transform).setContentSize(width, height); return node.addComponent(Graphics);
    },
    label(parent: SceneNode, text: string, x: number, y: number, _size: number, _color: string, width: number, height: number) {
      const node = new SceneNode('label'); parent.addChild(node); node.setPosition(x, y);
      node.addComponent(Transform).setContentSize(width, height);
      const label = node.addComponent(Label); label.string = text; return label;
    },
  };
  const room: RoomState = { ...defaultSelection, ...roomSelection, code: 'ABCD1234', hostId: 'self',
    phase: 'lobby', revision: 2, bots: 3, raceId: 0, seed: 1, roster: [],
    members: [{ ...defaultSelection, id: 'self', name: '车手', ready: false, connected: true, loadedRevision: 2 }] };
  const sent: ClientMessage[] = [];
  const calls = { leave: 0 };
  const client = { room, selfId: 'self', endpoint: 'wss://example.test', connected: true, connecting: false,
    status: '', changed() {}, send(message: ClientMessage) { sent.push(message); } };
  const panel = new MultiplayerPanel(hud, client, () => ({ ...defaultSelection }), () => {}, () => { calls.leave++; }, canUse);
  panel.root.active = true;
  return { panel, client, room, sent, calls };
}
function descendants(node: SceneNode): SceneNode[] { return [node, ...node.children.flatMap(descendants)]; }
function press(panel: any, name: string) {
  const button = descendants(panel.root).find(node => node.name === name && node.handlers.has(SceneNode.EventType.TOUCH_END));
  assert.ok(button, `Missing actual ${name} button`);
  for (let node: SceneNode | undefined = button; node; node = node.parent) assert.equal(node.active, true, `${name} must remain accessible`);
  button.emit(SceneNode.EventType.TOUCH_END);
}
function cycle(panel: any, field: 'vehicle' | 'driver', delta: -1 | 1) {
  const y = 98 - (field === 'vehicle' ? 2 : 3) * 40;
  const button = descendants(panel.root).find(node => node.name === (delta < 0 ? '‹' : '›') && node.position.y === y);
  assert.ok(button, `Missing actual ${field} arrow`);
  assert.equal(button.active, true, 'Host arrow must be accessible');
  button.emit(SceneNode.EventType.TOUCH_END);
}
const owns = (vehicleIds: string[], driverIds: string[]) => (selection: Selection) =>
  vehicleIds.includes(selection.vehicle) && driverIds.includes(selection.driver);

test('host arrows skip locked vehicles and drivers in either direction, including wraparound', () => {
  const { panel, sent } = setup(owns(['classic-kart', 'electric', 'retro-roadster'], ['rookie', 'champion', 'mechanic']));
  cycle(panel, 'vehicle', 1); cycle(panel, 'vehicle', -1);
  cycle(panel, 'driver', 1); cycle(panel, 'driver', -1);
  assert.deepEqual(sent, [
    { type: 'selection', ...defaultSelection, vehicle: 'electric' },
    { type: 'selection', ...defaultSelection, vehicle: 'retro-roadster' },
    { type: 'selection', ...defaultSelection, driver: 'champion' },
    { type: 'selection', ...defaultSelection, driver: 'mechanic' },
  ]);
});

test('a room with both items locked can repair either field without replacing the other room choices', () => {
  const { panel, sent } = setup(owns(['classic-kart', 'electric'], ['rookie', 'explorer']),
    { theme: 'glacier', route: 'city', vehicle: 'dune-buggy', driver: 'champion' });
  cycle(panel, 'vehicle', 1); cycle(panel, 'driver', 1);
  assert.deepEqual(sent, [
    { type: 'selection', theme: 'glacier', route: 'city', vehicle: 'electric', driver: 'champion' },
    { type: 'selection', theme: 'glacier', route: 'city', vehicle: 'dune-buggy', driver: 'explorer' },
  ]);
});

for (const field of ['vehicle', 'driver'] as const) test(`no usable ${field} stops after a bounded catalog traversal`, () => {
  let checked = 0;
  const count = field === 'vehicle' ? vehicles.length : drivers.length;
  const { panel, sent } = setup(() => {
    assert.ok(++checked <= count + 2, 'Ownership rejection must not cause an endless selection loop');
    return false;
  });
  checked = 0;
  cycle(panel, field, 1);
  assert.equal(sent.length, 0);
  assert.ok(checked > 0 && checked <= count + 2);
});

for (const locked of [{ vehicle: 'formula' }, { driver: 'polar-guide' }]) {
  test(`locked room ${Object.keys(locked)[0]} blocks ready, start, and rematch while leaving exit usable`, () => {
    const { panel, client, room, sent, calls } = setup(owns(['classic-kart'], ['rookie']), locked);
    assert.equal(panel.status.string, lockedMessage);
    for (const action of ['准备', '开始比赛']) {
      client.status = '已连接'; client.changed();
      assert.equal(panel.status.string, lockedMessage, 'Connection messages must not hide the unlock requirement');
      press(panel, action);
      assert.equal(client.status, lockedMessage);
      assert.equal(sent.length, 0);
    }
    room.phase = 'finished'; client.changed();
    press(panel, '开始比赛'); // The node keeps its name when the label changes to 再开一场.
    assert.equal(client.status, lockedMessage);
    assert.equal(sent.length, 0);
    press(panel, '退出房间');
    assert.equal(calls.leave, 1);
  });
}

test('ownership is checked against the current room after a host selection update', () => {
  const { panel, client, room, sent } = setup(owns(['classic-kart'], ['rookie']));
  room.vehicle = 'supercar'; room.revision++; room.members[0].loadedRevision = room.revision;
  client.changed(); press(panel, '准备');
  assert.equal(sent.length, 0);
  assert.equal(client.status, lockedMessage);
  room.vehicle = 'classic-kart'; client.changed(); press(panel, '准备');
  assert.deepEqual(sent, [{ type: 'ready', ready: true }]);
});

test('omitting the optional ownership callback preserves ready, start, rematch, and cycling behavior', () => {
  const { panel, client, room, sent } = setup();
  cycle(panel, 'vehicle', 1); press(panel, '准备'); press(panel, '开始比赛');
  room.phase = 'finished'; client.changed(); press(panel, '开始比赛');
  assert.deepEqual(sent, [
    { type: 'selection', ...defaultSelection, vehicle: 'dune-buggy' },
    { type: 'ready', ready: true }, { type: 'start' }, { type: 'rematch' },
  ]);
});

test('owned room selection still waits for assets before sending ready', () => {
  const { panel, client, room, sent } = setup(owns(['classic-kart'], ['rookie']));
  room.members[0].loadedRevision = 1;
  client.changed(); press(panel, '准备');
  assert.equal(client.status, '请等待素材加载完成');
  assert.deepEqual(sent, []);
});
