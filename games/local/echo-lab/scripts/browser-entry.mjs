import { readFile } from 'node:fs/promises';

export async function browserEntry(target, prefix = './') {
  if (!['web', 'h5'].includes(target)) throw new Error(`Unknown browser target: ${target}`);
  const template = await readFile(new URL('../shared/browser/index.html', import.meta.url), 'utf8');
  return template
    .replace('<html lang="zh-CN">', `<html lang="zh-CN" data-platform="${target}">`)
    .replace('./dev-mode.js', `${prefix}dev-mode.js`)
    .replace('href="styles.css"', `href="${prefix}shared/browser/styles.css"`)
    .replace('src="src/app.js"', `src="${prefix}${target}/entry.js"`)
    .replace(
      '</head>',
      `${target === 'h5' ? `<link rel="stylesheet" href="${prefix}h5/styles.css" />` : ''}<script defer src="${prefix}shared/browser/fullscreen.js"></script></head>`,
    )
    .replace(
      '<span class="local-badge">',
      '<button data-game-fullscreen type="button" aria-label="进入全屏">全屏</button><span class="local-badge">',
    );
}
