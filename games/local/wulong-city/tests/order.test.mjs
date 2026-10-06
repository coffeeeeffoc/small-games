import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({});
context.window = context;
vm.runInContext(await readFile(new URL('../levels-data.js', import.meta.url), 'utf8'), context);
vm.runInContext(await readFile(new URL('../level-order.js', import.meta.url), 'utf8'), context);
const route = context.LEVEL_ROUTE;
const ids = progress => route.order.filter(id => progress.unlockedLevels.has(id)).join(',');

test('the dog encounter moves to eighth without changing level IDs or losing content', () => {
  assert.equal(route.order.slice(0,26).join(','), '1,2,4,5,6,7,8,3,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26');
  assert.equal(route.order.slice(26).join(','), Array.from({length:74},(_,i)=>i+27).join(','));
  assert.equal(route.order.length,100);
  assert.equal([...route.order].sort((a, b) => a - b).join(','), Object.keys(context.LEVEL_DATA).join(','));
  assert.equal(route.number(3), 8);
  assert.equal(route.number(4), 3);
  assert.equal(route.next(2), 4);
  assert.equal(route.next(8), 3);
  assert.equal(route.next(3), 9);
  assert.equal(route.next(26), 27);
  assert.equal(route.next(100), null);
});

test('new players unlock exactly one next encounter along the revised route', () => {
  const progress = route.restore();
  assert.equal(ids(progress), '1');
  for (const [index, id] of route.order.entries()) {
    route.unlockNext(progress.unlockedLevels, id);
    assert.equal(route.frontier(progress.unlockedLevels), Math.min(index + 2, route.order.length));
    assert.equal(progress.unlockedLevels.size, Math.min(index + 2, route.order.length));
  }
});

test('legacy progress keeps the dog unlocked and saved while also opening the new third encounter', () => {
  const progress = route.restore({ unlocked: 3, records: { 1: 'door', 2: 'lift' }, level: 3, sound: false });
  assert.equal(ids(progress), '1,2,4,3');
  assert.equal(route.frontier(progress.unlockedLevels), 3);
  assert.equal(progress.level, 3);
  assert.equal(progress.sound, false);
  assert.deepEqual(progress.records, { 1: 'door', 2: 'lift' });
  assert.equal(progress.unlockedLevels.has(9), false);
});

test('old unlocks and completed records survive migration without renumbering or opening intermediate levels', () => {
  const progress = route.restore({ unlocked: 4, records: { 3: 'dog carried human' }, level: 3 });
  assert.equal(ids(progress), '1,2,4,3,9');
  assert.equal(progress.records[3], 'dog carried human');
  assert.equal(progress.records[8], undefined);
  assert.equal(progress.unlockedLevels.has(5), false);
  const resumed = route.restore({ orderVersion: 2, unlocked: 3, unlockedLevels: [...progress.unlockedLevels], records: progress.records, level: 3 });
  assert.equal(ids(resumed), ids(progress));
  assert.equal(resumed.level, 3);
});

test('completed old endings unlock the next added encounter; reaching one is insufficient', () => {
  for (const id of [20, 24, 26]) {
    assert.equal(route.restore({ unlocked: id, level: id }).unlockedLevels.has(id + 1), false);
    const progress = route.restore({ unlocked: id, records: { [id]: 'completed' }, level: id });
    assert.equal(progress.level, id);
    assert.equal(route.frontier(progress.unlockedLevels), id + 1);
    assert.equal(progress.unlockedLevels.has(id + 2), false);
  }
});

test('a completed 26-level save resumes at the new route without unlocking its remainder',()=>{
  const records=Object.fromEntries(Array.from({length:26},(_,i)=>[i+1,`record-${i+1}`]));
  const old=route.restore({unlocked:26,level:26,records});
  assert.equal(old.level,26);assert.equal(route.frontier(old.unlockedLevels),27);
  assert.equal(old.unlockedLevels.has(27),true);assert.equal(old.unlockedLevels.has(28),false);
  const saved=route.restore({orderVersion:2,level:27,unlockedLevels:[...old.unlockedLevels],records});
  assert.equal(saved.level,27);assert.equal(ids(saved),ids(old));
});

test('legacy counters cannot silently unlock the second city; current saves restore all 100 IDs',()=>{
  assert.equal(route.restore({unlocked:100}).unlockedLevels.size,26);
  const all=route.restore({orderVersion:2,level:100,unlockedLevels:[...route.order],records:{100:'home'}});
  assert.equal(all.level,100);assert.equal(route.frontier(all.unlockedLevels),100);
  assert.equal(all.unlockedLevels.size,100);assert.equal(route.next(100),null);
  route.unlockNext(all.unlockedLevels,100);
  assert.equal(all.unlockedLevels.size,100,'the ending must not invent level 101');
});
