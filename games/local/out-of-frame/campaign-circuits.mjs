const floor = (x, y, w) => ({ x, y, w, h: 540 - y });
const robot = (id, x, y, toX, speed) => ({
  id,
  kind: 'robot',
  x,
  y,
  w: 42,
  h: 46,
  speed,
  path: [
    { x, y },
    { x: toX, y },
  ],
});
const plate = (id, center, groundY, w) => ({ id, x: center - w / 2, y: groundY - 7, w, h: 7 });
const gate = (id, x, groundY, requires) => ({ id, x, y: groundY - 116, w: 18, h: 116, requires });
const names = [
  '三阶门廊',
  '一级一级留住',
  '接通三盏灯',
  '阶上有人',
  '交错的候场',
  '上行的静物',
  '三段回声',
  '窄门练习',
  '逐级放行',
  '三级定格',
  '阶梯后的渡口',
  '门外还有一段',
  '高船低灯',
  '短桥长注视',
  '保持这一格',
  '渐窄的船板',
  '离岸之前',
  '最后一道门',
  '三级远航',
  '交班给目光',
];

/** Terraces teach horizontal selection and cumulative gate circuits. The
 * second half adds a river crossing whose elevated ferry can be observed
 * above the last keeper, preparing the final chapter's vertical selection. */
export const CIRCUITS = Array.from({ length: 20 }, (_, i) => {
  const number = 61 + i;
  const bridge = i >= 10;
  const firstEdge = (bridge ? 230 : 310) + (i % 3) * 4;
  const secondEdge = (bridge ? 430 : 610) + (i % 3) * 4;
  const thirdEdge = bridge ? 550 - (i % 3) * 3 : 765 + (i % 3) * 3;
  const lowerStop = (bridge ? 160 : 240) + (i % 4) * 2;
  const middleStop = (bridge ? 330 : 475) + (i % 4) * 3;
  const upperStop = (bridge ? 470 : 765) + (i % 3) * 3;
  const lowerSpeed = 54 + i * 0.5;
  const middleSpeed = 55 + i * 0.6;
  const upperSpeed = 56 + i * 0.65;
  const plateWidth = 68 - Math.floor(i / 3) * 4;
  const objects = [
    robot('first-keeper', bridge ? 80 : 140, 414, firstEdge - 46, lowerSpeed),
    robot(
      'second-keeper',
      (bridge ? 355 : 370) + (i % 3) * 3,
      374,
      bridge ? 270 + (i % 3) * 3 : 535 + (i % 3) * 3,
      middleSpeed,
    ),
    robot(
      'third-keeper',
      bridge ? secondEdge + 9 : 655 + (i % 3) * 3,
      334,
      bridge ? thirdEdge - 46 : 830 + (i % 3) * 3,
      upperSpeed,
    ),
  ];
  const switches = [
    plate('a', lowerStop + 21 + (lowerSpeed * 3.5) / 60, 460, plateWidth),
    plate('b', middleStop + 21 + ((bridge ? -1 : 1) * middleSpeed * 3.5) / 60, 420, plateWidth - 2),
    plate('c', upperStop + 21 + (upperSpeed * 3.5) / 60, 380, plateWidth - 4),
  ];
  const solids = [
    floor(0, 460, firstEdge),
    floor(firstEdge, 420, secondEdge - firstEdge),
    floor(secondEdge, 380, (bridge ? thirdEdge : 960) - secondEdge),
  ];
  const gates = [
    gate('first-door', firstEdge - 23, 460, ['a']),
    gate('second-door', secondEdge - 23, 420, ['a', 'b']),
    gate('third-door', bridge ? 892 : 859, bridge ? 340 : 380, ['a', 'b', 'c']),
  ];
  const solution = [
    { kind: 'watch', object: 'first-keeper', axis: 'x', atLeast: lowerStop },
    { kind: 'frame', x: bridge ? 100 : 300, y: bridge ? 140 : 250 },
    {
      kind: 'watch',
      object: 'second-keeper',
      axis: 'x',
      ...(bridge ? { atMost: middleStop } : { atLeast: middleStop }),
    },
    { kind: 'frame', x: bridge ? 230 : 620, y: bridge ? 95 : 250 },
    { kind: 'watch', object: 'third-keeper', axis: 'x', atLeast: upperStop },
    { kind: 'frame', x: 0, y: 0 },
    { kind: 'walk', x: firstEdge - 135 },
    { kind: 'jump', frames: 48 },
    { kind: 'walk', x: middleStop - 80 },
    { kind: 'jump', frames: 48 },
    { kind: 'walk', x: secondEdge - 45 },
    { kind: 'jump', frames: 44 },
  ];
  if (!bridge) solution.push({ kind: 'jump', frames: 48 });
  let exitGround = 380;
  if (bridge) {
    const ferryWidth = 124 - Math.floor((i - 10) / 3) * 6;
    const ferryX = thirdEdge - 23;
    const ferryEnd = 950 - ferryWidth;
    const ferryEndY = 326 + (i % 3) * 2;
    objects.push({
      id: 'crossing-ferry',
      kind: 'platform',
      x: ferryX,
      y: 340,
      w: ferryWidth,
      h: 18,
      speed: 70 + (i - 10) * 1.2,
      path: [
        { x: ferryX, y: 340 },
        { x: ferryX + 38, y: 334 - (i % 3) * 2 },
        { x: ferryEnd, y: ferryEndY },
      ],
    });
    solids.push(floor(870 + (i % 3) * 2, 340, 90 - (i % 3) * 2));
    solution.push(
      // The boat already overlaps the bank here; leave a broad stopping window
      // for both human reaction time and DOM replay sampling near a turnaround.
      { kind: 'ride', object: 'crossing-ferry', untilX: ferryEnd - 25, offsetX: -70, y: 80 },
      { kind: 'frame', x: 0, y: 0 },
    );
    exitGround = 340;
  }
  solution.push({ kind: 'walk', x: 934 }, { kind: 'wait', frames: 20 });
  return {
    level: {
      id: `circuits-${number}`,
      number,
      kicker: `${number} / ${bridge ? '三级渡口' : '三级门廊'}`,
      title: names[i],
      goal: bridge
        ? '逐层冻结三位守门人，走过阶梯，再让渡船送你越过最后的缺口。'
        : '逐层冻结三位守门人，接通所有开关，沿阶梯通过三道门。',
      hint: [
        '三道门分别需要一盏、两盏、三盏灯。先把最左边的机器人留在开关上。',
        bridge
          ? '中层机器人向左走：把框向上移，排除已停好的下层核心；调度第三位时再上移，船暂时留在右边界外。'
          : '框向右移动时，让已停好的核心留在左边界外，再调度下一位机器人。',
        bridge
          ? '越过第三位机器人后落在船上。船面比这层地面更高：把框的下边界放在船核心与机器人核心之间，只让船继续。'
          : '机器人都停好后，再沿阶梯前进。每个机器人可以跳过，下一层地面也可以一次跳上。',
      ],
      spawn: { x: 56, y: 422 },
      frame: { x: 0, y: 250 },
      solids,
      objects,
      switches,
      gates,
      exit: { x: 912, y: exitGround - 62, w: 48, h: 62 },
    },
    solution,
  };
});
