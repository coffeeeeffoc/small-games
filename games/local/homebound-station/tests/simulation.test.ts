import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, DIRECTIONS, boardDepth, validateLevels, type LevelConfig } from '../src/levels.ts';
import { idlePose } from '../src/ambient.ts';
import {
  advance,
  blocker,
  canDispatch,
  createSimulation,
  dispatch,
  snapshot,
  splitGroup,
  splitPlans,
  queuePosition,
} from '../src/simulation.ts';
import type { Simulation } from '../src/simulation.ts';
import { solveLevel } from './support/solver.ts';

function invariant(s: Simulation) {
  const leaves = s.groups.filter((g) => !s.groups.some((c) => c.parentGroupId === g.id));
  const ids = leaves.flatMap((g) => g.passengers.map((p) => p.id));
  assert.equal(ids.length, s.target);
  assert.equal(new Set(ids).size, s.target);
  assert.equal(
    s.delivered.size,
    leaves.filter((g) => g.state === 'departed').reduce((n, g) => n + g.passengers.length, 0),
  );
  for (const g of leaves) {
    assert(g.boarded <= g.passengers.length);
    if (g.vehicleId) {
      const v = s.vehicles.find((v) => v.id === g.vehicleId)!;
      assert.equal(v.groupId, g.id);
      assert(g.passengers.length <= v.passengerCapacity);
    }
  }
  for (const b of s.bays) {
    const jobs = s.services.filter(
      (j) => j.bayId === b.id && j.clearedAt === undefined && j.phase !== 'done',
    );
    if (b.state !== 'free') {
      assert(jobs.length);
      assert.equal(b.vehicleId, jobs[0]!.vehicleId, '停靠位保持分配顺序，后来点击不能抢占');
      assert.equal(b.groupId, jobs[0]!.groupId);
    }
  }
  assert.equal(new Set(s.services.map((j) => j.vehicleId)).size, s.services.length);
  assert.equal(
    new Set(s.services.filter((j) => j.groupId).map((j) => j.groupId)).size,
    s.services.filter((j) => j.groupId).length,
  );
  for (const job of s.services)
    if (job.groupId) assert.deepEqual(job.pickupPoint, job.walkFrom, '接客期间不可重算乘客位置');
  // Independent SAT check: rendered bodies are 3m long and 1.5m wide, including rotations.
  const cars = s.vehicles.filter((v) => v.state !== 'removed');
  for (let i = 0; i < cars.length; i++)
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i]!,
        b = cars[j]!;
      const axes = [a, b].flatMap((v) => [
        [Math.sin(v.angle), Math.cos(v.angle)],
        [Math.cos(v.angle), -Math.sin(v.angle)],
      ]);
      const radius = (v: typeof a, axis: number[]) =>
        1.5 * Math.abs(Math.sin(v.angle) * axis[0]! + Math.cos(v.angle) * axis[1]!) +
        0.75 * Math.abs(Math.cos(v.angle) * axis[0]! - Math.sin(v.angle) * axis[1]!);
      assert(
        axes.some(
          (axis) =>
            Math.abs(
              (b.position.x - a.position.x) * axis[0]! + (b.position.z - a.position.z) * axis[1]!,
            ) >=
            radius(a, axis) + radius(b, axis) - 0.02,
        ),
        `车辆穿模 ${a.id}/${b.id} t=${s.time}`,
      );
    }
}
function drive(s: Simulation, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 20); i++) {
    advance(s, 0.05);
    invariant(s);
  }
}
function solve(config: LevelConfig, order: 'forward' | 'reverse' | 'random') {
  const { state: s } = solveLevel(config, order, { onStep: invariant });
  assert(
    s.won,
    `${config.id}/${order} 关卡应可解；t=${s.time}，已接${s.delivered.size}/${s.target}`,
  );
  assert(s.vehicles.every((v) => v.state === 'removed'));
  assert(s.bays.every((b) => b.state === 'free'));
  assert.equal(s.delivered.size, s.target);
  return s;
}
function fixture(): LevelConfig {
  return {
    id: 900,
    title: '并行测试',
    subtitle: '',
    hint: '',
    stars: [150, 240],
    groups: Array.from({ length: 8 }, (_, i) => ({ id: `T${i + 1}`, size: 2 })),
    vehicles: Array.from({ length: 8 }, (_, i) => ({
      id: `V${i + 1}`,
      capacity: 4,
      column: i % 2 ? 4 : 0,
      row: Math.floor(i / 2),
      direction: i % 2 ? 'E' : 'W',
    })),
  };
}

