export const saveKey = 'flick-arena-v1';
export function readSave(value) {
  if (!value || value.version !== 1) return { version: 1, played: 0, wins: 0, sound: true };
  const n = (x) => (Number.isSafeInteger(x) && x >= 0 ? x : 0);
  return {
    version: 1,
    played: n(value.played),
    wins: Math.min(n(value.wins), n(value.played)),
    sound: value.sound !== false,
  };
}
export function settle(save, winner) {
  return { ...save, played: save.played + 1, wins: save.wins + (winner === 0 ? 1 : 0) };
}
