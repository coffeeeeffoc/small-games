/**
 * Pure construction helpers. Every puzzle's decisions live in its numbered
 * module; no random generation or level-number branches affect its mechanics.
 *
 * Every board is perpendicular to X. The channel travels strictly towards +X,
 * crossing each board's plane exactly once, along its normal. This prevents a
 * channel segment from silently passing through an unrelated moving board.
 */
import { FACE_IDS, FACE_DEFS } from '../faces.mjs';
import { SHAFT_TRAVEL, BALL_RADIUS } from '../geometry.mjs';
const COLORS = ['#e4ad59', '#64c5bb', '#e08b78', '#a995e6', '#7fa9e1', '#cee07c'];
const CHAPTERS = ['认识盒子', '转角之间', '三面联动', '四方联锁', '六面机关'];
const NOTCHES = ['低', '中', '高'];

/**
 * shafts: [id, face, initial], latches: [id, shaft, face, conditions?].
 * conditions: [shaft, allowedPositions][]; preparation: ['shaft',id,value]
 * or ['latch',id]; route: [shaft, openPositions, optionalLabel][].
 * The solution follows these authored choices; it never solves/generates a
 * puzzle at runtime. Latches are deliberately reversible and contain no traps.
 */
export function defineLevel(spec) {
  const shaftFaceCounts = {};
  const shafts = spec.shafts.map(([id, face, initial], index) => {
    const count = shaftFaceCounts[face] ?? 0;
    shaftFaceCounts[face] = count + 1;
    return {
      id,
      label: `${id} 轴`,
      face,
      anchor: [-85 + count * 165, -70],
      initial,
      min: 0,
      max: 2,
      color: COLORS[index % COLORS.length],
      notches: [...NOTCHES],
      slideAxis: [...FACE_DEFS[face].v],
      role: `从${FACE_DEFS[face].label}操作，带动所有 ${id} 轴挡板`,
    };
  });
  const latchFaceCounts = {};
  const latches = (spec.latches ?? []).map(([id, shaft, face, conditions = []]) => {
    const count = latchFaceCounts[face] ?? 0;
    latchFaceCounts[face] = count + 1;
    return {
      id,
      shaft,
      face,
      label: `${shaft} 轴锁扣`,
      initial: true,
      anchor: [105, 140 - count * 125],
      releaseWhen: conditions.map(([held, positions]) => ({
        shaft: held,
        positions: [...positions],
      })),
    };
  });
  const path = [[-238, 110, -60]];
  const gates = [];
  const checkpoints = [];
  spec.route.forEach(([shaft, positions, label], index) => {
    const fraction = spec.route.length === 1 ? 0.5 : index / (spec.route.length - 1);
    const center = [-210 + fraction * 420, 90 - fraction * 180, [-60, 35, 65, -35][index % 4]];
    path.push(
      [center[0] - 12, center[1], center[2]],
      [...center],
      [center[0] + 12, center[1], center[2]],
    );
    const pathIndex = path.length - 2;
    const id = `gate-${index + 1}`;
    gates.push({
      id,
      shaft,
      label: label ?? `${shaft} 轴第 ${index + 1} 道门`,
      pathIndex,
      center,
      normal: [1, 0, 0],
      travel: SHAFT_TRAVEL,
      aperture: {
        offsets: positions.map((position) => position * SHAFT_TRAVEL),
        radius: BALL_RADIUS + 4,
      },
    });
    checkpoints.push({ pathIndex, gateIds: [id] });
  });
  path.push([238, -110, 60]);
  checkpoints.push({ pathIndex: path.length - 1, gateIds: [] });

  const solution = [];
  const positions = Object.fromEntries(shafts.map((shaft) => [shaft.id, shaft.initial]));
  let estimatedMoves = 1;
  const act = ([type, id, value]) => {
    const control = (type === 'shaft' ? shafts : latches).find((item) => item.id === id);
    if (!control) throw new Error(`Level ${spec.number}: unknown ${type} ${id}`);
    solution.push({ type: 'reveal', face: control.face }, { type: 'view', face: control.face });
    if (type === 'shaft') {
      if (positions[id] !== value) estimatedMoves += 1;
      positions[id] = value;
      solution.push({ type, id, value });
    } else {
      estimatedMoves += 1;
      solution.push({ type, id });
    }
  };
  for (const action of spec.preparation ?? []) act(action);
  solution.push({ type: 'release' });
  for (const [shaft, openPositions] of spec.route) {
    if (!openPositions.includes(positions[shaft])) act(['shaft', shaft, openPositions[0]]);
    solution.push({ type: 'advance' });
  }
  solution.push({ type: 'advance' });

  // Random openings always contain a control that can make useful progress:
  // an unlocked shaft, or a latch whose alignment window is already satisfied.
  const initialPositions = Object.fromEntries(shafts.map((shaft) => [shaft.id, shaft.initial]));
  const usefulControls = [
    ...shafts.filter(
      (shaft) => !latches.some((latch) => latch.shaft === shaft.id && latch.initial),
    ),
    ...latches.filter(
      (latch) =>
        latch.initial &&
        latch.releaseWhen.every((condition) =>
          condition.positions.includes(initialPositions[condition.shaft]),
        ),
    ),
  ];
  const controlFaces = [...new Set(usefulControls.map((control) => control.face))];
  const allFaces = FACE_IDS;
  const eligiblePairs = allFaces.flatMap((face, index) =>
    allFaces
      .slice(index + 1)
      .filter((other) => controlFaces.includes(face) || controlFaces.includes(other))
      .map((other) => [face, other]),
  );
  return {
    id: spec.id,
    number: spec.number,
    title: spec.title,
    subtitle: spec.subtitle,
    intro: spec.intro,
    lesson: spec.lesson,
    difficulty: spec.difficulty,
    chapter: {
      number: Math.ceil(spec.number / 10),
      title: CHAPTERS[Math.ceil(spec.number / 10) - 1],
    },
    requiredFaces: [
      ...new Set(
        shafts
          .filter((shaft) =>
            spec.route.some(([id, open]) => id === shaft.id && !open.includes(shaft.initial)),
          )
          .map((shaft) => shaft.face),
      ),
    ],
    initialViews: { eligiblePairs },
    shafts,
    latches,
    gates,
    path,
    checkpoints,
    solution,
    estimatedMoves,
    hints: spec.hints ?? [
      spec.intro,
      spec.lesson,
      '沿着球道逐道检查挡板。小球停住后仍可切换观察面、解锁与换挡。',
    ],
  };
}
