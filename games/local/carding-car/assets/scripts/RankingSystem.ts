import type { Progress } from './CheckpointSystem.ts';
export function ranking(drivers: { progress: Progress }[]) {
  return drivers
    .map((_, i) => i)
    .sort((a, b) => {
      const x = drivers[a].progress,
        y = drivers[b].progress;
      if (x.finishedAt || y.finishedAt)
        return (x.finishedAt || Infinity) - (y.finishedAt || Infinity) || a - b;
      return y.distance - x.distance || a - b;
    });
}

export type RaceRecord = { time: number; bestLap: number; place: number };

function validRecord(value: unknown): value is RaceRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as RaceRecord;
  return (
    Number.isSafeInteger(Math.round(r.time * 100)) &&
    typeof r.time === 'number' &&
    r.time > 0 &&
    Number.isFinite(r.bestLap) &&
    r.bestLap >= 0 &&
    r.bestLap <= r.time &&
    Number.isInteger(r.place) &&
    r.place >= 0 &&
    r.place <= 4
  );
}

export function addRecord(records: RaceRecord[], record: RaceRecord) {
  return [...records, record]
    .filter(validRecord)
    .sort((a, b) => a.time - b.time)
    .slice(0, 5);
}

export function readRecords(raw: string | null, legacyBest: string | null = null): RaceRecord[] {
  let records: RaceRecord[] = [];
  try {
    const parsed: unknown = raw && raw.length < 10000 ? JSON.parse(raw) : [];
    if (Array.isArray(parsed))
      records = parsed
        .filter(validRecord)
        .sort((a, b) => a.time - b.time)
        .slice(0, 5);
  } catch {}
  const time = Number(legacyBest);
  // Old saves contain only total time; zero means the lap/place was not recorded.
  const legacy = { time, bestLap: 0, place: 0 };
  if (!records.length && validRecord(legacy)) records.push(legacy);
  return records;
}

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const hundredths = Math.round(seconds * 100);
  if (!Number.isSafeInteger(hundredths)) return '—';
  return `${Math.floor(hundredths / 6000)}:${(Math.floor(hundredths / 100) % 60).toString().padStart(2, '0')}.${(hundredths % 100).toString().padStart(2, '0')}`;
}

export function recordFeedback(seconds: number, previousBest?: number) {
  if (!previousBest) return '首个路线纪录！再跑一场，挑战更快的自己';
  const delta = Math.round((seconds - previousBest) * 100) / 100;
  if (delta < 0) return `刷新本机纪录！快了 ${(-delta).toFixed(2)} 秒`;
  if (delta === 0) return '追平本机纪录！下一场试试更早出弯加速';
  return `距离本机纪录差 ${delta.toFixed(2)} 秒 · 少碰护栏，出弯再冲刺`;
}
