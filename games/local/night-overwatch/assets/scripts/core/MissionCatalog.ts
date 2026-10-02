import { MISSION, MAP, UNITS, routeLength, type BattlefieldId, type Kind } from './Data.ts';
export type MissionId = 'corridor-01' | 'ambush-02' | 'patrol-03' | 'training-60';
export type MissionEvent = { time: number; progress: number; kind: Kind; x: number; z: number; direction: readonly string[] };
export type MissionDefinition = Omit<typeof MISSION, 'id' | 'events'> & {
  id: MissionId; map: BattlefieldId; mode: 'escort' | 'training'; name: readonly string[]; description: readonly string[]; events: readonly MissionEvent[];
};
const profiles: MissionDefinition[] = [
  { ...MISSION, id: 'corridor-01', map: 'valley', mode: 'escort', name: ['山谷护送', 'VALLEY ESCORT'],
    description: ['24 个威胁同时出现 · 巡视四组友军', '24 visible contacts · Four friendly groups'],
    events: MISSION.events },
  { ...MISSION, id: 'ambush-02', map: 'highland', speed: routeLength('highland') / 240, mode: 'escort', name: ['高地伏击', 'HIGHLAND AMBUSH'],
    description: ['三批各 8 个威胁 · 时间/路程触发', 'Three waves of eight · Time/route triggered'],
    events: MISSION.events.map((event, i) => {
      const wave = Math.floor(i / 8);
      return { ...event, time: [0, 70, 145][wave], progress: [0, 0.28, 0.64][wave],
        direction: [`第 ${wave + 1} / 3 批伏击出现 · 各 8 个目标，巡视友军附近`,
          `AMBUSH ${wave + 1}/3: eight contacts. Scan friendly positions.`] };
    }) },
  { ...MISSION, id: 'patrol-03', map: 'valley', mode: 'escort', name: ['机动拦截', 'MOVING INTERCEPT'],
    description: ['巡逻轻车与重甲 · 预留弹着提前量', 'Rovers & armor · Lead the moving target'],
    events: MISSION.events.map((event) => ({ ...event, kind: event.kind === 'turret' ? 'light' : event.kind,
      direction: ['机动目标已出现 · 追踪移动并预留弹着时间', 'Moving contacts. Track and allow for flight time.'] })) },
];
export const TRAINING: MissionDefinition = {
  ...MISSION, id: 'training-60', map: 'valley', mode: 'training', duration: 60, speed: 0,
  name: ['60 秒火控热身', '60s FIRE CONTROL'],
  description: ['静止 / 巡逻 / 重甲 · 练切炮与提前量', 'Static / rover / armor · Switch & lead'],
  events: [
    { time: 0, progress: 0, kind: 'turret', x: -108, z: 25,
      direction: ['静止目标用爆破 · 巡逻目标看提前量 · 重甲用重炮', 'Burst for static · Lead rovers · Heavy for armor'] },
    { time: 0, progress: 0, kind: 'light', x: -109, z: 70,
      direction: ['巡逻目标：准星放到弹着时的位置', 'Rover: aim where it will be at impact'] },
    { time: 0, progress: 0, kind: 'heavy', x: -91, z: 49,
      direction: ['练瞄准，友军仍不能误伤 · 60 秒清除三个目标', 'Practice aiming. Avoid allies. Clear three targets in 60s.'] },
  ],
};
for (const profile of [...profiles, TRAINING]) {
  if (profile.events.length !== (profile.mode === 'training' ? 3 : 24) || profile.events.some((event) =>
    !UNITS[event.kind] || ![event.time, event.progress, event.x, event.z].every(Number.isFinite) ||
    event.time < 0 || event.time >= profile.duration || event.progress < 0 || event.progress > 1 ||
    Math.abs(event.x) > MAP.halfWidth || Math.abs(event.z) > MAP.halfDepth)) throw new Error('Invalid mission profile.');
  for (const event of profile.events) { Object.freeze(event.direction); Object.freeze(event); }
  Object.freeze(profile.events); Object.freeze(profile.name); Object.freeze(profile.description); Object.freeze(profile);
}
export const MISSIONS: readonly MissionDefinition[] = Object.freeze(profiles);
export function missionDefinition(id: unknown): MissionDefinition {
  return id === TRAINING.id ? TRAINING : MISSIONS.find((mission) => mission.id === id) || MISSIONS[0];
}
export function nextMission(id: MissionId): MissionId {
  return MISSIONS[(MISSIONS.findIndex((mission) => mission.id === id) + 1) % MISSIONS.length].id;
}
export function readMissionSearch(search: string): MissionId | undefined {
  const values = new URLSearchParams(search).getAll('mission');
  return values.length === 1 && [...MISSIONS, TRAINING].some((mission) => mission.id === values[0])
    ? values[0] as MissionId : undefined;
}
