import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { stripTypeScriptTypes } from 'node:module';
import { createMatch, command, snapshot } from '../assets/scripts/core/engine.ts';

// Exercise the shipped controller and real rule core with input/paint doubles.
// These unit tests do not stand in for Creator rendering or browser acceptance.
const moduleUrl = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const cc = moduleUrl(`
  export const _decorator = { ccclass: () => (value) => value };
  export class Component {} export class AudioClip {} export class AudioSource {}
  export class EventMouse {} export class EventTouch {}
  export const Game = {}, Input = {}, game = {}, input = {}, resources = {}, view = {};
  export const VERSION = 'test-double';
  export const sys = { isBrowser: false, localStorage: { setItem() {}, removeItem() {} } };
`);
const ui = moduleUrl(`
  export const W = 1152, H = 540;
  export const C = { ink: '', deep: '', jade: '', mint: '', gold: '', paper: '', muted: '', red: '' };
  export class MergeView {}
`);
const effects = moduleUrl(
  'export const attackEffects = () => {}, crystalImpact = () => {}, troopPose = () => ({dx:0,dy:0,angle:0});',
);
const controller = new URL('../assets/scripts/MergeFront.ts', import.meta.url);
const source = stripTypeScriptTypes(
  (await readFile(controller, 'utf8')).replace("@ccclass('MergeFront')", ''),
).replace(/from ['"]([^'"]+)['"]/g, (_, specifier) => {
  const url =
    specifier === 'cc'
      ? cc
      : specifier === './MergeView'
        ? ui
        : specifier === './BattleEffects'
          ? effects
          : new URL(specifier, controller).href;
  return 'from ' + JSON.stringify(url);
});
const { MergeFront } = await import(moduleUrl(source));
function fixture(seed = 18) {
  const app = new MergeFront();
  app.match = createMatch('level-01', seed);
  app.screen = 'playing';
  app.ui = {
    ready: true,
    controls: [],
    nodes: new Map(),
    frames: new Map(),
    pressed: '',
    begin() {
      this.controls = [];
    },
    end() {},
    panel() {},
    text() {},
    image() {},
    circle() {},
    ellipse() {},
    line() {},
    progress() {},
    crystal() {},
    hit(id, label, x, y, w, h, disabled = false) {
      this.controls.push({ id, label, x, y, w, h, disabled });
    },
    button(id, label, x, y, w, h, primary, disabled) {
      this.hit(id, label, x, y, w, h, disabled);
    },
    pause(x, y) {
      this.hit('pause', '暂停', x, y, 76, 72);
    },
    at(x, y) {
      return this.controls.findLast(
        (c) => !c.disabled && x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h,
      );
    },
  };
  app.render();
  return app;
}
function point(app, id) {
  const c = app.ui.controls.find((c) => c.id === id);
  assert(c, id);
  return { x: c.x + c.w / 2, y: c.y + c.h / 2 };
}
function start(app, id) {
  const p = point(app, id);
  app.down(1, p.x, p.y);
  return p;
}
function tickHold(app) {
  for (let i = 0; i < 6; i++) app.update(0.1);
}
function tap(app, id) {
  const p = start(app, id);
  app.up(1, p.x, p.y);
}

test('tap buys once into inventory and surviving offers stay at their original coordinates', () => {
  const app = fixture(),
    side = app.match.sides[0];
  const offer = side.shop.find((o) => o.key === 'fortify');
  const others = side.shop
    .filter((o) => o !== offer)
    .map((o) => [o.id, point(app, 'offer:' + o.id)]);
  const p = point(app, 'offer:' + offer.id);
  tap(app, 'offer:' + offer.id);
  assert.equal(side.coins, 4);
  assert.equal(side.spells.length, 1);
  assert.equal(app.hoverInfo, null);
  assert.equal(app.cardInfo, null);
  for (const [id, position] of others) assert.deepEqual(point(app, 'offer:' + id), position);
  app.down(1, p.x, p.y);
  app.up(1, p.x, p.y);
  assert.equal(side.coins, 4, 'a second tap in the vacancy cannot buy another offer');
});

test('long press across shop, hand, enemies, own units and spells is read-only; release consumes gesture', () => {
  const app = fixture(),
    side = app.match.sides[0];
  const card = side.hand[0];
  assert(command(app.match, 0, { type: 'deploy', card: card.id, x: 300, y: 180 }).ok);
  app.buyOffer(side.shop.find((o) => o.key === 'fortify').id);
  app.render();
  const controls = app.ui.controls.filter((c) => /^(offer|card|enemy|unit|spell):/.test(c.id));
  assert.equal(new Set(controls.map((c) => c.id.split(':')[0])).size, 5);
  for (const c of controls) {
    const before = snapshot(app.match),
      p = start(app, c.id);
    tickHold(app);
    assert(app.hoverInfo, c.id);
    assert.equal(app.cardInfo, null);
    assert(
      app.ui.controls.some((c) => c.id === 'pause'),
      'tooltip does not replace the scene controls',
    );
    app.move(1, p.x + 100, p.y - 90);
    app.up(1, p.x + 100, p.y - 90);
    assert.equal(app.hoverInfo, null);
    assert.deepEqual(snapshot(app.match), before);
  }
});

