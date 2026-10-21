import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { browserEntry } from './scripts/browser-entry.mjs';

const target = process.argv[2] || 'web';
if (!['web', 'h5', 'wechat'].includes(target) || process.argv.length > 3)
  throw new Error('Usage: node build.mjs [web|h5|wechat]');
const root = new URL('./', import.meta.url);
const output = new URL(target === 'web' ? 'dist/' : `dist-${target}/`, root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
if (target === 'wechat') {
  const { build } = await import('esbuild');
  await cp(new URL('wechat/', root), output, {
    recursive: true,
    filter: (source) => !source.endsWith('project.private.config.json'),
  });
  await build({
    entryPoints: [fileURLToPath(new URL('wechat/pages/lab/index.js', root))],
    outfile: fileURLToPath(new URL('pages/lab/index.js', output)),
    bundle: true,
    format: 'cjs',
    platform: 'neutral',
    target: 'es2018',
    logLevel: 'warning',
  });
  await rm(new URL('audio.js', output), { force: true });
  await rm(new URL('canvas.js', output), { force: true });
  const config = JSON.parse(await readFile(new URL('project.config.json', output), 'utf8'));
  if (process.env.WECHAT_APP_ID) {
    if (!/^wx[\da-f]{16}$/i.test(process.env.WECHAT_APP_ID))
      throw new Error('WECHAT_APP_ID 格式无效');
    config.appid = process.env.WECHAT_APP_ID;
  }
  await writeFile(new URL('project.config.json', output), JSON.stringify(config, null, 2) + '\n');
} else {
  for (const file of ['shared', 'src', 'styles.css', target, 'dev-mode.js']) {
    await cp(new URL(file, root), new URL(file, output), { recursive: true });
  }
  await rm(new URL('shared/browser/index.html', output));
  await writeFile(new URL('index.html', output), await browserEntry(target));
}
console.log(`Built echo-lab ${target}: ${fileURLToPath(output)}`);
