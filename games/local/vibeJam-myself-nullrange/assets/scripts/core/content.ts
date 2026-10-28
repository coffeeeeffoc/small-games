export const RULE_VERSION = 'nullrange-b1-v1';
export const GAME_ID = 'vibeJam-myself-nullrange';
export type Mission = {
  id: string;
  title: string;
  briefing: string;
  seed: number;
  timeLimit: number;
  enemies: { x: number; y: number; z: number; hp: number }[];
};
export const MISSIONS: readonly Mission[] = [
  {
    id: 'dawn-patrol',
    title: '晨雾巡航',
    seed: 20261029,
    timeLimit: 180,
    briefing: '清除三架入侵无人机。保持高度，转向追击；扫描可吸引残骸补充护盾。',
    enemies: [
      { x: 0, y: 95, z: -260, hp: 52 },
      { x: -90, y: 120, z: -380, hp: 52 },
      { x: 110, y: 100, z: -490, hp: 70 },
    ],
  },
];
export function validateMission(m: Mission) {
  if (
    !m.id ||
    !Number.isInteger(m.seed) ||
    !Number.isFinite(m.timeLimit) ||
    m.timeLimit <= 0 ||
    !m.enemies.length ||
    m.enemies.some((e) => ![e.x, e.y, e.z, e.hp].every(Number.isFinite) || e.hp <= 0 || e.y < 40)
  )
    throw Error('Invalid mission');
}
