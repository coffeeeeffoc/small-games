import { MISSION, MAP, UNITS, type Kind } from './Data.ts';
export type MissionId = 'corridor-01' | 'ambush-02' | 'patrol-03';
export type MissionEvent = { time: number; progress: number; kind: Kind; x: number; z: number; direction: readonly string[] };
export type MissionDefinition = Omit<typeof MISSION, 'id' | 'events'> & {
  id: MissionId; name: readonly string[]; description: readonly string[]; events: readonly MissionEvent[];
};
const profiles: MissionDefinition[] = [
  { ...MISSION, id: 'corridor-01', name: ['山谷护送', 'VALLEY ESCORT'],
    description: ['24 个威胁同时出现 · 巡视四组友军', '24 visible contacts · Four friendly groups'],
    events: MISSION.events },
  { ...MISSION, id: 'ambush-02', name: ['分段伏击', 'STAGED AMBUSH'],
    description: ['三批各 8 个威胁 · 时间/路程触发', 'Three waves of eight · Time/route triggered'],
    events: MISSION.events.map((event, i) => {
      const wave = Math.floor(i / 8);
      return { ...event, time: [0, 70, 145][wave], progress: [0, 0.28, 0.64][wave],
        direction: [`第 ${wave + 1} / 3 批伏击出现 · 各 8 个目标，巡视友军附近`,
          `AMBUSH ${wave + 1}/3: eight contacts. Scan friendly positions.`] };
    }) },
  { ...MISSION, id: 'patrol-03', name: ['机动拦截', 'MOVING INTERCEPT'],
    description: ['巡逻轻车与重甲 · 预留弹着提前量', 'Rovers & armor · Lead the moving target'],
    events: MISSION.events.map((event) => ({ ...event, kind: event.kind === 'turret' ? 'light' : event.kind,
      direction: ['机动目标已出现 · 追踪移动并预留弹着时间', 'Moving contacts. Track and allow for flight time.'] })) },
];
for (const profile of profiles) {
  if (profile.events.length !== 24 || profile.events.some((event) =>
    !UNITS[event.kind] || ![event.time, event.progress, event.x, event.z].every(Number.isFinite) ||
    event.time < 0 || event.time >= profile.duration || event.progress < 0 || event.progress > 1 ||
    Math.abs(event.x) > MAP.halfWidth || Math.abs(event.z) > MAP.halfDepth)) throw new Error('Invalid mission profile.');
  for (const event of profile.events) { Object.freeze(event.direction); Object.freeze(event); }
  Object.freeze(profile.events); Object.freeze(profile.name); Object.freeze(profile.description); Object.freeze(profile);
}
export const MISSIONS: readonly MissionDefinition[] = Object.freeze(profiles);
export function missionDefinition(id: unknown): MissionDefinition {
  return MISSIONS.find((mission) => mission.id === id) || MISSIONS[0];
}
export function nextMission(id: MissionId): MissionId {
  return MISSIONS[(MISSIONS.findIndex((mission) => mission.id === id) + 1) % MISSIONS.length].id;
}
