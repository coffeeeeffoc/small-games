import type { Simulation } from './Simulation.ts';
export type TrainingRecord = { time: number; fired: number; hitShots: number };
function valid(value: unknown): value is TrainingRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as TrainingRecord;
  return Number.isFinite(record.time) && record.time > 0 && record.time <= 60 &&
    Number.isInteger(record.fired) && record.fired > 0 && record.fired <= 1000 &&
    Number.isInteger(record.hitShots) && record.hitShots > 0 && record.hitShots <= record.fired;
}
export function readTrainingRecord(raw: string | null): TrainingRecord | undefined {
  try { const value: unknown = raw && raw.length < 1000 ? JSON.parse(raw) : null; return valid(value) ? value : undefined; }
  catch { return; }
}
export function bestTrainingRecord(previous: TrainingRecord | undefined, sim: Simulation): TrainingRecord | undefined {
  if (sim.mission.mode !== 'training' || sim.phase !== 'success' || sim.threatsRemaining ||
    sim.friendlyDamage || sim.friendlyLosses) return previous;
  const current = { time: sim.time, fired: sim.fired, hitShots: sim.hitShots };
  if (!valid(current)) return previous;
  return !previous || current.time < previous.time || current.time === previous.time && current.fired < previous.fired
    ? current : previous;
}
export function trainingNextGoal(sim: Simulation): readonly string[] {
  if (sim.friendlyDamage > 0) return ['下一轮先看友军与爆炸圈，零友伤才能留下热身纪录。', 'Next: check allies and blast circles. Only clean runs set a record.'];
  if (sim.threatsRemaining) return ['固定用爆破、巡逻留提前量、重甲用重炮；再练一轮。', 'Burst for static, lead the rover, Heavy for armor. Try again.'];
  if (sim.fired > 10 || sim.hitShots < sim.fired * .8) return ['零友伤完成！下一轮少用一发，或更早预判巡逻车。', 'Clean clear! Try one fewer shot, or lead the rover earlier.'];
  return ['精准完成！挑战更快清靶，或回护送保护四组友军。', 'Precise clear! Beat your time, or escort all four friendly groups.'];
}
