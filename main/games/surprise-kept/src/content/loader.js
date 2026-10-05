import { validateLevel } from '../core/engine.js';

const color = /^#[\da-f]{6}$/i;
const text = (value) => typeof value === 'string' && value.length > 0 && value.length < 300;

export function validateTheme(theme) {
  if (!theme || !/^[a-z][a-z0-9-]*$/.test(theme.id) || !text(theme.name) || !text(theme.banner))
    throw new Error('主题需要有效的 id、name 和 banner。');
  for (const key of ['wall', 'floor', 'accent', 'curtain']) {
    if (!color.test(theme.palette?.[key]))
      throw new Error(`主题 ${theme.id} 的 ${key} 必须是六位十六进制颜色。`);
  }
  return theme;
}

export function parseChapter(raw, themes, existingIds = new Set()) {
  if (
    !raw ||
    !text(raw.id) ||
    !text(raw.title) ||
    !Array.isArray(raw.levels) ||
    !raw.levels.length ||
    raw.levels.length > 300
  )
    throw new Error('章节需要 id、title 和 1–300 个关卡。');
  const ids = new Set(existingIds);
  return raw.levels.map((level) => {
    const result = validateLevel(level);
    if (!result.valid) throw new Error(`关卡 ${level?.id || '?'}：${result.errors.join('；')}`);
    if (!themes.has(level.theme))
      throw new Error(`关卡 ${level.id} 引用了未知主题 ${level.theme}。`);
    if (ids.has(level.id)) throw new Error(`关卡 id 重复：${level.id}`);
    ids.add(level.id);
    return level;
  });
}

export async function loadCatalog(fetcher = globalThis.fetch) {
  const manifestURL = new URL('../../content/manifest.json', import.meta.url);
  const read = async (url) => {
    const response = await fetcher(url);
    if (!response.ok) throw new Error(`无法读取关卡内容（${response.status}）。`);
    return response.json();
  };
  const manifest = await read(manifestURL);
  if (manifest.version !== 1 || !Array.isArray(manifest.chapters) || !manifest.chapters.length)
    throw new Error('不支持的章节目录格式。');
  const localURL = (path) => {
    if (typeof path !== 'string') throw new Error('内容路径无效。');
    const url = new URL(path, manifestURL);
    if (
      url.origin !== manifestURL.origin ||
      !url.pathname.startsWith(new URL('./', manifestURL).pathname)
    )
      throw new Error('内容包必须位于本游戏的 content 目录。');
    return url;
  };
  const rawThemes = await read(localURL(manifest.themes));
  if (!Array.isArray(rawThemes)) throw new Error('主题目录必须是数组。');
  const themes = new Map();
  for (const theme of rawThemes) {
    validateTheme(theme);
    if (themes.has(theme.id)) throw new Error(`主题 id 重复：${theme.id}`);
    themes.set(theme.id, theme);
  }
  const chapters = await Promise.all(manifest.chapters.map((path) => read(localURL(path))));
  const levels = [];
  const ids = new Set();
  for (const chapter of chapters) {
    const parsed = parseChapter(chapter, themes, ids);
    parsed.forEach((level) => ids.add(level.id));
    levels.push(...parsed);
  }
  return { themes, levels };
}
