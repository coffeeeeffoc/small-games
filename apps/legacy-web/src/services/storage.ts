export type SaveData = {
  coins: number;
  bestCultivation: number;
  bestOffice: number;
  arenaWins: number;
  collection: string[];
  adViews: number;
  adDay: string;
  cultivationChapter: number;
  officeDay: number;
  arenaLeague: number;
};
const KEY = 'bili-pocket-arcade:v1';
const initial: SaveData = {
  coins: 80,
  bestCultivation: 0,
  bestOffice: 0,
  arenaWins: 0,
  collection: [],
  adViews: 0,
  adDay: '',
  cultivationChapter: 1,
  officeDay: 1,
  arenaLeague: 1,
};
export function loadSave(): SaveData {
  try {
    return { ...initial, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...initial };
  }
}
export function writeSave(data: SaveData) {
  localStorage.setItem(KEY, JSON.stringify(data));
}
export function clearSave() {
  localStorage.removeItem(KEY);
}
