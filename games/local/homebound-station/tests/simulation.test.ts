import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, DIRECTIONS } from '../src/levels.ts';
import { idlePose } from '../src/ambient.ts';
import { advance, blocker, canDispatch, createSimulation, dispatch, snapshot, splitGroup, splitPlans } from '../src/simulation.ts';
import type { Simulation } from '../src/simulation.ts';

function invariant(s: Simulation) {
  const leaves = s.groups.filter(g => !s.groups.some(c => c.parentGroupId === g.id));
  const ids = leaves.flatMap(g => g.passengers.map(p => p.id));
  assert.equal(ids.length, s.target); assert.equal(new Set(ids).size, s.target);
  assert.equal(s.delivered.size, leaves.filter(g => g.state === 'departed').reduce((n, g) => n + g.passengers.length, 0));
  for (const g of leaves) {
    assert(g.boarded <= g.passengers.length);
    if (g.vehicleId) { const v = s.vehicles.find(v => v.id === g.vehicleId)!; assert.equal(v.groupId, g.id); assert(g.passengers.length <= v.passengerCapacity); assert.equal(v.seatCount - v.driverSeatCount, v.passengerCapacity); }
  }
  for (const b of s.bays) {
    const jobs = s.services.filter(j => j.bayId === b.id && j.clearedAt === undefined);
    assert.equal(jobs.length, b.state === 'free' ? 0 : 1);
    if (jobs.length) { assert.equal(b.groupId, jobs[0]!.groupId); assert.equal(b.vehicleId, jobs[0]!.vehicleId); }
  }
  const moving = s.services.filter(j => ['driving', 'departing'].includes(j.phase));
  assert(moving.length <= 1); assert.equal(moving[0]?.vehicleId, s.roadOwner);
  assert.equal(new Set(s.services.map(j => j.vehicleId)).size, s.services.length);
  // Independent geometric SAT test, including a 3m x 1.5m footprint for each rendered car.
  const cars = s.vehicles.filter(v => v.state !== 'removed');
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i]!, b = cars[j]!;
    const axes = [a, b].flatMap(v => [[Math.sin(v.angle), Math.cos(v.angle)], [Math.cos(v.angle), -Math.sin(v.angle)]]);
    const radius = (v: typeof a, axis: number[]) => 1.5 * Math.abs(Math.sin(v.angle) * axis[0]! + Math.cos(v.angle) * axis[1]!) + 0.75 * Math.abs(Math.cos(v.angle) * axis[0]! - Math.sin(v.angle) * axis[1]!);
    assert(axes.some(axis => Math.abs((b.position.x - a.position.x) * axis[0]! + (b.position.z - a.position.z) * axis[1]!) >= radius(a, axis) + radius(b, axis) - 0.02), `车辆穿模 ${a.id}/${b.id} t=${s.time}`);
  }
}
function drive(s: Simulation, seconds: number) { for (let i = 0; i < seconds * 20; i++) { advance(s, 0.05); invariant(s); } }
function solve(level: number, reverse = false, split = true) {
  const s = createSimulation(LEVELS[level]!);
  for (let i = 0; i < 12000 && !s.won; i++) {
    if (split || !s.vehicles.some(v => v.passengerCapacity === 6 && canDispatch(s, v.id).ok)) for (const g of s.groups) { const plan = splitPlans(s, g.id)[0]; if (plan) assert(splitGroup(s, g.id, plan, true).ok); }
    const cars = reverse ? [...s.vehicles].reverse() : s.vehicles;
    for (const v of cars) if (canDispatch(s, v.id).ok) assert(dispatch(s, v.id).ok);
    drive(s, 0.05);
  }
  assert(s.won, `第${level + 1}关必须可解：剩余 ${s.vehicles.filter(v => v.state === 'holding').map(v => v.id).join(',')}，已接${s.delivered.size}/${s.target}`);
  assert(s.vehicles.every(v => v.state === 'removed')); assert(s.bays.every(b => b.state === 'free')); assert.equal(s.delivered.size, s.target);
  return s;
}
test('每关包含12/16/20辆实际车辆，四个真实车位；箭头阻挡图可以完全解开', () => {
  LEVELS.forEach((level, i) => {
    const s = createSimulation(level); assert.equal(s.vehicles.length, [12, 16, 20][i]); assert.equal(s.bays.length, 4);
    const remaining = [...level.vehicles]; let blocked = 0;
    const clear = (car: typeof remaining[number]) => !remaining.some(other => {
      if (car === other) return false;
      const dir = DIRECTIONS[car.direction], dx = other.column - car.column, dz = other.row - car.row;
      return dx * dir.x + dz * dir.z > 0 && dx * dir.z - dz * dir.x === 0;
    });
    blocked = remaining.filter(v => !clear(v)).length; assert(blocked >= remaining.length / 2);
    while (remaining.length) { const index = remaining.findIndex(clear); assert(index >= 0, '箭头不能形成无解闭环'); remaining.splice(index, 1); }
    invariant(s);
  });
});
test('挡路车必须先走；错误点击无副作用；移动不会穿过还没出库的车', () => {
  const s = createSimulation(LEVELS[0]!); const car = s.vehicles.find(v => blocker(s, v))!;
  const before = JSON.stringify(snapshot(s)); assert.equal(dispatch(s, car.id).ok, false); assert.equal(JSON.stringify(snapshot(s)), before);
  assert(dispatch(s, '巡01').ok); drive(s, 0.3); assert.equal(s.vehicles[0]!.position.z, 6); assert(s.vehicles[0]!.position.x < -8);
  drive(s, 15); assert.equal(s.vehicles[0]!.state, 'removed');
});
test('自动分配空位，快速重复点击不重复派车和计数', () => {
  const s = createSimulation(LEVELS[0]!); assert(dispatch(s, '巡01').ok);
  assert.equal(s.vehicles[0]!.bayId, 'T1');
  for (let i = 0; i < 20; i++) assert.equal(dispatch(s, '巡01').ok, false);
  assert(dispatch(s, '巡02').ok); assert.equal(s.vehicles[1]!.bayId, 'T2');
  drive(s, 30); assert.equal(s.delivered.size, 6); assert.equal(s.services.length, 2);
});
test('四个车位满时不可超额预留', () => {
  const s = createSimulation(LEVELS[2]!);
  const free = s.vehicles.filter(v => !blocker(s, v)); assert(free.length >= 5);
  for (const v of free.slice(0, 4)) assert(dispatch(s, v.id).ok);
  const before = JSON.stringify(snapshot(s)); assert.equal(dispatch(s, free[4]!.id).ok, false); assert.equal(JSON.stringify(snapshot(s)), before);
});
test('按T1到T4检查各队首，容量足够即可，不合适的车位自动跳过', () => {
  const config = structuredClone(LEVELS[0]!);
  [6, 5, 2, 4].forEach((size, i) => { config.groups[i]!.size = size; });
  const s = createSimulation(config);
  assert(dispatch(s, '巡01').ok);
  assert.equal(s.vehicles[0]!.bayId, 'T3'); assert.equal(s.vehicles[0]!.groupId, 'T03');
  assert.equal(s.groups[0]!.state, 'ready'); assert.equal(s.groups[1]!.state, 'ready');
  assert(dispatch(s, '巡02').ok); assert.equal(s.vehicles[1]!.bayId, 'T4');
  assert(dispatch(s, '巡05').ok); assert.equal(s.vehicles[4]!.bayId, 'T1');
  invariant(s);
});
test('所有空位的队首都坐不下时拒绝；同一队列不能跳过大组去接后面小组', () => {
  const config = structuredClone(LEVELS[0]!);
  [6, 5, 6, 5].forEach((size, i) => { config.groups[i]!.size = size; });
  const s = createSimulation(config), before = JSON.stringify(snapshot(s));
  assert.equal(dispatch(s, '巡01').ok, false);
  assert.equal(JSON.stringify(snapshot(s)), before);
});
test('车尾离位即释放并计数；旧车仍在画面时下一辆能预留，旧车出画面不清新预留', () => {
  const s = createSimulation(LEVELS[0]!); assert(dispatch(s, '巡01').ok);
  for (let i = 0; i < 500 && s.delivered.size === 0; i++) drive(s, 0.05);
  const v = s.vehicles[0]!, bay = s.bays[0]!;
  assert.equal(v.state, 'departing'); assert(v.position.x < 15); assert.equal(bay.state, 'free'); assert.equal(s.delivered.size, 2);
  assert(dispatch(s, '巡02').ok); assert.equal(bay.vehicleId, '巡02');
  while (v.state !== 'removed') { drive(s, 0.05); assert.equal(bay.vehicleId, '巡02'); assert.equal(bay.state, 'reserved'); }
  drive(s, 25); assert.equal(s.delivered.size, 6);
});
test('容量区分司机；6人分车需同意和两条可落实路线，人数守恒且父组不重复服务', () => {
  const s = createSimulation(LEVELS[1]!); const v = s.vehicles[0]!;
  assert.equal(v.seatCount, 5); assert.equal(v.passengerCapacity, 4); assert.equal(dispatch(s, v.id, 'T1').ok, false);
  const plan = splitPlans(s, 'T01')[0]!; assert.deepEqual(plan.counts, [3, 3]);
  assert.equal(splitGroup(s, 'T01', plan, false).ok, false);
  assert.equal(splitGroup(s, 'T01', { ...plan, counts: [4, 4] }, true).ok, false);
  assert(splitGroup(s, 'T01', plan, true).ok); assert.equal(splitGroup(s, 'T01', plan, true).ok, false);
  const children = s.groups.filter(g => g.parentGroupId === 'T01'); assert.deepEqual(children.flatMap(g => g.passengers.map(p => p.id)), s.groups[0]!.passengers.map(p => p.id));
  assert(dispatch(s, plan.vehicles[0]).ok); drive(s, 20); assert.equal(s.groups[0]!.state, 'split');
  assert(dispatch(s, plan.vehicles[1]).ok); drive(s, 20); assert.equal(s.groups[0]!.state, 'departed'); assert.equal(s.delivered.size, 6);
  const care = createSimulation(LEVELS[1]!); care.groups[0]!.passengers[0]!.needsGuardian = true; assert.deepEqual(splitPlans(care, 'T01'), []);
});
test('暂停冻结整个世界，重试重建车阵；不同帧率模拟一致', () => {
  const s = createSimulation(LEVELS[0]!); dispatch(s, '巡01'); drive(s, 1); s.paused = true;
  const before = JSON.stringify(snapshot(s)); advance(s, 500); assert.equal(JSON.stringify(snapshot(s)), before); assert.equal(dispatch(s, '巡02').ok, false);
  const a = createSimulation(LEVELS[0]!), b = createSimulation(LEVELS[0]!); for (const sim of [a, b]) dispatch(sim, '巡01');
  for (let i = 0; i < 600; i++) advance(a, 1 / 60); advance(b, 10); assert.deepEqual(snapshot(a), snapshot(b));
  const fresh = createSimulation(LEVELS[0]!); assert.equal(fresh.time, 0); assert.equal(fresh.services.length, 0); assert.equal(fresh.delivered.size, 0); assert(fresh.vehicles.every(v => v.state === 'holding'));
});
test('待机动作局限在排队位置附近，同一乘客和时间的动作可重现', () => {
  for (const id of ['T01/p1', 'T01/p2', 'T12/p6']) for (let time = 0; time < 100; time += 0.13) {
    const pose = idlePose(id, time); assert.deepEqual(pose, idlePose(id, time));
    assert(Math.abs(pose.z) <= 0.2); assert(Math.abs(pose.turn) <= 0.3); assert(Math.abs(pose.stride) <= 0.28);
  }
  assert.notDeepEqual(idlePose('T01/p1', 8), idlePose('T01/p2', 8));
});
for (let i = 0; i < LEVELS.length; i++) for (const reverse of [false, true]) test(`第${i + 1}关${reverse ? '反向' : '正向'}选择全过程守恒、碰撞和通关`, () => { solve(i, reverse); });
test('整组坐大车时多余车辆仍须收班离场，接完人不提前判赢', () => {
  const s = solve(1, false, false); assert.equal(s.groups[0]!.boarded, 6); assert(s.services.some(j => !j.groupId));
});
