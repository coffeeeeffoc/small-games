import { localPoint, type Placement, type V3, type WorldData } from './world.ts';
export { localPoint } from './world.ts';

export type LifeBlock = Placement & { id: string; kiosk: boolean };
export type LifeTarget = {
  id: string;
  kind: 'visitor' | 'kiosk' | 'pigeon';
  name: string;
  position: V3;
  screen: [number, number];
};
export type LifeEvent = { id: string; kind: LifeTarget['kind']; serial: number };
export const LIFE_RADIUS = 75;
export const MAX_LIFE_BLOCKS = 5;

export function lifeBlocks(data: WorldData): LifeBlock[] {
  const blocks: LifeBlock[] = [];
  for (const deck of data.props['promenade-section'] || []) {
    // Only author life on the existing raised promenade, with space between little scenes.
    if (
      blocks.some(
        (b) => Math.hypot(b.position[0] - deck.position[0], b.position[2] - deck.position[2]) < 26,
      )
    )
      continue;
    blocks.push({
      ...deck,
      position: [deck.position[0], deck.position[1] + 0.62, deck.position[2]],
      id: `street-${blocks.length}`,
      kiosk: blocks.length % 4 === 0,
    });
  }
  // Welcome stop faces the initial landing, safely inside its existing promenade deck.
  blocks.push({
    id: 'welcome',
    position: [-373.9, 0.92, 44.7],
    yaw: -Math.PI / 2,
    scale: [1, 1, 1],
    kiosk: true,
  });
  return blocks;
}

export function nearbyLife(blocks: readonly LifeBlock[], position: readonly number[]): LifeBlock[] {
  return blocks
    .map((block) => ({
      block,
      d: Math.hypot(block.position[0] - position[0], block.position[2] - position[2]),
    }))
    .filter((item) => item.d < LIFE_RADIUS)
    .sort((a, b) => a.d - b.d)
    .slice(0, MAX_LIFE_BLOCKS)
    .map((item) => item.block);
}

// ponytail: visitors follow short authored promenade lanes; use navmesh routes if the city opens interiors.
export function visitorPose(block: LifeBlock, index: number, time: number) {
  const t = time * 0.19 + index * 2.1;
  const walking = index < 2;
  const p =
    !walking && block.kiosk
      ? localPoint({ ...block, position: kioskPoint(block) }, 0, -1.0)
      : localPoint(
          block,
          walking ? Math.sin(t) * 3.4 : -2.4,
          index === 0 ? 1.2 : index === 1 ? 2.2 : 1.6,
        );
  return {
    position: p,
    yaw: block.yaw + (walking ? (Math.cos(t) > 0 ? Math.PI / 2 : -Math.PI / 2) : Math.PI),
    stride: walking ? Math.sin(time * 4.8 + index) * Math.abs(Math.cos(t)) * 0.48 : 0,
  };
}

export function kioskPoint(block: LifeBlock): V3 {
  return block.id === 'welcome' ? block.position : localPoint(block, 1.7, -1.6);
}

export function streetColliders(blocks: readonly LifeBlock[]): WorldData['colliders'] {
  return blocks.flatMap((b) => {
    const result: WorldData['colliders'] = [];
    const p = kioskPoint(b);
    if (b.kiosk)
      result.push({ position: [p[0], p[1] + 0.65, p[2]], half: [1.13, 0.65, 0.55], yaw: b.yaw });
    for (const x of [-4.6, 4.6]) {
      const p = localPoint(b, x, -2.25);
      result.push({ position: [p[0], p[1] + 0.28, p[2]], half: [0.46, 0.28, 0.28], yaw: b.yaw });
    }
    const tree = localPoint(b, 5.8, 2.3);
    result.push({ position: [tree[0], tree[1] + 0.9, tree[2]], half: [0.3, 0.9, 0.3], yaw: b.yaw });
    return result;
  });
}
