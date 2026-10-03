import type { Axis, Box, Level, PieceDefinition, Vec3 } from '../core/types.ts';

const box = (min: Vec3, max: Vec3): Box => ({ min, max });
const cube = (x: number, y: number, z: number): Box =>
  box([x - 0.5, y - 0.5, z - 0.5], [x + 0.5, y + 0.5, z + 0.5]);

/** Original introductory fork-slot assemblies, not replicas of a historic burr.
 * The long spine and two teeth of each fork are one face-connected solid.
 * Dependencies arise solely from those teeth physically surrounding another bar.
 * Each piece has a preferred presentation axis; all world axes and rigid groups remain movable.
 */
const pieces: readonly PieceDefinition[] = [
  {
    id: 'key',
    name: '青竹 · 钥匙条',
    color: '#76a796',
    axis: 'x',
    range: [-6, 6],
    removedAt: 6,
    boxes: [box([-3.5, -0.5, -0.5], [2.5, 0.5, 0.5])],
  },
  {
    id: 'cross',
    name: '赤陶 · 双齿榫',
    color: '#ce8768',
    axis: 'y',
    range: [-6, 6],
    removedAt: 6,
    boxes: [box([-0.5, -3.5, 0.5], [0.5, 2.5, 1.5]), cube(0, -1, 0), cube(0, 1, 0)],
  },
  {
    id: 'upright',
    name: '靛蓝 · 立槽榫',
    color: '#7599bc',
    axis: 'z',
    range: [-6, 6],
    removedAt: 6,
    boxes: [box([0.5, 1.5, -3.5], [1.5, 2.5, 2.5]), cube(0, 2, 0), cube(0, 2, 2)],
  },
  {
    id: 'bridge',
    name: '蜜蜡 · 横桥榫',
    color: '#d1ac60',
    axis: 'x',
    range: [-6, 6],
    removedAt: 6,
    boxes: [box([-3.5, 2.5, -1.5], [2.5, 3.5, -0.5]), cube(0, 2, -1), cube(2, 2, -1)],
  },
  {
    id: 'fork',
    name: '紫檀 · 回抱榫',
    color: '#a391b8',
    axis: 'y',
    range: [-6, 6],
    removedAt: 6,
    boxes: [box([-1.5, -0.5, -2.5], [-0.5, 5.5, -1.5]), cube(-1, 2, -1), cube(-1, 4, -1)],
  },
];

/** New assemblies use integer cells, then merge straight runs into boxes.
 * A cell belongs to exactly one solid. The authoring helpers describe timber,
 * never dependencies or a prescribed solution; the collision solver discovers
 * which gates each piece actually releases.
 */
interface Timber {
  axis: Axis;
  cells: readonly Vec3[];
}
const axisNumber = (axis: Axis) => (axis === 'x' ? 0 : axis === 'y' ? 1 : 2);
const line = (axis: Axis, anchor: Vec3, low: number, high: number): Vec3[] =>
  Array.from(
    { length: high - low + 1 },
    (_, step) =>
      anchor.map(
        (value, index) => value + (index === axisNumber(axis) ? low + step : 0),
      ) as unknown as Vec3,
  );
const keyBar = (anchor: Vec3 = [0, 0, 0], low = -3, high = 3): Timber => ({
  axis: 'x',
  cells: line('x', anchor, low, high),
});
const forkSlot = (axis: Axis, anchor: Vec3, normal: Axis, side = 1): Timber => ({
  axis,
  cells: [
    ...line(
      axis,
      anchor.map(
        (value, index) => value + (index === axisNumber(normal) ? side : 0),
      ) as unknown as Vec3,
      -3,
      3,
    ),
    ...line(axis, anchor, -1, -1),
    ...line(axis, anchor, 1, 1),
  ],
});
const sideFork = (x: number): Timber => forkSlot('y', [x, 0, 0], 'z');
const standingFork = (x: number, y: number, z = 1, side = 1): Timber =>
  forkSlot('z', [x, y, z], 'x', side);
const crossCap = (x: number, y: number): Timber => forkSlot('x', [x, y, 1], 'z');
const upperFork = (x: number, y: number, z: number): Timber => forkSlot('x', [x, y, z], 'y');

/** Two separate keys pass through this gate's two slots. */
const doubleGate = (x: number): Timber => ({
  axis: 'y',
  cells: [...line('y', [x, 0, 1], -3, 3), ...[-3, -1, 1, 3].map((y): Vec3 => [x, y, 0])],
});