test('100个稳定且独立的关卡；车辆数量、依赖难度渐进；所有方向图可解', () => {
  assert.equal(LEVELS.length, 100);
  assert(validateLevels());
  LEVELS.forEach((level, i) => {
    assert.equal(level.id, i + 1);
    assert.equal(level.chapter, Math.ceil((i + 1) / 10));
    if (i) {
      assert(level.vehicles.length >= LEVELS[i - 1]!.vehicles.length);
      assert(level.difficulty! >= LEVELS[i - 1]!.difficulty!);
    }
    assert.equal(boardDepth(level.vehicles), level.dependencyDepth);
    const remaining = [...level.vehicles];
    while (remaining.length) {
      const index = remaining.findIndex(
        (car) =>
          !remaining.some((other) => {
            const d = DIRECTIONS[car.direction],
              dx = other.column - car.column,
              dz = other.row - car.row;
            return car !== other && dx * d.x + dz * d.z > 0 && dx * d.z - dz * d.x === 0;
          }),
      );
      assert(index >= 0);
      remaining.splice(index, 1);
    }
  });
});
test('连续点击立即绑定乘客和位置；八辆车可同时发车，超过四个停靠位也可接单', () => {
  const s = createSimulation(fixture());
  const positions = s.groups.map((g) => queuePosition(s, g));
  for (const [i, v] of s.vehicles.entries()) {
    assert(dispatch(s, v.id).ok);
    assert.equal(v.groupId, `T${i + 1}`);
    assert.deepEqual(s.services[i]!.pickupPoint, positions[i]);
  }
  assert.equal(s.services.length, 8);
  assert(s.services.every((j) => j.phase === 'driving'));
  const initial = s.vehicles.map((v) => ({ ...v.position }));
  drive(s, 0.1);
  assert.equal(
    s.vehicles.filter(
      (v, i) => Math.hypot(v.position.x - initial[i]!.x, v.position.z - initial[i]!.z) > 0,
    ).length,
    8,
  );
  assert.equal(s.delivered.size, 0, '第二辆出发不必等待第一组上车');
  for (let i = 0; i < 3000 && !s.won; i++) drive(s, 0.05);
  assert(s.won);
  for (const [i, job] of s.services.entries()) assert.deepEqual(job.pickupPoint, positions[i]);
});
test('重复点击和被挡点击无副作用，车不能穿过仍在停车场的车辆', () => {
  const s = createSimulation(LEVELS[99]!);
  const blocked = s.vehicles.find((v) => blocker(s, v))!;
  const before = JSON.stringify(snapshot(s));
  assert.equal(dispatch(s, blocked.id).ok, false);
  assert.equal(JSON.stringify(snapshot(s)), before);
  const free = s.vehicles.find((v) => canDispatch(s, v.id).ok)!;
  assert(dispatch(s, free.id).ok);
  const assigned = JSON.stringify(snapshot(s));
  for (let i = 0; i < 20; i++) assert.equal(dispatch(s, free.id).ok, false);
  assert.equal(JSON.stringify(snapshot(s)), assigned);
  drive(s, 10);
});
test('已分配乘客的固定站位不受前组离开影响；后来点击不抢占已排队停靠位', () => {
  const s = createSimulation(fixture());
  for (const v of s.vehicles.slice(0, 5)) assert(dispatch(s, v.id).ok);
  const source = { ...s.services[4]!.pickupPoint! };
  while (s.delivered.size === 0 && s.time < 150) drive(s, 0.05);
  assert(s.delivered.size > 0);
  assert.deepEqual(s.services[4]!.pickupPoint, source);
  for (const v of s.vehicles.slice(5)) assert(dispatch(s, v.id).ok);
  for (let i = 0; i < 4000 && !s.won; i++) drive(s, 0.05);
  assert(s.won);
});
test('大组分乘 API 保留，需同意和两辆车，人员ID守恒，子组可并行排队', () => {
  const config = fixture();
  config.groups = [{ id: 'large', size: 6, allowSplit: true }];
  const s = createSimulation(config);
  const plan = splitPlans(s, 'large')[0]!;
  assert(plan);
  assert.equal(splitGroup(s, 'large', plan, false).ok, false);
  assert(splitGroup(s, 'large', plan, true).ok);
  assert(dispatch(s, plan.vehicles[0]).ok);
  assert(dispatch(s, plan.vehicles[1]).ok);
  invariant(s);
  for (let i = 0; i < 5000 && !s.won; i++) {
    for (const v of s.vehicles) if (canDispatch(s, v.id).ok) dispatch(s, v.id);
    drive(s, 0.05);
  }
  assert(s.won);
  assert.equal(s.delivered.size, 6);
  assert.equal(s.groups[0]!.state, 'departed');
});
test('暂停冻结分配、移动和计时；重试重建空状态；1/2/3/5倍速在相同模拟时间一致', () => {
  const s = createSimulation(fixture());
  dispatch(s, 'V1');
  dispatch(s, 'V2');
  drive(s, 1);
  s.paused = true;
  const before = JSON.stringify(snapshot(s));
  advance(s, 500);
  assert.equal(JSON.stringify(snapshot(s)), before);
  assert.equal(dispatch(s, 'V3').ok, false);
  const results = [1, 2, 3, 5].map((speed) => {
    const sim = createSimulation(fixture());
    for (const v of sim.vehicles) dispatch(sim, v.id);
    for (let i = 0; i < 1800 / speed; i++) advance(sim, speed / 60);
    return snapshot(sim);
  });
  results.forEach((result) => assert.deepEqual(result, results[0]));
  const fresh = createSimulation(fixture());
  assert.equal(fresh.time, 0);
  assert.equal(fresh.services.length, 0);
  assert.equal(fresh.delivered.size, 0);
});
test('待机动作保持轻量、确定且不偏离候车位置', () => {
  for (const id of ['T01/p1', 'T01/p2', 'T12/p6'])
    for (let time = 0; time < 10; time += 0.13) {
      const pose = idlePose(id, time);
      assert.deepEqual(pose, idlePose(id, time));
      assert(Math.abs(pose.z) <= 0.2);
      assert(Math.abs(pose.turn) <= 0.3);
    }
});
for (const order of ['forward', 'reverse', 'random'] as const)
  test(`全部100关 ${order} 点击顺序：完整通关、无穿模、乘客守恒、固定接客位置`, () => {
    for (const level of LEVELS) solve(level, order);
  });

