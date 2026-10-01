import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const template = (name) => readFile(new URL(name, import.meta.url), 'utf8')
  .then((text) => text.replaceAll('\r\n', '\n'));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 12);

export async function startupMarkup(background) {
  const [css, html, js] = await Promise.all([
    template('overlay.css'), template('overlay.html'), template('runtime.js'),
  ]);
  return {
    head: `<!-- night-startup:head --><link rel="preload" as="image" href="${background}" fetchpriority="high"><style>${css.replaceAll('__NIGHT_BACKGROUND__', background)}</style><!-- /night-startup:head -->`,
    body: `<!-- night-startup:body -->${html}<script>${js}</script><!-- /night-startup:body -->`,
  };
}

// Deliberately leave Creator's hashed JS/settings intact. Only HTML owns the new boot chain.
export async function installStartup(out, target) {
  if (!['web-mobile', 'web-desktop'].includes(target)) throw Error('Unsupported startup target');
  const indexPath = path.join(out, 'index.html');
  let html = await readFile(indexPath, 'utf8');
  const entry = html.match(/System\.import\(['"](\.\/index(?:\.[\w-]+)?\.js)['"]\)/)?.[1]
    || html.match(/data-night-entry="(\.\/index(?:\.[\w-]+)?\.js)"/)?.[1];
  if (!entry) throw Error('Unknown Creator index.html bootstrap; review startup integration');
  const index = await readFile(path.join(out, entry), 'utf8');
  const application = index.match(/['"](\.\/application(?:\.[\w-]+)?\.js)['"]/)?.[1];
  if (!application) throw Error('Creator application module not found');
  const app = await readFile(path.join(out, application), 'utf8');
  const settingsPath = app.match(/settingsPath\s*=\s*['"](src\/settings(?:\.[\w-]+)?\.json)['"]/)?.[1];
  if (!settingsPath) throw Error('Creator settings path not found');
  const settings = JSON.parse(await readFile(path.join(out, settingsPath), 'utf8'));
  if (settings.CocosEngine !== '3.8.8')
    throw Error('Startup lifecycle was verified for Creator 3.8.8; review it before upgrading');
  if (settings.splashScreen?.totalTime !== 0 || settings.splashScreen?.logo?.type === 'default')
    console.log('Creator emitted its default splash; startup disables it through settings.overrideSettings at onPostBaseInitDelegate, before SplashScreen.init.');

  const background = await readFile(new URL('background.webp', import.meta.url));
  const backgroundPath = `startup/background.${digest(background)}.webp`;
  const markup = await startupMarkup(backgroundPath);
  for (const part of ['head', 'body'])
    html = html.replace(new RegExp(`\\s*<!-- night-startup:${part} -->[\\s\\S]*?<!-- /night-startup:${part} -->\\s*`, 'g'), '');
  const boot = `<script data-night-entry="${entry}">window.NightStartup.boot(${JSON.stringify(application)}, ${JSON.stringify(target)});</script>`;
  const bootPattern = /<script\b[^>]*>[\s\S]*?<\/script>/g;
  let replaced = 0;
  html = html.replace(bootPattern, (script) => {
    if (!script.includes(`System.import('${entry}')`) && !script.includes(`System.import("${entry}")`)
        && !script.includes('data-night-entry=')) return script;
    replaced++;
    return boot;
  });
  if (replaced !== 1 || !/<body\b[^>]*>/.test(html) || !html.includes('</head>'))
    throw Error('Unexpected Creator HTML shape; startup injection aborted');
  html = html.replace(/<html(?:\s[^>]*)?>/, '<html lang="zh-CN">')
    .replace(/\s*<\/head>/, `${markup.head}\n</head>`)
    .replace(/(<body\b[^>]*>)\s*/, (_, body) => `${body}\n${markup.body}\n`);
  await mkdir(path.join(out, 'startup'), { recursive: true });
  await writeFile(path.join(out, backgroundPath), background);
  await writeFile(indexPath, html);
}
