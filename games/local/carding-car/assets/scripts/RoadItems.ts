import type { KartState } from './KartPhysics.ts';
import { pointAt, type TrackData } from './TrackGenerator.ts';
export const itemKinds = [
  'boost-pad',
  'coin',
  'freeze-orb',
  'magnet',
  'mystery-box',
  'nitro',
  'oil-slick',
  'repair-kit',
  'roadblock',
  'shield',
  'spring-pad',
  'watermelon-peel',
] as const;
export type ItemKind = (typeof itemKinds)[number];
export const itemNames: Record<ItemKind, string> = {
  'boost-pad': '加速带',
  coin: '金币加速',
  'freeze-orb': '冰冻减速',
  magnet: '磁力吸取',
  'mystery-box': '幸运补给',
  nitro: '氮气补充',
  'oil-slick': '油渍打滑',
  'repair-kit': '维修恢复',
  roadblock: '路障减速',
  shield: '护盾保护',
  'spring-pad': '弹跳起飞',
  'watermelon-peel': '西瓜皮旋转',
};
export type RoadItem = {
  kind: ItemKind;
  x: number;
  y: number;
  z: number;
  heading: number;
  availableAt: number;
};
export function createItems(track: TrackData, seed: number): RoadItem[] {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const kinds = [...itemKinds];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  return Array.from({ length: 24 }, (_, i) => {
    const p = pointAt(track, 48 + ((track.length - 96) * (i + random() * 0.3)) / 24);
    const lane = (random() - 0.5) * Math.max(0, track.width - 5);
    return {
      kind: kinds[i % kinds.length],
      x: p.x + Math.cos(p.heading) * lane,
      y: p.y,
      z: p.z - Math.sin(p.heading) * lane,
      heading: p.heading,
      availableAt: 0,
    };
  });
}
export function applyItem(k: KartState, kind: ItemKind) {
  const harmful = ['freeze-orb', 'oil-slick', 'roadblock', 'watermelon-peel'].includes(kind);
  if (harmful && k.shield > 0) {
    k.shield = 0;
    k.itemMessage = '护盾抵挡了障碍';
    k.itemMessageTime = 2;
    return;
  }
  k.itemMessage = itemNames[kind];
  k.itemMessageTime = 2.5;
  switch (kind) {
    case 'boost-pad':
      k.boost = Math.max(k.boost, 2);
      break;
    case 'nitro':
      k.nitroCooldown = 0;
      k.boost = Math.max(k.boost, 2.5);
      break;
    case 'coin':
      k.coins++;
      k.boost = Math.max(k.boost, 0.8);
      break;
    case 'freeze-orb':
      k.slow = 2.8;
      k.speed *= 0.5;
      break;
    case 'magnet':
      k.magnet = 8;
      break;
    case 'mystery-box':
      k.shield = 5;
      k.boost = Math.max(k.boost, 1.3);
      break;
    case 'oil-slick':
      k.slip = 2;
      k.speed *= 0.8;
      break;
    case 'repair-kit':
      k.slow = k.spin = k.slip = k.collision = 0;
      k.boost = Math.max(k.boost, 1);
      break;
    case 'roadblock':
      k.speed *= 0.28;
      k.slow = 1.2;
      k.collision = 0.3;
      break;
    case 'shield':
      k.shield = 8;
      break;
    case 'spring-pad':
      k.airborne = true;
      k.verticalSpeed = 7;
      k.y += 0.08;
      break;
    case 'watermelon-peel':
      k.spin = 1.4;
      k.speed *= 0.55;
      break;
  }
}
/** Segment sweep catches a pickup even when one simulation step crosses its whole footprint. */
export function collectItems(
  items: RoadItem[],
  k: KartState,
  previous: { x: number; z: number },
  time: number,
) {
  if (k.itemCooldown > 0) return 0;
  for (const item of items) {
    if (item.availableAt > time || Math.abs(k.y - item.y) > 1.8) continue;
    const dx = k.x - previous.x,
      dz = k.z - previous.z;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((item.x - previous.x) * dx + (item.z - previous.z) * dz) / (dx * dx + dz * dz || 1),
      ),
    );
    const radius =
      k.magnet > 0 && ['coin', 'nitro', 'shield', 'repair-kit', 'mystery-box'].includes(item.kind)
        ? 6
        : 1.9;
    if (Math.hypot(item.x - previous.x - dx * t, item.z - previous.z - dz * t) > radius) continue;
    item.availableAt = time + 12;
    k.itemCooldown = 0.65;
    applyItem(k, item.kind);
    return 1;
  }
  return 0;
}