test('无关的北向出口立即真实移动，无需等待前车接客', () => {
  const config: LevelConfig = {
    id: 901,
    title: 'Parallel north exits',
    subtitle: '',
    hint: '',
    stars: [100, 200],
    groups: [
      { id: 'G1', size: 1 },
      { id: 'G2', size: 1 },
    ],
    vehicles: [
      { id: 'A', capacity: 4, column: 0, row: 0, direction: 'N' },
      { id: 'B', capacity: 4, column: 4, row: 0, direction: 'N' },
    ],
  };
  const s = createSimulation(config);
  assert(dispatch(s, 'A').ok);
  drive(s, 0.5);
  assert(dispatch(s, 'B').ok);
  drive(s, 0.1);
  assert(s.vehicles[1]!.position.z < 7.5);
  assert.equal(s.services[0]!.phase, 'driving');
  drive(s, 1);
  assert(s.vehicles[1]!.position.x > 8);
  assert.equal(s.delivered.size, 0);
  for (let i = 0; i < 2000 && !s.won; i++) drive(s, 0.05);
  assert(s.won);
});
test('北向出库和邻近湾位驶出的对向汇入不会互相锁死', () => {
  for (const delay of [3.5, 4, 4.5, 5, 5.5]) {
    const config: LevelConfig = {
      id: 902,
      title: 'Local merge',
      subtitle: '',
      hint: '',
      stars: [100, 200],
      groups: [
        { id: 'G1', size: 2 },
        { id: 'G2', size: 2 },
      ],
      vehicles: [
        { id: 'A', capacity: 4, column: 0, row: 0, direction: 'W' },
        { id: 'B', capacity: 4, column: 1, row: 0, direction: 'N' },
      ],
    };
    const s = createSimulation(config);
    assert(dispatch(s, 'A').ok);
    drive(s, delay);
    assert(dispatch(s, 'B').ok);
    for (let i = 0; i < 2000 && !s.won; i++) drive(s, 0.05);
    assert(s.won, `merge delay ${delay}`);
  }
});
test('后来分配同一湾位的车继续绕行，不在通过道堵住先分配车辆', () => {
  const config: LevelConfig = {
    id: 903,
    title: 'Occupied bay through lane',
    subtitle: '',
    hint: '',
    stars: [100, 200],
    groups: Array.from({ length: 5 }, (_, i) => ({ id: `G${i}`, size: 1 })),
    vehicles: [
      { id: 'A', capacity: 4, column: 4, row: 0, direction: 'N' },
      { id: 'B', capacity: 4, column: 4, row: 1, direction: 'E' },
      { id: 'C', capacity: 4, column: 2, row: 3, direction: 'S' },
      { id: 'D', capacity: 4, column: 0, row: 2, direction: 'W' },
      { id: 'E', capacity: 4, column: 0, row: 0, direction: 'W' },
    ],
  };
  const s = createSimulation(config);
  for (const id of ['A', 'B', 'C', 'D', 'E']) {
    assert(dispatch(s, id).ok);
    drive(s, 0.5);
  }
  assert.equal(s.services[4]!.bayId, s.services[0]!.bayId);
  drive(s, 1);
  assert(s.vehicles[4]!.position.x < -11);
  assert.equal(s.services[0]!.phase, 'driving');
  for (let i = 0; i < 3000 && !s.won; i++) drive(s, 0.05);
  assert(s.won);
});