/** Along the preferred axes, the end stops limit a key's straight extraction.
 * A short shift clears a narrow slot and offers a route through the frame.
 * Other world-axis moves and moving a rigid group remain valid alternatives.
 */
const captiveFrame = (slot = 2, side = 1, edge = 4): Timber => ({
  axis: 'y',
  cells: [
    ...line('x', [0, 0, side], -edge, edge),
    ...line('y', [slot, 0, side], -3, 3),
    [-edge, 0, 0],
    [edge, 0, 0],
    [slot, -1, 0],
    [slot, 1, 0],
  ],
});

const palette = ['#76a796', '#ce8768', '#7599bc', '#d1ac60', '#a391b8', '#a9ad70'];
const timberNames = ['青竹', '赤陶', '靛蓝', '蜜蜡', '紫檀', '松石'];
const pieceIds = ['key', 'cross', 'upright', 'bridge', 'fork', 'crown'];

function timberBoxes(timber: Timber): Box[] {
  const cells = new Set(timber.cells.map((cell) => cell.join(',')));
  const result: Box[] = [];
  while (cells.size) {
    const cell = cells.values().next().value!.split(',').map(Number);
    let longest = { axis: 0, low: cell[0]!, high: cell[0]! };
    for (let axis = 0; axis < 3; axis++) {
      const neighbor = [...cell];
      while (cells.has(neighbor.join(','))) neighbor[axis]!--;
      const low = neighbor[axis]! + 1;
      neighbor[axis] = cell[axis]!;
      while (cells.has(neighbor.join(','))) neighbor[axis]!++;
      const high = neighbor[axis]! - 1;
      if (high - low > longest.high - longest.low) longest = { axis, low, high };
    }
    const { axis, low, high } = longest;
    const current = [...cell];
    for (let position = low; position <= high; position++) {
      current[axis] = position;
      cells.delete(current.join(','));
    }
    result.push(
      box(
        cell.map((value, index) => (index === axis ? low : value) - 0.5) as unknown as Vec3,
        cell.map((value, index) => (index === axis ? high : value) + 0.5) as unknown as Vec3,
      ),
    );
  }
  return result;
}

function assembly(timbers: readonly Timber[], names: readonly string[]): PieceDefinition[] {
  const allCells = timbers.flatMap((timber) => timber.cells);
  const min = [0, 1, 2].map((axis) => Math.min(...allCells.map((cell) => cell[axis]!)) - 0.5);
  const max = [0, 1, 2].map((axis) => Math.max(...allCells.map((cell) => cell[axis]!)) + 0.5);
  return timbers.map((timber, index) => {
    const axis = axisNumber(timber.axis);
    const boxes = timberBoxes(timber);
    // Keep useful reference distances for the preferred-axis layout. These
    // metadata values neither constrain movement nor determine completion.
    const removedAt = Math.ceil(
      Math.max(
        max[axis]! - Math.min(...boxes.map((part) => part.min[axis]!)),
        Math.max(...boxes.map((part) => part.max[axis]!)) - min[axis]!,
      ),
    );
    return {
      id: pieceIds[index]!,
      name: `${timberNames[index]} · ${names[index]}`,
      color: palette[index]!,
      axis: timber.axis,
      range: [-removedAt, removedAt],
      removedAt,
      boxes,
    };
  });
}

