import { GAME } from '../config.ts';
import { levels } from '../game/levels/levels.ts';
import { decodeSave } from '../game/core/save.ts';
import type { Save } from '../game/core/model.ts';

// Platform boundary: replacing this adapter does not change movement or game rules.
export function loadSave() {
  try {
    const result = decodeSave(localStorage.getItem(GAME.storageKey), levels);
    if (result.warning.includes('损坏')) {
      const profile = decodeSave(localStorage.getItem(`${GAME.storageKey}:profile`), levels);
      result.save = profile.save;
    }
    return result;
  } catch {
    return { ...decodeSave(null, levels), warning: '浏览器无法读取存档，本次仍可游玩。' };
  }
}
export function writeSave(save: Save) {
  try {
    const { run: _run, ...profile } = save;
    localStorage.setItem(`${GAME.storageKey}:profile`, JSON.stringify(profile));
    localStorage.setItem(GAME.storageKey, JSON.stringify(save));
    return '';
  } catch {
    return '自动保存失败：请检查浏览器存储空间或隐私设置。';
  }
}
