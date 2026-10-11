import { MISSIONS, type MissionId } from './MissionCatalog.ts';
export type MissionProgress = { version: 1; cleared: MissionId[] };
export const newMissionProgress = (): MissionProgress => ({ version: 1, cleared: [] });
export function readMissionProgress(raw: string | null): MissionProgress {
  try {
    const data = raw && raw.length <= 16000 ? JSON.parse(raw) : null;
    if (data?.version !== 1 || !Array.isArray(data.cleared)) return newMissionProgress();
    const candidates = new Set(data.cleared.filter((id: unknown) => typeof id === 'string'));
    const cleared: MissionId[] = [];
    for (const [index, mission] of MISSIONS.entries())
      if (candidates.has(mission.id) && (index < 3 || cleared.includes(MISSIONS[index - 1].id))) cleared.push(mission.id);
    return { version: 1, cleared };
  } catch { return newMissionProgress(); }
}
export function missionUnlocked(progress: MissionProgress, id: MissionId): boolean {
  const index = MISSIONS.findIndex(m => m.id === id);
  // Preserve all three existing public tasks during migration.
  return index >= 0 && (index < 3 || progress.cleared.includes(id) || progress.cleared.includes(MISSIONS[index - 1].id));
}
export function completeMission(progress: MissionProgress, id: MissionId, success: boolean, practice = false): MissionProgress {
  if (!success || practice || !missionUnlocked(progress, id) || progress.cleared.includes(id)) return progress;
  return { version: 1, cleared: [...progress.cleared, id] };
}