const chapters = ['识榫入门', '分路寻钥', '借位进阶', '匠心合锁'];
interface LevelPlan {
  id: string;
  title: string;
  mechanic: string;
  clue: string;
  pieces: readonly PieceDefinition[];
}
const plans: readonly LevelPlan[] = [
  {
    id: 'first-key',
    title: '初见 · 三向榫',
    mechanic: '自由拆装',
    clue: '每根木条都能沿 X、Y、Z 移动。可以逐件分离，也可以组合挪开，再把它们原样装回。',
    pieces: pieces.slice(0, 3),
  },
  {
    id: 'cross-roads',
    title: '交错 · 四件锁',
    mechanic: '看阻挡',
    clue: '观察木条侧面的齿，试试换轴或组合移动，找出不同的出口。',
    pieces: pieces.slice(0, 4),
  },
  {
    id: 'five-links',
    title: '层叠 · 五件锁',
    mechanic: '连续拆装',
    clue: '五根木条交叠相扣。选择一件或组合移动，观察哪些接触挡住去路，再将各件归位。',
    pieces,
  },
  {
    id: 'twin-forks',
    title: '分岔 · 一钥双门',
    mechanic: '自由分路',
    clue: '钥匙退出后，两侧都出现空隙。试着自己决定先走哪一路。',
    pieces: assembly([keyBar(), sideFork(-2), sideFork(2)], ['中钥', '左叉', '右叉']),
  },
  {
    id: 'captive-key',
    title: '借位 · 先退一步',
    mechanic: '局部让位',
    clue: '试着先小幅挪动槽口内的钥匙，看看套框会怎样松开；也可以寻找其他方向的出口。',
    pieces: assembly(
      [keyBar([0, 0, 0], -1, 2), captiveFrame(), standingFork(2, 2)],
      ['短钥', '套框', '立榫'],
    ),
  },
  {
    id: 'twin-keys',
    title: '合闸 · 两钥同开',
    mechanic: '双钥汇合',
    clue: '沿长闸方向观察，两道槽各有一根钥匙。可以逐一清空，也可以试着组合挪动。',
    pieces: assembly(
      [keyBar([0, -2, 0]), keyBar([0, 2, 0]), doubleGate(0)],
      ['下钥', '上钥', '双槽闸'],
    ),
  },
  {
    id: 'fork-relay',
    title: '接力 · 长短两路',
    mechanic: '方向选择',
    clue: '一侧很快就能拆完，另一侧还有立榫。受阻后换个方向试探。',
    pieces: assembly(
      [keyBar(), sideFork(-2), sideFork(2), standingFork(2, 2)],
      ['中钥', '短路叉', '长路叉', '立榫'],
    ),
  },
  {
    id: 'three-gates',
    title: '三岔 · 一钥三门',
    mechanic: '三路选择',
    clue: '同一根钥匙贯穿三道榫槽；门打开后，你可以安排自己的顺序。',
    pieces: assembly(
      [keyBar(), sideFork(-2), sideFork(0), sideFork(2)],
      ['通钥', '左门', '中门', '右门'],
    ),
  },
  {
    id: 'twin-gates',
    title: '并锁 · 双钥双闸',
    mechanic: '交叉依赖',
    clue: '两根钥匙同时穿过两道门，先辨认哪两根是共同的阻挡。',
    pieces: assembly(
      [keyBar([0, -2, 0]), keyBar([0, 2, 0]), doubleGate(-2), doubleGate(2)],
      ['下钥', '上钥', '左双闸', '右双闸'],
    ),
  },
  {
    id: 'passing-bridge',
    title: '错步 · 套框让路',
    mechanic: '中途换手',
    clue: '沿套框方向试着先挪一小段，看看哪一端会松开，再决定下一步换谁移动。',
    pieces: assembly(
      [keyBar([0, 0, 0], -1, 2), captiveFrame(), standingFork(2, 3), standingFork(2, -3)],
      ['短钥', '套框', '上立榫', '下立榫'],
    ),
  },
  {
    id: 'six-links',
    title: '六叠 · 回环长链',
    mechanic: '深层顺序',
    clue: '最后一道槽在背面。观察每次抽出后新出现的开口。',
    pieces: [
      ...pieces,
      {
        id: 'crown',
        name: '松石 · 尾槽榫',
        color: palette[5]!,
        axis: 'z',
        range: [-8, 8],
        removedAt: 8,
        boxes: [box([-2.5, 4.5, -5.5], [-1.5, 5.5, 1.5]), cube(-1, 5, -3), cube(-1, 5, -1)],
      },
    ],
  },
  {
    id: 'branching-path',
    title: '双枝 · 各有后手',
    mechanic: '双支接力',
    clue: '左右两路都有下一层，比较沿木条方向、侧向和组合移动时的不同阻挡。',
    pieces: assembly(
      [keyBar(), sideFork(-2), sideFork(2), standingFork(-2, -2, 1, -1), standingFork(2, 2)],
      ['中钥', '左枝', '右枝', '左立榫', '右立榫'],
    ),
  },
  {
    id: 'twin-key-canopy',
    title: '双檐 · 汇合再分流',
    mechanic: '先合后分',
    clue: '两把钥匙放开一根长闸，长闸又托着两道横檐。',
    pieces: assembly(
      [keyBar([0, -2, 0]), keyBar([0, 2, 0]), doubleGate(0), crossCap(0, -2), crossCap(0, 2)],
      ['下钥', '上钥', '中闸', '下横檐', '上横檐'],
    ),
  },
  {
    id: 'three-way-relay',
    title: '偏枝 · 三路有轻重',
    mechanic: '路线比较',
    clue: '三扇门的后面并不相同，先转一转，找出还扣着立榫的一路。',
    pieces: assembly(
      [keyBar(), sideFork(-2), sideFork(0), sideFork(2), standingFork(2, 2)],
      ['通钥', '左门', '中门', '右门', '尾榫'],
    ),
  },
  {
    id: 'return-before-release',
    title: '迂回 · 借位再接力',
    mechanic: '多次让位',
    clue: '试试先让套框挪一步，再转向新露出的槽口；换轴和组合移动也能带来不同路线。',
    pieces: assembly(
      [
        keyBar([0, 0, 0], -1, 2),
        captiveFrame(),
        standingFork(2, 3),
        standingFork(2, -3),
        upperFork(3, 3, 3),
      ],
      ['短钥', '套框', '上立榫', '下立榫', '顶叉'],
    ),
  },
  {
    id: 'crossed-gates',
    title: '联庭 · 双闸双檐',
    mechanic: '并行复原',
    clue: '共同的钥匙连接两座门，拆开时看分路，装回时看入口。',
    pieces: assembly(
      [
        keyBar([0, -2, 0]),
        keyBar([0, 2, 0]),
        doubleGate(-2),
        doubleGate(2),
        crossCap(-2, -2),
        crossCap(2, 2),
      ],
      ['下钥', '上钥', '左闸', '右闸', '左横檐', '右横檐'],
    ),
  },
  {
    id: 'split-and-pass',
    title: '分庭 · 两路相接',
    mechanic: '分路与换手',
    clue: '比较两路的槽口：顺着木条拆时，可以尝试先挪中间件再换手，也可以另找出口。',
    pieces: assembly(
      [
        keyBar(),
        sideFork(-2),
        sideFork(2),
        standingFork(-2, -2, 1, -1),
        standingFork(2, 3),
        standingFork(2, -3),
      ],
      ['中钥', '左枝', '右枝', '左立榫', '右上榫', '右下榫'],
    ),
  },
  {
    id: 'opposing-frames',
    title: '对扣 · 左右借位',
    mechanic: '反向让位',
    clue: '钥匙两侧各有一道套框。试试左右让位怎样改变槽口，也留意侧向和组合路线。',
    pieces: assembly(
      [
        keyBar([0, 0, 0], -2, 2),
        captiveFrame(2, 1, 4),
        captiveFrame(-2, -1, 5),
        standingFork(2, 3),
        standingFork(-2, -3, -1, -1),
      ],
      ['双向钥', '前框', '后框', '前立榫', '后立榫'],
    ),
  },
  {
    id: 'staggered-frames',
    title: '错环 · 双框三扣',
    mechanic: '交替开槽',
    clue: '前后套框相互借道，观察小幅移动后哪一端先松开。',
    pieces: assembly(
      [
        keyBar([0, 0, 0], -2, 2),
        captiveFrame(2, 1, 4),
        captiveFrame(-2, -1, 5),
        standingFork(2, 2),
        standingFork(-2, -3, -1, -1),
        standingFork(-2, 3, -1, -1),
      ],
      ['双向钥', '前框', '后框', '前立榫', '后下榫', '后上榫'],
    ),
  },
  {
    id: 'master-workshop',
    title: '匠心 · 归榫成器',
    mechanic: '综合机关',
    clue: '借位、换手、沿支路拆开是一种思路；也试试自由换轴和组合，寻找自己的路线。',
    pieces: assembly(
      [
        keyBar([0, 0, 0], -2, 2),
        captiveFrame(2, 1, 4),
        captiveFrame(-2, -1, 5),
        standingFork(2, 3),
        standingFork(-2, -3, -1, -1),
        upperFork(3, 3, 3),
      ],
      ['双向钥', '前框', '后框', '前立榫', '后立榫', '顶叉'],
    ),
  },
];

export const levels: readonly Level[] = plans.map((plan, index) => ({
  ...plan,
  chapter: chapters[Math.floor(index / 5)]!,
  subtitle: plan.mechanic,
  description: `${plan.clue} 拆开后，再亲手把每根榫条送回原位。`,
  difficulty: ['入门', '进阶', '挑战', '匠心'][Math.floor(index / 5)]!,
  estimatedMinutes: ['2–4 分钟', '3–5 分钟', '4–7 分钟', '5–9 分钟'][Math.floor(index / 5)]!,
}));

export default levels;
