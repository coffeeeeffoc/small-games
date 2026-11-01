import type { Simulation } from './Simulation.ts';
export type TrainingRecord = { time: number; fired: number; hitShots: number; ammoSpent: number };
function parse(value: unknown): TrainingRecord | undefined {
  if (!value || typeof value !== 'object') return;
  const record = value as TrainingRecord;
  const ammoSpent = record.ammoSpent === undefined ? record.fired : record.ammoSpent;
  if (Number.isFinite(record.time) && record.time > 0 &&
    Number.isInteger(ammoSpent) && ammoSpent > 0 && ammoSpent <= 1000 &&
    Number.isInteger(record.fired) && record.fired >= ammoSpent && record.fired <= ammoSpent * 4 &&
    Number.isInteger(record.hitShots) && record.hitShots > 0 && record.hitShots <= record.fired)
    return { time: record.time, fired: record.fired, hitShots: record.hitShots, ammoSpent };
}
export function readTrainingRecord(raw: string | null): TrainingRecord | undefined {
  try { return parse(raw && raw.length < 1000 ? JSON.parse(raw) : null); }
  catch { return; }
}
export function bestTrainingRecord(previous: TrainingRecord | undefined, sim: Simulation): TrainingRecord | undefined {
  if (sim.mission.mode !== 'training' || sim.phase !== 'success' || sim.threatsRemaining ||
    sim.friendlyDamage || sim.friendlyLosses) return previous;
  const current = parse({ time: sim.time, fired: sim.fired, hitShots: sim.hitShots, ammoSpent: sim.ammoSpent });
  if (!current) return previous;
  return !previous || current.time < previous.time || current.time === previous.time && current.ammoSpent < previous.ammoSpent
    ? current : previous;
}
export function trainingNextGoal(sim: Simulation): readonly string[] {
  if (sim.friendlyDamage > 0) return ['下一轮先看友军与爆炸圈，零友伤才能留下热身纪录。', 'Next: check allies and blast circles. Only clean runs set a record.'];
  if (sim.threatsRemaining) return ['固定用榴弹、巡逻留提前量、重甲用重炮；再练一轮。', 'HE for static, lead the rover, Heavy for armor. Try again.'];
  if (sim.ammoSpent > 10 || !sim.loadout.effects.some(effect=>effect==='burst'||effect==='twin') && sim.hitShots < sim.fired * .8)
    return ['零友伤完成！下一轮少用一发，或更早预判巡逻车。', 'Clean clear! Try one fewer round, or lead the rover earlier.'];
  return ['精准完成！挑战更快清靶，或回护送保护四组友军。', 'Precise clear! Beat your time, or escort all four friendly groups.'];
}