test('路口先行权在不同上车时长和点击时刻保持可清场', () => {
  // Sweep both sides of boarding/departure boundaries. A fixed dispatch cadence
  // misses priority reversals after a car has already entered a crossing.
  const delayTicks = [
    ...new Set([
      ...Array.from({ length: 81 }, (_, i) => i * 5),
      ...Array.from({ length: 21 }, (_, i) => 90 + i),
    ]),
  ];
  for (const firstDirection of ['N', 'W'] as const)
    for (const size of [1, 2, 3, 4])
      for (const delay of delayTicks) {
        const config: LevelConfig = {
          id: 904,
          title: '局部路口延时回归',
          subtitle: '',
          hint: '',
          stars: [100, 200],
          groups: [
            { id: 'G1', size },
            { id: 'G2', size },
          ],
          vehicles: [
            { id: 'A', capacity: 4, column: 0, row: 0, direction: firstDirection },
            {
              id: 'B',
              capacity: 4,
              column: firstDirection === 'N' ? 4 : 1,
              row: 0,
              direction: 'N',
            },
          ],
        };
        const s = createSimulation(config);
        assert(dispatch(s, 'A').ok);
        drive(s, delay * 0.05);
        assert(dispatch(s, 'B').ok);
        for (let i = 0; i < 3000 && !s.won; i++) drive(s, 0.05);
        assert(s.won, firstDirection + '/' + size + '/' + delay);
      }
});

test('真实关卡的错峰点击回放：有限交点、离站、绕行和湾口承诺都不锁死', () => {
  const cases: { level: number; actions: [number, string][] }[] = [
    {
      level: 56,
      actions: [
        [0, '巡02'],
        [8, '巡09'],
        [23, '巡01'],
        [31, '巡12'],
        [43, '巡03'],
        [56, '巡06'],
        [65, '巡10'],
        [82, '巡04'],
        [102, '巡13'],
        [109, '巡11'],
        [120, '巡07'],
        [125, '巡08'],
        [143, '巡05'],
      ],
    },
    {
      level: 94,
      actions: [
        [0, '巡04'],
        [19, '巡15'],
        [38, '巡01'],
        [56, '巡09'],
        [58, '巡02'],
        [78, '巡19'],
        [89, '巡08'],
        [100, '巡16'],
        [116, '巡17'],
        [125, '巡12'],
        [143, '巡05'],
        [153, '巡06'],
        [168, '巡18'],
        [176, '巡03'],
        [196, '巡07'],
        [206, '巡14'],
        [212, '巡13'],
        [228, '巡10'],
        [241, '巡11'],
      ],
    },
    {
      level: 1,
      actions: [
        [0, '巡02'],
        [13, '巡04'],
        [30, '巡01'],
        [43, '巡03'],
        [50, '巡06'],
        [67, '巡05'],
      ],
    },
    {
      level: 98,
      actions: [
        [0, '巡04'],
        [12, '巡18'],
        [28, '巡09'],
        [46, '巡16'],
        [54, '巡03'],
        [70, '巡02'],
        [86, '巡14'],
        [101, '巡17'],
        [120, '巡01'],
        [128, '巡05'],
        [135, '巡10'],
        [140, '巡11'],
        [150, '巡08'],
        [162, '巡19'],
        [181, '巡15'],
        [201, '巡12'],
        [211, '巡06'],
        [227, '巡07'],
        [240, '巡13'],
      ],
    },
  ];
  for (const example of cases) {
    const s = createSimulation(LEVELS[example.level - 1]!);
    let nextAction = 0;
    while (!s.won && s.time < 200) {
      const action = example.actions[nextAction];
      if (action && s.ticks === action[0]) {
        assert(dispatch(s, action[1]).ok, example.level + '/' + action[1]);
        nextAction++;
      }
      drive(s, 0.05);
    }
    assert.equal(nextAction, example.actions.length);
    assert(s.won, 'replay level ' + example.level);
  }
});