test('drag wins over hold; primary cancellation clears inspection while secondary cancellation does not', () => {
  const app = fixture(),
    id = 'card:' + app.match.sides[0].hand[0].id;
  const p = start(app, id);
  app.move(1, p.x + 20, p.y - 50);
  tickHold(app);
  assert.equal(app.hoverInfo, null);
  assert(app.press.moved);
  app.touchCancel({ getID: () => 2 });
  assert(app.press);
  app.touchCancel({ getID: () => 1 });
  assert.equal(app.press, null);
  app.update(0);
  start(app, id);
  tickHold(app);
  assert(app.hoverInfo);
  app.touchCancel({ getID: () => 2 });
  assert(app.hoverInfo);
  app.touchCancel({ getID: () => 1 });
  assert.equal(app.hoverInfo, null);
});

test('release, resize cleanup, suspend and stage transition cannot leave an inspection or execute a stale buy', () => {
  for (const clear of ['clear', 'suspend', 'stage']) {
    const app = fixture(),
      offer = app.match.sides[0].shop[0],
      p = start(app, 'offer:' + offer.id);
    tickHold(app);
    if (clear === 'stage') {
      app.match.roundStage = 'battle';
      app.update(0);
    } else if (clear === 'suspend') {
      // Suspend switches screen and persists but the paint double need not draw the pause menu.
      app.render = () => {};
      app.suspend();
    } else app.clear();
    assert.equal(app.hoverInfo, null);
    assert.equal(app.press, null);
    app.up(1, p.x, p.y);
    assert.equal(app.match.sides[0].coins, 6);
  }
});

test('unaffordable/full purchases preserve state; a full bag can still buy a matching fragment', () => {
  const app = fixture(),
    side = app.match.sides[0];
  side.coins = 0;
  const offer = side.shop[0];
  app.render();
  const before = snapshot(app.match);
  tap(app, 'offer:' + offer.id);
  assert.deepEqual(snapshot(app.match), before);
  side.coins = 10;
  side.bag['nezha:0'] = 10;
  const full = snapshot(app.match);
  tap(app, 'offer:' + side.shop.find((o) => o.kind === 'spell').id);
  assert.deepEqual(snapshot(app.match), full);
  side.shop = [{ id: 999, key: 'nezha', kind: 'part', part: 'nezha:1', cost: 1 }];
  app.render();
  tap(app, 'offer:999');
  assert.equal(side.coins, 9);
  assert.equal(side.hand.length, 3);
  assert.equal(side.bag['nezha:0'], 9);
});

test('purchase selects the page containing the new spell and duplicate fragments keep distinct controls', () => {
  const app = fixture(),
    side = app.match.sides[0];
  side.bag['nezha:0'] = 7;
  app.render();
  app.buyOffer(side.shop.find((o) => o.key === 'fortify').id);
  app.render();
  assert.equal(app.handPage, 1);
  assert(app.ui.controls.some((c) => c.id === 'spell:' + side.spells[0].id));
  app.handPage = 0;
  app.render();
  const parts = app.ui.controls.filter((c) => c.id.startsWith('part:'));
  assert.equal(parts.length, 4);
  assert.equal(new Set(parts.map((c) => c.id)).size, 4);
  const p = start(app, parts[0].id);
  tickHold(app);
  assert.equal(app.hoverInfo.title, '哪 · 残字');
  app.up(1, p.x, p.y);
});

test('combat inspection reads live stats without enabling formation or shop changes', () => {
  const app = fixture(),
    card = app.match.sides[0].hand[0];
  assert(command(app.match, 0, { type: 'deploy', card: card.id, x: 300, y: 180 }).ok);
  assert(command(app.match, 0, { type: 'startRound' }).ok);
  app.render();
  const id = 'troop:' + card.id,
    p = start(app, id),
    before = app.match.tick;
  tickHold(app);
  assert(app.match.tick > before);
  assert(app.hoverInfo?.body.includes('护盾'));
  assert(!app.ui.controls.some((c) => /^(offer|unit|card):/.test(c.id)));
  app.up(1, p.x, p.y);
  assert.equal(app.hoverInfo, null);
});

test('dropping on the bench edge recalls instead of merging or casting into the nearby board', () => {
  const app = fixture(),
    side = app.match.sides[0],
    card = side.hand[0];
  assert(command(app.match, 0, { type: 'deploy', card: card.id, x: 300, y: 330 }).ok);
  side.hand.push({ ...card, id: 999 });
  app.buyOffer(side.shop.find((o) => o.key === 'fortify').id);
  app.render();
  const edge = { x: app.fieldPoint(300, 330).x, y: app.inspect().dropZones.hand.y + 1 };
  for (const id of ['card:999', 'spell:' + side.spells[0].id]) {
    const before = snapshot(app.match);
    start(app, id);
    app.move(1, edge.x, edge.y);
    app.up(1, edge.x, edge.y);
    assert.deepEqual(snapshot(app.match), before);
  }
  start(app, 'unit:' + card.id);
  app.move(1, edge.x, edge.y);
  app.up(1, edge.x, edge.y);
  assert.equal(side.formation.length, 0);
  assert.equal(side.hand.length, 3);
});
